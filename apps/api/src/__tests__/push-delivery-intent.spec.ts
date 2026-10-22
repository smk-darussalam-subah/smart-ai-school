jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
import * as webpush from 'web-push';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { AuthUser } from '@smk/auth';
import { PushService } from '../push/push.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { VerifyPushDeliverySchema } from '../push/dto/push.dto';

const parent = '12000000-0000-4000-8000-000000000001';
const child = '12000000-0000-4000-8000-000000000002';
const session = '12000000-0000-4000-8000-000000000003';
const logId = '12000000-0000-4000-8000-000000000004';
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-intent';
const auth = { keycloakId: 'synthetic-parent', roles: ['ORANG_TUA'] } as AuthUser;
type Payload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  delivery: { version: 2; messageId: string; refType: string | null; refId: string | null };
  deliveryProof: string;
};

function fixture() {
  const records = [{ jp: 1, status: 'alpha', notes: 'Synthetic only', revision: 1 }];
  const hash = createHash('sha256')
    .update(JSON.stringify(records.map((r) => [r.jp, r.status, r.notes, r.revision])))
    .digest('hex')
    .slice(0, 24);
  const log = {
    id: logId,
    recipient: parent,
    channel: 'push',
    status: 'pending',
    subject: 'Kehadiran sesi',
    body: 'Synthetic Alpha JP 1',
    refType: 'student_session_attendance' as string | null,
    refId: `${child}:${session}:${hash}` as string | null,
  };
  const state = { relation: true, session: true, owner: true, log: true, userId: parent };
  const db = {
    user: { findUnique: jest.fn(async () => ({ id: state.userId })) },
    notificationLog: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            recipient: string;
            channel: string;
            status: string | { in: string[] };
          };
        }) =>
          state.log &&
          where.id === log.id &&
          where.recipient === log.recipient &&
          where.channel === log.channel &&
          (typeof where.status === 'string'
            ? where.status === log.status
            : where.status.in.includes(log.status))
            ? log
            : null,
      ),
    },
    pushSubscription: {
      findMany: jest.fn(async () => [
        { id: 'subscription', endpoint, keys: { p256dh: 'synthetic-p', auth: 'synthetic-a' } },
      ]),
      findFirst: jest.fn(async () => (state.owner ? { id: 'subscription' } : null)),
    },
    student: {
      findFirst: jest.fn(async () =>
        state.relation ? { parent: { keycloakId: auth.keycloakId } } : null,
      ),
    },
    classSession: {
      findFirst: jest.fn(async () =>
        state.session
          ? {
              serviceDate: new Date('2026-10-22'),
              academicYear: { code: '2026/2027' },
              semester: { number: 1 },
            }
          : null,
      ),
    },
    studentSessionAttendance: { findMany: jest.fn(async () => records) },
    reportCard: { findFirst: jest.fn(async () => ({ studentId: child })) },
  };
  const service = new PushService(db as unknown as PrismaService);
  const send = async () => {
    // Omit optional kind and fence: classification must come from the stored intent.
    await service.dispatchNotificationLog({
      logId,
      userId: parent,
      title: 'Untrusted caller title',
      body: 'Untrusted caller body',
    });
    const call = jest.mocked(webpush.sendNotification).mock.calls.at(-1);
    if (!call) throw new Error('Expected a provider-accepted payload');
    return JSON.parse(String(call[1])) as Payload;
  };
  const verify = (payload: Payload) =>
    service.verifyDelivery(
      {
        endpoint,
        proof: payload.deliveryProof,
        message: {
          ...payload.delivery,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          tag: payload.tag,
        },
      },
      auth,
    );
  return { records, log, state, db, service, send, verify };
}

/** Real production worker + real verifier, synthetic transport/repository only. */
async function display(service: PushService, payload: Payload) {
  const listeners: Record<
    string,
    (event: { data: { json(): unknown }; waitUntil(p: Promise<unknown>): void }) => void
  > = {};
  const entries = new Map<string, Response>();
  const shown = jest.fn();
  const worker = {
    location: { origin: 'https://synthetic.diis.invalid' },
    addEventListener: (name: string, handler: (typeof listeners)[string]) => {
      listeners[name] = handler;
    },
    registration: {
      pushManager: { getSubscription: async () => ({ endpoint }) },
      showNotification: shown,
    },
    __DIIS_SW_TEST__: undefined as unknown as {
      persistPushStateRecord(v: unknown): Promise<unknown>;
    },
  };
  runInNewContext(readFileSync(resolve(__dirname, '../../../web/public/sw.js'), 'utf8'), {
    self: worker,
    URL,
    Request,
    Response,
    Headers,
    console,
    caches: {
      open: async () => ({
        put: async (k: string, v: Response) => entries.set(k, v),
        match: async (k: string) => entries.get(k)?.clone(),
      }),
    },
    fetch: async (_url: string, options: { body: string }) =>
      new Response(JSON.stringify(await service.verifyDelivery(JSON.parse(options.body), auth)), {
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  await worker.__DIIS_SW_TEST__.persistPushStateRecord({
    state: 'signed-in',
    attemptId: 'synthetic-current-session',
  });
  let pending: Promise<unknown> | undefined;
  listeners.push!({
    data: { json: () => payload },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  return shown;
}

describe('provider-delayed push intent binding', () => {
  const oldPublic = process.env.VAPID_PUBLIC_KEY,
    oldPrivate = process.env.VAPID_PRIVATE_KEY;
  let permission: jest.SpyInstance;
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'synthetic-public';
    process.env.VAPID_PRIVATE_KEY = 'synthetic-private';
    jest
      .mocked(webpush.sendNotification)
      .mockReset()
      .mockResolvedValue({} as never);
    permission = jest
      .spyOn(PermissionsService.prototype, 'hasFreshPermission')
      .mockResolvedValue(true);
  });
  afterEach(() => {
    permission.mockRestore();
    if (oldPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = oldPublic;
    if (oldPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = oldPrivate;
  });
  it.each(['pending', 'sent'])(
    'valid %s intent displays the persisted payload, not caller substitutions',
    async (status) => {
      const f = fixture();
      const payload = await f.send();
      f.log.status = status;
      expect(payload.body).toBe(f.log.body);
      expect(payload.title).toBe(f.log.subject);
      expect(await f.verify(payload)).toEqual({ deliver: true });
      expect(await display(f.service, payload)).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    'transfer',
    'permission',
    'correction',
    'session',
    'missing',
    'failed',
    'channel',
    'recipient',
    'owner',
    'account',
    'body',
    'ref',
  ])('suppresses provider-captured attendance after %s changes', async (change) => {
    const f = fixture();
    const payload = await f.send();
    f.log.status = 'sent';
    if (change === 'transfer') f.state.relation = false;
    if (change === 'permission') permission.mockResolvedValue(false);
    if (change === 'correction') f.records[0]!.revision++;
    if (change === 'session') f.state.session = false;
    if (change === 'missing') f.state.log = false;
    if (change === 'failed') f.log.status = 'failed';
    if (change === 'channel') f.log.channel = 'email';
    if (change === 'recipient') f.log.recipient = child;
    if (change === 'owner') f.state.owner = false;
    if (change === 'account') f.state.userId = child;
    if (change === 'body') f.log.body = 'Corrected body';
    if (change === 'ref') f.log.refId = `${child}:${session}:${'b'.repeat(24)}`;
    expect(await f.verify(payload)).toEqual({ deliver: false });
    expect(await display(f.service, payload)).not.toHaveBeenCalled();
  });
  it.each(['messageId', 'refType', 'refId', 'title', 'body', 'url', 'tag', 'version'])(
    'rejects tampered %s and cannot downgrade a private intent',
    async (field) => {
      const f = fixture();
      const payload = await f.send();
      const changed = JSON.parse(JSON.stringify(payload)) as Payload;
      if (field === 'version') (changed.delivery as { version: number }).version = 1;
      else if (['messageId', 'refType', 'refId'].includes(field))
        Object.assign(changed.delivery, { [field]: field === 'messageId' ? child : 'tampered' });
      else Object.assign(changed, { [field]: 'tampered' });
      expect(await display(f.service, changed)).not.toHaveBeenCalled();
    },
  );
  it('rejects legacy universal proofs and stripped context (old-worker request)', async () => {
    const f = fixture();
    const payload = await f.send();
    const legacyProof = createHmac('sha256', 'synthetic-private')
      .update(parent)
      .update('\0')
      .update(endpoint)
      .digest('hex');
    expect(await f.verify({ ...payload, deliveryProof: legacyProof })).toEqual({ deliver: false });
    const stripped = { endpoint, proof: payload.deliveryProof };
    expect(VerifyPushDeliverySchema.safeParse(stripped).success).toBe(false);
    expect(await f.service.verifyDelivery(stripped as never, auth)).toEqual({ deliver: false });
    expect(
      await display(f.service, { ...payload, delivery: undefined } as unknown as Payload),
    ).not.toHaveBeenCalled();
  });
  it.each(['report-card', 'class_session_alert', null])(
    'preserves current %s pushes without attendance permissions',
    async (refType) => {
      const f = fixture();
      f.log.refType = refType;
      f.log.refId = refType === 'report-card' ? session : null;
      permission.mockResolvedValue(false);
      f.state.relation = false;
      const payload = await f.send();
      f.log.status = 'sent';
      expect(await f.verify(payload)).toEqual({ deliver: true });
      expect(await display(f.service, payload)).toHaveBeenCalledTimes(1);
      expect(f.db.student.findFirst).not.toHaveBeenCalled();
    },
  );
  it('does not sign a missing or revoked attendance intent even without caller kind/fence', async () => {
    const f = fixture();
    f.state.relation = false;
    expect(
      await f.service.dispatchNotificationLog({ logId, userId: parent, title: 'a', body: 'b' }),
    ).toEqual({ attempted: 0, staleRemoved: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
