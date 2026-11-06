import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PermissionsService } from '../permissions/permissions.service';
import type { PrismaService } from '../prisma/prisma.service';

const url = process.env.CAPACITY_AUTHORITY_TEST_URL;
const postgres = url ? describe : describe.skip;
postgres('actual PostgreSQL authority errors and fresh transaction boundaries', () => {
  let db: PrismaClient, service: PermissionsService;
  beforeAll(async () => {
    if (
      !url ||
      !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/diis_test_capacity_authority(?:\?|$)/.test(url)
    )
      throw Error('Dedicated loopback disposable DB required');
    db = new PrismaClient({ datasourceUrl: url });
    service = new PermissionsService(db as unknown as PrismaService);
    await db.$connect();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const actor = () =>
    db.user.create({
      data: {
        keycloakId: randomUUID(),
        email: randomUUID() + '@example.invalid',
        fullName: 'Disposable authority fixture',
        role: 'SUPER_ADMIN',
      },
    });
  it('actual timed-out role read produces503 and rolls back a marker written earlier in the transaction', async () => {
    const user = await actor(),
      marker = randomUUID();
    let ready!: () => void, unlock!: () => void;
    const locked = new Promise<void>((r) => {
        ready = r;
      }),
      hold = new Promise<void>((r) => {
        unlock = r;
      });
    const locker = db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('LOCK TABLE auth.users IN ACCESS EXCLUSIVE MODE');
        ready();
        await hold;
      },
      { timeout: 10000 },
    );
    try {
      await locked;
      await expect(
        db.$transaction(
          async (tx) => {
            await tx.auditLog.create({
              data: {
                id: marker,
                actorRoles: ['GURU'],
                action: 'qa.authority-rollback',
                method: 'POST',
                path: '/qa/disposable',
                statusCode: 200,
                outcome: 'success',
              },
            });
            await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '75ms'");
            return service.hasFreshPermission(user.keycloakId, 'report.wali.manage', tx);
          },
          { timeout: 5000 },
        ),
      ).rejects.toMatchObject({ status: 503, response: { code: 'AUTHORITY_UNAVAILABLE' } });
    } finally {
      unlock();
      await locker;
    }
    expect(await db.auditLog.count({ where: { id: marker } })).toBe(0);
    expect(await service.getAuthoritativePrimaryRole(user.keycloakId)).toBe('SUPER_ADMIN');
  });
  it('role change and disable after request entry are seen by fresh post-queue/transaction checks', async () => {
    const user = await actor(),
      request = {};
    expect(await service.getAuthoritativePrimaryRole(user.keycloakId, undefined, request)).toBe(
      'SUPER_ADMIN',
    );
    await db.user.update({ where: { id: user.id }, data: { role: 'TATA_USAHA' } });
    await db.$transaction(async (tx) => {
      expect(await service.getAuthoritativePrimaryRole(user.keycloakId, tx, request)).toBe(
        'TATA_USAHA',
      );
    });
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await service.getAuthoritativePrimaryRole(user.keycloakId)).toBeNull();
    await db.$transaction(async (tx) => {
      expect(await service.hasFreshPermission(user.keycloakId, 'report.wali.manage', tx)).toBe(
        false,
      );
    });
  });
});
