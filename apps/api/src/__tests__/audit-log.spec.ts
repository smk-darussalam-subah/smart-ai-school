// =============================================================================
// audit-log.spec.ts — Unit tests AuditLogService + AuditLogController
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService, CreateAuditLogInput } from '../audit-log/audit-log.service';
import { AuditLogController } from '../audit-log/audit-log.controller';
import { PrismaService } from '../prisma/prisma.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_INPUT: CreateAuditLogInput = {
  actorId: 'kc-uuid-sa',
  actorUsername: 'admin',
  actorRoles: ['SUPER_ADMIN'],
  action: 'student.create',
  resourceType: 'students',
  resourceId: 'stu-123',
  method: 'POST',
  path: '/api/v1/students',
  statusCode: 201,
  outcome: 'success',
  ip: '203.0.113.5',
  userAgent: 'Mozilla/5.0',
  metadata: null,
};

const SAMPLE_ROW = {
  id: 'cuid-sample-01',
  createdAt: new Date('2026-06-09T10:00:00Z'),
  ...SAMPLE_INPUT,
};

// ── PrismaService mock ─────────────────────────────────────────────────────────

const mockAuditCreate = jest.fn();
const mockAuditFindMany = jest.fn();
const mockAuditCount = jest.fn();
const mockTransaction = jest.fn();

const mockPrisma = {
  auditLog: {
    create: mockAuditCreate,
    findMany: mockAuditFindMany,
    count: mockAuditCount,
  },
  $transaction: mockTransaction,
};

// ── AuditLogService ────────────────────────────────────────────────────────────

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    jest.clearAllMocks();
  });

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('memanggil prisma.auditLog.create dengan data yang benar', async () => {
      mockAuditCreate.mockResolvedValue(SAMPLE_ROW);

      await service.create(SAMPLE_INPUT);

      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const callData = (mockAuditCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(callData['actorId']).toBe('kc-uuid-sa');
      expect(callData['action']).toBe('student.create');
      expect(callData['outcome']).toBe('success');
      expect(callData['statusCode']).toBe(201);
    });

    it('actorId null (anonim) → prisma dipanggil tanpa throw', async () => {
      mockAuditCreate.mockResolvedValue(undefined);

      await expect(service.create({
        ...SAMPLE_INPUT,
        actorId: null,
        actorUsername: null,
        actorRoles: [],
      })).resolves.toBeUndefined();

      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });

    it('prisma.create throw → error dipropagasi (bukan di-swallow service)', async () => {
      mockAuditCreate.mockRejectedValue(new Error('DB error'));

      await expect(service.create(SAMPLE_INPUT)).rejects.toThrow('DB error');
    });
  });

  // ── findAll() ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    beforeEach(() => {
      // $transaction mock: jalankan kedua query dan kembalikan hasilnya
      mockTransaction.mockImplementation(
        (queries: [Promise<unknown[]>, Promise<number>]) =>
          Promise.all(queries),
      );
      mockAuditFindMany.mockResolvedValue([SAMPLE_ROW]);
      mockAuditCount.mockResolvedValue(1);
    });

    it('tanpa filter → total=1, data berisi 1 baris, limit/offset dikembalikan', async () => {
      const result = await service.findAll({ limit: 20, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('filter actorId → WHERE.actorId ter-set, $transaction dipanggil', async () => {
      await service.findAll({ actorId: 'kc-uuid-sa', limit: 20, offset: 0 });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('filter statusCode → $transaction dipanggil', async () => {
      await service.findAll({ statusCode: 201, limit: 20, offset: 0 });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('filter from + to → $transaction dipanggil', async () => {
      await service.findAll({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-09T23:59:59.999Z',
        limit: 20,
        offset: 0,
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('pagination limit=5 offset=10 → limit/offset dikembalikan benar', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ limit: 5, offset: 10 });

      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
    });

    it('total=0 → data=[], total=0', async () => {
      mockTransaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ limit: 20, offset: 0 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});

// ── AuditLogController ─────────────────────────────────────────────────────────

describe('AuditLogController', () => {
  let controller: AuditLogController;

  const mockServiceFindAll = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogService,
          useValue: { findAll: mockServiceFindAll },
        },
      ],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
    jest.clearAllMocks();

    mockServiceFindAll.mockResolvedValue({
      data: [SAMPLE_ROW],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it('query kosong (default) → service.findAll dipanggil, data dikembalikan', async () => {
    const result = await controller.findAll({});
    expect(mockServiceFindAll).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it('query dengan limit + offset string → diparse ke number, service dipanggil', async () => {
    await controller.findAll({ limit: '10', offset: '5' });
    expect(mockServiceFindAll).toHaveBeenCalledTimes(1);
    const arg = mockServiceFindAll.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['limit']).toBe(10);
    expect(arg['offset']).toBe(5);
  });

  it('query dengan actorId + resourceType → diteruskan ke service', async () => {
    await controller.findAll({
      actorId: 'kc-uuid',
      resourceType: 'students',
      limit: '20',
      offset: '0',
    });
    const arg = mockServiceFindAll.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['actorId']).toBe('kc-uuid');
    expect(arg['resourceType']).toBe('students');
  });

  it('limit bukan angka (abc) → BadRequestException dilempar', () => {
    expect(() => controller.findAll({ limit: 'abc' })).toThrow(BadRequestException);
  });

  it('limit lebih dari 100 → BadRequestException (melebihi max)', () => {
    expect(() => controller.findAll({ limit: '200' })).toThrow(BadRequestException);
  });

  it('offset negatif → BadRequestException', () => {
    expect(() => controller.findAll({ offset: '-1' })).toThrow(BadRequestException);
  });

  it('filter from/to datetime valid → service dipanggil tanpa error', async () => {
    await expect(
      controller.findAll({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-09T23:59:59.999Z',
      }),
    ).resolves.toBeDefined();
    expect(mockServiceFindAll).toHaveBeenCalledTimes(1);
  });
});
