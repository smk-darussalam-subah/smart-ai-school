/**
 * seed-subjects.ts — DEV-03 (2K-4)
 *
 * Upsert DISTINCT subject names dari teaching_assignments ke academic.subjects.
 * Idempotent: run berulang aman. code = 3 huruf kapital dari name (ditambah counter bila collision).
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/seed-subjects.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function deriveCode(name: string, existing: Set<string>): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  if (!existing.has(base)) return base;
  for (let i = 1; i <= 99; i++) {
    const candidate = `${base.slice(0, 4)}${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base.slice(0, 3)}${Date.now() % 1000}`;
}

async function main() {
  // Ambil DISTINCT subject dari teaching_assignments
  const rows = await prisma.$queryRaw<{ subject: string }[]>`
    SELECT DISTINCT subject FROM academic.teaching_assignments ORDER BY subject
  `;

  if (rows.length === 0) {
    console.log('Tidak ada data teaching_assignments — seeding mapel default SMK.');
    rows.push(
      { subject: 'Matematika' },
      { subject: 'Bahasa Indonesia' },
      { subject: 'Bahasa Inggris' },
      { subject: 'Pendidikan Agama' },
      { subject: 'PKN' },
      { subject: 'Penjaskes' },
      { subject: 'Pemrograman Dasar' },
      { subject: 'Basis Data' },
      { subject: 'Jaringan Komputer' },
      { subject: 'Desain Grafis' },
    );
  }

  const usedCodes = new Set<string>(
    (await prisma.$queryRaw<{ code: string }[]>`SELECT code FROM academic.subjects`).map(
      (r) => r.code,
    ),
  );

  let upserted = 0;
  for (const row of rows) {
    const name = row.subject.trim();
    if (!name) continue;

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM academic.subjects WHERE name = ${name} LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(`  skip (sudah ada): ${name}`);
      continue;
    }

    const code = deriveCode(name, usedCodes);
    usedCodes.add(code);

    await prisma.$executeRaw`
      INSERT INTO academic.subjects (code, name, is_active, updated_at)
      VALUES (${code}, ${name}, TRUE, NOW())
      ON CONFLICT (name) DO NOTHING
    `;
    console.log(`  upsert: ${code} → ${name}`);
    upserted++;
  }

  console.log(`\nSelesai. ${upserted} mapel baru ditambahkan.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
