jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { GenerateQuestionDraftSchema, GenerateRppStepSchema } from '../ai/dto/generate.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { OpenAiProviderError } from '../ai/adapters/openai.adapter';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';

const RPP_ID = '11111111-1111-4111-8111-111111111111';
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KEGIATAN_PATCH = JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Menyampaikan tujuan pembelajaran.',
    inti: 'Menganalisis grafik fungsi linear.',
    penutup: 'Refleksi dan umpan balik.',
    diferensiasi: 'Menyiapkan dukungan bertahap dan tantangan lanjutan sesuai kesiapan siswa.',
  }],
});
const ATP_PATCH = JSON.stringify({
  atp: [{ tpRef: 'TP 1', indikator: 'Menjelaskan grafik fungsi linear dengan benar.' }],
});
const AI_QUESTION_ITEM = {
  itemKey: 'item-1',
  question: {
    subject: 'Pemrograman Web',
    type: 'multiple_choice' as const,
    body: 'Manakah tag HTML yang digunakan untuk membuat tautan?',
    options: [
      { id: 'a', text: '<a>' },
      { id: 'b', text: '<img>' },
      { id: 'c', text: '<table>' },
      { id: 'd', text: '<form>' },
    ],
    answer: 'a',
    difficulty: 'easy' as const,
    tags: ['html'],
  },
  tpRefs: ['TP 1'],
  cognitiveLevel: 'C2' as const,
  rationale: 'Mengukur pemahaman dasar tag tautan.',
  warnings: [],
};
const AI_QUESTION_OUTPUT = JSON.stringify({ items: [AI_QUESTION_ITEM] });
const MODULE_ID = '22222222-2222-4222-8222-222222222222';
const questionDraftDto = {
  moduleId: MODULE_ID,
  purpose: 'formatif' as const,
  questionCount: 1,
  typeDistribution: { multiple_choice: 1, true_false: 0, matching: 0, essay: 0 },
  difficultyDistribution: { easy: 1, medium: 0, hard: 0 },
  cognitiveDistribution: { C1: 0, C2: 1, C3: 0, C4: 0, C5: 0, C6: 0 },
  tpRefs: ['TP 1'],
  contextMode: 'auto_vokasi' as const,
  character: 'konseptual' as const,
  idempotencyKey: 'draft-key-123456',
};
const questionDraftRequestSpec = {
  source: { type: 'module', id: MODULE_ID },
  purpose: 'formatif',
  questionCount: 1,
  typeDistribution: questionDraftDto.typeDistribution,
  difficultyDistribution: questionDraftDto.difficultyDistribution,
  cognitiveDistribution: questionDraftDto.cognitiveDistribution,
  tpRefs: ['TP 1'],
  contextMode: 'auto_vokasi',
  character: 'konseptual',
  teacherInstruction: null,
};
const ownedModule = {
  id: MODULE_ID,
  teacherId: 'teacher-1',
  classId: 'class-1',
  subject: 'Pemrograman Web',
  title: 'HTML Dasar',
  tp: 'Mengidentifikasi tag HTML dasar.',
  content: 'Tag a membuat tautan dan img menampilkan gambar.',
  academicYear: '2026/2027',
  semester: 1,
  class: { id: 'class-1', name: 'X TKJ 1', grade: 10, majorCode: 'TKJ' },
};
const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: 'test',
  meta: { target: ['teacher_id', 'type', 'idempotency_key'] },
});
const kegiatanPatchWithInti = (inti: string) => JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Apersepsi pembelajaran.',
    inti,
    penutup: 'Refleksi pembelajaran.',
    diferensiasi: 'Pendampingan kelompok kecil dan pilihan produk belajar.',
  }],
});
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));
const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
};
const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value;
};

describe('AiGenerateService - AI-0A Modul Ajar containment', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const userFindMany = jest.fn();
  const teacherFindUnique = jest.fn();
  const rppFindFirst = jest.fn();
  const lmsModuleFindFirst = jest.fn();
  const majorFindUnique = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const questionFindMany = jest.fn();
  const questionCreate = jest.fn();
  const questionFindUnique = jest.fn();
  const questionUpsert = jest.fn();
  const questionCount = jest.fn();
  const aiGenerationFindFirst = jest.fn();
  const aiGenerationCreate = jest.fn();
  const aiGenerationUpdate = jest.fn();
  const aiGenerationUpdateMany = jest.fn();
  const aiDraftAcceptanceUpsert = jest.fn();
  const aiDraftAcceptanceUpdate = jest.fn();
  const transaction = jest.fn();
  const executeRaw = jest.fn();
  const queryRaw = jest.fn();
  const localChat = jest.fn();
  const cloudChat = jest.fn();
  const notificationNotify = jest.fn();
  const shouldAttemptOpenAiProbe = jest.fn();
  const markOpenAiQuotaExhausted = jest.fn();
  const markOpenAiRecovered = jest.fn();
  const claimOpenAiQuotaNoticeIncident = jest.fn();
  const releaseOpenAiQuotaNoticeIncident = jest.fn();

  const baseRpp = {
    id: RPP_ID,
    teacherId: 'teacher-1',
    classId: 'class-1',
    subject: 'Matematika',
    title: 'Fungsi Linear',
    academicYear: '2026/2027',
    semester: 1,
    body: {
      fase: 'E',
      cp: 'Peserta didik memahami fungsi linear.',
      tp: ['Menjelaskan grafik fungsi linear.'],
      kegiatan: [],
    },
    class: { id: 'class-1', name: 'X TKJ 1', grade: 10, majorCode: 'TKJ' },
  };

  beforeEach(async () => {
    [
      userFindUnique, userFindMany, teacherFindUnique, rppFindFirst, lmsModuleFindFirst,
      majorFindUnique, teachingAssignmentFindFirst, questionFindMany, questionCreate, questionFindUnique,
      questionUpsert, questionCount, aiGenerationFindFirst, aiGenerationCreate, aiGenerationUpdate, aiGenerationUpdateMany,
      aiDraftAcceptanceUpsert, aiDraftAcceptanceUpdate, transaction, executeRaw, queryRaw, localChat, cloudChat,
      notificationNotify, shouldAttemptOpenAiProbe, markOpenAiQuotaExhausted, markOpenAiRecovered,
      claimOpenAiQuotaNoticeIncident, releaseOpenAiQuotaNoticeIncident,
    ]
      .forEach((mock) => mock.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin',
      email: 'admin@example.sch.id',
      phone: null,
    }]);
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    rppFindFirst.mockResolvedValue(baseRpp);
    lmsModuleFindFirst.mockResolvedValue(null);
    majorFindUnique.mockResolvedValue({
      name: 'Teknik Komputer dan Jaringan',
      description: 'Administrasi jaringan sekolah. Keamanan perangkat lab. Layanan internet kelas.',
    });
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'ta-1' });
    questionFindMany.mockResolvedValue([]);
    questionCreate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({
      id: 'q-ai-1',
      subject: args.data.subject,
      type: args.data.type,
      body: args.data.body,
      difficulty: args.data.difficulty,
      aiItemKey: args.data.aiItemKey ?? null,
    }));
    questionFindUnique.mockResolvedValue(null);
    questionUpsert.mockImplementation((args: { create: Record<string, unknown> }) => Promise.resolve({
      id: 'q-ai-1',
      subject: args.create.subject,
      type: args.create.type,
      body: args.create.body,
      options: args.create.options ?? null,
      answer: args.create.answer ?? null,
      difficulty: args.create.difficulty,
      tags: args.create.tags,
      rubric: args.create.rubric ?? null,
      aiItemKey: args.create.aiItemKey ?? null,
      tpRefs: args.create.tpRefs ?? [],
      cognitiveLevel: args.create.cognitiveLevel ?? null,
    }));
    questionCount.mockResolvedValue(0);
    aiGenerationFindFirst.mockResolvedValue(null);
    aiGenerationCreate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({
      id: 'gen-1',
      model: args.data.model ?? 'gpt-4.1-mini',
    }));
    aiGenerationUpdate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({
      id: 'gen-1',
      model: args.data.model ?? 'gpt-4.1-mini',
    }));
    aiGenerationUpdateMany.mockResolvedValue({ count: 1 });
    executeRaw.mockResolvedValue(1);
    queryRaw.mockResolvedValue([{ id: 'gen-1', model: 'gpt-4.1-mini' }]);
    aiDraftAcceptanceUpsert.mockImplementation((args: { create: { payloadFingerprint: string } }) =>
      Promise.resolve({ payloadFingerprint: args.create.payloadFingerprint }));
    aiDraftAcceptanceUpdate.mockResolvedValue({ id: 'accept-1' });
    const prisma = {
      user: { findUnique: userFindUnique, findMany: userFindMany },
      teacher: { findUnique: teacherFindUnique },
      rpp: { findFirst: rppFindFirst },
      lmsModule: { findFirst: lmsModuleFindFirst },
      major: { findUnique: majorFindUnique },
      teachingAssignment: { findFirst: teachingAssignmentFindFirst },
      question: {
        findMany: questionFindMany,
        create: questionCreate,
        findUnique: questionFindUnique,
        upsert: questionUpsert,
        count: questionCount,
      },
      aiGeneration: {
        create: aiGenerationCreate,
        findFirst: aiGenerationFindFirst,
        update: aiGenerationUpdate,
        updateMany: aiGenerationUpdateMany,
      },
      aiDraftAcceptance: { upsert: aiDraftAcceptanceUpsert, update: aiDraftAcceptanceUpdate },
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      $transaction: transaction,
    };
    transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    localChat.mockResolvedValue(KEGIATAN_PATCH);
    cloudChat.mockResolvedValue(KEGIATAN_PATCH);
    notificationNotify.mockResolvedValue(undefined);
    shouldAttemptOpenAiProbe.mockResolvedValue(true);
    markOpenAiQuotaExhausted.mockResolvedValue(undefined);
    markOpenAiRecovered.mockResolvedValue(undefined);
    claimOpenAiQuotaNoticeIncident.mockResolvedValue('incident-1');
    releaseOpenAiQuotaNoticeIncident.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGenerateService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AI_GATEWAY', useValue: { chat: localChat } },
        { provide: 'OPENAI_GATEWAY', useValue: { chat: cloudChat } },
        { provide: AiProviderStatusService, useValue: {
          shouldAttemptOpenAiProbe,
          markOpenAiQuotaExhausted,
          markOpenAiRecovered,
          claimOpenAiQuotaNoticeIncident,
          releaseOpenAiQuotaNoticeIncident,
        } },
        { provide: NotificationService, useValue: { notify: notificationNotify } },
      ],
    }).compile();
    service = module.get(AiGenerateService);
  });

  it('loads saved RPP and derives prompt from server-side ownership context', async () => {
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(rppFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RPP_ID, teacherId: 'teacher-1' },
    }));
    expect(teachingAssignmentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        teacherId: 'teacher-1',
        classId: 'class-1',
        subject: 'Matematika',
        academicYear: '2026/2027',
      },
    }));
    const prompt = cloudChat.mock.calls[0][0] as string;
    expect(prompt).toContain('Mapel: Matematika.');
    expect(prompt).toContain('Judul: Fungsi Linear.');
    expect(prompt).toContain('Kelas: X TKJ 1');
    expect(prompt).not.toContain('browser');
  });

  it('rejects extra browser context fields at the DTO boundary', () => {
    const parsed = GenerateRppStepSchema.safeParse({
      rppId: RPP_ID,
      section: 'kegiatan',
      context: 'raw browser context',
      rppBody: { cp: 'raw body' },
      subject: 'browser-declared subject',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: expect.arrayContaining(['context', 'rppBody', 'subject']),
        }),
      ]));
    }
  });

  it('requires idempotencyKey at the AI question draft DTO boundary', () => {
    const { idempotencyKey: _idempotencyKey, ...withoutKey } = questionDraftDto;

    expect(GenerateQuestionDraftSchema.safeParse(questionDraftDto).success).toBe(true);
    expect(GenerateQuestionDraftSchema.safeParse(withoutKey).success).toBe(false);
  });

  it('rejects non-owner before provider call and audit write', async () => {
    rppFindFirst.mockResolvedValue(null);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toThrow('Akses Modul Ajar ditolak');

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects owned RPP without active TeachingAssignment before provider call', async () => {
    teachingAssignmentFindFirst.mockResolvedValue(null);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toThrow('Assignment mengajar untuk Modul Ajar ini tidak aktif');

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('generates AI question drafts without creating canonical questions', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);

    const result = await service.generateQuestionDrafts(questionDraftDto, GURU);

    expect(result.items).toHaveLength(1);
    expect(questionCreate).not.toHaveBeenCalled();
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'question-drafts',
        sourceType: 'module',
        sourceId: MODULE_ID,
        status: 'generating',
        idempotencyKey: 'draft-key-123456',
      }),
    }));
    const createdSpec = asRecord(aiGenerationCreate.mock.calls[0][0].data.requestSpec);
    expect(asRecord(createdSpec.request)).toEqual(questionDraftRequestSpec);
    expect(asRecord(createdSpec.lease)).toEqual(expect.objectContaining({
      leaseId: expect.any(String),
      leaseExpiresAt: expect.any(String),
      leaseSequence: 1,
    }));
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const prompt = cloudChat.mock.calls[0][0] as string;
    expect(prompt).toContain('Katalog konteks umum-produktif sekolah');
    expect(prompt).toContain('Administrasi jaringan sekolah');
    const options = asRecord(cloudChat.mock.calls[0][2]);
    const responseFormat = asRecord(options.responseFormat);
    expect(responseFormat.strict).toBe(true);
    const schema = asRecord(responseFormat.schema);
    const itemSchema = asRecord(asRecord(asRecord(schema.properties).items).items);
    expect(itemSchema.required).toEqual(['itemKey', 'question', 'tpRefs', 'cognitiveLevel', 'rationale', 'warnings']);
    const questionSchema = asRecord(asRecord(itemSchema.properties).question);
    const shapes = asArray(questionSchema.anyOf).map(asRecord);
    for (const shape of shapes) {
      const properties = asRecord(shape.properties);
      expect([...asArray(shape.required)].sort()).toEqual(Object.keys(properties).sort());
    }
    const matchingShape = shapes.find((shape) =>
      asArray(asRecord(asRecord(shape.properties).type).enum).includes('matching'));
    expect(matchingShape).toBeDefined();
    const matchingPair = asRecord(asRecord(asRecord(matchingShape?.properties).pairs).items);
    expect(asRecord(asRecord(matchingPair.properties).match).description).toContain('Jangan isi dengan M1');
    const matchingAnswer = asRecord(asRecord(asRecord(matchingShape?.properties).answer).items);
    expect(asArray(matchingAnswer.required).sort()).toEqual(['matchId', 'promptId']);
    expect(matchingAnswer.additionalProperties).toBe(false);
    expect(asRecord(asRecord(matchingAnswer.properties).matchId).description).toContain('question.pairs[].id');
  });

  it('uses the strict question draft schema when Redis circuit routes generation to Ollama', async () => {
    shouldAttemptOpenAiProbe.mockResolvedValue(false);
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    localChat.mockResolvedValue(AI_QUESTION_OUTPUT);
    queryRaw.mockResolvedValueOnce([{ id: 'gen-1', model: 'ollama' }]);

    const result = await service.generateQuestionDrafts({
      ...questionDraftDto,
      idempotencyKey: 'draft-key-ollama-schema',
    }, GURU);

    expect(result.model).toBe('ollama');
    expect(result.items).toHaveLength(1);
    expect(cloudChat).not.toHaveBeenCalled();
    expect(localChat).toHaveBeenCalledTimes(1);
    const options = asRecord(localChat.mock.calls[0][2]);
    const responseFormat = asRecord(options.responseFormat);
    expect(responseFormat.type).toBe('json_schema');
    expect(responseFormat.name).toBe('question_drafts');
    expect(responseFormat.strict).toBe(true);
    const schema = asRecord(responseFormat.schema);
    expect(asArray(schema.required)).toEqual(['items']);
    const itemSchema = asRecord(asRecord(asRecord(schema.properties).items).items);
    expect(itemSchema.required).toEqual(['itemKey', 'question', 'tpRefs', 'cognitiveLevel', 'rationale', 'warnings']);
    const questionSchema = asRecord(asRecord(itemSchema.properties).question);
    expect(questionSchema.anyOf).toBeUndefined();
    expect(asArray(asRecord(asRecord(questionSchema.properties).type).enum)).toEqual(['multiple_choice']);
  });

  it('rejects productive question draft when the managed major description is empty', async () => {
    lmsModuleFindFirst.mockResolvedValue({ ...ownedModule, class: { ...ownedModule.class, majorCode: 'DKV' } });
    majorFindUnique.mockResolvedValue({ name: 'Desain Komunikasi Visual', description: null });
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);

    await expect(service.generateQuestionDrafts({ ...questionDraftDto, contextMode: 'produktif' }, GURU))
      .rejects.toThrow('Konteks produktif untuk jurusan Desain Komunikasi Visual belum dikonfigurasi');

    expect(cloudChat).not.toHaveBeenCalled();
    expect(localChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
    expect(aiGenerationUpdateMany).not.toHaveBeenCalled();
  });

  it('bounds managed productive context before sending it to the provider', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    majorFindUnique.mockResolvedValue({
      name: 'Teknik Komputer dan Jaringan',
      description: `${'A'.repeat(900)}. Konteks setelah batas tidak boleh masuk prompt.`,
    });
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);

    await service.generateQuestionDrafts({ ...questionDraftDto, idempotencyKey: 'draft-key-bounded-context' }, GURU);

    const prompt = cloudChat.mock.calls[0][0] as string;
    expect(prompt).toContain('A'.repeat(180));
    expect(prompt).not.toContain('Konteks setelah batas tidak boleh masuk prompt');
  });

  it('rejects near-duplicate AI question draft bodies before finalizing generation', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    const nearDuplicateOutput = JSON.stringify({
      items: [
        AI_QUESTION_ITEM,
        {
          ...AI_QUESTION_ITEM,
          itemKey: 'item-2',
          question: {
            ...AI_QUESTION_ITEM.question,
            body: 'Manakah tag HTML digunakan untuk membuat tautan?',
          },
        },
      ],
    });
    cloudChat.mockResolvedValue(nearDuplicateOutput);

    await expect(service.generateQuestionDrafts({
      ...questionDraftDto,
      idempotencyKey: 'draft-key-near-duplicate',
      questionCount: 2,
      typeDistribution: { multiple_choice: 2, true_false: 0, matching: 0, essay: 0 },
      difficultyDistribution: { easy: 2, medium: 0, hard: 0 },
      cognitiveDistribution: { C1: 0, C2: 2, C3: 0, C4: 0, C5: 0, C6: 0 },
    }, GURU)).rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects ambiguous multiple-choice options before finalizing generation', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    const ambiguousOutput = JSON.stringify({
      items: [{
        ...AI_QUESTION_ITEM,
        question: {
          ...AI_QUESTION_ITEM.question,
          options: [
            { id: 'a', text: '<a>' },
            { id: 'b', text: '<img>' },
            { id: 'c', text: '<table>' },
            { id: 'd', text: 'Semua jawaban benar' },
          ],
        },
      }],
    });
    cloudChat.mockResolvedValue(ambiguousOutput);

    await expect(service.generateQuestionDrafts({
      ...questionDraftDto,
      idempotencyKey: 'draft-key-ambiguous-option',
    }, GURU)).rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('recovers a concurrent generate race by returning the existing idempotent draft', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);
    aiGenerationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'gen-existing',
        requestSpec: questionDraftRequestSpec,
        output: AI_QUESTION_OUTPUT,
        model: 'gpt-4.1-mini',
      });
    aiGenerationCreate.mockRejectedValueOnce(p2002());

    const result = await service.generateQuestionDrafts(questionDraftDto, GURU);

    expect(result.generationId).toBe('gen-existing');
    expect(result.items).toEqual([AI_QUESTION_ITEM]);
    expect(aiGenerationCreate).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent generate requests so the provider is called once per idempotency key', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);
    let storedDraft: { id: string; requestSpec: Record<string, unknown>; output: string; model: string; status: string } | null = null;
    aiGenerationFindFirst.mockImplementation(() => Promise.resolve(storedDraft));
    aiGenerationCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      storedDraft = {
        id: 'gen-1',
        requestSpec: args.data.requestSpec as Record<string, unknown>,
        output: args.data.output as string,
        model: args.data.model as string,
        status: args.data.status as string,
      };
      return { id: 'gen-1' };
    });
    queryRaw.mockImplementation(async () => {
      storedDraft = {
        id: 'gen-1',
        requestSpec: storedDraft?.requestSpec ?? questionDraftRequestSpec,
        output: AI_QUESTION_OUTPUT,
        model: 'gpt-4.1-mini',
        status: 'drafted',
      };
      return [{ id: 'gen-1', model: 'gpt-4.1-mini' }];
    });

    const [first, second] = await Promise.all([
      service.generateQuestionDrafts(questionDraftDto, GURU),
      service.generateQuestionDrafts(questionDraftDto, GURU),
    ]);

    expect(first.generationId).toBe('gen-1');
    expect(second.generationId).toBe('gen-1');
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(aiGenerationCreate).toHaveBeenCalledTimes(1);
  });

  it('reclaims a stale generating lease before calling the provider again', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);
    aiGenerationFindFirst.mockResolvedValueOnce({
      id: 'gen-stale',
      requestSpec: {
        request: questionDraftRequestSpec,
        lease: {
          leaseId: 'old-lease',
          leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
          leaseSequence: 1,
        },
      },
      output: '',
      model: 'pending',
      status: 'generating',
    });
    executeRaw.mockResolvedValueOnce(1);
    queryRaw.mockResolvedValueOnce([{ id: 'gen-stale', model: 'gpt-4.1-mini' }]);

    const result = await service.generateQuestionDrafts(questionDraftDto, GURU);

    expect(result.generationId).toBe('gen-stale');
    expect(aiGenerationCreate).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(cloudChat).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale claimant finalize after its lease was superseded', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(AI_QUESTION_OUTPUT);
    queryRaw.mockResolvedValueOnce([]);

    await expect(service.generateQuestionDrafts(questionDraftDto, GURU))
      .rejects.toThrow('Lease generate draft AI');

    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('normalizes matching provider answer arrays before validating canonical output', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(JSON.stringify({
      items: [{
        itemKey: 'match-1',
        question: {
          subject: 'Pemrograman Web',
          type: 'matching',
          body: 'Pasangkan tag HTML dengan fungsinya.',
          pairs: [
            { id: 'p1', prompt: '<a>', match: 'Membuat tautan halaman' },
            { id: 'p2', prompt: '<img>', match: 'Menampilkan gambar pada halaman' },
          ],
          answer: [
            { promptId: 'p1', matchId: 'Membuat tautan halaman' },
            { promptId: 'p2', matchId: 'Menampilkan gambar pada halaman' },
          ],
          difficulty: 'medium',
          tags: ['html'],
        },
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
        rationale: 'Mengukur pemahaman pasangan tag dan fungsi.',
        warnings: [],
      }],
    }));

    const result = await service.generateQuestionDrafts({
      ...questionDraftDto,
      idempotencyKey: 'draft-key-matching',
      typeDistribution: { multiple_choice: 0, true_false: 0, matching: 1, essay: 0 },
      difficultyDistribution: { easy: 0, medium: 1, hard: 0 },
    }, GURU);

    expect(result.items[0]?.question).toEqual(expect.objectContaining({
      type: 'matching',
      answer: { p1: 'p1', p2: 'p2' },
    }));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects matching draft items whose match text is only an internal code', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(JSON.stringify({
      items: [{
        itemKey: 'match-code-1',
        question: {
          subject: 'Pemrograman Web',
          type: 'matching',
          body: 'Pasangkan perangkat jaringan dengan fungsinya.',
          pairs: [
            { id: 'p1', prompt: 'Router', match: 'M1' },
            { id: 'p2', prompt: 'Switch', match: 'M2' },
          ],
          answer: [
            { promptId: 'p1', matchId: 'M1' },
            { promptId: 'p2', matchId: 'M2' },
          ],
          difficulty: 'medium',
          tags: ['jaringan'],
        },
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
        rationale: 'Mengukur pemahaman perangkat jaringan.',
        warnings: [],
      }],
    }));

    await expect(service.generateQuestionDrafts({
      ...questionDraftDto,
      idempotencyKey: 'draft-key-match-code',
      typeDistribution: { multiple_choice: 0, true_false: 0, matching: 1, essay: 0 },
      difficultyDistribution: { easy: 0, medium: 1, hard: 0 },
    }, GURU)).rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });
  });

  it('uses one bounded repair attempt when provider returns invalid question JSON', async () => {
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat
      .mockResolvedValueOnce(JSON.stringify({ items: [{ itemKey: 'bad', question: { type: 'essay' } }] }))
      .mockResolvedValueOnce(AI_QUESTION_OUTPUT);

    const result = await service.generateQuestionDrafts(questionDraftDto, GURU);

    expect(result.items).toEqual([AI_QUESTION_ITEM]);
    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(aiGenerationCreate).toHaveBeenCalledTimes(1);
  });

  it('accepts selected AI draft items into canonical questions with provenance', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      teacherId: 'teacher-1',
      output: AI_QUESTION_OUTPUT,
      status: 'drafted',
      requestSpec: {
        source: { type: 'module', id: '22222222-2222-4222-8222-222222222222' },
        purpose: 'formatif',
        contextMode: 'auto_vokasi',
        character: 'konseptual',
      },
      contextSnapshot: {
        sourceType: 'module',
        sourceId: '22222222-2222-4222-8222-222222222222',
        subject: 'Pemrograman Web',
        title: 'HTML Dasar',
        academicYear: '2026/2027',
        semester: 1,
        classId: 'class-1',
        className: 'X TKJ 1',
        grade: 10,
        majorName: 'Teknik Komputer dan Jaringan',
        tpOptions: [{ ref: 'TP 1', text: 'Mengidentifikasi tag HTML dasar.' }],
      },
      sourceType: 'module',
      sourceId: '22222222-2222-4222-8222-222222222222',
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);

    const result = await service.acceptQuestionDrafts(generationId, {
      idempotencyKey: 'accept-key-123456',
      items: [{
        itemKey: AI_QUESTION_ITEM.itemKey,
        question: AI_QUESTION_ITEM.question,
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
      }],
    }, GURU);

    expect(result.acceptedCount).toBe(1);
    expect(questionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        teacherId: 'teacher-1',
        subject: 'Pemrograman Web',
        source: 'AI_ASSISTED',
        aiGenerationId: generationId,
        aiItemKey: 'item-1',
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
      }),
    }));
    expect(aiGenerationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: generationId },
      data: { status: 'accepted' },
    }));
  });

  it('accepts newly created drafts when JSON nulls round-trip from the database as null', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    const trueFalseItem = {
      ...AI_QUESTION_ITEM,
      question: {
        subject: 'Pemrograman Web',
        type: 'true_false' as const,
        body: 'Tag anchor digunakan untuk membuat tautan.',
        answer: true,
        difficulty: 'easy' as const,
        tags: ['html'],
      },
    };
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      teacherId: 'teacher-1',
      output: JSON.stringify({ items: [trueFalseItem] }),
      status: 'drafted',
      requestSpec: {
        source: { type: 'module', id: MODULE_ID },
        purpose: 'formatif',
        contextMode: 'auto_vokasi',
        character: 'konseptual',
      },
      contextSnapshot: {
        sourceType: 'module',
        sourceId: MODULE_ID,
        subject: 'Pemrograman Web',
        title: 'HTML Dasar',
        academicYear: '2026/2027',
        semester: 1,
        classId: 'class-1',
        className: 'X TKJ 1',
        grade: 10,
        majorName: 'Teknik Komputer dan Jaringan',
        tpOptions: [{ ref: 'TP 1', text: 'Mengidentifikasi tag HTML dasar.' }],
      },
      sourceType: 'module',
      sourceId: MODULE_ID,
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    questionUpsert.mockResolvedValueOnce({
      id: 'q-ai-1',
      subject: trueFalseItem.question.subject,
      type: trueFalseItem.question.type,
      body: trueFalseItem.question.body,
      options: null,
      answer: 'true',
      difficulty: trueFalseItem.question.difficulty,
      tags: trueFalseItem.question.tags,
      rubric: null,
      aiItemKey: trueFalseItem.itemKey,
      tpRefs: ['TP 1'],
      cognitiveLevel: 'C2',
    });

    const result = await service.acceptQuestionDrafts(generationId, {
      idempotencyKey: 'accept-key-json-null',
      items: [{
        itemKey: trueFalseItem.itemKey,
        question: trueFalseItem.question,
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
      }],
    }, GURU);

    expect(result.acceptedCount).toBe(1);
    expect(aiGenerationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: generationId },
      data: { status: 'accepted' },
    }));
  });

  it('rejects accept retry when the same idempotency key has a different payload', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      teacherId: 'teacher-1',
      output: AI_QUESTION_OUTPUT,
      status: 'drafted',
      contextSnapshot: {},
      sourceType: 'module',
      sourceId: MODULE_ID,
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    aiDraftAcceptanceUpsert.mockResolvedValueOnce({ payloadFingerprint: 'different-payload' });

    await expect(service.acceptQuestionDrafts(generationId, {
      idempotencyKey: 'accept-key-123456',
      items: [{
        itemKey: AI_QUESTION_ITEM.itemKey,
        question: AI_QUESTION_ITEM.question,
        tpRefs: ['TP 1'],
        cognitiveLevel: 'C2',
      }],
    }, GURU)).rejects.toThrow('Idempotency key accept sudah dipakai untuk payload berbeda');

    expect(questionUpsert).not.toHaveBeenCalled();
  });

  it('regenerates one AI draft item in the same generation', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    const replacement = {
      ...AI_QUESTION_ITEM,
      itemKey: 'provider-new-key',
      question: {
        ...AI_QUESTION_ITEM.question,
        body: 'Tag HTML manakah yang membuat tautan ke halaman lain?',
      },
      rationale: 'Regenerate item tanpa mengubah distribusi.',
    };
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      output: AI_QUESTION_OUTPUT,
      status: 'drafted',
      requestSpec: {
        request: {
          purpose: 'formatif',
          contextMode: 'auto_vokasi',
          character: 'konseptual',
        },
        lease: {
          leaseId: 'lease-1',
          leaseSequence: 1,
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      contextSnapshot: {
        sourceType: 'module',
        sourceId: '22222222-2222-4222-8222-222222222222',
        subject: 'Pemrograman Web',
        title: 'HTML Dasar',
        academicYear: '2026/2027',
        semester: 1,
        classId: 'class-1',
        className: 'X TKJ 1',
        grade: 10,
        majorName: 'Teknik Komputer dan Jaringan',
        tpOptions: [{ ref: 'TP 1', text: 'Mengidentifikasi tag HTML dasar.' }],
      },
      sourceType: 'module',
      sourceId: '22222222-2222-4222-8222-222222222222',
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    cloudChat.mockResolvedValue(JSON.stringify({ items: [replacement] }));

    const result = await service.regenerateQuestionDraftItem(generationId, 'item-1', {}, GURU);

    expect(result.item.itemKey).toBe('item-1');
    expect(result.item.question.body).toContain('tautan');
    expect(aiGenerationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: generationId },
      data: expect.objectContaining({
        status: 'drafted',
        output: expect.stringContaining('"itemKey":"item-1"'),
      }),
    }));
  });

  it('does not regenerate an accepted draft item', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      output: AI_QUESTION_OUTPUT,
      status: 'partially_accepted',
      requestSpec: questionDraftRequestSpec,
      contextSnapshot: {},
      sourceType: 'module',
      sourceId: MODULE_ID,
    });
    questionFindUnique.mockResolvedValue({ id: 'q-ai-1' });

    await expect(service.regenerateQuestionDraftItem(generationId, 'item-1', {}, GURU))
      .rejects.toThrow('Item draft sudah diterima dan tidak dapat diregenerasi');

    expect(cloudChat).not.toHaveBeenCalled();
    expect(localChat).not.toHaveBeenCalled();
  });

  it('rejects all draft items server-side only when none have been accepted', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      status: 'drafted',
      sourceType: 'module',
      sourceId: MODULE_ID,
      contextSnapshot: {},
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);

    const result = await service.rejectQuestionDrafts(generationId, { idempotencyKey: 'reject-key-123456' }, GURU);

    expect(result).toEqual({ generationId, rejected: true });
    expect(aiGenerationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'rejected' },
    }));
  });

  it('does not reject all after any draft item has been accepted', async () => {
    const generationId = '33333333-3333-4333-8333-333333333333';
    aiGenerationFindFirst.mockResolvedValue({
      id: generationId,
      status: 'partially_accepted',
      sourceType: 'module',
      sourceId: MODULE_ID,
      contextSnapshot: {},
    });
    lmsModuleFindFirst.mockResolvedValue(ownedModule);
    questionCount.mockResolvedValue(1);

    await expect(service.rejectQuestionDrafts(generationId, { idempotencyKey: 'reject-key-123456' }, GURU))
      .rejects.toThrow('Sebagian item sudah diterima');

    expect(aiGenerationUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'rejected' },
    }));
  });

  it('routes PII context to local gateway and never calls cloud', async () => {
    rppFindFirst.mockResolvedValue({
      ...baseRpp,
      body: {
        cp: 'Nama: Budi Santoso. Email: budi@example.com.',
        tp: ['Menjelaskan jaringan lokal.'],
      },
    });
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(localChat).toHaveBeenCalledTimes(1);
    expect(cloudChat).not.toHaveBeenCalled();
    const promptSentLocal = localChat.mock.calls[0][0] as string;
    expect(promptSentLocal).not.toContain('budi@example.com');
    expect(promptSentLocal).not.toContain('Budi Santoso');
    const auditPrompt = aiGenerationCreate.mock.calls[0][0].data.prompt as string;
    expect(auditPrompt).not.toContain('Budi Santoso');
    expect(auditPrompt).not.toContain('budi@example.com');
  });

  it('blocks PII context if local gateway fails, with no cloud fallback', async () => {
    rppFindFirst.mockResolvedValue({
      ...baseRpp,
      body: { cp: 'Nama: Budi Santoso', tp: ['TP aman'] },
    });
    localChat.mockRejectedValue(new Error('local unavailable'));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_CONTEXT_PII_BLOCKED' }) });

    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('stops ATP generation with missing TP before provider call', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { cp: 'CP tersimpan' } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
  });

  it('stops kegiatan and asesmen generation with missing TP before save/provider/audit', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { cp: 'CP tersimpan', tp: [] } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });
    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'asesmen' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('stops CP/TP generation with missing CP before provider call', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { tp: ['TP browser'] } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'cp_tp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
  });

  it('rejects invalid ATP output before audit success', async () => {
    cloudChat.mockResolvedValue('ini bukan JSON');

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects markdown/code-fence and legacy KI/KD output before audit success', async () => {
    cloudChat.mockResolvedValue('```json\n{"kegiatan":[{"inti":"Kompetensi Dasar lama"}]}\n```');

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects an outer code fence around otherwise valid JSON before audit success', async () => {
    cloudChat.mockResolvedValue(`\`\`\`json\n${KEGIATAN_PATCH}\n\`\`\``);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects a nested code fence inside otherwise valid JSON before audit success', async () => {
    cloudChat.mockResolvedValue(kegiatanPatchWithInti('Siswa membandingkan contoh ```teks``` dan menjelaskan hasilnya.'));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects incomplete kegiatan patches before audit success', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      kegiatan: [{ pertemuan: 'Pertemuan 1', inti: 'Hanya kegiatan inti.' }],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['KD mandiri', 'Gunakan KD 3.1 sebagai acuan.'],
    ['Kompetensi Dasar', 'Mengacu pada Kompetensi Dasar kelas X.'],
    ['Kompetensi Inti', 'Mengacu pada Kompetensi Inti kelas X.'],
    ['KI/KD', 'Mengacu pada KI/KD kelas X.'],
    ['KI-KD', 'Mengacu pada KI-KD kelas X.'],
    ['KI dan KD', 'Mengacu pada KI dan KD kelas X.'],
    ['heading markdown generik', '# Tujuan Pembelajaran\nSiswa memahami grafik.'],
  ])('rejects legacy curriculum or markdown heading output without code fence: %s', async (_case, badText) => {
    cloudChat.mockResolvedValue(kegiatanPatchWithInti(badText));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects extra fields and CP overwrite in CP/TP patch', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      cp: 'CP buatan AI',
      tp: ['Menjelaskan grafik fungsi linear.'],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'cp_tp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('returns a structured patch for ATP and validates TP refs against saved TP', async () => {
    cloudChat.mockResolvedValue(ATP_PATCH);

    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU);

    expect(res).toEqual({
      type: 'atp',
      output: { atp: [{ tpRef: 'TP 1', indikator: 'Menjelaskan grafik fungsi linear dengan benar.' }] },
    });
  });

  it('rejects ATP refs that invent unsaved TP', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      atp: [{ tpRef: 'TP 2', indikator: 'Indikator palsu.' }],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });
  });

  it('uses a single configured provider attempt for non-PII prompts', async () => {
    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(res).toEqual({
      type: 'kegiatan',
      output: {
        kegiatan: [{
          pertemuan: 'Pertemuan 1',
          pendahuluan: 'Menyampaikan tujuan pembelajaran.',
          inti: 'Menganalisis grafik fungsi linear.',
          penutup: 'Refleksi dan umpan balik.',
          diferensiasi: 'Menyiapkan dukungan bertahap dan tantangan lanjutan sesuai kesiapan siswa.',
        }],
      },
    });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(cloudChat).toHaveBeenCalledWith(
      expect.stringContaining('Schema JSON'),
      undefined,
      { responseFormat: expect.objectContaining({
        type: 'json_schema',
        name: 'rpp_kegiatan_patch',
        schema: expect.objectContaining({
          additionalProperties: false,
          required: ['kegiatan'],
        }),
      }) },
    );
    const options = cloudChat.mock.calls[0][2] as { responseFormat: { schema: Record<string, unknown> } };
    const schemaText = JSON.stringify(options.responseFormat.schema);
    expect(schemaText).not.toMatch(/minLength|maxLength|minItems|maxItems|pattern/);
    expect(schemaText).toContain('diferensiasi');
    expect(localChat).not.toHaveBeenCalled();
  });

  it('opens circuit, falls back to Ollama, and notifies admin when OpenAI quota is exhausted', async () => {
    localChat.mockResolvedValue(KEGIATAN_PATCH);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'You exceeded your current quota',
      429,
      'organization_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));

    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(res.output).toEqual({
      kegiatan: [{
        pertemuan: 'Pertemuan 1',
        pendahuluan: 'Menyampaikan tujuan pembelajaran.',
        inti: 'Menganalisis grafik fungsi linear.',
        penutup: 'Refleksi dan umpan balik.',
        diferensiasi: 'Menyiapkan dukungan bertahap dan tantangan lanjutan sesuai kesiapan siswa.',
      }],
    });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledWith(
      expect.stringContaining('Kembalikan hanya JSON object berikut tanpa perubahan'),
      undefined,
      { responseFormat: 'json_object' },
    );
    expect(markOpenAiQuotaExhausted).toHaveBeenCalledWith('organization_spend_limit_exceeded');
    expect(notificationNotify).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      to: 'admin@example.sch.id',
      subject: 'OpenAI fallback aktif',
      refType: 'ai_openai_quota',
      refId: 'incident-1',
    }));
    expect((notificationNotify.mock.calls[0][0] as { body: string }).body).toContain('Ollama lokal');
    expect((notificationNotify.mock.calls[0][0] as { body: string }).body).toContain('billing/usage OpenAI');
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it.each([
    'credit_balance_exhausted',
    'organization_usage_limit_exceeded',
  ])('opens circuit and falls back for official OpenAI quota code %s', async (code) => {
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'OpenAI usage is not available',
      429,
      code,
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledTimes(1);
    expect(markOpenAiQuotaExhausted).toHaveBeenCalledWith(code);
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it('throttles repeated OpenAI quota admin notifications while continuing fallback', async () => {
    claimOpenAiQuotaNoticeIncident
      .mockResolvedValueOnce('incident-1')
      .mockResolvedValueOnce(null);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'You exceeded your current quota',
      429,
      'insufficient_quota',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(localChat).toHaveBeenCalledTimes(2);
    expect(notificationNotify).toHaveBeenCalledTimes(1);
    expect(claimOpenAiQuotaNoticeIncident).toHaveBeenCalledTimes(2);
  });

  it('bypasses OpenAI while Redis circuit is open and uses Ollama directly', async () => {
    shouldAttemptOpenAiProbe.mockResolvedValue(false);
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(cloudChat).not.toHaveBeenCalled();
    expect(localChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledWith(
      expect.stringContaining('Kembalikan hanya JSON object berikut tanpa perubahan'),
      undefined,
      { responseFormat: 'json_object' },
    );
    expect(notificationNotify).not.toHaveBeenCalled();
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it('retries temporary OpenAI rate limit once without opening circuit or falling back', async () => {
    cloudChat
      .mockRejectedValueOnce(new OpenAiProviderError(
        'Rate limit reached',
        429,
        'rate_limit_exceeded',
        'rate_limit_exceeded',
        0,
      ))
      .mockResolvedValueOnce(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(localChat).not.toHaveBeenCalled();
    expect(markOpenAiQuotaExhausted).not.toHaveBeenCalled();
    expect(notificationNotify).not.toHaveBeenCalled();
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'gpt-4.1-mini' }),
    }));
  });

  it('does not retry before a long Retry-After budget and returns rate-limited response', async () => {
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Rate limit reached',
      429,
      'rate_limit_exceeded',
      'rate_limit_exceeded',
      5,
    ));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_PROVIDER_RATE_LIMITED' }) });

    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).not.toHaveBeenCalled();
    expect(markOpenAiQuotaExhausted).not.toHaveBeenCalled();
    expect(notificationNotify).not.toHaveBeenCalled();
  });

  it('uses one incident refId for all admin recipients in the same quota notice', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }, {
      id: 'admin-2',
      fullName: 'Super Admin 2',
      email: null,
      phone: '628100000001',
    }]);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(notificationNotify.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ channel: 'email', to: 'admin1@example.sch.id', refId: 'incident-1' }),
      expect.objectContaining({ channel: 'whatsapp', to: '628100000001', refId: 'incident-1' }),
    ]);
  });

  it('keeps quota notice throttle when at least one admin recipient succeeds', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }, {
      id: 'admin-2',
      fullName: 'Super Admin 2',
      email: 'admin2@example.sch.id',
      phone: null,
    }]);
    notificationNotify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('email unavailable'));
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(releaseOpenAiQuotaNoticeIncident).not.toHaveBeenCalled();
  });

  it('releases quota notice throttle when every recipient delivery fails', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }]);
    notificationNotify.mockRejectedValue(new Error('email unavailable'));
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(1);
    expect(releaseOpenAiQuotaNoticeIncident).toHaveBeenCalledWith('incident-1');
  });

  it('uses unique notification refIds for separate quota incidents', async () => {
    claimOpenAiQuotaNoticeIncident
      .mockResolvedValueOnce('incident-1')
      .mockResolvedValueOnce('incident-2');
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    const first = notificationNotify.mock.calls[0][0] as { refId: string };
    const second = notificationNotify.mock.calls[1][0] as { refId: string };
    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(first.refId).not.toBe(second.refId);
  });

  it('legacy raw-context endpoints are disabled explicitly', () => {
    expect(() => service.rejectLegacyGeneration()).toThrow(HttpException);
    try {
      service.rejectLegacyGeneration();
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(410);
      expect((err as HttpException).getResponse()).toEqual(expect.objectContaining({
        error: 'AI_ENDPOINT_DISABLED',
      }));
    }
  });
});
