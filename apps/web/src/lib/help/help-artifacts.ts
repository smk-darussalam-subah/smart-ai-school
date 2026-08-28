import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { HELP_ARTIFACTS } from './help-evidence';
import type { HelpArtifact } from './help-schema';

const ARTIFACT_ID_PATTERN = /^artifact\.[a-z0-9.-]+$/;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const PDF_SCAN_OVERLAP = 256;
const PDF_TAIL_BYTES = 4096;
const VERIFY_CHUNK_BYTES = 64 * 1024;

export interface HelpPdfFileInspection {
  sha256: string;
  sizeBytes: number;
  pageCount: number;
}

function scanPdfMarkers(text: string, startBefore = Number.POSITIVE_INFINITY): {
  pageCount: number;
  hasCatalog: boolean;
} {
  let pageCount = 0;
  let hasCatalog = false;
  for (const match of text.matchAll(/\/Type\s*\/(Page(?!s)\b|Catalog\b)/g)) {
    if ((match.index ?? 0) >= startBefore) continue;
    if (match[1] === 'Catalog') hasCatalog = true;
    else pageCount += 1;
  }
  return { pageCount, hasCatalog };
}

function parseStartXref(tail: string): number | null {
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}

function isPdfXrefTarget(payload: Uint8Array, offset: number): boolean {
  if (offset >= payload.byteLength) return false;
  const probe = Buffer.from(payload).subarray(offset, Math.min(payload.byteLength, offset + 512)).toString('latin1');
  return /^xref\b/.test(probe) || /^\d+\s+\d+\s+obj\b[\s\S]*?\/Type\s*\/XRef\b/.test(probe);
}

export function inspectHelpPdf(payload: Uint8Array): { pageCount: number } | null {
  const buffer = Buffer.from(payload);
  if (!buffer.subarray(0, 8).toString('latin1').match(/^%PDF-1\.[0-7]/)) return null;
  const text = buffer.toString('latin1');
  const startXref = parseStartXref(text.slice(-PDF_TAIL_BYTES));
  const markers = scanPdfMarkers(text);
  if (startXref === null || !isPdfXrefTarget(buffer, startXref) || !markers.hasCatalog) return null;
  return markers.pageCount > 0 ? { pageCount: markers.pageCount } : null;
}

export function inspectHelpPdfFileSync(filePath: string): HelpPdfFileInspection | null {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(filePath, 'r');
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) return null;

    const digest = createHash('sha256');
    const chunk = Buffer.alloc(VERIFY_CHUNK_BYTES);
    let header = Buffer.alloc(0);
    let tail = Buffer.alloc(0);
    let scanCarry = '';
    let pageCount = 0;
    let hasCatalog = false;
    let sizeBytes = 0;
    const scan = (text: string, startBefore?: number) => {
      const markers = scanPdfMarkers(text, startBefore);
      pageCount += markers.pageCount;
      hasCatalog ||= markers.hasCatalog;
    };

    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead <= 0) continue;
      const slice = chunk.subarray(0, bytesRead);
      sizeBytes += bytesRead;
      digest.update(slice);
      if (header.length < 8) header = Buffer.concat([header, slice]).subarray(0, 8);
      tail = Buffer.concat([tail, slice]).subarray(-PDF_TAIL_BYTES);
      const text = scanCarry + slice.toString('latin1');
      if (text.length > PDF_SCAN_OVERLAP) {
        const cutoff = text.length - PDF_SCAN_OVERLAP;
        scan(text, cutoff);
        scanCarry = text.slice(cutoff);
      } else {
        scanCarry = text;
      }
    } while (bytesRead > 0);
    scan(scanCarry);

    if (!/^%PDF-1\.[0-7]/.test(header.toString('latin1')) || !hasCatalog || pageCount <= 0) return null;
    const startXref = parseStartXref(tail.toString('latin1'));
    if (startXref === null || startXref >= sizeBytes) return null;
    const probe = Buffer.alloc(512);
    const probeBytes = readSync(descriptor, probe, 0, probe.length, startXref);
    if (!isPdfXrefTarget(probe.subarray(0, probeBytes), 0)) return null;

    return { sha256: digest.digest('hex'), sizeBytes, pageCount };
  } catch {
    return null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

async function verifyHelpPdfFile(
  filePath: string,
  expectedSha256: string,
  expectedPageCount: number,
  signal: AbortSignal,
): Promise<boolean> {
  const digest = createHash('sha256');
  let header = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let scanCarry = '';
  let pageCount = 0;
  let hasCatalog = false;
  const scan = (text: string, startBefore?: number) => {
    const markers = scanPdfMarkers(text, startBefore);
    pageCount += markers.pageCount;
    hasCatalog ||= markers.hasCatalog;
  };

  try {
    for await (const rawChunk of createReadStream(filePath, { highWaterMark: 64 * 1024, signal })) {
      const chunk = Buffer.from(rawChunk);
      digest.update(chunk);
      if (header.length < 8) header = Buffer.concat([header, chunk]).subarray(0, 8);
      tail = Buffer.concat([tail, chunk]).subarray(-PDF_TAIL_BYTES);
      const text = scanCarry + chunk.toString('latin1');
      if (text.length > PDF_SCAN_OVERLAP) {
        const cutoff = text.length - PDF_SCAN_OVERLAP;
        scan(text, cutoff);
        scanCarry = text.slice(cutoff);
      } else {
        scanCarry = text;
      }
    }
    scan(scanCarry);
    if (signal.aborted || digest.digest('hex') !== expectedSha256) return false;
    if (!/^%PDF-1\.[0-7]/.test(header.toString('latin1')) || !hasCatalog || pageCount !== expectedPageCount) return false;
    const startXref = parseStartXref(tail.toString('latin1'));
    if (startXref === null) return false;
    const handle = await open(filePath, 'r');
    try {
      const probe = Buffer.alloc(512);
      const { bytesRead } = await handle.read(probe, 0, probe.length, startXref);
      return isPdfXrefTarget(probe.subarray(0, bytesRead), 0);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

export function resolvePrivateArtifactRoot(cwd = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'private', 'help-artifacts'),
    path.resolve(cwd, 'apps', 'web', 'private', 'help-artifacts'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function findHelpArtifact(id: string): HelpArtifact | null {
  if (!ARTIFACT_ID_PATTERN.test(id)) return null;
  return HELP_ARTIFACTS.find((artifact) => artifact.id === id) ?? null;
}

export function isHelpArtifactReady(artifact: HelpArtifact): artifact is HelpArtifact & {
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  candidateSha: string;
  generatedAt: string;
} {
  return artifact.status === 'ready' &&
    Boolean(artifact.sha256 && artifact.candidateSha && artifact.generatedAt) &&
    artifact.sizeBytes !== null && artifact.pageCount !== null &&
    artifact.privacyReview === 'pass' && artifact.visualReview === 'pass';
}

export function isSafeHelpArtifactPath(fileName: string, cwd = process.cwd()): boolean {
  const artifactRoot = resolvePrivateArtifactRoot(cwd);
  const resolved = path.resolve(artifactRoot, fileName);
  return resolved.startsWith(`${artifactRoot}${path.sep}`) && path.basename(resolved) === fileName;
}

export function helpArtifactHeaders(artifact: HelpArtifact, size: number): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, max-age=0, no-transform',
    'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
    'Content-Length': String(size),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Type': artifact.contentType,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

export async function streamHelpArtifact(
  artifact: HelpArtifact,
  signal: AbortSignal,
  cwd = process.cwd(),
): Promise<Response | null> {
  if (!isHelpArtifactReady(artifact) || !isSafeHelpArtifactPath(artifact.fileName, cwd) || signal.aborted) return null;
  const artifactRoot = resolvePrivateArtifactRoot(cwd);
  const filePath = path.resolve(artifactRoot, artifact.fileName);
  try {
    const [rootPath, fileMetadata] = await Promise.all([realpath(artifactRoot), lstat(filePath)]);
    if (!fileMetadata.isFile() || fileMetadata.isSymbolicLink()) return null;
    const resolvedFile = await realpath(filePath);
    if (!resolvedFile.startsWith(`${rootPath}${path.sep}`)) return null;
    const metadata = await stat(resolvedFile);
    if (metadata.size !== artifact.sizeBytes || metadata.size > MAX_ARTIFACT_BYTES) return null;
    if (!await verifyHelpPdfFile(resolvedFile, artifact.sha256, artifact.pageCount, signal)) return null;
    if (signal.aborted) return null;
    const body = Readable.toWeb(createReadStream(resolvedFile, { signal })) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: helpArtifactHeaders(artifact, metadata.size),
    });
  } catch {
    return null;
  }
}

export function genericArtifactUnavailable(): Response {
  return Response.json(
    { message: 'Dokumen belum tersedia.' },
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
