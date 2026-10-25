import { Prisma, PrismaClient } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiProviderStatusService } from '../ai/ai-provider-status.service';
import { QuestionBankService } from '../question-bank/question-bank.service';

const url = process.env.STUDENT_JP_DATABASE_URL;
if (
  url &&
  url !== 'postgresql://diis_local:diis_local@127.0.0.1:55445/diis_learning_ai_remediation'
)
  throw Error('Exact disposable loopback database only');
const proof = url ? describe : describe.skip;
proof('R08 regenerate commit on disposable PostgreSQL', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const forbidden = {
    chat: jest.fn(async () => {
      throw Error('Unexpected provider call');
    }),
  };
  const ai = (db: PrismaClient = prisma, provider: { chat: () => Promise<string> } = forbidden) =>
    new AiGenerateService(
      db as PrismaService,
      provider as never,
      null,
      {} as AiProviderStatusService,
    );
  let session: Awaited<ReturnType<typeof prisma.classSession.findFirstOrThrow>>, user: AuthUser;
  beforeAll(async () => {
    session = await prisma.classSession.findFirstOrThrow({
      where: { classNameSnapshot: 'X SYN' },
      orderBy: { scheduledStartAt: 'asc' },
    });
    const teacher = await prisma.teacher.findUniqueOrThrow({
      where: { id: session.assignedTeacherId },
      include: { user: true },
    });
    user = {
      keycloakId: teacher.user.keycloakId,
      roles: ['GURU'],
      username: 'synthetic',
      fullName: 'Synthetic',
      email: 'synthetic@example.invalid',
    };
  });
  beforeEach(() => forbidden.chat.mockClear());
  afterAll(async () => {
    await prisma.$disconnect();
  });
  async function fixture() {
    const module = await prisma.lmsModule.create({
      data: {
        teacherId: session.assignedTeacherId,
        classId: session.classId,
        subject: session.subjectSnapshot,
        title: 'Synthetic delayed regeneration',
        tp: 'Memahami bilangan.',
        content: 'Bilangan bulat dan penjumlahan.',
        academicYear: '2026/2027',
        semester: 1,
      },
    });
    const items = [
      'Nol terletak di antara bilangan positif dan negatif.',
      'Dua kantong berisi lima kelereng masing masing menghasilkan sepuluh benda.',
    ].map((body, n) => ({
      itemKey: `regen-proof-item-${n}`,
      question: {
        type: 'true_false' as const,
        subject: session.subjectSnapshot,
        body,
        answer: true,
        difficulty: 'easy' as const,
        tags: [] as string[],
      },
      tpRefs: ['TP 1'],
      cognitiveLevel: 'C2' as const,
      rationale: 'Synthetic',
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
        requestSpec: {
          request: { purpose: 'formatif', contextMode: 'umum', character: 'konseptual' },
        },
      },
    });
    return {
      row,
      module,
      items,
      dto: (indices: number[], key = 'regen-proof-accept-key') => ({
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
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function delayed(f: Fixture, index = 0, db: PrismaClient = prisma) {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (enter = r)),
      gate = new Promise<void>((r) => (release = r));
    const replacement = {
      ...f.items[index]!,
      question: {
        ...f.items[index]!.question,
        body:
          index === 0
            ? 'Bilangan minus tujuh berada di sebelah kiri angka satu pada garis bilangan.'
            : 'Jarak dua titik yang sama adalah nol satuan.',
      },
    };
    const provider = {
      chat: jest.fn(async () => {
        enter();
        await gate;
        return JSON.stringify({ items: [replacement] });
      }),
    };
    const pending = ai(db, provider)
      .regenerateQuestionDraftItem(f.row.id, f.items[index]!.itemKey, {}, user)
      .then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error: error as { status: number } }),
      );
    return { provider, replacement, entered, release, pending };
  }
  async function state(id: string) {
    return {
      generation: await prisma.aiGeneration.findUniqueOrThrow({ where: { id } }),
      questions: await prisma.question.findMany({
        where: { aiGenerationId: id },
        orderBy: { id: 'asc' },
      }),
      receipts: await prisma.aiDraftAcceptance.findMany({
        where: { aiGenerationId: id },
        orderBy: { id: 'asc' },
      }),
    };
  }
  it('happy path replaces only the requested item, without accepting or publishing it', async () => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      r.release();
      const result = await r.pending;
      expect(result.error).toBeNull();
      expect(result.value?.item.itemKey).toBe(f.items[0]!.itemKey);
      const current = await state(f.row.id);
      expect(current.generation.status).toBe('drafted');
      expect(JSON.parse(current.generation.output).items).toEqual([r.replacement, f.items[1]]);
      expect(current.questions).toHaveLength(0);
      expect(current.receipts).toHaveLength(0);
      expect(r.provider.chat).toHaveBeenCalledTimes(1);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('R08: a rejected generation cannot be reopened by a late provider response', async () => {
    const f = await fixture(),
      r = delayed(f),
      dto = { idempotencyKey: 'regen-proof-reject-before-response' };
    try {
      await r.entered;
      await ai().rejectQuestionDrafts(f.row.id, dto, user);
      const before = await state(f.row.id);
      expect(before.generation.status).toBe('rejected');
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
      await expect(ai().rejectQuestionDrafts(f.row.id, dto, user)).resolves.toEqual({
        generationId: f.row.id,
        rejected: true,
      });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('reject-first denies regenerate before making a provider call', async () => {
    const f = await fixture();
    try {
      await ai().rejectQuestionDrafts(
        f.row.id,
        { idempotencyKey: 'regen-proof-reject-first' },
        user,
      );
      const before = await state(f.row.id);
      await expect(
        ai().regenerateQuestionDraftItem(f.row.id, f.items[0]!.itemKey, {}, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(forbidden.chat).not.toHaveBeenCalled();
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('regenerate-first can still be rejected afterwards, without creating questions', async () => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      r.release();
      expect((await r.pending).error).toBeNull();
      await ai().rejectQuestionDrafts(
        f.row.id,
        { idempotencyKey: 'regen-proof-reject-after' },
        user,
      );
      const current = await state(f.row.id);
      expect(current.generation.status).toBe('rejected');
      expect(current.questions).toHaveLength(0);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it.each([
    { label: 'target partial', indices: [0] },
    { label: 'all', indices: [0, 1] },
  ])('accept $label during provider latency blocks the stale replacement', async ({ indices }) => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      await ai().acceptQuestionDrafts(f.row.id, f.dto(indices), user);
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('accept-first denies target regeneration before the provider', async () => {
    const f = await fixture();
    try {
      await ai().acceptQuestionDrafts(f.row.id, f.dto([0]), user);
      const before = await state(f.row.id);
      await expect(
        ai().regenerateQuestionDraftItem(f.row.id, f.items[0]!.itemKey, {}, user),
      ).rejects.toMatchObject({ status: 409 });
      expect(forbidden.chat).not.toHaveBeenCalled();
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('regenerate-first output can be accepted using its actual returned payload', async () => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      r.release();
      const result = await r.pending;
      if (!result.value) throw Error('Expected replacement');
      const { itemKey, question, tpRefs, cognitiveLevel } = result.value.item;
      const saved = await ai().acceptQuestionDrafts(
        f.row.id,
        {
          idempotencyKey: 'regen-proof-accept-new-output',
          items: [{ itemKey, question, tpRefs, cognitiveLevel }],
        },
        user,
      );
      expect(saved.acceptedCount).toBe(1);
      expect(saved.questions[0]!.body).toBe(r.replacement.question.body);
      expect((await state(f.row.id)).generation.status).toBe('partially_accepted');
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('an unaccepted item can regenerate on a partial generation without downgrading status', async () => {
    const f = await fixture();
    let r: ReturnType<typeof delayed> | undefined;
    try {
      await ai().acceptQuestionDrafts(f.row.id, f.dto([1]), user);
      const before = await state(f.row.id);
      r = delayed(f, 0);
      await r.entered;
      r.release();
      expect((await r.pending).error).toBeNull();
      const current = await state(f.row.id);
      expect(current.generation.status).toBe('partially_accepted');
      expect(current.questions).toEqual(before.questions);
      expect(current.receipts).toEqual(before.receipts);
      expect(JSON.parse(current.generation.output).items[1]).toEqual(f.items[1]);
    } finally {
      r?.release();
      if (r) await r.pending;
      await f.dispose();
    }
  });
  it('accepting a different item during provider latency preserves that acceptance', async () => {
    const f = await fixture(),
      r = delayed(f, 0);
    try {
      await r.entered;
      await ai().acceptQuestionDrafts(f.row.id, f.dto([1]), user);
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toBeNull();
      const current = await state(f.row.id);
      expect(current.generation.status).toBe('partially_accepted');
      expect(current.questions).toEqual(before.questions);
      expect(current.receipts).toEqual(before.receipts);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('accepted target tombstone remains authoritative after the question is deleted', async () => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      const saved = await ai().acceptQuestionDrafts(f.row.id, f.dto([0]), user);
      await new QuestionBankService(prisma as PrismaService).remove(saved.questions[0]!.id, user);
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it.each([0, 1])(
    'parallel regenerate of item %i cannot overwrite a newer full-output snapshot',
    async (index) => {
      const f = await fixture(),
        older = delayed(f, 0),
        newer = delayed(f, index);
      try {
        await Promise.all([older.entered, newer.entered]);
        newer.release();
        expect((await newer.pending).error).toBeNull();
        const before = await state(f.row.id);
        older.release();
        expect((await older.pending).error).toMatchObject({ status: 409 });
        expect(await state(f.row.id)).toEqual(before);
      } finally {
        older.release();
        newer.release();
        await Promise.all([older.pending, newer.pending]);
        await f.dispose();
      }
    },
  );
  it('a changed generation request snapshot invalidates an outstanding result', async () => {
    const f = await fixture(),
      r = delayed(f);
    try {
      await r.entered;
      await prisma.aiGeneration.update({
        where: { id: f.row.id },
        data: {
          requestSpec: {
            request: {
              purpose: 'formatif',
              contextMode: 'umum',
              character: 'konseptual',
              teacherInstruction: 'Gunakan konteks baru.',
            },
          },
        },
      });
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it('provider latency holds no DB transaction: pool1 remains usable, then reject wins', async () => {
    const f = await fixture(),
      single = new PrismaClient({ datasourceUrl: url + '?connection_limit=1&pool_timeout=1' }),
      r = delayed(f, 0, single);
    try {
      await r.entered;
      const rows = await single.$transaction((tx) =>
        tx.$queryRaw<Array<{ ready: number }>>(Prisma.sql`SELECT 1 AS ready`),
      );
      expect(rows[0]!.ready).toBe(1);
      await ai(single).rejectQuestionDrafts(
        f.row.id,
        { idempotencyKey: 'regen-proof-pool-reject' },
        user,
      );
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await single.$disconnect();
      await f.dispose();
    }
  });
  it('zero-row final write is a conflict without output/state drift (fault injection)', async () => {
    const f = await fixture();
    const proxy = new Proxy(prisma, {
      get(target, key) {
        if (key === '$transaction')
          return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
            target.$transaction((tx) =>
              run(
                new Proxy(tx, {
                  get(client, method) {
                    if (method === 'aiGeneration')
                      return new Proxy(client.aiGeneration, {
                        get(model, op) {
                          if (op === 'updateMany') return async () => ({ count: 0 });
                          const value = Reflect.get(model, op);
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
    const r = delayed(f, 0, proxy);
    try {
      await r.entered;
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 409 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r.release();
      await r.pending;
      await f.dispose();
    }
  });
  it.each(['manual', 'other-generation'] as const)(
    'duplicate guard still includes a %s bank question',
    async (source) => {
      const f = await fixture(),
        r = delayed(f),
        other = source === 'other-generation' ? await fixture() : null;
      let questionId: string | undefined;
      try {
        await r.entered;
        const question = await prisma.question.create({
          data: {
            teacherId: session.assignedTeacherId,
            subject: session.subjectSnapshot,
            type: 'true_false',
            body: r.replacement.question.body,
            answer: 'true',
            difficulty: 'easy',
            tags: [],
            ...(other
              ? {
                  source: 'AI_ASSISTED',
                  aiGenerationId: other.row.id,
                  aiItemKey: 'other-existing-item',
                  tpRefs: ['TP 1'],
                  cognitiveLevel: 'C2',
                }
              : { source: 'MANUAL' }),
          },
        });
        questionId = question.id;
        const before = await state(f.row.id);
        r.release();
        expect((await r.pending).error).toMatchObject({ status: 502 });
        expect(await state(f.row.id)).toEqual(before);
      } finally {
        r.release();
        await r.pending;
        if (questionId) await prisma.question.delete({ where: { id: questionId } });
        await other?.dispose();
        await f.dispose();
      }
    },
  );
  it('foreign ownership denies regenerate without calling the provider', async () => {
    const f = await fixture();
    try {
      const before = await state(f.row.id);
      await expect(
        ai().regenerateQuestionDraftItem(
          f.row.id,
          f.items[0]!.itemKey,
          {},
          { ...user, keycloakId: '00000000-0000-4000-8000-999999999999' },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(forbidden.chat).not.toHaveBeenCalled();
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
  it('successful regeneration also finalizes with a one-connection pool', async () => {
    const f = await fixture(),
      single = new PrismaClient({ datasourceUrl: url + '?connection_limit=1&pool_timeout=1' }),
      r = delayed(f, 0, single);
    try {
      await r.entered;
      r.release();
      expect((await r.pending).error).toBeNull();
      expect((await state(f.row.id)).generation.status).toBe('drafted');
    } finally {
      r.release();
      await r.pending;
      await single.$disconnect();
      await f.dispose();
    }
  });
  it('an edited accepted sibling is still included in the replacement bank duplicate guard', async () => {
    const f = await fixture();
    let r: ReturnType<typeof delayed> | undefined;
    try {
      const saved = await ai().acceptQuestionDrafts(f.row.id, f.dto([1]), user);
      r = delayed(f, 0);
      await r.entered;
      await new QuestionBankService(prisma as PrismaService).update(
        saved.questions[0]!.id,
        { ...f.items[1]!.question, body: r.replacement.question.body },
        user,
      );
      const before = await state(f.row.id);
      r.release();
      expect((await r.pending).error).toMatchObject({ status: 502 });
      expect(await state(f.row.id)).toEqual(before);
    } finally {
      r?.release();
      if (r) await r.pending;
      await f.dispose();
    }
  });
});
