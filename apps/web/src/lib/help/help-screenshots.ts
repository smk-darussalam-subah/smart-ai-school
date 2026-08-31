import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { HELP_SCREENSHOTS } from './help-evidence';
import type { HelpScreenshot } from './help-schema';

const SCREENSHOT_ID_PATTERN = /^shot\.[a-z0-9.-]+$/;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;
const VERIFY_CHUNK_BYTES = 64 * 1024;

export interface HelpScreenshotFileInspection {
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export function resolvePrivateScreenshotRoot(cwd = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'private', 'help-screenshots'),
    path.resolve(cwd, 'apps', 'web', 'private', 'help-screenshots'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function findHelpScreenshot(id: string): HelpScreenshot | null {
  if (!SCREENSHOT_ID_PATTERN.test(id)) return null;
  return HELP_SCREENSHOTS.find((screenshot) => screenshot.id === id) ?? null;
}

export function isHelpScreenshotReady(screenshot: HelpScreenshot): screenshot is HelpScreenshot & {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  candidateSha: string;
  capturedAt: string;
} {
  return screenshot.assetStatus === 'ready' &&
    Boolean(screenshot.fileName && screenshot.sha256 && screenshot.candidateSha && screenshot.capturedAt) &&
    screenshot.sizeBytes !== null && screenshot.width !== null && screenshot.height !== null &&
    (screenshot.sourceKind !== 'shared-auth' || Boolean(screenshot.themeManifestSha256)) &&
    screenshot.privacyReview === 'pass' && screenshot.visualReview === 'pass';
}

export function isSafeHelpScreenshotPath(fileName: string, cwd = process.cwd()): boolean {
  const screenshotRoot = resolvePrivateScreenshotRoot(cwd);
  const resolved = path.resolve(screenshotRoot, fileName);
  return resolved.startsWith(`${screenshotRoot}${path.sep}`) && path.basename(resolved) === fileName;
}

function screenshotContentType(fileName: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.jpg') return 'image/jpeg';
  return null;
}

export function readHelpScreenshotDimensions(
  payload: Uint8Array,
  fileName: string,
): { width: number; height: number } | null {
  const buffer = Buffer.from(payload);
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (extension === '.jpg') {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) return null;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
      const isStartOfFrame = [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
        0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ].includes(marker);
      if (isStartOfFrame && segmentLength >= 7) {
        return {
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3),
        };
      }
      offset += segmentLength;
    }
    return null;
  }

  if (extension === '.webp') {
    if (
      buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) return null;
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    }
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }

  return null;
}

function appendImageHeader(
  header: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  fileName: string,
): { header: Buffer<ArrayBufferLike>; dimensions: { width: number; height: number } | null } {
  const remaining = Math.max(0, MAX_IMAGE_HEADER_BYTES - header.length);
  const nextHeader = remaining > 0
    ? Buffer.concat([header, chunk.subarray(0, remaining)])
    : header;
  return { header: nextHeader, dimensions: readHelpScreenshotDimensions(nextHeader, fileName) };
}

export async function inspectHelpScreenshotFile(
  filePath: string,
  fileName: string,
  signal: AbortSignal,
): Promise<HelpScreenshotFileInspection | null> {
  const digest = createHash('sha256');
  let header: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let dimensions: { width: number; height: number } | null = null;
  let sizeBytes = 0;
  try {
    for await (const rawChunk of createReadStream(filePath, { highWaterMark: VERIFY_CHUNK_BYTES, signal })) {
      const chunk = Buffer.from(rawChunk);
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_SCREENSHOT_BYTES) return null;
      digest.update(chunk);
      if (!dimensions) ({ header, dimensions } = appendImageHeader(header, chunk, fileName));
    }
    if (signal.aborted || !dimensions) return null;
    return { sha256: digest.digest('hex'), sizeBytes, ...dimensions };
  } catch {
    return null;
  }
}

export function inspectHelpScreenshotFileSync(
  filePath: string,
  fileName: string,
): HelpScreenshotFileInspection | null {
  let descriptor: number | null = null;
  const chunk = Buffer.alloc(VERIFY_CHUNK_BYTES);
  const digest = createHash('sha256');
  let header: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let dimensions: { width: number; height: number } | null = null;
  let sizeBytes = 0;
  try {
    descriptor = openSync(filePath, 'r');
    const metadata = fstatSync(descriptor);
    if (metadata.size > MAX_SCREENSHOT_BYTES) return null;
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead > 0) {
        const slice = chunk.subarray(0, bytesRead);
        sizeBytes += bytesRead;
        digest.update(slice);
        if (!dimensions) ({ header, dimensions } = appendImageHeader(header, slice, fileName));
      }
    } while (bytesRead > 0);
    if (!dimensions) return null;
    return { sha256: digest.digest('hex'), sizeBytes, ...dimensions };
  } catch {
    return null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

export function helpScreenshotHeaders(contentType: string, size: number): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, max-age=0, no-transform',
    'Content-Length': String(size),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': contentType,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

export async function streamHelpScreenshot(
  screenshot: HelpScreenshot,
  signal: AbortSignal,
  cwd = process.cwd(),
): Promise<Response | null> {
  if (!isHelpScreenshotReady(screenshot) || !isSafeHelpScreenshotPath(screenshot.fileName, cwd) || signal.aborted) {
    return null;
  }

  const screenshotRoot = resolvePrivateScreenshotRoot(cwd);
  const filePath = path.resolve(screenshotRoot, screenshot.fileName);
  const contentType = screenshotContentType(screenshot.fileName);
  if (!contentType) return null;

  try {
    const [rootPath, fileMetadata] = await Promise.all([realpath(screenshotRoot), lstat(filePath)]);
    if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) return null;
    const resolvedFile = await realpath(filePath);
    if (!resolvedFile.startsWith(`${rootPath}${path.sep}`)) return null;

    const metadata = await stat(resolvedFile);
    if (metadata.size !== screenshot.sizeBytes || metadata.size > MAX_SCREENSHOT_BYTES) return null;
    const inspection = await inspectHelpScreenshotFile(resolvedFile, screenshot.fileName, signal);
    if (!inspection || inspection.sha256 !== screenshot.sha256 || inspection.sizeBytes !== screenshot.sizeBytes ||
      inspection.width !== screenshot.width || inspection.height !== screenshot.height || signal.aborted) return null;
    const body = Readable.toWeb(createReadStream(resolvedFile, { signal })) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: helpScreenshotHeaders(contentType, metadata.size),
    });
  } catch {
    return null;
  }
}

export function genericScreenshotUnavailable(): Response {
  return Response.json(
    { message: 'Gambar panduan belum tersedia.' },
    {
      status: 404,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
