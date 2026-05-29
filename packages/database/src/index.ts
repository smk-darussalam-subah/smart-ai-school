// =============================================================================
// @smk/database — Re-export Prisma client untuk digunakan di seluruh monorepo
//
// Usage di apps/api:
//   import { PrismaClient, Prisma } from '@smk/database';
//   import type { User, Student } from '@smk/database';
//
// Catatan: Prisma client di-generate oleh `npm run db:generate`
// (prisma generate) saat pertama kali setup atau setelah schema berubah.
// =============================================================================

export { PrismaClient, Prisma } from '@prisma/client';
export type * from '@prisma/client';
