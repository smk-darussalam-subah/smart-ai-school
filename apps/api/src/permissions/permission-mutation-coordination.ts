import { Prisma } from '@prisma/client';

/** Permission administration is rare; serialize replacements before reading old IDs. */
export async function acquirePermissionMutationLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('auth:permissions:mutation:v1'))`,
  );
}

/**
 * An existing catalog row is the MVCC anchor, including when no override exists.
 * A business-neutral UPDATE creates a new row version without changing catalog
 * values/timestamps. RR readers lock that version or fail with serialization;
 * an advisory lock alone cannot refresh a previously established snapshot.
 * Caller holds acquirePermissionMutationLock through the complete mutation.
 */
export async function touchPermissionAnchors(
  tx: Prisma.TransactionClient,
  permissionIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(permissionIds.map((id) => id.toLowerCase()))].sort();
  if (!ids.length) return;
  const parameters = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM auth.permissions WHERE id IN (${parameters}) ORDER BY id FOR UPDATE`,
  );
  await tx.$executeRaw(
    Prisma.sql`UPDATE auth.permissions SET description = description WHERE id IN (${parameters})`,
  );
}

/**
 * Protect the rows on which report authority depends before resolving it.
 * Existing appointment/catalog/lifecycle row changes conflict under RR; new
 * appointment/reconcile grants can only add authority. Restrictive override
 * inserts and role replacements use the catalog anchors above. All locks stay
 * on the caller's single connection until commit/rollback.
 */
export async function lockReportPermissionSnapshot(
  tx: Prisma.TransactionClient,
  keycloakId: string,
  permission: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM auth.users WHERE keycloak_id = ${keycloakId}::uuid FOR SHARE`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM school.academic_years WHERE is_active = true ORDER BY id FOR SHARE`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT s.id FROM school.staff s JOIN auth.users u ON u.id = s.user_id WHERE u.keycloak_id = ${keycloakId}::uuid ORDER BY s.id FOR SHARE OF s`,
  );
  await tx.$queryRaw(Prisma.sql`SELECT p.id FROM school.positions p WHERE EXISTS (
    SELECT 1 FROM school.appointments a JOIN school.staff s ON s.id = a.staff_id JOIN auth.users u ON u.id = s.user_id
    WHERE a.position_id = p.id AND u.keycloak_id = ${keycloakId}::uuid
  ) ORDER BY p.id FOR SHARE OF p`);
  await tx.$queryRaw(Prisma.sql`SELECT m.id FROM school.majors m WHERE EXISTS (
    SELECT 1 FROM school.appointments a JOIN school.staff s ON s.id = a.staff_id JOIN auth.users u ON u.id = s.user_id
    WHERE a.major_id = m.id AND u.keycloak_id = ${keycloakId}::uuid
  ) ORDER BY m.id FOR SHARE OF m`);
  await tx.$queryRaw(Prisma.sql`SELECT a.id FROM school.appointments a JOIN school.staff s ON s.id = a.staff_id JOIN auth.users u ON u.id = s.user_id
    WHERE u.keycloak_id = ${keycloakId}::uuid ORDER BY a.id FOR SHARE OF a`);
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM auth.permissions WHERE code IN (${permission}, '*') ORDER BY id FOR SHARE`,
  );
}
