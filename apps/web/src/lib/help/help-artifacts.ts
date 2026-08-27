import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { HELP_ARTIFACTS } from './help-evidence';
import type { HelpArtifact } from './help-schema';

const ARTIFACT_ID_PATTERN = /^artifact\.[a-z0-9.-]+$/;

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
  if (artifact.status !== 'ready' || !isSafeHelpArtifactPath(artifact.fileName, cwd)) return null;
  const filePath = path.resolve(resolvePrivateArtifactRoot(cwd), artifact.fileName);
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) return null;
    const stream = createReadStream(filePath);
    const abort = () => stream.destroy();
    signal.addEventListener('abort', abort, { once: true });
    stream.once('close', () => signal.removeEventListener('abort', abort));
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
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
