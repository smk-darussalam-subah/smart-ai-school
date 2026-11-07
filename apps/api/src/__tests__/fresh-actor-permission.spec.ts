jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Prisma } from '@prisma/client';
import type { UserRole } from '@smk/auth';
import { PermissionsService } from '../permissions/permissions.service';
import type { PrismaService } from '../prisma/prisma.service';

const OWN = 'attendance.own.read';
const CHILD = 'attendance.child.read';
const GLOBAL = 'academic.attendance.read';
const actorId = '10000000-0000-4000-8000-000000000001';
const secondId = '10000000-0000-4000-8000-000000000002';

type StoredActor = { id: string; role: string; active: boolean; deleted: boolean };
type Override = { grant: boolean; permission: { code: string } };
type UserLookup = {
  where: { keycloakId: string; isActive: boolean; deletedAt: null };
  select: Record<string, boolean>;
};

/** Deterministic ORM adapter around the real permission resolver.
 * PostgreSQL snapshot/locking and the HTTP guard are covered by their separate suites. */
function fixture() {
  const actors = new Map<string, StoredActor>([
    ['kc-student', { id: actorId, role: 'SISWA', active: true, deleted: false }],
    ['kc-parent', { id: secondId, role: 'ORANG_TUA', active: true, deleted: false }],
  ]);
  const grants: Record<string, string[]> = { SISWA: [OWN], ORANG_TUA: [CHILD] };
  const db = {
    user: {
      findFirst: jest.fn(async ({ where }: UserLookup) => {
        const row = actors.get(where.keycloakId);
        return row && row.active && !row.deleted ? { id: row.id, role: row.role } : null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { keycloakId: string } }) => {
        const row = actors.get(where.keycloakId);
        return row ? { id: row.id } : null;
      }),
    },
    academicYear: { findMany: jest.fn(async () => [{ id: 'year-current' }]) },
    rolePermission: {
      findMany: jest.fn(async ({ where }: { where: { role: { in: string[] } } }) =>
        where.role.in.flatMap((role) =>
          (grants[role] ?? []).map((code) => ({ permission: { code } })),
        ),
      ),
    },
    userPermissionOverride: { findMany: jest.fn<Promise<Override[]>, [unknown]>(async () => []) },
    appointment: {
      findMany: jest.fn<
        Promise<{ position: { permissions: { permissionId: string }[] } }[]>,
        [unknown]
      >(async () => []),
    },
    permission: {
      findMany: jest.fn<Promise<{ code: string }[]>, [unknown]>(async () => []),
    },
  };
  const service = new PermissionsService(db as unknown as PrismaService);
  return { actors, grants, db, tx: db as unknown as Prisma.TransactionClient, service };
}

describe('fresh actor permission: one lookup, no retained authority', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T03:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads active actor ID and role once without a second ID or role lookup', async () => {
    const f = fixture();
    await expect(f.service.findFreshActorWithPermission('kc-student', OWN, f.tx)).resolves.toEqual({
      id: actorId,
      role: 'SISWA',
    });
    expect(f.db.user.findFirst).toHaveBeenCalledTimes(1);
    expect(f.db.user.findFirst).toHaveBeenCalledWith({
      where: { keycloakId: 'kc-student', isActive: true, deletedAt: null },
      select: { id: true, role: true },
    });
    expect(f.db.user.findUnique).not.toHaveBeenCalled();
    expect(f.db.rolePermission.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['SISWA'] } },
      select: { permission: { select: { code: true } } },
    });
  });

  it('derives the required permission from the database role at each invocation', async () => {
    const f = fixture();
    const required = jest.fn((role: UserRole) =>
      role === 'SISWA' ? OWN : role === 'ORANG_TUA' ? CHILD : null,
    );
    await expect(
      f.service.findFreshActorWithPermission('kc-student', required, f.tx),
    ).resolves.toMatchObject({ role: 'SISWA' });
    f.actors.get('kc-student')!.role = 'ORANG_TUA';
    await expect(
      f.service.findFreshActorWithPermission('kc-student', required, f.tx),
    ).resolves.toMatchObject({ id: actorId, role: 'ORANG_TUA' });
    expect(required.mock.calls.map(([role]) => role)).toEqual(['SISWA', 'ORANG_TUA']);
    expect(f.db.user.findFirst).toHaveBeenCalledTimes(2);
    expect(f.db.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['missing', 'inactive', 'deleted', 'position-only', 'invalid-role'] as const)(
    'denies %s actors before querying permission grants',
    async (kind) => {
      const f = fixture();
      const actor = f.actors.get('kc-student')!;
      if (kind === 'missing') f.actors.delete('kc-student');
      if (kind === 'inactive') actor.active = false;
      if (kind === 'deleted') actor.deleted = true;
      if (kind === 'position-only') actor.role = 'KEPALA_SEKOLAH';
      if (kind === 'invalid-role') actor.role = 'UNKNOWN_ROLE';
      const required = jest.fn(() => OWN);
      await expect(
        f.service.findFreshActorWithPermission('kc-student', required, f.tx),
      ).resolves.toBeNull();
      expect(required).not.toHaveBeenCalled();
      expect(f.db.academicYear.findMany).not.toHaveBeenCalled();
      expect(f.db.rolePermission.findMany).not.toHaveBeenCalled();
      expect(f.db.userPermissionOverride.findMany).not.toHaveBeenCalled();
      expect(f.db.appointment.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([null, ''] as const)(
    'denies a resolver result of %s before permission queries',
    async (code) => {
      const f = fixture();
      const required = jest.fn(() => code);
      await expect(
        f.service.findFreshActorWithPermission('kc-student', required, f.tx),
      ).resolves.toBeNull();
      expect(required).toHaveBeenCalledWith('SISWA');
      expect(f.db.rolePermission.findMany).not.toHaveBeenCalled();
    },
  );

  it('does not substitute a global read grant for the required own permission', async () => {
    const f = fixture();
    f.grants.SISWA = [GLOBAL];
    await expect(
      f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
    ).resolves.toBeNull();
  });

  it('allows a missing role grant through a current manual grant', async () => {
    const f = fixture();
    f.grants.SISWA = [];
    f.db.userPermissionOverride.findMany.mockResolvedValue([
      { grant: true, permission: { code: OWN } },
    ]);
    await expect(f.service.findFreshActorWithPermission('kc-student', OWN, f.tx)).resolves.toEqual({
      id: actorId,
      role: 'SISWA',
    });
    expect(f.db.userPermissionOverride.findMany).toHaveBeenCalledWith({
      where: {
        userId: actorId,
        status: 'ACTIVE',
        source: 'MANUAL',
        OR: [{ academicYearId: 'year-current' }, { academicYearId: null }],
      },
      select: { grant: true, permission: { select: { code: true } } },
    });
  });

  it.each([false, true])(
    'a manual revoke wins over role and manual grants in either order (%s)',
    async (reverse) => {
      const f = fixture();
      const overrides: Override[] = [
        { grant: true, permission: { code: OWN } },
        { grant: false, permission: { code: OWN } },
      ];
      f.db.userPermissionOverride.findMany.mockResolvedValue(
        reverse ? overrides.reverse() : overrides,
      );
      await expect(
        f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
      ).resolves.toBeNull();
    },
  );

  it('retains appointment year, active-user, effective-date and position-scope filters', async () => {
    const f = fixture();
    f.actors.get('kc-student')!.role = 'GURU';
    f.grants.GURU = [];
    f.db.appointment.findMany.mockResolvedValue([
      { position: { permissions: [{ permissionId: 'appointment-grant' }] } },
    ]);
    f.db.permission.findMany.mockResolvedValue([{ code: GLOBAL }]);
    await expect(
      f.service.findFreshActorWithPermission('kc-student', GLOBAL, f.tx),
    ).resolves.toEqual({
      id: actorId,
      role: 'GURU',
    });
    expect(f.db.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          academicYearId: 'year-current',
          staff: {
            userId: actorId,
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
          },
          position: { isActive: true },
          effectiveFrom: { lte: new Date('2026-11-05T00:00:00Z') },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date('2026-11-05T00:00:00Z') } },
          ],
          AND: [
            {
              OR: [
                { position: { scopeType: 'NONE' }, majorId: null },
                { position: { scopeType: 'MAJOR' }, major: { isActive: true } },
              ],
            },
          ],
        }),
      }),
    );
    expect(f.db.permission.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['appointment-grant'] } },
      select: { code: true },
    });
    f.db.userPermissionOverride.findMany.mockResolvedValue([
      { grant: false, permission: { code: GLOBAL } },
    ]);
    await expect(
      f.service.findFreshActorWithPermission('kc-student', GLOBAL, f.tx),
    ).resolves.toBeNull();
  });

  it.each([{ years: [] }, { years: [{ id: 'year-a' }, { id: 'year-b' }] }])(
    'does not use appointment or year-scoped authority without one active year',
    async ({ years }) => {
      const f = fixture();
      f.grants.SISWA = [];
      f.db.academicYear.findMany.mockResolvedValue(years);
      await expect(
        f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
      ).resolves.toBeNull();
      expect(f.db.appointment.findMany).not.toHaveBeenCalled();
      expect(f.db.userPermissionOverride.findMany).toHaveBeenCalledWith({
        where: {
          userId: actorId,
          status: 'ACTIVE',
          source: 'MANUAL',
          OR: [{ academicYearId: null }],
        },
        select: { grant: true, permission: { select: { code: true } } },
      });
    },
  );

  it('reads current authority even when an older effective-permission cache allowed access', async () => {
    const f = fixture();
    await expect(f.service.getEffectivePermissions('kc-student', ['SISWA'])).resolves.toEqual(
      new Set([OWN]),
    );
    f.db.userPermissionOverride.findMany.mockResolvedValue([
      { grant: false, permission: { code: OWN } },
    ]);
    await expect(
      f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
    ).resolves.toBeNull();
    // Proves the control really retained the old cache; the fresh path did not consume it.
    await expect(f.service.getEffectivePermissions('kc-student', ['SISWA'])).resolves.toEqual(
      new Set([OWN]),
    );
  });

  it('re-reads an actor disabled between two calls using the same transaction object', async () => {
    const f = fixture();
    await expect(
      f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
    ).resolves.toMatchObject({ id: actorId });
    f.actors.get('kc-student')!.active = false;
    await expect(
      f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
    ).resolves.toBeNull();
    expect(f.db.user.findFirst).toHaveBeenCalledTimes(2);
    expect(f.db.rolePermission.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not retain an actor across identities or separate transaction clients', async () => {
    const first = fixture();
    const second = fixture();
    second.actors.get('kc-student')!.active = false;
    await expect(
      first.service.findFreshActorWithPermission('kc-student', OWN, first.tx),
    ).resolves.toMatchObject({ id: actorId });
    await expect(
      first.service.findFreshActorWithPermission('kc-parent', CHILD, first.tx),
    ).resolves.toEqual({ id: secondId, role: 'ORANG_TUA' });
    await expect(
      first.service.findFreshActorWithPermission('kc-student', OWN, second.tx),
    ).resolves.toBeNull();
    expect(second.db.user.findFirst).toHaveBeenCalledTimes(1);
    expect(first.db.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('allows SUPER_ADMIN only after an active actor and nonempty required permission', async () => {
    const f = fixture();
    f.actors.get('kc-student')!.role = 'SUPER_ADMIN';
    await expect(
      f.service.findFreshActorWithPermission('kc-student', 'any.permission', f.tx),
    ).resolves.toEqual({ id: actorId, role: 'SUPER_ADMIN' });
    await expect(
      f.service.findFreshActorWithPermission('kc-student', () => null, f.tx),
    ).resolves.toBeNull();
    f.actors.get('kc-student')!.active = false;
    await expect(
      f.service.findFreshActorWithPermission('kc-student', 'any.permission', f.tx),
    ).resolves.toBeNull();
    expect(f.db.user.findFirst).toHaveBeenCalledTimes(3);
    expect(f.db.rolePermission.findMany).not.toHaveBeenCalled();
    expect(f.db.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['actor', 'year', 'role', 'override', 'appointment', 'permission'] as const)(
    '%s lookup failure is a sanitized 503, never a grant or a false 403',
    async (point) => {
      const f = fixture();
      const error = Object.assign(new Error('PRIVATE-QUERY-VALUE do-not-return@example.invalid'), {
        code: 'P2024',
      });
      if (point === 'actor') f.db.user.findFirst.mockRejectedValueOnce(error);
      if (point === 'year') f.db.academicYear.findMany.mockRejectedValueOnce(error);
      if (point === 'role') f.db.rolePermission.findMany.mockRejectedValueOnce(error);
      if (point === 'override') f.db.userPermissionOverride.findMany.mockRejectedValueOnce(error);
      if (point === 'appointment') f.db.appointment.findMany.mockRejectedValueOnce(error);
      if (point === 'permission') {
        f.db.appointment.findMany.mockResolvedValue([
          { position: { permissions: [{ permissionId: 'appointment-grant' }] } },
        ]);
        f.db.permission.findMany.mockRejectedValueOnce(error);
      }
      const failure = await f.service.findFreshActorWithPermission('kc-student', OWN, f.tx).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(failure).toMatchObject({ status: 503, response: { code: 'AUTHORITY_UNAVAILABLE' } });
      expect(JSON.stringify(failure)).not.toContain('PRIVATE-QUERY-VALUE');
      expect(JSON.stringify(failure)).not.toContain('do-not-return@example.invalid');
    },
  );

  it('legacy hasFreshPermission still reads authority after an earlier fresh-actor call', async () => {
    const f = fixture();
    await expect(
      f.service.findFreshActorWithPermission('kc-student', OWN, f.tx),
    ).resolves.toMatchObject({ id: actorId });
    f.actors.get('kc-student')!.active = false;
    await expect(f.service.hasFreshPermission('kc-student', OWN, f.tx)).resolves.toBe(false);
    expect(f.db.user.findFirst).toHaveBeenCalledTimes(2);
  });
});
