/**
 * provision-inspector.ts — pastikan akun inspektur punya baris auth.users.
 *
 * Konteks (insiden 2026-06-13): akun "inspector" dibuat langsung di Keycloak
 * (saat 2I) TANPA baris di auth.users → GET /auth/me 404 → izin kosong →
 * sidebar hanya menampilkan Beranda. Skrip ini menambal invariant "setiap user
 * Keycloak punya baris DB" secara IDEMPOTEN, agar:
 *   - bisa dijalankan ulang aman (upsert, tidak menimpa data bila sudah ada),
 *   - memulihkan baris bila DB di-restore dari backup lama.
 *
 * Nilai default = akun inspektur PROD; override via env bila perlu.
 *   INSPECTOR_KEYCLOAK_ID, INSPECTOR_EMAIL, INSPECTOR_NAME, INSPECTOR_ROLE
 *
 * Run (di dalam container):
 *   docker exec smk-api sh -c 'cd /app && npx ts-node --project tsconfig.scripts.json scripts/provision-inspector.ts'
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const KEYCLOAK_ID = process.env.INSPECTOR_KEYCLOAK_ID ?? 'af486cb9-84f7-4b19-9deb-63a2af4b4c2c';
const EMAIL = process.env.INSPECTOR_EMAIL ?? 'inspector@smkdarussalamsubah.sch.id';
const FULL_NAME = process.env.INSPECTOR_NAME ?? 'Inspektur';
const ROLE = (process.env.INSPECTOR_ROLE ?? 'SUPER_ADMIN') as UserRole;

async function main() {
  const existing = await prisma.user.findUnique({
    where: { keycloakId: KEYCLOAK_ID },
    select: { id: true, role: true, email: true },
  });

  if (existing) {
    console.log(
      `[provision-inspector] SKIP — baris sudah ada (id=${existing.id}, role=${existing.role}, email=${existing.email})`,
    );
    return;
  }

  const created = await prisma.user.create({
    data: {
      keycloakId: KEYCLOAK_ID,
      email: EMAIL,
      fullName: FULL_NAME,
      role: ROLE,
      isActive: true,
    },
    select: { id: true, role: true, email: true },
  });

  console.log(
    `[provision-inspector] OK — baris dibuat (id=${created.id}, role=${created.role}, email=${created.email})`,
  );
}

main()
  .catch((err) => {
    console.error('[provision-inspector] GAGAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
