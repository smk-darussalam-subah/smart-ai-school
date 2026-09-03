import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { UserStatusService } from '../auth/user-status.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const databaseUrl = process.env.WAVE10_IDENTITY_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const DISPOSABLE_CONFIRMATION = 'CONFIRM_DISPOSABLE_WAVE10_IDENTITY';
const DISPOSABLE_MARKER = 'WAVE10_IDENTITY_DISPOSABLE_V1';

function assertDisposableDatabase(input: {
  databaseUrl: string;
  confirmation: string | undefined;
  currentDatabase: string;
  marker: string | null;
}): void {
  const parsed = new URL(input.databaseUrl);
  const requestedDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const localHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const disposableName = /^diis_(?:dryrun|test)_wave10_[a-z0-9_]+$/i.test(input.currentDatabase);
  if (
    input.confirmation !== DISPOSABLE_CONFIRMATION ||
    input.marker !== DISPOSABLE_MARKER ||
    !localHost ||
    !disposableName ||
    requestedDatabase !== input.currentDatabase
  ) {
    throw new Error(
      `Wave 10 identity proof requires an explicitly marked local disposable database ` +
        `(confirmation=${input.confirmation === DISPOSABLE_CONFIRMATION}, ` +
        `marker=${input.marker === DISPOSABLE_MARKER}, localHost=${localHost}, ` +
        `disposableName=${disposableName}, databaseMatch=${requestedDatabase === input.currentDatabase}).`,
    );
  }
}

describePostgres('UsersService last active Super Admin PostgreSQL concurrency', () => {
  const prismaA = new PrismaClient({ datasourceUrl: databaseUrl });
  const prismaB = new PrismaClient({ datasourceUrl: databaseUrl });
  const keycloak = {
    getUserRealmRoles: jest.fn().mockResolvedValue(['SUPER_ADMIN']),
    assignRealmRole: jest.fn().mockResolvedValue(undefined),
    removeRealmRole: jest.fn().mockResolvedValue(undefined),
    setEnabled: jest.fn().mockResolvedValue(undefined),
  } as unknown as KeycloakAdminService;
  const permissions = {
    invalidateUser: jest.fn(),
  } as unknown as PermissionsService;
  const userStatus = {
    invalidate: jest.fn(),
  } as unknown as UserStatusService;
  const serviceA = new UsersService(
    prismaA as unknown as PrismaService,
    userStatus,
    keycloak,
    permissions,
  );
  const serviceB = new UsersService(
    prismaB as unknown as PrismaService,
    userStatus,
    keycloak,
    permissions,
  );
  const userIds: string[] = [];
  let adminA: { id: string; keycloakId: string };
  let adminB: { id: string; keycloakId: string };

  beforeAll(async () => {
    const [identity] = await prismaA.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    const marker = await prismaA.$queryRaw<Array<{ marker: string }>>`
      SELECT "marker" FROM "public"."diis_disposable_test_marker" LIMIT 1
    `;
    assertDisposableDatabase({
      databaseUrl: databaseUrl!,
      confirmation: process.env.WAVE10_IDENTITY_DATABASE_CONFIRMATION,
      currentDatabase: identity!.currentDatabase,
      marker: marker[0]?.marker ?? null,
    });

    const existingActiveAdmins = await prismaA.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
    });
    if (existingActiveAdmins !== 0) {
      throw new Error(
        'Disposable Wave 10 identity database must not contain active Super Admin fixtures.',
      );
    }

    const suffix = randomUUID();
    adminA = await prismaA.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `wave10-admin-a-${suffix}@example.invalid`,
        fullName: 'Wave 10 Admin A',
        role: 'SUPER_ADMIN',
      },
      select: { id: true, keycloakId: true },
    });
    adminB = await prismaA.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `wave10-admin-b-${suffix}@example.invalid`,
        fullName: 'Wave 10 Admin B',
        role: 'SUPER_ADMIN',
      },
      select: { id: true, keycloakId: true },
    });
    userIds.push(adminA.id, adminB.id);
  });

  beforeEach(async () => {
    await prismaA.user.updateMany({
      where: { id: { in: userIds } },
      data: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
    });
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) await prismaA.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  async function expectExactlyOneRejected(operations: [Promise<unknown>, Promise<unknown>]) {
    const results = await Promise.allSettled(operations);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prismaA.user.count({
        where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
      }),
    ).toBeGreaterThanOrEqual(1);
  }

  it('serializes concurrent demote versus demote', async () => {
    await expectExactlyOneRejected([
      serviceA.updateRole(adminB.id, 'GURU', adminA.keycloakId),
      serviceB.updateRole(adminA.id, 'GURU', adminB.keycloakId),
    ]);
  });

  it('serializes concurrent deactivate versus deactivate', async () => {
    await expectExactlyOneRejected([
      serviceA.updateActive(adminB.id, false, adminA.keycloakId),
      serviceB.updateActive(adminA.id, false, adminB.keycloakId),
    ]);
  });

  it('serializes concurrent demote versus deactivate', async () => {
    await expectExactlyOneRejected([
      serviceA.updateRole(adminB.id, 'GURU', adminA.keycloakId),
      serviceB.updateActive(adminA.id, false, adminB.keycloakId),
    ]);
  });
});
