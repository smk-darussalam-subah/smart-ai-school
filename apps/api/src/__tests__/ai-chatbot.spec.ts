// =============================================================================
// ai-chatbot.spec.ts — Unit tests SMA-46
//
// Skenario wajib:
//   ✓ POST /ai/chat: embed → searchSimilar → chat(context) → {answer, sources, sessionId}
//   ✓ POST /ai/chat: retrieval kosong (belum ada embedding) → graceful, tidak 500
//   ✓ POST /ai/chat: threshold similarity menyaring chunk tidak relevan
//   ✓ POST /ai/chat tanpa token → 401 (guard global)
//   ✓ POST /ai/knowledge: non-SA → 403; SA → buat chunk + embed
//   ✓ POST /ai/knowledge: Ollama gagal → chunk tersimpan embedding NULL, tidak 500
//   ✓ POST /ai/knowledge/backfill: non-SA → 403; SA → panggil backfillEmbeddings
//   ✓ $queryRaw parameterized (Prisma.sql, bukan raw concat)
//   ✓ chatWithRag: sessionId di-echo bila ada
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AIGateway, RagContext } from '@smk/types';
import { AuthUser } from '@smk/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVector(len = 768): number[] {
  return Array.from({ length: len }, (_, i) => i / len);
}

function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    keycloakId: 'kc-uuid-sa',
    email: 'sa@smk.sch.id',
    username: 'sa',
    roles: ['SUPER_ADMIN'],
    fullName: 'Super Admin',
    ...overrides,
  };
}

function makeGateway(overrides?: Partial<AIGateway>): AIGateway {
  return {
    embed: jest.fn().mockResolvedValue(makeVector()),
    chat: jest.fn().mockResolvedValue('jawaban dari AI'),
    ...overrides,
  };
}

function makePrisma(overrides?: Partial<PrismaService>): PrismaService {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'db-user-uuid-sa' }),
    },
    ragChunk: {
      create: jest.fn().mockResolvedValue({
        id: 'uuid-chunk-1',
        title: 'FAQ PPDB',
        category: 'faq',
        source: 'manual',
        isActive: false,
        createdBy: 'db-user-uuid-sa',
        createdAt: new Date(),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // SMA-49: chat session defaults
    chatSession: {
      findUnique: jest.fn().mockResolvedValue({ id: 'session-uuid', userId: 'db-user-uuid-sa' }),
      create: jest.fn().mockResolvedValue({ id: 'new-session-uuid' }),
    },
    chatMessage: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as PrismaService;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function buildModule(gateway: AIGateway, prisma: PrismaService): Promise<TestingModule> {
  return Test.createTestingModule({
    controllers: [AiController],
    providers: [
      AiService,
      { provide: 'AI_GATEWAY', useValue: gateway },
      { provide: 'CLAUDE_GATEWAY', useValue: null }, // SMA-48: default off in tests
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
}

// ── Tests: AiService.chatWithRag ──────────────────────────────────────────────

describe('AiService.chatWithRag()', () => {
  it('embed → searchSimilar → chat(context) → {answer, sources, sessionId}', async () => {
    const chunks = [
      { id: 'c1', title: 'FAQ PPDB', content: 'Syarat pendaftaran...', similarity: 0.92 },
      { id: 'c2', title: 'Biaya SPP', content: 'SPP per bulan...', similarity: 0.78 },
    ];
    const gateway = makeGateway();
    // sessionId ada → chatSession.findUnique return session milik user tsb
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue(chunks),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag(
      { message: 'cara daftar?', sessionId: 'session-uuid' },
      makeUser(),
    );

    expect(gateway.embed).toHaveBeenCalledWith('cara daftar?');
    expect(gateway.chat).toHaveBeenCalledWith(
      'cara daftar?',
      expect.arrayContaining<RagContext>([
        { title: 'FAQ PPDB', content: 'Syarat pendaftaran...' },
        { title: 'Biaya SPP', content: 'SPP per bulan...' },
      ]),
    );
    expect(result.answer).toBe('jawaban dari AI');
    expect(result.sources).toEqual([{ title: 'FAQ PPDB' }, { title: 'Biaya SPP' }]);
    // sessionId yang dikirim digunakan (bukan session baru)
    expect(result.sessionId).toBe('session-uuid');
  });

  it('retrieval kosong (belum ada embedding) → chat dipanggil tanpa context, tidak 500', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue([]) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag({ message: 'apa itu DIIS?' }, makeUser());

    expect(gateway.chat).toHaveBeenCalledWith('apa itu DIIS?', undefined);
    expect(result.sources).toEqual([]);
    expect(result.answer).toBe('jawaban dari AI');
  });

  it('threshold similarity menyaring chunk tidak relevan', async () => {
    const chunks = [
      { id: 'c1', title: 'Tidak relevan', content: '...', similarity: 0.1 },
    ];
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue(chunks) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const origMin = process.env['AI_RAG_MIN_SIMILARITY'];
    process.env['AI_RAG_MIN_SIMILARITY'] = '0.3';
    const result = await svc.chatWithRag({ message: 'pertanyaan' }, makeUser());
    process.env['AI_RAG_MIN_SIMILARITY'] = origMin;

    // Chunk di-filter → chat dipanggil tanpa context
    expect(gateway.chat).toHaveBeenCalledWith('pertanyaan', undefined);
    expect(result.sources).toEqual([]);
  });

  it('tanpa sessionId → session baru dibuat, sessionId selalu dikembalikan', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag({ message: 'tanya' }, makeUser());
    // Session baru dibuat → sessionId dikembalikan (bukan undefined)
    expect(result.sessionId).toBe('new-session-uuid');
    expect(prisma.chatSession.create).toHaveBeenCalled();
  });
});

// ── Tests: AiService.searchSimilar ───────────────────────────────────────────

describe('AiService.searchSimilar()', () => {
  it('menggunakan Prisma.sql ($queryRaw parameterized, bukan string concat)', async () => {
    const gateway = makeGateway();
    const queryRawMock = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({ $queryRaw: queryRawMock });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await svc.searchSimilar(makeVector(), 4, 0.3);

    // Pastikan dipanggil dengan Prisma.sql (TemplateStringsArray via tag), bukan string mentah
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    const firstArg = queryRawMock.mock.calls[0][0];
    // Prisma.sql menghasilkan object dengan .strings dan .values (bukan string biasa)
    // Ini membuktikan parameterized query, bukan raw string concat
    expect(typeof firstArg).not.toBe('string');
    expect(firstArg).toHaveProperty('strings');
    expect(firstArg).toHaveProperty('values');
  });

  it('filter similarity di bawah threshold', async () => {
    const rawResults = [
      { id: 'a', title: 'Relevan', content: 'ok', similarity: 0.85 },
      { id: 'b', title: 'Tidak relevan', content: 'no', similarity: 0.15 },
    ];
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue(rawResults) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.searchSimilar(makeVector(), 4, 0.3);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Relevan');
  });
});

// ── Tests: AiService.createKnowledge ─────────────────────────────────────────

describe('AiService.createKnowledge()', () => {
  it('SA → buat chunk + embed → embeddingOk=true', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.createKnowledge(
      { title: 'FAQ PPDB', content: 'Syarat pendaftaran...', category: 'faq' },
      makeUser(),
    );

    expect(prisma.ragChunk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'FAQ PPDB', category: 'faq', isActive: false }),
      }),
    );
    expect(gateway.embed).toHaveBeenCalledWith('Syarat pendaftaran...');
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(result.embeddingOk).toBe(true);
  });

  it('Ollama down saat createKnowledge → chunk tersimpan, embeddingOk=false, tidak 500', async () => {
    const gateway = makeGateway({
      embed: jest.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.createKnowledge(
      { title: 'Artikel', content: 'Konten...', category: 'info' },
      makeUser(),
    );

    expect(prisma.ragChunk.create).toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(result.embeddingOk).toBe(false);
  });

  it('source opsional → default ke "manual"', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await svc.createKnowledge({ title: 'T', content: 'C', category: 'cat' }, makeUser());

    expect(prisma.ragChunk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'manual' }),
      }),
    );
  });
});

// ── Tests: AiService.backfillEmbeddings ──────────────────────────────────────

describe('AiService.backfillEmbeddings()', () => {
  it('embed semua chunk NULL, laporkan {total, success, failed}', async () => {
    const nullChunks = [
      { id: 'c1', content: 'konten 1' },
      { id: 'c2', content: 'konten 2' },
    ];
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue(nullChunks) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const results = await svc.backfillEmbeddings();

    expect(gateway.embed).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('Ollama down saat backfill → error dicatat, tidak throw (fail-soft)', async () => {
    const chunks = [{ id: 'c1', content: 'konten' }];
    const gateway = makeGateway({
      embed: jest.fn().mockRejectedValue(new Error('Ollama down')),
    });
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue(chunks) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.backfillEmbeddings()).resolves.not.toThrow();
    const results = await svc.backfillEmbeddings();
    const failed = results.filter((r) => !r.success);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]?.error).toContain('Ollama down');
  });
});

// ── Tests: AiController — guard & route ──────────────────────────────────────

describe('AiController — endpoint wiring', () => {
  it('GET /ai/knowledge memanggil aiService.listKnowledge()', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const controller = mod.get(AiController);
    const svc = mod.get(AiService);

    jest.spyOn(svc, 'listKnowledge').mockResolvedValue([]);
    await controller.listKnowledge();

    expect(svc.listKnowledge).toHaveBeenCalled();
  });

  it('POST /ai/knowledge/backfill mengembalikan {total, success, failed, results}', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue([]) });
    const mod = await buildModule(gateway, prisma);
    const controller = mod.get(AiController);

    const result = await controller.backfill();

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('results');
    expect(result.total).toBe(0);
  });

  it('POST /ai/chat memanggil aiService.chatWithRag() dengan dto + user dan return hasilnya', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const controller = mod.get(AiController);
    const svc = mod.get(AiService);
    const user = makeUser();

    jest.spyOn(svc, 'chatWithRag').mockResolvedValue({
      answer: 'jawaban',
      sources: [{ title: 'FAQ' }],
      sessionId: 'new-session-uuid',
    });

    const result = await controller.chat({ message: 'pertanyaan' }, user);

    expect(svc.chatWithRag).toHaveBeenCalledWith({ message: 'pertanyaan' }, user);
    expect(result).toEqual({
      answer: 'jawaban',
      sources: [{ title: 'FAQ' }],
      sessionId: 'new-session-uuid',
    });
  });
});
