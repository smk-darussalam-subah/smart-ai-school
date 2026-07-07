// =============================================================================
// ai-chat-history.spec.ts — Unit tests SMA-49 Chat History
//
// Skenario wajib:
//   (a) POST /ai/chat tanpa sessionId → session baru + 2 pesan disimpan, sessionId dikembalikan
//   (b) POST /ai/chat dengan sessionId milik user → messages di-append ke session yang sama
//   (c) GET /ai/chat/:sessionId/history oleh pemilik → 200, pesan terurut ASC
//   (d) GET /ai/chat/:sessionId/history oleh user lain → 403
//   (e) GET /ai/chat/:sessionId/history oleh SUPER_ADMIN (bukan pemilik) → 200
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

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AIGateway } from '@smk/types';
import { AuthUser } from '@smk/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const OWNER_KEYCLOAK_ID = 'kc-owner-uuid';
const OTHER_KEYCLOAK_ID = 'kc-other-uuid';
const SA_KEYCLOAK_ID = 'kc-sa-uuid';

const OWNER_DB_ID = 'db-owner-uuid';
const OTHER_DB_ID = 'db-other-uuid';
const SA_DB_ID = 'db-sa-uuid';

const SESSION_ID = 'session-abc-uuid';
const NEW_SESSION_ID = 'new-session-xyz-uuid';

function makeVector(len = 768): number[] {
  return Array.from({ length: len }, (_, i) => i / len);
}

function makeOwner(): AuthUser {
  return {
    keycloakId: OWNER_KEYCLOAK_ID,
    email: 'owner@smk.sch.id',
    username: 'owner',
    roles: ['GURU'],
    fullName: 'Guru Owner',
  };
}

function makeOther(): AuthUser {
  return {
    keycloakId: OTHER_KEYCLOAK_ID,
    email: 'other@smk.sch.id',
    username: 'other',
    roles: ['GURU'],
    fullName: 'Guru Lain',
  };
}

function makeSuperAdmin(): AuthUser {
  return {
    keycloakId: SA_KEYCLOAK_ID,
    email: 'sa@smk.sch.id',
    username: 'sa',
    roles: ['SUPER_ADMIN'],
    fullName: 'Super Admin',
  };
}

function makeGateway(): AIGateway {
  return {
    embed: jest.fn().mockResolvedValue(makeVector()),
    chat: jest.fn().mockResolvedValue('Jawaban dari AI untuk skenario test'),
  };
}

/**
 * Prisma mock yang aware terhadap keycloakId → DB userId mapping.
 * user.findUnique dipanggil oleh resolveUserId — return per keycloakId.
 */
function makePrisma(opts: {
  sessionOwnerId?: string;  // userId pemilik session di DB (default: OWNER_DB_ID)
  sessionExists?: boolean;  // apakah chatSession.findUnique return data (default: true)
  messages?: Array<{ id: string; role: string; content: string; createdAt: Date }>;
} = {}): PrismaService {
  const {
    sessionOwnerId = OWNER_DB_ID,
    sessionExists = true,
    messages = [],
  } = opts;

  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),

    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { keycloakId: string } }) => {
        const map: Record<string, string> = {
          [OWNER_KEYCLOAK_ID]: OWNER_DB_ID,
          [OTHER_KEYCLOAK_ID]: OTHER_DB_ID,
          [SA_KEYCLOAK_ID]: SA_DB_ID,
        };
        const id = map[where.keycloakId];
        return Promise.resolve(id ? { id } : null);
      }),
    },

    ragChunk: {
      create: jest.fn().mockResolvedValue({
        id: 'chunk-1',
        title: 'FAQ',
        category: 'faq',
        source: 'manual',
        isActive: false,
        createdBy: OWNER_DB_ID,
        createdAt: new Date(),
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },

    chatSession: {
      findUnique: jest.fn().mockImplementation(() =>
        Promise.resolve(
          sessionExists
            ? { id: SESSION_ID, userId: sessionOwnerId }
            : null,
        ),
      ),
      create: jest.fn().mockResolvedValue({ id: NEW_SESSION_ID }),
    },

    chatMessage: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue(messages),
    },
  } as unknown as PrismaService;
}

async function buildModule(gateway: AIGateway, prisma: PrismaService): Promise<TestingModule> {
  return Test.createTestingModule({
    controllers: [AiController],
    providers: [
      AiService,
      { provide: 'AI_GATEWAY', useValue: gateway },
      { provide: 'CLAUDE_GATEWAY', useValue: null }, // SMA-48: default off in tests
      { provide: 'OPENAI_GATEWAY', useValue: null }, // R-28: default off in tests
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
}

// ── (a) tanpa sessionId → session baru + 2 messages tersimpan ────────────────

describe('(a) chatWithRag tanpa sessionId: session baru dibuat, sessionId dikembalikan', () => {
  it('chatSession.create dipanggil + chatMessage.createMany dengan 2 entri', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag({ message: 'cara daftar sekolah?' }, makeOwner());

    expect(prisma.chatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: OWNER_DB_ID }),
      }),
    );
    expect(prisma.chatMessage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'cara daftar sekolah?' }),
          expect.objectContaining({ role: 'assistant' }),
        ]),
      }),
    );
    expect(result.sessionId).toBe(NEW_SESSION_ID);
    expect(typeof result.answer).toBe('string');
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('title session = 50 char pertama pesan', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const longMessage = 'A'.repeat(100);
    await svc.chatWithRag({ message: longMessage }, makeOwner());

    expect(prisma.chatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'A'.repeat(50) }),
      }),
    );
  });

  it('pesan pendek (<50 char) → title = pesan penuh', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const shortMsg = 'Apa biaya SPP?';
    await svc.chatWithRag({ message: shortMsg }, makeOwner());

    expect(prisma.chatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: shortMsg }),
      }),
    );
  });
});

// ── (b) dengan sessionId milik user → append messages ────────────────────────

describe('(b) chatWithRag dengan sessionId milik user: append messages ke session', () => {
  it('session ditemukan + kepemilikan valid → messages di-append, sessionId sama', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag(
      { message: 'lanjut tanya', sessionId: SESSION_ID },
      makeOwner(),
    );

    // Session yang ada dipakai — bukan session baru
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
    expect(prisma.chatSession.findUnique).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      select: { id: true, userId: true },
    });
    expect(prisma.chatMessage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ sessionId: SESSION_ID, role: 'user' }),
          expect.objectContaining({ sessionId: SESSION_ID, role: 'assistant' }),
        ]),
      }),
    );
    expect(result.sessionId).toBe(SESSION_ID);
  });

  it('sessionId milik user lain → ForbiddenException', async () => {
    const gateway = makeGateway();
    // Session dimiliki OTHER_DB_ID, tapi yang request = owner (OWNER_DB_ID)
    const prisma = makePrisma({ sessionOwnerId: OTHER_DB_ID });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(
      svc.chatWithRag({ message: 'hacking session', sessionId: SESSION_ID }, makeOwner()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sessionId tidak ada di DB → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ sessionExists: false });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(
      svc.chatWithRag({ message: 'tanya', sessionId: SESSION_ID }, makeOwner()),
    ).rejects.toThrow(NotFoundException);
  });
});

// ── (c) history oleh pemilik → 200, pesan terurut ASC ───────────────────────

describe('(c) getChatHistory oleh pemilik session: 200, pesan terurut createdAt ASC', () => {
  it('pemilik mendapatkan history session miliknya', async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    const messages = [
      { id: 'msg-1', role: 'user', content: 'cara daftar?', createdAt: earlier },
      { id: 'msg-2', role: 'assistant', content: 'Untuk mendaftar...', createdAt: now },
    ];

    const gateway = makeGateway();
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID, messages });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.getChatHistory(SESSION_ID, makeOwner());

    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');

    // Pastikan query orderBy ASC dipanggil
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: SESSION_ID },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('session tidak ada → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ sessionExists: false });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.getChatHistory(SESSION_ID, makeOwner())).rejects.toThrow(NotFoundException);
  });
});

// ── (d) history oleh user lain → 403 ─────────────────────────────────────────

describe('(d) getChatHistory oleh user lain (bukan pemilik): 403', () => {
  it('user lain (non-SA) → ForbiddenException', async () => {
    const gateway = makeGateway();
    // Session dimiliki OWNER_DB_ID; OTHER_DB_ID bukan pemilik
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.getChatHistory(SESSION_ID, makeOther())).rejects.toThrow(ForbiddenException);
  });

  it('ForbiddenException message mengandung konteks yang jelas', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.getChatHistory(SESSION_ID, makeOther())).rejects.toThrow(
      /bukan session milik/i,
    );
  });
});

// ── (e) SA akses history user lain → 200 ────────────────────────────────────

describe('(e) getChatHistory oleh SUPER_ADMIN (bukan pemilik): 200', () => {
  it('SA dapat akses session user manapun tanpa 403', async () => {
    const now = new Date();
    const messages = [
      { id: 'msg-x', role: 'user', content: 'rahasia siswa', createdAt: now },
    ];

    const gateway = makeGateway();
    // Session dimiliki OWNER_DB_ID; SA_DB_ID bukan pemilik tapi harus diizinkan
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID, messages });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.getChatHistory(SESSION_ID, makeSuperAdmin());

    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.messages).toHaveLength(1);
    // SA tidak perlu panggil resolveUserId (skip ownership check)
    // Verifikasi: user.findUnique tidak dipanggil untuk SA (optimasi — tidak perlu resolve)
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('SA dapat akses session yang ada → history dikembalikan penuh', async () => {
    const now = new Date();
    const messages = [
      { id: 'm1', role: 'user', content: 'pertanyaan', createdAt: new Date(now.getTime() - 2000) },
      { id: 'm2', role: 'assistant', content: 'jawaban', createdAt: now },
    ];

    const gateway = makeGateway();
    const prisma = makePrisma({ sessionOwnerId: OWNER_DB_ID, messages });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.getChatHistory(SESSION_ID, makeSuperAdmin());

    expect(result.messages).toHaveLength(2);
  });
});

// ── Endpoint wiring — AiController.history() ─────────────────────────────────

describe('AiController.history(): wiring ke getChatHistory', () => {
  it('GET /ai/chat/:sessionId/history memanggil getChatHistory dengan sessionId + user', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const controller = mod.get(AiController);
    const svc = mod.get(AiService);
    const owner = makeOwner();

    jest.spyOn(svc, 'getChatHistory').mockResolvedValue({ sessionId: SESSION_ID, messages: [] });

    await controller.history(SESSION_ID, owner);

    expect(svc.getChatHistory).toHaveBeenCalledWith(SESSION_ID, owner);
  });
});
