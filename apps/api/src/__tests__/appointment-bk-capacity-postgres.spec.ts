import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatusService } from '../auth/user-status.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import {
  acquireUserMutationLocks,
  createKeycloakMutationTransactionOptions,
} from '../users/user-mutation-coordination';

const databaseUrl = process.env.APPOINTMENT_BK_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const CONFIRMATION = 'CONFIRM_DISPOSABLE_APPOINTMENT_BK';
const MARKER = 'APPOINTMENT_BK_DISPOSABLE_V1';

function assertDisposableDatabase(input: {
  databaseUrl: string;
  confirmation?: string;
  currentDatabase: string;
  marker?: string;
}) {
  const parsed = new URL(input.databaseUrl);
  const requested = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    input.confirmation !== CONFIRMATION ||
    input.marker !== MARKER ||
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    !/^diis_test_[a-z0-9_]+$/i.test(input.currentDatabase) ||
    requested !== input.currentDatabase
  )
    throw new Error('Guru BK proof requires an explicitly marked local disposable database.');
}

describePostgres('Guru BK capacity PostgreSQL proof', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const userIds: string[] = [];
  let academicYearId = '';

  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<
      Array<{ currentDatabase: string }>
    >`SELECT current_database() AS "currentDatabase"`;
    const marker = await prisma.$queryRaw<
      Array<{ marker: string }>
    >`SELECT marker FROM public.diis_disposable_test_marker LIMIT 1`;
    assertDisposableDatabase({
      databaseUrl: databaseUrl!,
      confirmation: process.env.APPOINTMENT_BK_DATABASE_CONFIRMATION,
      currentDatabase: identity!.currentDatabase,
      marker: marker[0]?.marker,
    });
  });

  afterAll(async () => {
    try {
      if (academicYearId) {
        await prisma.appointment.deleteMany({ where: { academicYearId } });
        await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
      }
      if (userIds.length) {
        await prisma.staff.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createStaff(label: string) {
    const user = await prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `bk-proof-${label}-${randomUUID()}@example.invalid`,
        fullName: `BK Proof ${label}`,
        role: 'GURU',
      },
    });
    userIds.push(user.id);
    return prisma.staff.create({ data: { userId: user.id, employmentStatus: 'GTY' } });
  }

  async function createProofUser(
    label: string,
    archived = false,
    role: 'GURU' | 'SUPER_ADMIN' = 'GURU',
  ) {
    const now = archived ? new Date() : null;
    const user = await prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `identity-proof-${label}-${randomUUID()}@example.invalid`,
        fullName: `Identity Proof ${label}`,
        role,
        isActive: !archived,
        deletedAt: now,
      },
    });
    userIds.push(user.id);
    return user;
  }

  function createUsersService(keycloak: {
    setEnabled: (keycloakId: string, enabled: boolean) => Promise<void>;
    logoutUser: (keycloakId: string) => Promise<void>;
  }) {
    return new UsersService(
      prisma as unknown as PrismaService,
      { invalidate: jest.fn() } as unknown as UserStatusService,
      keycloak as unknown as KeycloakAdminService,
      { invalidateUser: jest.fn() } as unknown as PermissionsService,
    );
  }

  function createDelayedKeycloak(initialEnabled: boolean, delayedValue: boolean) {
    let enabled = initialEnabled;
    let delayPending = true;
    let announceDelay!: () => void;
    let releaseDelay!: () => void;
    const delayed = new Promise<void>((resolve) => {
      announceDelay = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });
    const setEnabled = jest.fn(async (_keycloakId: string, nextEnabled: boolean) => {
      if (delayPending && nextEnabled === delayedValue) {
        delayPending = false;
        announceDelay();
        await hold;
      }
      enabled = nextEnabled;
    });
    const logoutUser = jest.fn(async (_keycloakId: string) => undefined);

    return {
      service: createUsersService({ setEnabled, logoutUser }),
      waitForDelay: () => delayed,
      releaseDelay,
      isEnabled: () => enabled,
    };
  }

  async function expectStillPending(promise: Promise<unknown>) {
    const outcome = promise.then(
      () => 'settled',
      () => 'settled',
    );
    await expect(
      Promise.race([
        outcome,
        new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 75)),
      ]),
    ).resolves.toBe('pending');
  }

  it('accepts exactly two candidates and rejects the concurrent third candidate', async () => {
    const position = await prisma.position.findUniqueOrThrow({ where: { code: 'GURU_BK' } });
    expect(position.maxActiveHolders).toBe(2);
    const year = await prisma.academicYear.create({
      data: {
        code: `BK${randomUUID().slice(0, 7)}`,
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2027-06-30T00:00:00Z'),
        isActive: false,
      },
    });
    academicYearId = year.id;
    const staff = await Promise.all(['one', 'two', 'three'].map(createStaff));

    const results = await Promise.allSettled(
      staff.map((person) =>
        prisma.appointment.create({
          data: {
            staffId: person.id,
            positionId: position.id,
            academicYearId: year.id,
            effectiveFrom: new Date('2026-07-01T00:00:00Z'),
            status: 'PENDING_APPROVAL',
          },
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.appointment.count({
        where: {
          positionId: position.id,
          academicYearId: year.id,
          status: 'PENDING_APPROVAL',
        },
      }),
    ).resolves.toBe(2);
  });

  it('gives exactly one transaction ownership of a concurrent password reset', async () => {
    let announceLock: (() => void) | undefined;
    let releaseLock: (() => void) | undefined;
    const lockAcquired = new Promise<void>((resolve) => {
      announceLock = resolve;
    });
    const holdLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const first = prisma.$transaction(
      async (tx) => {
        await acquireUserMutationLocks(tx, ['password-target']);
        announceLock?.();
        await holdLock;
      },
      { timeout: 10_000 },
    );
    await lockAcquired;

    await expect(
      prisma.$transaction((tx) => acquireUserMutationLocks(tx, ['password-target'])),
    ).rejects.toThrow('sedang diproses');
    releaseLock?.();
    await first;

    await expect(
      prisma.$transaction((tx) => acquireUserMutationLocks(tx, ['password-target'])),
    ).resolves.toBeUndefined();
  });

  it('keeps a scaled transaction alive beyond all simulated Keycloak phases', async () => {
    const options = createKeycloakMutationTransactionOptions({
      callCount: 3,
      requestTimeoutMs: 50,
      retryAttempt: 1,
      marginMs: 150,
    });
    let externalMutationCompleted = false;

    await expect(
      prisma.$transaction(async (tx) => {
        await acquireUserMutationLocks(tx, ['scaled-timeout-target']);
        for (let phase = 0; phase < 3; phase++) {
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
        externalMutationCompleted = true;
        await tx.$queryRaw`SELECT 1 AS value FROM pg_sleep(0.05)`;
      }, options),
    ).resolves.toBeUndefined();

    expect(options).toEqual({ maxWait: 5_000, timeout: 450 });
    expect(externalMutationCompleted).toBe(true);
  });

  it('keeps cold-cache role sync alive through four bounded Keycloak operations', async () => {
    const options = createKeycloakMutationTransactionOptions({
      callCount: 4,
      requestTimeoutMs: 50,
      retryAttempt: 1,
      marginMs: 150,
    });
    let roleSyncCompleted = false;

    await expect(
      prisma.$transaction(async (tx) => {
        await acquireUserMutationLocks(tx, ['cold-role-sync-target']);
        for (let operation = 0; operation < 4; operation++) {
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
        roleSyncCompleted = true;
        await tx.$queryRaw`SELECT 1 AS value FROM pg_sleep(0.05)`;
      }, options),
    ).resolves.toBeUndefined();

    expect(options).toEqual({ maxWait: 5_000, timeout: 550 });
    expect(roleSyncCompleted).toBe(true);
  });

  it.each([
    ['role change', false, { role: 'TATA_USAHA' as const }],
    ['disable', false, { isActive: false }],
    ['archive', false, { isActive: false, deletedAt: new Date('2026-10-01T00:00:00Z') }],
    ['restore', true, { isActive: true, deletedAt: null }],
  ])(
    'serializes reset and %s through the same target lock in both orders',
    async (label, initiallyArchived, mutation) => {
      const target = await createProofUser(label.replace(' ', '-'), initiallyArchived);

      let announceReset: (() => void) | undefined;
      let releaseReset: (() => void) | undefined;
      const resetOwned = new Promise<void>((resolve) => {
        announceReset = resolve;
      });
      const holdReset = new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
      const resetFirst = prisma.$transaction(async (tx) => {
        await acquireUserMutationLocks(tx, [target.id]);
        announceReset?.();
        await holdReset;
      });
      await resetOwned;
      await expect(
        prisma.$transaction(async (tx) => {
          await acquireUserMutationLocks(tx, [target.id]);
          await tx.user.update({ where: { id: target.id }, data: mutation });
        }),
      ).rejects.toThrow('sedang diproses');
      releaseReset?.();
      await resetFirst;

      let announceLifecycle: (() => void) | undefined;
      let releaseLifecycle: (() => void) | undefined;
      const lifecycleOwned = new Promise<void>((resolve) => {
        announceLifecycle = resolve;
      });
      const holdLifecycle = new Promise<void>((resolve) => {
        releaseLifecycle = resolve;
      });
      const lifecycleFirst = prisma.$transaction(async (tx) => {
        await acquireUserMutationLocks(tx, [target.id]);
        await tx.user.update({ where: { id: target.id }, data: mutation });
        announceLifecycle?.();
        await holdLifecycle;
      });
      await lifecycleOwned;
      await expect(
        prisma.$transaction((tx) => acquireUserMutationLocks(tx, [target.id])),
      ).rejects.toThrow('sedang diproses');
      releaseLifecycle?.();
      await lifecycleFirst;

      await expect(
        prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
      ).resolves.toMatchObject(mutation);
    },
  );

  it('keeps archive ownership until delayed disable finishes before restore', async () => {
    const actor = await createProofUser('archive-first-actor', false, 'SUPER_ADMIN');
    const target = await createProofUser('archive-first-target');
    const keycloak = createDelayedKeycloak(true, false);
    const lifecycle = {
      reason: 'Archive/restore ordering proof',
      expectedUpdatedAt: target.updatedAt.toISOString(),
    };

    const archive = keycloak.service.archiveUser(target.id, lifecycle, actor.keycloakId);
    await keycloak.waitForDelay();
    await expect(
      keycloak.service.restoreUser(target.id, lifecycle, actor.keycloakId),
    ).rejects.toThrow('sedang diproses');

    keycloak.releaseDelay();
    const archived = await archive;
    const restored = await keycloak.service.restoreUser(
      target.id,
      { ...lifecycle, expectedUpdatedAt: archived.updatedAt.toISOString() },
      actor.keycloakId,
    );

    expect(restored).toMatchObject({ isActive: true, deletedAt: null });
    expect(keycloak.isEnabled()).toBe(true);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ isActive: true, deletedAt: null });
  });

  it('keeps restore ownership until delayed enable finishes before archive', async () => {
    const actor = await createProofUser('restore-first-actor', false, 'SUPER_ADMIN');
    const target = await createProofUser('restore-first-target', true);
    const keycloak = createDelayedKeycloak(false, true);
    const lifecycle = {
      reason: 'Restore/archive ordering proof',
      expectedUpdatedAt: target.updatedAt.toISOString(),
    };

    const restore = keycloak.service.restoreUser(target.id, lifecycle, actor.keycloakId);
    await keycloak.waitForDelay();
    await expect(
      keycloak.service.archiveUser(target.id, lifecycle, actor.keycloakId),
    ).rejects.toThrow('sedang diproses');

    keycloak.releaseDelay();
    const restored = await restore;
    const archived = await keycloak.service.archiveUser(
      target.id,
      { ...lifecycle, expectedUpdatedAt: restored.updatedAt.toISOString() },
      actor.keycloakId,
    );

    expect(archived.isActive).toBe(false);
    expect(archived.deletedAt).toBeInstanceOf(Date);
    expect(keycloak.isEnabled()).toBe(false);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('serializes delayed disable before a newer enable request', async () => {
    const actor = await createProofUser('disable-first-actor', false, 'SUPER_ADMIN');
    const target = await createProofUser('disable-first-target');
    const keycloak = createDelayedKeycloak(true, false);

    const disable = keycloak.service.updateActive(target.id, false, actor.keycloakId);
    await keycloak.waitForDelay();
    const competingEnable = keycloak.service.updateActive(target.id, true, actor.keycloakId);
    await expectStillPending(competingEnable);

    keycloak.releaseDelay();
    await expect(disable).resolves.toMatchObject({ isActive: false });
    await expect(competingEnable).rejects.toThrow('Data pengguna berubah');
    await expect(
      keycloak.service.updateActive(target.id, true, actor.keycloakId),
    ).resolves.toMatchObject({ isActive: true });

    expect(keycloak.isEnabled()).toBe(true);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ isActive: true, deletedAt: null });
  });

  it('serializes delayed enable before a newer disable request', async () => {
    const actor = await createProofUser('enable-first-actor', false, 'SUPER_ADMIN');
    const target = await createProofUser('enable-first-target');
    await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
    const inactive = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const keycloak = createDelayedKeycloak(false, true);

    const enable = keycloak.service.updateActive(inactive.id, true, actor.keycloakId);
    await keycloak.waitForDelay();
    const competingDisable = keycloak.service.updateActive(inactive.id, false, actor.keycloakId);
    await expectStillPending(competingDisable);

    keycloak.releaseDelay();
    await expect(enable).resolves.toMatchObject({ isActive: true });
    await expect(competingDisable).rejects.toThrow('Data pengguna berubah');
    await expect(
      keycloak.service.updateActive(inactive.id, false, actor.keycloakId),
    ).resolves.toMatchObject({ isActive: false });

    expect(keycloak.isEnabled()).toBe(false);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ isActive: false, deletedAt: null });
  });
});
