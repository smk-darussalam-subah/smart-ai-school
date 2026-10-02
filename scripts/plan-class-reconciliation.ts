import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  assertClassReconciliationBinding,
  buildClassReconciliationPlan,
  databaseTargetFromUrl,
  parseClassReconciliationManifest,
  sha256,
} from '../apps/api/src/classes/class-reconciliation-plan';

interface CliOptions {
  manifestPath: string;
  expectedManifestSha256: string;
  expectedTargetSha256: string;
}

function optionValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Gunakan ${name} <nilai>. Script ini hanya mendukung dry-run.`);
  }
  return value;
}

export function parseCliOptions(args: string[]): CliOptions {
  if (args.includes('--apply')) {
    throw new Error('Mutasi data tidak didukung oleh script dry-run ini');
  }
  const expectedManifestSha256 = optionValue(args, '--expected-manifest-sha256');
  const expectedTargetSha256 = optionValue(args, '--expected-target-sha256');
  const digestPattern = /^[a-f0-9]{64}$/;
  if (!digestPattern.test(expectedManifestSha256) || !digestPattern.test(expectedTargetSha256)) {
    throw new Error('Expected digest wajib SHA-256 hex kecil sepanjang 64 karakter');
  }
  return {
    manifestPath: resolve(optionValue(args, '--manifest')),
    expectedManifestSha256,
    expectedTargetSha256,
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const bytes = await readFile(options.manifestPath);
  const manifestSha256 = sha256(bytes);
  if (manifestSha256 !== options.expectedManifestSha256) {
    throw new Error('Digest manifest tidak cocok dengan digest yang disetujui');
  }
  const manifest = parseClassReconciliationManifest(bytes.toString('utf8'));
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL wajib tersedia untuk dry-run rekonsiliasi');
  const configuredTarget = databaseTargetFromUrl(databaseUrl);
  const prisma = new PrismaClient();

  try {
    const identityRows = await prisma.$queryRaw<
      Array<{ databaseName: string; schemaName: string }>
    >`SELECT current_database() AS "databaseName", current_schema() AS "schemaName"`;
    const identity = identityRows[0];
    if (!identity) throw new Error('Database tidak mengembalikan identitas target');
    assertClassReconciliationBinding({
      manifest,
      manifestSha256,
      expectedManifestSha256: options.expectedManifestSha256,
      configuredTarget,
      expectedTargetSha256: options.expectedTargetSha256,
      observedDatabaseName: identity.databaseName,
      observedSchemaName: identity.schemaName,
    });

    const [students, teachers] = await Promise.all([
      prisma.student.findMany({
        where: { id: { in: manifest.studentIds } },
        select: {
          id: true,
          classId: true,
          status: true,
          deletedAt: true,
          user: { select: { isActive: true, deletedAt: true } },
        },
      }),
      prisma.teacher.findMany({
        where: { id: { in: manifest.teacherIds } },
        select: {
          id: true,
          deletedAt: true,
          user: { select: { isActive: true, deletedAt: true } },
          walikelas: { select: { id: true, isActive: true } },
        },
      }),
    ]);

    const plan = buildClassReconciliationPlan(manifest, students, teachers);
    process.stdout.write(
      `${JSON.stringify(
        {
          verified: true,
          binding: {
            manifestSha256,
            targetSha256: configuredTarget.targetSha256,
            databaseName: identity.databaseName,
            schemaName: identity.schemaName,
          },
          ...plan,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
