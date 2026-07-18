// =============================================================================
// attendance.spec.ts — Unit tests SMA-38
//
// Skenario wajib:
//   ✓ POST: GURU bulk insert OK — semua record disimpan atomik
//   ✓ POST: GURU kelas lain → ForbiddenException (403)
//   ✓ POST: GURU tanpa profil teacher → ForbiddenException
//   ✓ POST: classId tidak ada → NotFoundException
//   ✓ POST: P2002 duplikat → di-propagate (PrismaExceptionFilter → 409 di HTTP)
//   ✓ POST: transaksi gagal sebagian → $transaction dipanggil, error propagate
//   ✓ GET:  SA melihat semua
//   ✓ GET:  GURU hanya kelas yang ia ajar
//   ✓ GET:  GURU + classId bukan kelasnya → ForbiddenException
//   ✓ GET:  SISWA hanya diri sendiri
//   ✓ GET:  ORANG_TUA hanya anak
//   ✓ GET:  ORANG_TUA tanpa anak → ForbiddenException
//   ✓ GET:  filter dateFrom/dateTo diterapkan
//   ✓ GET:  pagination diterapkan
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
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceController } from '../attendance/attendance.controller';
import { AttendanceModule } from '../attendance/attendance.module';
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

const GURU_USER: AuthUser = {
  keycloakId: 'kc-guru', email: 'guru@smk.sch.id',
  username: 'guru1', fullName: 'Agus', roles: ['GURU'],
};

const SISWA_USER: AuthUser = {
  keycloakId: 'kc-siswa', email: 'siswa@smk.sch.id',
  username: 'siswa1', fullName: 'Budi', roles: ['SISWA'],
};

const ORANGTUA_USER: AuthUser = {
  keycloakId: 'kc-ortu', email: 'ortu@smk.sch.id',
  username: 'ortu1', fullName: 'Hasan', roles: ['ORANG_TUA'],
};

const MOCK_ATTENDANCE = {
  id:         'att-uuid-001',
  studentId:  'student-uuid-001',
  classId:    'class-uuid-001',
  date:       new Date('2025-07-21'),
  status:     'hadir',
  notes:      null,
  recordedBy: 'user-uuid-guru',
  createdAt:  new Date('2025-07-21'),
  student:    { id: 'student-uuid-001', nis: '2024001', user: { fullName: 'Budi' } },
  class:      { id: 'class-uuid-001', name: 'X RPL 1', majorCode: 'RPL' },
};

const BULK_DTO = {
  classId: 'class-uuid-001',
  date:    '2025-07-21',
  records: [
    { studentId: 'student-uuid-001', status: 'hadir' as const },
    { studentId: 'student-uuid-002', status: 'izin'  as const },
  ],
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  return {
    $transaction: jest.fn(),
    user:    { findUnique: jest.fn() },
    teacher: { findUnique: jest.fn() },
    student: { findUnique: jest.fn(), findMany: jest.fn() },
    teachingAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    class:   { findUnique: jest.fn(), findMany: jest.fn() },
    attendance: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      count:      jest.fn(),
    },
  };
}

// ── AttendanceService tests ───────────────────────────────────────────────────

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(AttendanceService);
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([]);
  });

  // ── bulkCreate ───────────────────────────────────────────────────────────────

  describe('bulkCreate', () => {
    function setupGuruResolve(opts: { teacherId?: string; hasAssignment?: boolean } = {}) {
      const tid = opts.teacherId ?? 'teacher-uuid-001';
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue({ id: tid });
      prisma.teachingAssignment.findFirst.mockResolvedValue(
        opts.hasAssignment === false ? null : { id: 'assign-uuid-001' },
      );
      prisma.class.findUnique.mockResolvedValue({ id: 'class-uuid-001' });
    }

    it('bulk insert berhasil — $transaction dipanggil dengan benar', async () => {
      setupGuruResolve();
      prisma.$transaction.mockResolvedValue([MOCK_ATTENDANCE, { ...MOCK_ATTENDANCE, id: 'att-uuid-002', studentId: 'student-uuid-002' }]);

      const result = await service.bulkCreate(BULK_DTO, GURU_USER);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // $transaction menerima array Prisma promises (satu per record)
      const txArg = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(2); // 2 records
      expect(result.count).toBe(2);
      expect(result.date).toBe('2025-07-21');
      expect(result.classId).toBe('class-uuid-001');
    });

    it('recordedBy diisi dengan userId guru (bukan teacherId)', async () => {
      setupGuruResolve();
      // Pastikan attendance.create dipanggil dengan recordedBy = user.id
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
        // simulate: return mock data, verify create was called correctly via attendance.create mock
        return ops.map(() => MOCK_ATTENDANCE);
      });
      // Inject spy pada attendance.create untuk cek argumen
      const createSpy = jest.spyOn(prisma.attendance, 'create').mockReturnValue(MOCK_ATTENDANCE as never);

      await service.bulkCreate(BULK_DTO, GURU_USER);

      // create dipanggil 2x (satu per record)
      expect(createSpy).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const firstCall = createSpy.mock.calls[0]![0] as { data: { recordedBy: string } };
      expect(firstCall.data.recordedBy).toBe('user-uuid-guru');
    });

    it('GURU kelas lain (tidak punya TeachingAssignment di sana) → ForbiddenException', async () => {
      setupGuruResolve({ hasAssignment: false });

      await expect(service.bulkCreate(BULK_DTO, GURU_USER)).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('GURU tanpa profil teacher → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue(null);

      await expect(service.bulkCreate(BULK_DTO, GURU_USER)).rejects.toThrow(ForbiddenException);
    });

    it('classId tidak ada → NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findFirst.mockResolvedValue({ id: 'assign-uuid-001' });
      prisma.class.findUnique.mockResolvedValue(null); // kelas tidak ada

      await expect(service.bulkCreate(BULK_DTO, GURU_USER)).rejects.toThrow(NotFoundException);
    });

    it('P2002 dari $transaction → di-propagate (PrismaExceptionFilter → 409 di HTTP)', async () => {
      setupGuruResolve();
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      // Simulasi: $transaction rollback karena P2002
      prisma.$transaction.mockRejectedValue(p2002);

      await expect(service.bulkCreate(BULK_DTO, GURU_USER)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('transaksi gagal sebagian → error propagate, $transaction dipanggil (rollback otomatis)', async () => {
      setupGuruResolve();
      const dbError = new Error('Connection lost mid-transaction');
      prisma.$transaction.mockRejectedValue(dbError);

      await expect(service.bulkCreate(BULK_DTO, GURU_USER)).rejects.toThrow('Connection lost mid-transaction');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('date di-parse UTC — attendance.create menerima Date object', async () => {
      setupGuruResolve();
      const createSpy = jest.spyOn(prisma.attendance, 'create').mockReturnValue(MOCK_ATTENDANCE as never);
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => ops.map(() => MOCK_ATTENDANCE));

      await service.bulkCreate({ ...BULK_DTO, date: '2025-01-15' }, GURU_USER);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const firstCall = createSpy.mock.calls[0]![0] as { data: { date: Date } };
      expect(firstCall.data.date).toBeInstanceOf(Date);
      expect(firstCall.data.date.toISOString()).toContain('2025-01-15');
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const BASE_QUERY = { page: 1, limit: 20 };

    beforeEach(() => {
      prisma.attendance.findMany.mockResolvedValue([MOCK_ATTENDANCE]);
      prisma.attendance.count.mockResolvedValue(1);
    });

    it('SA melihat semua tanpa filter ownership', async () => {
      const result = await service.findAll(BASE_QUERY, SA_USER);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('KS melihat semua tanpa filter ownership', async () => {
      await service.findAll(BASE_QUERY, KS_USER);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('SA + classId filter → where.classId diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, classId: 'class-uuid-001' }, SA_USER);

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.classId).toBe('class-uuid-001');
    });

    it('SA + studentId filter → where.studentId diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, studentId: 'student-uuid-001' }, SA_USER);

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-001');
    });

    it('SA + dateFrom/dateTo → where.date.gte/lte diterapkan', async () => {
      await service.findAll(
        { ...BASE_QUERY, dateFrom: '2025-07-01', dateTo: '2025-07-31' },
        SA_USER,
      );

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.date).toBeDefined();
      expect((callWhere.date as { gte: Date }).gte).toBeInstanceOf(Date);
      expect((callWhere.date as { lte: Date }).lte).toBeInstanceOf(Date);
    });

    describe('GURU ownership', () => {
      function setupGuru(classIds: string[]) {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
        prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
        prisma.teachingAssignment.findMany.mockResolvedValue(
          classIds.map((id) => ({ classId: id })),
        );
      }

      it('GURU hanya kelas yang ia ajar — where.classId = { in: myClassIds }', async () => {
        setupGuru(['class-uuid-001', 'class-uuid-002']);

        await service.findAll(BASE_QUERY, GURU_USER);

        const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
        expect(callWhere.classId).toEqual({ in: ['class-uuid-001', 'class-uuid-002'] });
      });

      it('GURU + classId valid (kelasnya sendiri) → where.classId = classId spesifik', async () => {
        setupGuru(['class-uuid-001', 'class-uuid-002']);

        await service.findAll({ ...BASE_QUERY, classId: 'class-uuid-001' }, GURU_USER);

        const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
        expect(callWhere.classId).toBe('class-uuid-001');
      });

      it('GURU + classId bukan kelasnya → ForbiddenException', async () => {
        setupGuru(['class-uuid-001']);

        await expect(
          service.findAll({ ...BASE_QUERY, classId: 'class-uuid-LAIN' }, GURU_USER),
        ).rejects.toThrow(ForbiddenException);
      });

      it('GURU tanpa assignment sama sekali → return kosong tanpa DB query attendance', async () => {
        setupGuru([]); // tidak ada kelas

        const result = await service.findAll(BASE_QUERY, GURU_USER);

        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
        expect(prisma.attendance.findMany).not.toHaveBeenCalled();
      });
    });

    it('SISWA hanya diri sendiri — studentId dari query diabaikan', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-self' });

      await service.findAll({ ...BASE_QUERY, studentId: 'student-uuid-LAIN' }, SISWA_USER);

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-self');
    });

    it('SISWA + classId filter → where.classId diterapkan', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-self' });

      await service.findAll({ ...BASE_QUERY, classId: 'class-uuid-001' }, SISWA_USER);

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-self');
      expect(callWhere.classId).toBe('class-uuid-001');
    });

    it('ORANG_TUA hanya anak — where.studentId = { in: childIds }', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([{ id: 'child-uuid-001' }, { id: 'child-uuid-002' }]);

      await service.findAll(BASE_QUERY, ORANGTUA_USER);

      const callWhere = prisma.attendance.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toEqual({ in: ['child-uuid-001', 'child-uuid-002'] });
    });

    it('ORANG_TUA tanpa anak terdaftar → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([]);

      await expect(service.findAll(BASE_QUERY, ORANGTUA_USER)).rejects.toThrow(ForbiddenException);
    });

    it('pagination — skip dan take diterapkan dengan benar', async () => {
      await service.findAll({ page: 3, limit: 15 }, SA_USER);

      const call = prisma.attendance.findMany.mock.calls[0][0];
      expect(call.skip).toBe(30); // (3-1)*15
      expect(call.take).toBe(15);
    });
  });
});

// ── AttendanceController tests ────────────────────────────────────────────────

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: jest.Mocked<AttendanceService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: {
            bulkCreate: jest.fn().mockResolvedValue({
              count: 2, date: '2025-07-21', classId: 'class-uuid-001', data: [MOCK_ATTENDANCE],
            }),
            findAll: jest.fn().mockResolvedValue({ data: [MOCK_ATTENDANCE], total: 1, page: 1, limit: 20 }),
          },
        },
      ],
    }).compile();

    controller = module.get(AttendanceController);
    service = module.get(AttendanceService);
    jest.clearAllMocks();
  });

  it('bulkCreate — delegasi ke service dengan dto + user', async () => {
    await controller.bulkCreate(BULK_DTO, GURU_USER);
    expect(service.bulkCreate).toHaveBeenCalledWith(BULK_DTO, GURU_USER);
  });

  it('findAll — query valid → delegasi ke service', async () => {
    const validClassId = '550e8400-e29b-41d4-a716-446655440000';
    await controller.findAll({ classId: validClassId, page: '1' }, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ classId: validClassId, page: 1 }),
      SA_USER,
    );
  });

  it('findAll — query tidak valid (page = bukan angka) → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ page: 'abc' }, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('findAll — date format salah → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ dateFrom: '21-07-2025' }, SA_USER); // format salah
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });
});

// ── AttendanceModule compilation ──────────────────────────────────────────────

describe('AttendanceModule', () => {
  it('compiles dengan PrismaService di-override', async () => {
    const module = await Test.createTestingModule({
      imports: [AttendanceModule],
    })
      .overrideProvider(AttendanceService)
      .useValue({})
      .compile();

    expect(module).toBeDefined();
    expect(module.get(AttendanceController)).toBeDefined();
  });
});
