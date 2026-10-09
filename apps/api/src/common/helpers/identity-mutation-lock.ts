import { Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import type { PermissionsService } from '../../permissions/permissions.service';

// Same lock as UsersService lifecycle changes. Domain locks MUST come first:
// a request waiting for a domain lock must not block a revoke from committing.
export const USER_IDENTITY_MUTATION_LOCK = 'users:last-active-super-admin';
export async function acquireIdentityMutationLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${USER_IDENTITY_MUTATION_LOCK}))`);
}

/** Called after all domain/cutover locks, before any privileged write. */
export async function assertFreshMutationAuthority(
  tx: Prisma.TransactionClient,
  permissions: PermissionsService,
  keycloakId: string,
  permission: string,
  primaryRoles: readonly string[],
  positions: readonly string[] = [],
): Promise<void> {
  await acquireIdentityMutationLock(tx);
  const role = await permissions.getAuthoritativePrimaryRole(keycloakId, tx);
  const activePositions = role && !primaryRoles.includes(role) && positions.length
    ? await permissions.getActivePositionCodes(keycloakId, undefined, tx)
    : new Set<string>();
  if (!role || (!primaryRoles.includes(role) && !positions.some((code) => activePositions.has(code))) ||
    !await permissions.hasFreshPermission(keycloakId, permission, tx)) {
    throw new ForbiddenException('Kewenangan mutasi tidak lagi berlaku; muat ulang sesi Anda');
  }
}
