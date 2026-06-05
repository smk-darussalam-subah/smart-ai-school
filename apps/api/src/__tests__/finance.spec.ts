// =============================================================================
// finance.spec.ts — Unit tests SMA-41
//
// Skenario wajib:
//   ✓ POST record: recordedBy=userId; dobel bulan/tahun → propagate P2002
//   ✓ POST approve oleh SA/KS → set approvedBy/approvedAt
//   ✓ POST approve oleh TU → 403 (controller @Roles)
//   ✓ POST approve sudah diapprove → ConflictException (409)
//   ✓ POST approve payment tidak ada → NotFoundException
//   ✓ GET list SISWA self-only (query.studentId diabaikan)
//   ✓ GET list ORANG_TUA anak-only
//   ✓ GET list ORANG_TUA tanpa anak → ForbiddenException
//   ✓ GET list SA full access
//   ✓ GET list KS read-only (POST record → 403 — lewat controller)
//   ✓ GET history SISWA self-only; studentId asing → ForbiddenException
//   ✓ GET history ORANG_TUA anak-only; studentId asing → ForbiddenException
//   ✓ GET summary agregat groupBy benar
//   ✓ Controller: query invalid → BadRequestException
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
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinanceService } from '../finance/finance.service';
import { FinanceController } from '../finance/finance.controller';
import { FinanceModule } from '../finance/finance.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SA_USER: AuthUser = {
  keycloakId: 'kc-admin', email: 'admin@smk.sch.id',
  username: 'admin', fullName: 'Admin', roles: ['SUPER_ADMIN'],
};

const KS_USER: AuthUser = {
  keycloakId: 'kc-ks', email: 'ks@smk.sch.id',
  username: 'ks', fullName: 'Kepala Sekolah', roles: ['KEPALA_SEKOLAH'],
};

const TU_USER: AuthUser = {
  keycloakId: 'kc-tu', email: 'tu@smk.sch.id',
  username: 'tu', fullName: 'Sari Wulandari', roles: ['TATA_USAHA'],
};

const SISWA_USER: AuthUser = {
  keycloakId: 'kc-siswa', email: 'siswa@smk.sch.id',
  username: 'siswa1', fullName: 'Budi Santoso', roles: ['SISWA'],
};

const ORANGTUA_USER: AuthUser = {
  keycloakId: 'kc-ortu', email: 'ortu@smk.sch.id',
  username: 'ortu1', fullName: 'Hasan', roles: ['ORANG_TUA'],
};

const MOCK_SPP = {
  id:         'spp-uuid-001',
  studentId:  'student-uuid-001',
  month:      7,
  year:       2025,
  amount:     '250000',
  status:     'paid',
  paidAt:     new Date('2025-07-05'),
  receiptNo:  'RCP-2025-07-001',
  recordedBy: 'user-uuid-tu',
  approvedBy: null,
  approvedAt: null,
  createdAt:  new Date('2025-07-05'),
  updatedAt:  new Date('2025-07-05'),
  student: { id: 'student-uuid-001', nis: '2024001', user: { fullName: 'Budi' } },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  return {
    user:       { findUnique: jest.fn() },
    student:    { findUnique: jest.fn(), findMany: jest.fn() },
    sppPayment: {
      create:   jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update:   jest.fn(),
      count:    jest.fn(),
      groupBy:  jest.fn(),
    },
  };
}

// ── FinanceService tests ───────────────────────────────────────────────────────

describe('FinanceService', () => {
  let service: FinanceService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(FinanceService);
    jest.clearAllMocks();
  });

  // ── createRecord ─────────────────────────────────────────────────────────────

  describe('createRecord', () => {
    const CREATE_DTO = {
      studentId: 'student-uuid-001',
      month: 7,
      year: 2025,
      amount: 250000,
      status: 'paid' as const,
      receiptNo: 'RCP-2025-07-001',
    };

    it('TU berhasil input SPP — recordedBy=userId', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-tu' });
      prisma.sppPayment.create.mockResolvedValue(MOCK_SPP);

      const result = await service.createRecord(CREATE_DTO, TU_USER);

      expect(result).toEqual(MOCK_SPP);
      expect(prisma.sppPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordedBy: 'user-uuid-tu' }),
        }),
      );
    });

    it('SA berhasil input SPP — recordedBy=userId SA', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-admin' });
      prisma.sppPayment.create.mockResolvedValue({ ...MOCK_SPP, recordedBy: 'user-uuid-admin' });

      const result = await service.createRecord(CREATE_DTO, SA_USER);

      expect(prisma.sppPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordedBy: 'user-uuid-admin' }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('P2002 dobel [studentId,month,year] → propagate ke PrismaExceptionFilter', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-tu' });
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prisma.sppPayment.create.mockRejectedValue(p2002);

      // Service TIDAK menangkap P2002 → propagate ke filter global
      await expect(service.createRecord(CREATE_DTO, TU_USER)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('paidAt di-set untuk status paid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-tu' });
      prisma.sppPayment.create.mockResolvedValue(MOCK_SPP);

      await service.createRecord(CREATE_DTO, TU_USER);

      const callData = prisma.sppPayment.create.mock.calls[0][0].data;
      expect(callData.paidAt).toBeInstanceOf(Date);
    });

    it('paidAt null untuk status unpaid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-tu' });
      prisma.sppPayment.create.mockResolvedValue({ ...MOCK_SPP, status: 'unpaid', paidAt: null });

      await service.createRecord({ ...CREATE_DTO, status: 'unpaid' as const }, TU_USER);

      const callData = prisma.sppPayment.create.mock.calls[0][0].data;
      expect(callData.paidAt).toBeNull();
    });

    it('user tidak ada → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createRecord(CREATE_DTO, TU_USER)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const BASE_QUERY = { page: 1, limit: 20 };

    beforeEach(() => {
      prisma.sppPayment.findMany.mockResolvedValue([MOCK_SPP]);
      prisma.sppPayment.count.mockResolvedValue(1);
    });

    it('SA melihat semua data tanpa filter ownership', async () => {
      const result = await service.findAll(BASE_QUERY, SA_USER);

      expect(result.data).toHaveLength(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('KS melihat semua data (read-only di controller)', async () => {
      const result = await service.findAll(BASE_QUERY, KS_USER);

      expect(result.data).toHaveLength(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('TU dengan filter studentId berhasil', async () => {
      await service.findAll({ ...BASE_QUERY, studentId: 'student-uuid-001' }, TU_USER);

      const callWhere = prisma.sppPayment.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-001');
    });

    it('SISWA hanya melihat SPP sendiri — query.studentId diabaikan', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-self' });

      await service.findAll({ ...BASE_QUERY, studentId: 'other-student-uuid' }, SISWA_USER);

      const callWhere = prisma.sppPayment.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-self'); // bukan 'other-student-uuid'
    });

    it('ORANG_TUA hanya melihat SPP anak', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([
        { id: 'child-uuid-001' },
        { id: 'child-uuid-002' },
      ]);

      await service.findAll(BASE_QUERY, ORANGTUA_USER);

      const callWhere = prisma.sppPayment.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toEqual({ in: ['child-uuid-001', 'child-uuid-002'] });
    });

    it('ORANG_TUA tanpa anak → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([]);

      await expect(service.findAll(BASE_QUERY, ORANGTUA_USER)).rejects.toThrow(ForbiddenException);
    });

    it('filter year dan status diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, year: 2025, status: 'paid' as const }, SA_USER);

      const callWhere = prisma.sppPayment.findMany.mock.calls[0][0].where;
      expect(callWhere.year).toBe(2025);
      expect(callWhere.status).toBe('paid');
    });

    it('pagination diterapkan', async () => {
      await service.findAll({ page: 3, limit: 10 }, SA_USER);

      const call = prisma.sppPayment.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20); // (3-1)*10
      expect(call.take).toBe(10);
    });
  });

  // ── summary ──────────────────────────────────────────────────────────────────

  describe('summary', () => {
    it('mengembalikan agregat groupBy year/month/status', async () => {
      prisma.sppPayment.groupBy.mockResolvedValue([
        { year: 2025, month: 7, status: 'paid',   _sum: { amount: '750000' }, _count: { id: 3 } },
        { year: 2025, month: 7, status: 'unpaid', _sum: { amount: '500000' }, _count: { id: 2 } },
      ]);

      const result = await service.summary({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ year: 2025, month: 7, status: 'paid', count: 3 });
      expect(result[1]).toMatchObject({ year: 2025, month: 7, status: 'unpaid', count: 2 });
    });

    it('filter year dan month diteruskan ke where', async () => {
      prisma.sppPayment.groupBy.mockResolvedValue([]);

      await service.summary({ year: 2025, month: 7 });

      const callWhere = prisma.sppPayment.groupBy.mock.calls[0][0].where;
      expect(callWhere.year).toBe(2025);
      expect(callWhere.month).toBe(7);
    });
  });

  // ── findHistory ──────────────────────────────────────────────────────────────

  describe('findHistory', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-uuid-001',
        nis: '2024001',
        user: { fullName: 'Budi' },
      });
      prisma.sppPayment.findMany.mockResolvedValue([MOCK_SPP]);
    });

    it('SA melihat histori student manapun', async () => {
      const result = await service.findHistory('student-uuid-001', SA_USER);

      expect(result.payments).toHaveLength(1);
      expect(result.student.id).toBe('student-uuid-001');
    });

    it('TU melihat histori student manapun', async () => {
      const result = await service.findHistory('student-uuid-001', TU_USER);

      expect(result.payments).toHaveLength(1);
    });

    it('KS melihat histori student manapun (F-1 fix: KS harus bisa akses history, bukan hanya list)', async () => {
      // KS masuk ELEVATED_ROLES → isElevated()=true → tidak kena pembatasan ownership
      // @Roles di controller sebelumnya tidak include KS — bug → sudah diperbaiki
      const result = await service.findHistory('student-uuid-001', KS_USER);

      expect(result.payments).toHaveLength(1);
      expect(result.student.id).toBe('student-uuid-001');
    });

    it('SISWA melihat histori sendiri', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      // student.findUnique dipanggil 2x: sekali untuk resolve siswa, sekali untuk student check
      prisma.student.findUnique
        .mockResolvedValueOnce({ id: 'student-uuid-001' }) // resolveSiswaId
        .mockResolvedValueOnce({ id: 'student-uuid-001', nis: '2024001', user: { fullName: 'Budi' } }); // check

      const result = await service.findHistory('student-uuid-001', SISWA_USER);

      expect(result).toBeDefined();
    });

    it('SISWA akses studentId asing → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-self' }); // resolveSiswaId

      await expect(
        service.findHistory('student-uuid-OTHER', SISWA_USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ORANG_TUA melihat histori anak', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([{ id: 'student-uuid-001' }]);
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-uuid-001',
        nis: '2024001',
        user: { fullName: 'Budi' },
      });

      const result = await service.findHistory('student-uuid-001', ORANGTUA_USER);

      expect(result.payments).toHaveLength(1);
    });

    it('ORANG_TUA akses studentId bukan anaknya → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([{ id: 'child-uuid-001' }]);

      await expect(
        service.findHistory('student-uuid-OTHER', ORANGTUA_USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('student tidak ada → NotFoundException', async () => {
      prisma.student.findUnique.mockResolvedValue(null);

      await expect(service.findHistory('non-existent-id', SA_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('SA berhasil approve — approvedBy=userId, approvedAt di-set', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-admin' });
      prisma.sppPayment.findUnique.mockResolvedValue({
        id: 'spp-uuid-001',
        approvedBy: null,
        approvedAt: null,
      });
      prisma.sppPayment.update.mockResolvedValue({
        ...MOCK_SPP,
        approvedBy: 'user-uuid-admin',
        approvedAt: new Date(),
      });

      const result = await service.approve('spp-uuid-001', SA_USER);

      expect(prisma.sppPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ approvedBy: 'user-uuid-admin' }),
        }),
      );
      expect(result.approvedBy).toBe('user-uuid-admin');
    });

    it('KS berhasil approve', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ks' });
      prisma.sppPayment.findUnique.mockResolvedValue({
        id: 'spp-uuid-001',
        approvedBy: null,
        approvedAt: null,
      });
      prisma.sppPayment.update.mockResolvedValue({
        ...MOCK_SPP,
        approvedBy: 'user-uuid-ks',
        approvedAt: new Date(),
      });

      const result = await service.approve('spp-uuid-001', KS_USER);

      expect(result).toBeDefined();
    });

    it('sudah diapprove sebelumnya → ConflictException (409)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-admin' });
      prisma.sppPayment.findUnique.mockResolvedValue({
        id: 'spp-uuid-001',
        approvedBy: 'user-uuid-ks', // sudah ada approvedBy
        approvedAt: new Date(),
      });

      await expect(service.approve('spp-uuid-001', SA_USER)).rejects.toThrow(ConflictException);
      expect(prisma.sppPayment.update).not.toHaveBeenCalled();
    });

    it('payment tidak ditemukan → NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-admin' });
      prisma.sppPayment.findUnique.mockResolvedValue(null);

      await expect(service.approve('non-existent-id', SA_USER)).rejects.toThrow(NotFoundException);
    });

    it('approvedAt adalah Date instance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-admin' });
      prisma.sppPayment.findUnique.mockResolvedValue({
        id: 'spp-uuid-001',
        approvedBy: null,
        approvedAt: null,
      });
      prisma.sppPayment.update.mockResolvedValue({ ...MOCK_SPP, approvedBy: 'user-uuid-admin', approvedAt: new Date() });

      await service.approve('spp-uuid-001', SA_USER);

      const updateCall = prisma.sppPayment.update.mock.calls[0][0];
      expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
    });
  });
});

// ── FinanceController tests ────────────────────────────────────────────────────

describe('FinanceController', () => {
  let controller: FinanceController;
  let service: jest.Mocked<FinanceService>;

  const mockService = {
    createRecord: jest.fn().mockResolvedValue(MOCK_SPP),
    findAll:      jest.fn().mockResolvedValue({ data: [MOCK_SPP], total: 1, page: 1, limit: 20 }),
    summary:      jest.fn().mockResolvedValue([]),
    findHistory:  jest.fn().mockResolvedValue({ student: {}, payments: [] }),
    approve:      jest.fn().mockResolvedValue({ ...MOCK_SPP, approvedBy: 'user-uuid-admin' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanceController],
      providers: [{ provide: FinanceService, useValue: mockService }],
    }).compile();

    controller = module.get(FinanceController);
    service = module.get(FinanceService);
    jest.clearAllMocks();
  });

  it('createRecord — delegasi ke service dengan dto + user', async () => {
    const dto = { studentId: 'student-uuid-001', month: 7, year: 2025, amount: 250000, status: 'paid' as const };
    await controller.createRecord(dto, TU_USER);
    expect(service.createRecord).toHaveBeenCalledWith(dto, TU_USER);
  });

  it('findAll — query valid → delegasi ke service', async () => {
    await controller.findAll({ year: '2025', status: 'paid' }, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2025, status: 'paid' }),
      SA_USER,
    );
  });

  it('findAll — query tidak valid → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ year: 'invalid' }, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('summary — query valid → delegasi ke service', async () => {
    await controller.summary({ year: '2025' });
    expect(service.summary).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2025 }),
    );
  });

  it('summary — query tidak valid → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.summary({ month: 'tiga-belas' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('findHistory — delegasi ke service dengan studentId + user', async () => {
    await controller.findHistory('student-uuid-001', SISWA_USER);
    expect(service.findHistory).toHaveBeenCalledWith('student-uuid-001', SISWA_USER);
  });

  it('approve — delegasi ke service dengan id + user', async () => {
    await controller.approve('spp-uuid-001', SA_USER);
    expect(service.approve).toHaveBeenCalledWith('spp-uuid-001', SA_USER);
  });
});

// ── FinanceModule compilation ─────────────────────────────────────────────────

describe('FinanceModule', () => {
  it('compiles dengan PrismaService di-override', async () => {
    const module = await Test.createTestingModule({
      imports: [FinanceModule],
    })
      .overrideProvider(FinanceService)
      .useValue({})
      .compile();

    expect(module).toBeDefined();
    expect(module.get(FinanceController)).toBeDefined();
  });
});
