// =============================================================================
// ai-knowledge-crud.spec.ts — Unit tests SMA-46a
//
// Skenario wajib:
//   ✓ create → isActive=false (draft) + createdBy + embed dipanggil
//   ✓ PATCH content → re-embed + isActive kembali false
//   ✓ PATCH title saja → tidak re-embed, status tidak berubah
//   ✓ publish oleh KS → isActive=true + publishedBy/At
//   ✓ publish oleh TU → 403 (ForbiddenException)
//   ✓ publish chunk tanpa embedding → 422 (UnprocessableEntityException)
//   ✓ unpublish oleh SA/KS → isActive=false
//   ✓ unpublish oleh TU → 403
//   ✓ delete oleh SA → ok (hard-delete)
//   ✓ delete oleh TU/KS → 403 (via @Roles controller — test service level: SA only)
//   ✓ GET list/detail OK
//   ✓ getKnowledgeById tidak ada → 404
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
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AIGateway } from '@smk/types';
import { AuthUser } from '@smk/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVector(len = 768): number[] {
  return Array.from({ length: len }, (_, i) => i / len);
}

function makeUser(role: string = 'SUPER_ADMIN'): AuthUser {
  return {
    keycloakId: `kc-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@smk.sch.id`,
    username: role.toLowerCase(),
    roles: [role as AuthUser['roles'][0]],
    fullName: role,
  };
}

function makeGateway(overrides?: Partial<AIGateway>): AIGateway {
  return {
    embed: jest.fn().mockResolvedValue(makeVector()),
    chat: jest.fn().mockResolvedValue('jawaban'),
    ...overrides,
  };
}

const CHUNK_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const USER_DB_ID = 'db-uuid-0000-0000-0000-000000000001';

function makeChunk(overrides?: object) {
  return {
    id: CHUNK_ID,
    title: 'FAQ Test',
    category: 'faq',
    source: 'manual',
    isActive: false,
    createdBy: USER_DB_ID,
    publishedBy: null,
    publishedAt: null,
    createdAt: new Date('2026-06-02'),
    ...overrides,
  };
}

function makePrisma(overrides?: Partial<PrismaService>): PrismaService {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER_DB_ID }),
    },
    ragChunk: {
      create: jest.fn().mockResolvedValue(makeChunk()),
      findUnique: jest.fn().mockResolvedValue(makeChunk()),
      update: jest.fn().mockResolvedValue(makeChunk()),
      delete: jest.fn().mockResolvedValue({ id: CHUNK_ID }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

async function buildModule(gateway: AIGateway, prisma: PrismaService): Promise<TestingModule> {
  return Test.createTestingModule({
    controllers: [AiController],
    providers: [
      AiService,
      { provide: 'AI_GATEWAY', useValue: gateway },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
}

// ── create → draft ────────────────────────────────────────────────────────────

describe('AiService.createKnowledge() — draft flow', () => {
  it('buat chunk dengan isActive=false + createdBy + embed dipanggil', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.createKnowledge(
      { title: 'FAQ', content: 'isi', category: 'faq' },
      makeUser('SUPER_ADMIN'),
    );

    expect(prisma.ragChunk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, createdBy: USER_DB_ID }),
      }),
    );
    expect(gateway.embed).toHaveBeenCalledWith('isi');
    expect(result.embeddingOk).toBe(true);
  });

  it('TU bisa create (SA/KS/TU allowed) — createdBy terisi', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(
      svc.createKnowledge({ title: 'T', content: 'C', category: 'cat' }, makeUser('TATA_USAHA')),
    ).resolves.not.toThrow();

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keycloakId: 'kc-tata_usaha' } }),
    );
  });
});

// ── PATCH: re-embed on content change ────────────────────────────────────────

describe('AiService.updateKnowledge()', () => {
  it('PATCH content → ragChunk.update dipanggil + re-embed + isActive=false', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: CHUNK_ID, title: 'T', content: 'baru', source: 'manual',
          category: 'faq', isActive: false, hasEmbedding: true,
          createdBy: null, publishedBy: null, publishedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await svc.updateKnowledge(CHUNK_ID, { content: 'konten baru' });

    expect(prisma.ragChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'konten baru', isActive: false }),
      }),
    );
    expect(gateway.embed).toHaveBeenCalledWith('konten baru');
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('PATCH title saja → tidak re-embed, isActive tidak diubah', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: CHUNK_ID, title: 'Judul Baru', content: 'lama', source: 'manual',
          category: 'faq', isActive: true, hasEmbedding: true,
          createdBy: null, publishedBy: null, publishedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await svc.updateKnowledge(CHUNK_ID, { title: 'Judul Baru' });

    expect(prisma.ragChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Judul Baru' }),
      }),
    );
    // isActive tidak ada di data update → status tidak berubah
    expect(prisma.ragChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ isActive: false }),
      }),
    );
    expect(gateway.embed).not.toHaveBeenCalled();
  });

  it('chunk tidak ada → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      ragChunk: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as Partial<PrismaService>);
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.updateKnowledge('not-a-real-id', { title: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── publish / unpublish ───────────────────────────────────────────────────────

describe('AiService.publishKnowledge()', () => {
  it('KS publish chunk yang sudah ada embedding → isActive=true + publishedBy/At', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue([{ id: CHUNK_ID, hasEmbedding: true }]),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.publishKnowledge(CHUNK_ID, makeUser('KEPALA_SEKOLAH'));

    expect(prisma.ragChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: true, publishedBy: USER_DB_ID }),
      }),
    );
    expect(result.isActive).toBe(true);
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it('TU coba publish → ForbiddenException 403', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.publishKnowledge(CHUNK_ID, makeUser('TATA_USAHA'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('publish chunk tanpa embedding → UnprocessableEntityException 422', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue([{ id: CHUNK_ID, hasEmbedding: false }]),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.publishKnowledge(CHUNK_ID, makeUser('SUPER_ADMIN'))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('publish chunk tidak ada → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.publishKnowledge(CHUNK_ID, makeUser('SUPER_ADMIN'))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AiService.unpublishKnowledge()', () => {
  it('SA unpublish → isActive=false', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.unpublishKnowledge(CHUNK_ID, makeUser('SUPER_ADMIN'));

    expect(prisma.ragChunk.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(result.isActive).toBe(false);
  });

  it('TU unpublish → ForbiddenException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.unpublishKnowledge(CHUNK_ID, makeUser('TATA_USAHA'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('AiService.deleteKnowledge()', () => {
  it('SA delete → ragChunk.delete dipanggil, return {id}', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma();
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.deleteKnowledge(CHUNK_ID);

    expect(prisma.ragChunk.delete).toHaveBeenCalledWith({ where: { id: CHUNK_ID } });
    expect(result).toEqual({ id: CHUNK_ID });
  });

  it('delete chunk tidak ada → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({
      ragChunk: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as Partial<PrismaService>);
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.deleteKnowledge(CHUNK_ID)).rejects.toThrow(NotFoundException);
  });
});

// ── GET list / detail ─────────────────────────────────────────────────────────

describe('AiService.listKnowledge() + getKnowledgeById()', () => {
  it('listKnowledge menggunakan $queryRaw dan mengembalikan array', async () => {
    const listData = [makeChunk({ hasEmbedding: false })];
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue(listData) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    const result = await svc.listKnowledge();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('getKnowledgeById tidak ada → NotFoundException', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ $queryRaw: jest.fn().mockResolvedValue([]) });
    const mod = await buildModule(gateway, prisma);
    const svc = mod.get(AiService);

    await expect(svc.getKnowledgeById(CHUNK_ID)).rejects.toThrow(NotFoundException);
  });
});
