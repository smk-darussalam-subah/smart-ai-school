import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  applyClassReconciliation,
  parseClassReconciliationApplyManifest,
} from '../apps/api/src/classes/class-reconciliation-apply';
import { databaseTargetFromUrl, sha256 } from '../apps/api/src/classes/class-reconciliation-plan';

interface CliOptions {
  manifestPath: string;
  expectedManifestSha256: string;
  expectedDryRunSha256: string;
  expectedTargetSha256: string;
}

export function safeApplyErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code?: unknown }).code === 'P2034' ||
      ((error as { code?: unknown }).code === 'P2010' &&
        error instanceof Error &&
        error.message.includes('could not serialize access')))
  ) {
    return 'Apply dibatalkan karena ada perubahan bersamaan; jangan rerun tanpa refresh dan approval baru.';
  }
  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal';
  return /[0-9a-f]{8}-[0-9a-f-]{27}/i.test(message)
    ? 'Apply gagal dan transaksi dibatalkan; detail identifier disembunyikan.'
    : message;
}

function optionValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Gunakan ${name} <nilai>.`);
  return value;
}

export function parseApplyCliOptions(args: string[]): CliOptions {
  if (!args.includes('--apply')) {
    throw new Error('Operator apply wajib memakai flag --apply eksplisit');
  }
  const expectedManifestSha256 = optionValue(args, '--expected-manifest-sha256');
  const expectedDryRunSha256 = optionValue(args, '--expected-dry-run-sha256');
  const expectedTargetSha256 = optionValue(args, '--expected-target-sha256');
  const digestPattern = /^[a-f0-9]{64}$/;
  if (
    !digestPattern.test(expectedManifestSha256) ||
    !digestPattern.test(expectedDryRunSha256) ||
    !digestPattern.test(expectedTargetSha256)
  ) {
    throw new Error('Expected digest wajib SHA-256 hex kecil sepanjang 64 karakter');
  }
  return {
    manifestPath: resolve(optionValue(args, '--manifest')),
    expectedManifestSha256,
    expectedDryRunSha256,
    expectedTargetSha256,
  };
}

async function main(): Promise<void> {
  const options = parseApplyCliOptions(process.argv.slice(2));
  const bytes = await readFile(options.manifestPath);
  const manifestSha256 = sha256(bytes);
  if (manifestSha256 !== options.expectedManifestSha256) {
    throw new Error('Digest manifest apply tidak cocok dengan digest yang disetujui');
  }
  const manifest = parseClassReconciliationApplyManifest(bytes.toString('utf8'));
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL wajib tersedia untuk operator apply');
  const configuredTarget = databaseTargetFromUrl(databaseUrl);
  const prisma = new PrismaClient();

  try {
    const receipt = await applyClassReconciliation(prisma, {
      manifest,
      manifestSha256,
      expectedManifestSha256: options.expectedManifestSha256,
      expectedDryRunSha256: options.expectedDryRunSha256,
      expectedTargetSha256: options.expectedTargetSha256,
      configuredTarget,
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${safeApplyErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
