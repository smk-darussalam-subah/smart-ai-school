import { Prisma, PrismaClient } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiProviderStatusService } from '../ai/ai-provider-status.service';

const url = process.env.STUDENT_JP_DATABASE_URL;
if (
  url &&
  url !== 'postgresql://diis_local:diis_local@127.0.0.1:55445/diis_learning_ai_remediation'
)
  throw Error('Exact disposable loopback database only');
const proof = url ? describe : describe.skip;
proof('R06/R07 reject lifecycle on PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const gateway = {
    generate: jest.fn(async () => {
      throw Error('Provider calls forbidden');
    }),
  };
  const ai = (db: PrismaClient = prisma) =>
    new AiGenerateService(
      db as PrismaService,
      gateway as never,
      null,
      {} as AiProviderStatusService,
    );
  let session: Awaited<ReturnType<typeof prisma.classSession.findFirstOrThrow>>, user: AuthUser;
  beforeAll(async () => {
    // The existing 34-case JP suite provides only this disposable synthetic class/teacher.
    session = await prisma.classSession.findFirstOrThrow({
      where: { classNameSnapshot: 'X SYN' },
      orderBy: { scheduledStartAt: 'asc' },
    });
    const profile = await prisma.teacher.findUniqueOrThrow({
      where: { id: session.assignedTeacherId },
      include: { user: true },
    });
    user = {
      keycloakId: profile.user.keycloakId,
      roles: ['GURU'],
      username: 'synthetic',
      email: 'synthetic@example.invalid',
      fullName: 'Synthetic',
    };
  });
  beforeEach(() => gateway.generate.mockClear());
  afterAll(async () => {
    await prisma.$disconnect();
  });
  async function fixture() {
    const module = await prisma.lmsModule.create({
      data: {
        teacherId: session.assignedTeacherId,
        classId: session.classId,
        subject: session.subjectSnapshot,
        title: 'Synthetic reject lifecycle',
        tp: 'Memahami bilangan.',
        content: 'Bilangan negatif kurang dari nol.',
        academicYear: '2026/2027',
        semester: 1,
      },
    });
    const items = [1, 2].map((n) => ({
      itemKey: `reject-proof-item-${n}`,
      question: {
        type: 'true_false' as const,
        subject: session.subjectSnapshot,
        body: `Pernyataan bilangan sintetis nomor ${n}.`,
        answer: true,
        difficulty: 'easy' as const,
        tags: [] as string[],
      },
      tpRefs: ['TP 1'],
      cognitiveLevel: 'C2' as const,
      rationale: 'Synthetic only',
      warnings: [] as string[],
    }));
    const row = await prisma.aiGeneration.create({
      data: {
        teacherId: session.assignedTeacherId,
        type: 'question-drafts',
        prompt: 'Synthetic only',
        output: JSON.stringify({ items }),
        model: 'synthetic',
        sourceType: 'module',
        sourceId: module.id,
        status: 'drafted',
        contextSnapshot: {},
        requestSpec: {},
      },
    });
    return {
      row,
      items,
      dto: (indices: number[], key = 'reject-proof-accept-0001') => ({
        idempotencyKey: key,
        items: indices.map((i) => {
          const { itemKey, question, tpRefs, cognitiveLevel } = items[i]!;
          return { itemKey, question, tpRefs, cognitiveLevel };
        }),
      }),
      dispose: async () => {
        await prisma.question.deleteMany({ where: { aiGenerationId: row.id } });
        await prisma.aiDraftAcceptance.deleteMany({ where: { aiGenerationId: row.id } });
        await prisma.aiGeneration.delete({ where: { id: row.id } });
        await prisma.lmsModule.delete({ where: { id: module.id } });
      },
    };
  }
  function pauseBeforeTransaction() {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (enter = r)),
      gate = new Promise<void>((r) => (release = r));
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return async (...args: unknown[]) => {
            enter();
            await gate;
            return Reflect.apply(target.$transaction, target, args);
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { proxy, entered, release };
  }
  async function state(id: string) {
    return {
      generation: await prisma.aiGeneration.findUniqueOrThrow({ where: { id } }),
      receipts: await prisma.aiDraftAcceptance.findMany({
        where: { aiGenerationId: id },
        orderBy: { id: 'asc' },
      }),
      questions: await prisma.question.findMany({
        where: { aiGenerationId: id },
        orderBy: { id: 'asc' },
      }),
    };
  }
  it('R07: lost-ACK same-key replay confirms the exact committed rejection without writes', async () => {
    const f = await fixture(),
      dto = { idempotencyKey: 'reject-proof-lost-ack' };
    try {
      const first = await ai().rejectQuestionDrafts(f.row.id, dto, user),
        before = await state(f.row.id);
      expect(before.receipts).toHaveLength(1);
      expect(before.receipts[0]!.itemKeys).toEqual([]);
      expect(before.receipts[0]!.status).toBe('accepted');
      expect(await ai().rejectQuestionDrafts(f.row.id, dto, user)).toEqual(first);
      expect(await state(f.row.id)).toEqual(before);
      expect(gateway.generate).not.toHaveBeenCalled();
    } finally {
      await f.dispose();
    }
  });
  it('control: reject-first prevents later accept without creating questions', async () => {
    const f = await fixture();
    try {
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-first' }, user),
      ).resolves.toEqual({ generationId: f.row.id, rejected: true });
      await expect(ai().acceptQuestionDrafts(f.row.id, f.dto([0]), user)).rejects.toMatchObject({
        status: 409,
      });
      expect((await state(f.row.id)).questions).toHaveLength(0);
      expect((await state(f.row.id)).generation.status).toBe('rejected');
    } finally {
      await f.dispose();
    }
  });
  it.each([
    { label: 'partial', indices: [0], expected: 'partially_accepted' },
    { label: 'full', indices: [0, 1], expected: 'accepted' },
  ])(
    'R06: paused reject must recheck after $label accept commits',
    async ({ indices, expected }) => {
      const f = await fixture(),
        gate = pauseBeforeTransaction();
      const rejecting = ai(gate.proxy)
        .rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-paused' }, user)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error: error as { status: number } }),
        );
      try {
        await gate.entered;
        await ai().acceptQuestionDrafts(f.row.id, f.dto(indices), user);
        const before = await state(f.row.id);
        gate.release();
        const result = await rejecting;
        expect(result.error).toMatchObject({ status: 409 });
        expect(result.value).toBeNull();
        expect(await state(f.row.id)).toEqual(before);
        expect(before.generation.status).toBe(expected);
        expect(before.questions).toHaveLength(indices.length);
        expect(gateway.generate).not.toHaveBeenCalled();
      } finally {
        gate.release();
        await rejecting;
        await f.dispose();
      }
    },
  );
  it('R07: concurrent same-key rejects on two instances create one committed receipt', async () => {
    const f = await fixture(),
      dto = { idempotencyKey: 'reject-proof-concurrent' };
    try {
      const results = await Promise.all([
        ai().rejectQuestionDrafts(f.row.id, dto, user),
        ai().rejectQuestionDrafts(f.row.id, dto, user),
      ]);
      expect(results[0]).toEqual(results[1]);
      const current = await state(f.row.id);
      expect(current.receipts).toHaveLength(1);
      expect(current.questions).toHaveLength(0);
      expect(current.generation.status).toBe('rejected');
    } finally {
      await f.dispose();
    }
  });
  it('different reject keys may confirm an already rejected intent without changing generation', async () => {
    const f = await fixture();
    try {
      await ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-key-one' }, user);
      const before = (await state(f.row.id)).generation;
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-key-two' }, user),
      ).resolves.toEqual({ generationId: f.row.id, rejected: true });
      const current = await state(f.row.id);
      expect(current.generation).toEqual(before);
      expect(current.receipts).toHaveLength(2);
      expect(
        current.receipts.every((r) => r.status === 'accepted' && r.itemKeys.length === 0),
      ).toBe(true);
    } finally {
      await f.dispose();
    }
  });
  it('R04 preservation: deleted partial acceptance remains a reject blocker', async () => {
    const f = await fixture();
    try {
      await ai().acceptQuestionDrafts(f.row.id, f.dto([0]), user);
      await prisma.question.deleteMany({ where: { aiGenerationId: f.row.id } });
      const before = await state(f.row.id);
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-deleted' }, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
      await expect(
        ai().acceptQuestionDrafts(f.row.id, f.dto([0], 'reject-proof-retry-accept'), user),
      ).rejects.toMatchObject({ status: 409, response: { error: 'AI_ACCEPTED_ITEM_CHANGED' } });
    } finally {
      await f.dispose();
    }
  });
  it('same key cannot be reused for an accept operation after rejection', async () => {
    const f = await fixture(),
      key = 'reject-proof-shared-key';
    try {
      await ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: key }, user);
      const before = await state(f.row.id);
      await expect(
        ai().acceptQuestionDrafts(f.row.id, f.dto([0], key), user),
      ).rejects.toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('receipt fingerprint mismatch is rejected without changing persistent state', async () => {
    const f = await fixture(),
      key = 'reject-proof-mismatch';
    try {
      await prisma.aiDraftAcceptance.create({
        data: {
          aiGenerationId: f.row.id,
          idempotencyKey: key,
          payloadFingerprint: 'different-operation',
          itemKeys: [],
          status: 'pending',
        },
      });
      const before = await state(f.row.id);
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: key }, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('a committed item receipt blocks reject even with missing question and stale drafted status', async () => {
    const f = await fixture();
    try {
      await ai().acceptQuestionDrafts(f.row.id, f.dto([0]), user);
      await prisma.question.deleteMany({ where: { aiGenerationId: f.row.id } });
      await prisma.aiGeneration.update({ where: { id: f.row.id }, data: { status: 'drafted' } });
      const before = await state(f.row.id);
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-tombstone' }, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('foreign ownership cannot reject or replay another teacher generation', async () => {
    const f = await fixture();
    try {
      await ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-owner' }, user);
      const before = await state(f.row.id);
      const foreign = { ...user, keycloakId: '00000000-0000-4000-8000-999999999999' };
      await expect(
        ai().rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-owner' }, foreign),
      ).rejects.toMatchObject({ status: 403 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('reject and replay also complete with one pool connection', async () => {
    const f = await fixture(),
      single = new PrismaClient({ datasourceUrl: url + '?connection_limit=1&pool_timeout=2' }),
      dto = { idempotencyKey: 'reject-proof-pool-one' };
    try {
      const service = ai(single);
      const first = await service.rejectQuestionDrafts(f.row.id, dto, user);
      expect(await service.rejectQuestionDrafts(f.row.id, dto, user)).toEqual(first);
    } finally {
      await single.$disconnect();
      await f.dispose();
    }
  });
  it('R06: accept really waits on PostgreSQL while reject owns the generation row lock', async () => {
    const f = await fixture(),
      contender = new PrismaClient({
        datasourceUrl:
          url + '?application_name=diis_reject_contender&connection_limit=1&pool_timeout=2',
      });
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (enter = r)),
      gate = new Promise<void>((r) => (release = r));
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
            target.$transaction(
              async (tx) =>
                run(
                  new Proxy(tx, {
                    get(client, method) {
                      if (method === '$queryRaw')
                        return async (...args: unknown[]) => {
                          const result: unknown = await Reflect.apply(
                            client.$queryRaw,
                            client,
                            args,
                          );
                          enter();
                          await gate;
                          return result;
                        };
                      const value = Reflect.get(client, method);
                      return typeof value === 'function' ? value.bind(client) : value;
                    },
                  }),
                ),
              { timeout: 10000 },
            );
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const rejecting = ai(proxy).rejectQuestionDrafts(
      f.row.id,
      { idempotencyKey: 'reject-proof-holds-lock' },
      user,
    );
    let accepting: Promise<unknown> | undefined;
    try {
      await entered;
      accepting = ai(contender)
        .acceptQuestionDrafts(f.row.id, f.dto([0]), user)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error: error as { status: number } }),
        );
      let waiting = false;
      for (let retry = 0; retry < 40 && !waiting; retry++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>(
          Prisma.sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'diis_reject_contender' AND wait_event_type = 'Lock') AS waiting`,
        );
        waiting = rows[0]!.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      release();
      await expect(rejecting).resolves.toEqual({ generationId: f.row.id, rejected: true });
      expect(await accepting).toMatchObject({ value: null, error: { status: 409 } });
      expect((await state(f.row.id)).questions).toHaveLength(0);
    } finally {
      release();
      await Promise.allSettled([rejecting, ...(accepting ? [accepting] : [])]);
      await contender.$disconnect();
      await f.dispose();
    }
  });
  it('zero-row conditional transition rolls back a newly pending reject receipt (fault injection)', async () => {
    const f = await fixture();
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
            target.$transaction((tx) =>
              run(
                new Proxy(tx, {
                  get(client, method) {
                    if (method === 'aiGeneration')
                      return new Proxy(client.aiGeneration, {
                        get(model, operation) {
                          if (operation === 'updateMany') return async () => ({ count: 0 });
                          const value = Reflect.get(model, operation);
                          return typeof value === 'function' ? value.bind(model) : value;
                        },
                      });
                    const value = Reflect.get(client, method);
                    return typeof value === 'function' ? value.bind(client) : value;
                  },
                }),
              ),
            );
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      const before = await state(f.row.id);
      await expect(
        ai(proxy).rejectQuestionDrafts(f.row.id, { idempotencyKey: 'reject-proof-zero-row' }, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('inconsistent committed reject receipt cannot claim success for a non-rejected generation', async () => {
    const f = await fixture(),
      dto = { idempotencyKey: 'reject-proof-state-contradiction' };
    try {
      await ai().rejectQuestionDrafts(f.row.id, dto, user);
      await prisma.aiGeneration.update({ where: { id: f.row.id }, data: { status: 'drafted' } });
      const before = await state(f.row.id);
      await expect(ai().rejectQuestionDrafts(f.row.id, dto, user)).rejects.toMatchObject({
        status: 409,
      });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
});
