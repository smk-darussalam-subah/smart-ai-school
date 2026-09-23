import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';

const repoRoot = path.resolve(__dirname, '../../../..');
const schema = readFileSync(path.join(repoRoot, 'packages/database/prisma/schema.prisma'), 'utf8');
const migration = readFileSync(path.join(
  repoRoot,
  'packages/database/prisma/migrations/20260921000001_push_subscription_global_endpoint_ownership/migration.sql',
), 'utf8');
const service = readFileSync(path.join(repoRoot, 'apps/api/src/push/push.service.ts'), 'utf8');

describe('PWA push endpoint ownership migration contract', () => {
  it('binds each endpoint to one global owner while retaining the user lookup index', () => {
    const model = schema.slice(
      schema.indexOf('model PushSubscription'),
      schema.indexOf('model LoginEvent'),
    );
    expect(model).toContain('@@unique([endpoint])');
    expect(model).toContain('@@index([userId])');
    expect(model).not.toContain('@@unique([userId, endpoint])');
  });

  it('deduplicates deterministically before replacing the old database constraint', () => {
    expect(migration).toContain('PARTITION BY "endpoint"');
    expect(migration).toContain('ORDER BY "created_at" DESC, "id" DESC');
    expect(migration).toContain('ranked.row_number > 1');
    expect(migration).toContain('DROP CONSTRAINT "push_subscriptions_user_id_endpoint_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"');
  });

  it('uses one monotonic database CAS for transfer and never logs a capability endpoint', () => {
    const subscribeBlock = service.slice(
      service.indexOf('async subscribe'),
      service.indexOf('/** Remove a push subscription */'),
    );
    expect(subscribeBlock).toContain('this.prisma.$queryRaw');
    expect(subscribeBlock).toContain('ON CONFLICT ("endpoint") DO UPDATE');
    expect(subscribeBlock).toContain('bindingIssuedAt');
    expect(subscribeBlock).toContain('current_subscription."user_id" = EXCLUDED."user_id"');
    expect(subscribeBlock).toContain('END < ${bindingIssuedAt}');
    expect(subscribeBlock).toContain('END = ${bindingIssuedAt}');
    expect(subscribeBlock).not.toContain('logger.');
    expect(subscribeBlock).not.toContain('console.');
  });
});

const databaseUrl = process.env.PWA_PUSH_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('PWA push endpoint ownership PostgreSQL CAS', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const service = new PushService(prisma as unknown as PrismaService);
  const userIds: string[] = [];
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    const marker = await prisma.$queryRaw<Array<{ marker: string }>>`
      SELECT "marker" FROM "public"."diis_disposable_test_marker" LIMIT 1
    `;
    const parsed = new URL(databaseUrl!);
    if (
      process.env.PWA_PUSH_DATABASE_CONFIRMATION !== 'CONFIRM_DISPOSABLE_PWA_PUSH'
      || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
      || !/^diis_test_pwa_push_[a-z0-9_]+$/i.test(identity!.currentDatabase)
      || marker[0]?.marker !== 'PWA_PUSH_DISPOSABLE_V1'
    ) {
      throw new Error('PWA push CAS proof requires an explicitly marked local disposable database.');
    }
  });

  afterAll(async () => {
    try {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } });
      if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('keeps the newer account owner when an older authenticated binding arrives later', async () => {
    const userA = await prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `pwa-a-${randomUUID()}@example.invalid`,
        fullName: 'PWA CAS A',
        role: 'SISWA',
      },
    });
    const userB = await prisma.user.create({
      data: {
        keycloakId: randomUUID(),
        email: `pwa-b-${randomUUID()}@example.invalid`,
        fullName: 'PWA CAS B',
        role: 'SISWA',
      },
    });
    userIds.push(userA.id, userB.id);
    const actor = (keycloakId: string, tokenIssuedAt: number): AuthUser => ({
      keycloakId,
      tokenIssuedAt,
      email: '',
      username: keycloakId,
      fullName: 'PWA CAS',
      roles: ['SISWA'],
    });

    await expect(service.subscribe(
      { endpoint, keys: { p256dh: 'newer', auth: 'newer' } },
      actor(userB.keycloakId, 200),
    )).resolves.toEqual({ reconciled: true });
    await expect(service.subscribe(
      { endpoint, keys: { p256dh: 'stale-same-owner', auth: 'stale-same-owner' } },
      actor(userB.keycloakId, 100),
    )).resolves.toEqual({ reconciled: false });
    await expect(service.subscribe(
      { endpoint, keys: { p256dh: 'intermediate', auth: 'intermediate' } },
      actor(userA.keycloakId, 150),
    )).resolves.toEqual({ reconciled: false });

    const stored = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(stored.userId).toBe(userB.id);
    expect(stored.keys).toMatchObject({ bindingIssuedAt: 200, p256dh: 'newer', auth: 'newer' });
  });
});
