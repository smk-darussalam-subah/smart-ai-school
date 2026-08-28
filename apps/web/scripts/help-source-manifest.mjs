import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE_MANIFEST = Object.freeze([
  'apps/api/src/__tests__/student-dashboard.spec.ts',
  'apps/api/src/student-dashboard/student-dashboard.service.ts',
  'apps/web/next.config.js',
  'apps/web/private/help-screenshots/README.md',
  'apps/web/scripts/help-source-manifest.mjs',
  'apps/web/src/__tests__/help-artifact-route.test.ts',
  'apps/web/src/__tests__/help-screenshot-route.test.ts',
  'apps/web/src/__tests__/help-system.test.ts',
  'apps/web/src/__tests__/help-topic-content.test.ts',
  'apps/web/src/app/api/help/artifacts/[id]/route.ts',
  'apps/web/src/app/api/help/screenshots/[id]/route.ts',
  'apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx',
  'apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx',
  'apps/web/src/app/dashboard/akademik/_components/ortu/BerandaOrtu.tsx',
  'apps/web/src/app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx',
  'apps/web/src/app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx',
  'apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx',
  'apps/web/src/app/dashboard/akademik/_components/siswa/TaskDetailModal.tsx',
  'apps/web/src/app/dashboard/akademik/_components/siswa/TugasSiswa.tsx',
  'apps/web/src/app/dashboard/akademik/_components/siswa/siswa-types.ts',
  'apps/web/src/app/dashboard/akademik/page.tsx',
  'apps/web/src/app/dashboard/panduan/[slug]/page.tsx',
  'apps/web/src/app/dashboard/panduan/_components/HelpTopicContent.tsx',
  'apps/web/src/app/globals.css',
  'apps/web/src/lib/academic-workflow-deep-link.ts',
  'apps/web/src/lib/help/help-artifacts.ts',
  'apps/web/src/lib/help/help-catalog.ts',
  'apps/web/src/lib/help/help-evidence-authority.ts',
  'apps/web/src/lib/help/help-evidence.ts',
  'apps/web/src/lib/help/help-links.ts',
  'apps/web/src/lib/help/help-projection.ts',
  'apps/web/src/lib/help/help-schema.ts',
  'apps/web/src/lib/help/help-screenshots.ts',
  'apps/web/src/lib/help/help-validation.ts',
]);

function ordinalCompare(left, right) {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function buildHelpSourceManifest(projectRoot) {
  const paths = [...SOURCE_MANIFEST].sort(ordinalCompare);
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(resolve(projectRoot, path));
    files.push({ path, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
  }
  const serialized = files.map((file) => `${file.path}\t${file.sha256}`).join('\n');
  return {
    version: 1,
    algorithm: 'sha256(path<TAB>sha256, ordinal UTF-8 paths, LF separators, no trailing LF)',
    fileCount: files.length,
    digest: sha256(Buffer.from(serialized, 'utf8')),
    serialized,
    files,
  };
}

async function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const result = await buildHelpSourceManifest(projectRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`help-source-manifest failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
