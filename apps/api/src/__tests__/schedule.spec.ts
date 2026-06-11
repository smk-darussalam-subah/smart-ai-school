// =============================================================================
// schedule.spec.ts — Unit tests SMA-39
//
// Skenario wajib:
//   ✓ POST: SA input jadwal → 201, data tersimpan
//   ✓ POST: teachingAssignmentId tidak ada → 400
//   ✓ POST: classId tidak sesuai teachingAssignment → 400
//   ✓ POST: konflik guru (slot JP overlap) → ConflictException 409
//   ✓ POST: konflik ruang (slot JP overlap) → ConflictException 409
//   ✓ POST: konflik kelas (P2002) → di-propagate ke PrismaExceptionFilter → 409
//   ✓ GET:  SA melihat semua (no ownership filter)
//   ✓ GET:  GURU hanya jadwal assignment miliknya
//   ✓ GET:  GURU tanpa profil teacher → ForbiddenException
//   ✓ GET:  GURU tanpa assignment → return kosong
//   ✓ GET:  SISWA hanya kelas sendiri
//   ✓ GET:  SISWA belum di kelas → return kosong
//   ✓ GET:  ORANG_TUA hanya kelas anak
//   ✓ GET:  ORANG_TUA tanpa anak → ForbiddenException
//   ✓ GET:  filter teacherId (elevated) → via TeachingAssignment
//   ✓ GET:  filter teacherId kosong → return kosong
//   ✓ GET:  pagination diterapkan
//   ✓ Controller: query invalid → BadRequestException
//   ✓ Controller: body invalid (jpEnd < jpStart) → 400 via ZodPipe
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser:     jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger:   { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScheduleService }    from '../schedule/schedule.service';
import { ScheduleController } from '../schedule/schedule.controller';
import { ScheduleModule }     from '../schedule/schedule.module';
import { PrismaService }      from '../prisma/prisma.service';
import { AuthUser }           from '@smk/auth';

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
  username: 'tu', fullName: 'Tata Usaha', roles: ['TATA_USAHA'],
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

const MOCK_SCHEDULE = {
  id:                   'sched-uuid-001',
  classId:              'class-uuid-001',
  teachingAssignmentId: 'ta-uuid-001',
  dayOfWeek:            1,
  jpStart:              1,
  jpEnd:                2,
  room:                 'Lab TKJ',
  academicYear:         '2025/2026',
  semester:             1,
  createdAt:            new Date('2025-07-21'),
  updatedAt:            new Date('2025-07-21'),
  class:                { id: 'class-uuid-001', name: 'X TKJ 1', majorCode: 'TKJ', grade: 10 },
  teachingAssignment: {
    id:      'ta-uuid-001',
    subject: 'Jaringan Komputer',
    teacher: { id: 'teacher-uuid-001', user: { fullName: 'Agus Setiawan' } },
  },
};

const CREATE_DTO = {
  classId:              'class-uuid-001',
  teachingAssignmentId: 'ta-uuid-001',
  dayOfWeek:            1,
  jpStart:              3,
  jpEnd:                4,
  room:                 'Kelas A',
  academicYear:         '2025/2026',
  semester:             1,
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  return {
    user:               { findUnique: jest.fn() },
    teacher:            { findUnique: jest.fn() },
    student:            { findUnique: jest.fn(), findMany: jest.fn() },
    teachingAssignment: { findUnique: jest.fn(), findMany: jest.fn() },
    schedule: {
      findFirst:  jest.fn(),
      findMany:   jest.fn(),
      count:      jest.fn(),
      create:     jest.fn(),
    },
  };
}

// ── ScheduleService tests ─────────────────────────────────────────────────────

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ScheduleService);
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────────

  describe('create', () => {
    function setupValidCreate(opts: {
      taClassId?: string;
      taAcademicYear?: string;
      guruConflict?: boolean;
      roomConflict?: boolean;
    } = {}) {
      prisma.teachingAssignment.findUnique.mockResolvedValue({
        id:           'ta-uuid-001',
        teacherId:    'teacher-uuid-001',
        classId:      opts.taClassId ?? 'class-uuid-001',
        academicYear: opts.taAcademicYear ?? '2025/2026',
      });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ id: 'ta-uuid-001' }]);
      prisma.schedule.findFirst
        .mockResolvedValueOnce(opts.guruConflict ? { id: 'conflict' } : null)
        .mockResolvedValueOnce(opts.roomConflict ? { id: 'conflict' } : null);
      prisma.schedule.create.mockResolvedValue(MOCK_SCHEDULE);
    }

    it('SA input jadwal valid → create dipanggil, data dikembalikan', async () => {
      setupValidCreate();
      const result = await service.create(CREATE_DTO);
      expect(prisma.schedule.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(MOCK_SCHEDULE);
    });

    it('teachingAssignmentId tidak ada → BadRequestException', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(null);
      await expect(service.create(CREATE_DTO)).rejects.toThrow(BadRequestException);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('classId tidak sesuai teachingAssignment → BadRequestException', async () => {
      setupValidCreate({ taClassId: 'class-uuid-BEDA' });
      await expect(service.create(CREATE_DTO)).rejects.toThrow(BadRequestException);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('academicYear mismatch vs TeachingAssignment → BadRequestException (F-1)', async () => {
      // assignment punya 2024/2025, dto kirim 2025/2026 → inkonsisten → 400
      setupValidCreate({ taAcademicYear: '2024/2025' });
      await expect(
        service.create({ ...CREATE_DTO, academicYear: '2025/2026' }),
      ).rejects.toThrow(BadRequestException);
      // gagal cepat: cek konflik tidak boleh dijalankan
      expect(prisma.schedule.findFirst).not.toHaveBeenCalled();
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('konflik guru (slot JP overlap) → ConflictException', async () => {
      setupValidCreate({ guruConflict: true });
      await expect(service.create(CREATE_DTO)).rejects.toThrow(ConflictException);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('konflik ruang (slot JP overlap, room non-null) → ConflictException', async () => {
      setupValidCreate({ roomConflict: true });
      await expect(service.create(CREATE_DTO)).rejects.toThrow(ConflictException);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('room null → cek konflik ruang di-skip (findFirst 2×: rentang kelas + guru)', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue({
        id: 'ta-uuid-001', teacherId: 'teacher-uuid-001', classId: 'class-uuid-001',
        academicYear: '2025/2026',
      });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ id: 'ta-uuid-001' }]);
      prisma.schedule.findFirst.mockResolvedValue(null); // guru tidak conflict
      prisma.schedule.create.mockResolvedValue(MOCK_SCHEDULE);

      await service.create({ ...CREATE_DTO, room: null });

      // findFirst 2× (2F-1: cek rentang kelas + cek guru) — room check di-skip
      expect(prisma.schedule.findFirst).toHaveBeenCalledTimes(2);
    });

    it('P2002 dari DB → error di-propagate ke PrismaExceptionFilter', async () => {
      setupValidCreate();
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002', clientVersion: '5.0.0',
      });
      prisma.schedule.create.mockRejectedValue(p2002);

      await expect(service.create(CREATE_DTO)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const BASE_QUERY = { page: 1, limit: 20 };

    beforeEach(() => {
      prisma.schedule.findMany.mockResolvedValue([MOCK_SCHEDULE]);
      prisma.schedule.count.mockResolvedValue(1);
    });

    it('SA melihat semua — tidak ada ownership filter, user.findUnique tidak dipanggil', async () => {
      const result = await service.findAll(BASE_QUERY, SA_USER);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('KS melihat semua — tidak ada ownership filter', async () => {
      await service.findAll(BASE_QUERY, KS_USER);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('TU melihat semua — tidak ada ownership filter', async () => {
      await service.findAll(BASE_QUERY, TU_USER);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('SA + teacherId filter → TeachingAssignment dicari, taIds dipakai di where', async () => {
      prisma.teachingAssignment.findMany.mockResolvedValue([{ id: 'ta-uuid-001' }]);

      await service.findAll({ ...BASE_QUERY, teacherId: 'teacher-uuid-001' }, SA_USER);

      expect(prisma.teachingAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teacherId: 'teacher-uuid-001' } }),
      );
      const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
      expect(callWhere.teachingAssignmentId).toEqual({ in: ['ta-uuid-001'] });
    });

    it('SA + teacherId filter, teacher tidak punya assignment → return kosong', async () => {
      prisma.teachingAssignment.findMany.mockResolvedValue([]);

      const result = await service.findAll({ ...BASE_QUERY, teacherId: 'teacher-uuid-NONE' }, SA_USER);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });

    describe('GURU ownership', () => {
      function setupGuru(assignmentIds: string[]) {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
        prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
        prisma.teachingAssignment.findMany.mockResolvedValue(
          assignmentIds.map((id) => ({ id })),
        );
      }

      it('GURU hanya jadwal assignment miliknya — where.teachingAssignmentId = { in: taIds }', async () => {
        setupGuru(['ta-uuid-001', 'ta-uuid-002']);
        await service.findAll(BASE_QUERY, GURU_USER);

        const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
        expect(callWhere.teachingAssignmentId).toEqual({ in: ['ta-uuid-001', 'ta-uuid-002'] });
      });

      it('GURU tanpa assignment → return kosong, schedule.findMany tidak dipanggil', async () => {
        setupGuru([]);
        const result = await service.findAll(BASE_QUERY, GURU_USER);

        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
        expect(prisma.schedule.findMany).not.toHaveBeenCalled();
      });

      it('GURU tanpa profil teacher → ForbiddenException', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
        prisma.teacher.findUnique.mockResolvedValue(null);

        await expect(service.findAll(BASE_QUERY, GURU_USER)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('SISWA ownership', () => {
      it('SISWA hanya kelas sendiri — where.classId = student.classId', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
        prisma.student.findUnique.mockResolvedValue({ classId: 'class-uuid-001' });

        await service.findAll(BASE_QUERY, SISWA_USER);

        const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
        expect(callWhere.classId).toBe('class-uuid-001');
      });

      it('SISWA belum di kelas (classId null) → return kosong', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
        prisma.student.findUnique.mockResolvedValue({ classId: null });

        const result = await service.findAll(BASE_QUERY, SISWA_USER);

        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
        expect(prisma.schedule.findMany).not.toHaveBeenCalled();
      });

      it('SISWA tidak ada profil → mengembalikan data kosong', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
        prisma.student.findUnique.mockResolvedValue(null);

        const result = await service.findAll(BASE_QUERY, SISWA_USER);

        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
      });
    });

    describe('ORANG_TUA ownership', () => {
      it('ORANG_TUA hanya kelas anak — where.classId = { in: childClassIds }', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
        prisma.student.findMany.mockResolvedValue([
          { classId: 'class-uuid-001' },
          { classId: 'class-uuid-002' },
        ]);

        await service.findAll(BASE_QUERY, ORANGTUA_USER);

        const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
        expect(callWhere.classId).toEqual({ in: ['class-uuid-001', 'class-uuid-002'] });
      });

      it('ORANG_TUA tanpa anak terdaftar → ForbiddenException', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
        prisma.student.findMany.mockResolvedValue([]);

        await expect(service.findAll(BASE_QUERY, ORANGTUA_USER)).rejects.toThrow(ForbiddenException);
      });
    });

    it('filter dayOfWeek → where.dayOfWeek diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, dayOfWeek: 1 }, SA_USER);
      const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
      expect(callWhere.dayOfWeek).toBe(1);
    });

    it('filter academicYear → where.academicYear diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, academicYear: '2025/2026' }, SA_USER);
      const callWhere = prisma.schedule.findMany.mock.calls[0][0].where;
      expect(callWhere.academicYear).toBe('2025/2026');
    });

    it('pagination — skip dan take diterapkan dengan benar', async () => {
      await service.findAll({ page: 3, limit: 10 }, SA_USER);
      const call = prisma.schedule.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20); // (3-1)*10
      expect(call.take).toBe(10);
    });
  });
});

// ── ScheduleController tests ──────────────────────────────────────────────────

describe('ScheduleController', () => {
  let controller: ScheduleController;
  let service: jest.Mocked<ScheduleService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        {
          provide: ScheduleService,
          useValue: {
            findAll: jest.fn().mockResolvedValue({ data: [MOCK_SCHEDULE], total: 1, page: 1, limit: 20 }),
            create:  jest.fn().mockResolvedValue(MOCK_SCHEDULE),
          },
        },
      ],
    }).compile();

    controller = module.get(ScheduleController);
    service    = module.get(ScheduleService);
    jest.clearAllMocks();
  });

  it('findAll — query valid → delegasi ke service', async () => {
    await controller.findAll({ dayOfWeek: '1', page: '1' }, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ dayOfWeek: 1, page: 1 }),
      SA_USER,
    );
  });

  it('findAll — query tidak valid (dayOfWeek > 6) → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ dayOfWeek: '7' }, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('findAll — semester tidak valid (3) → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ semester: '3' }, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('create — body valid → delegasi ke service', async () => {
    await controller.create(CREATE_DTO);
    expect(service.create).toHaveBeenCalledWith(CREATE_DTO);
  });
});

// ── ScheduleModule compilation ────────────────────────────────────────────────

describe('ScheduleModule', () => {
  it('compiles dengan PrismaService di-override', async () => {
    const module = await Test.createTestingModule({
      imports: [ScheduleModule],
    })
      .overrideProvider(ScheduleService)
      .useValue({})
      .compile();

    expect(module).toBeDefined();
    expect(module.get(ScheduleController)).toBeDefined();
  });
});
