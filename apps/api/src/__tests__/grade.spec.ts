// =============================================================================
// grade.spec.ts — Unit tests SMA-37
//
// Skenario wajib:
//   ✓ POST: GURU input nilai → OK
//   ✓ POST: GURU bukan pemilik assignment → ForbiddenException
//   ✓ POST: UTS dobel → ConflictException (409)
//   ✓ POST: UAS dobel → ConflictException (409)
//   ✓ POST: UH dobel → OK (boleh banyak)
//   ✓ POST: assignmentId tidak ada → NotFoundException
//   ✓ POST: studentId tidak ada → NotFoundException
//   ✓ GET:  GURU hanya mendapat nilai kelas sendiri
//   ✓ GET:  SISWA hanya mendapat nilai sendiri
//   ✓ GET:  ORANG_TUA hanya mendapat nilai anak
//   ✓ GET:  SA melihat semua
//   ✓ PATCH SA: selalu bisa
//   ✓ PATCH GURU: berhasil dalam 7 hari
//   ✓ PATCH GURU: >7 hari → ForbiddenException
//   ✓ PATCH GURU: submittedBy orang lain → ForbiddenException
//   ✓ PATCH: grade tidak ada → NotFoundException
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GradeService } from '../grade/grade.service';
import { GradeController } from '../grade/grade.controller';
import { GradeModule } from '../grade/grade.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SA_USER: AuthUser = {
  keycloakId: 'kc-admin', email: 'admin@smk.sch.id',
  username: 'admin', fullName: 'Admin', roles: ['SUPER_ADMIN'],
};

const GURU_USER: AuthUser = {
  keycloakId: 'kc-guru', email: 'guru@smk.sch.id',
  username: 'guru1', fullName: 'Agus Setiawan', roles: ['GURU'],
};

const SISWA_USER: AuthUser = {
  keycloakId: 'kc-siswa', email: 'siswa@smk.sch.id',
  username: 'siswa1', fullName: 'Budi Santoso', roles: ['SISWA'],
};

const ORANGTUA_USER: AuthUser = {
  keycloakId: 'kc-ortu', email: 'ortu@smk.sch.id',
  username: 'ortu1', fullName: 'Hasan', roles: ['ORANG_TUA'],
};

const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

const MOCK_ASSIGNMENT = {
  id: 'assign-uuid-001',
  teacherId: 'teacher-uuid-001',
  academicYear: '2025/2026',
};

const MOCK_GRADE = {
  id: 'grade-uuid-001',
  studentId: 'student-uuid-001',
  assignmentId: 'assign-uuid-001',
  semester: 1,
  academicYear: '2025/2026',
  score: '85.00',
  type: 'uts',
  notes: null,
  submittedBy: 'user-uuid-guru',
  createdAt: THREE_DAYS_AGO,
  updatedAt: THREE_DAYS_AGO,
  student: { id: 'student-uuid-001', nis: '2024001', user: { fullName: 'Budi' } },
  assignment: {
    id: 'assign-uuid-001',
    subject: 'Matematika',
    teacherId: 'teacher-uuid-001',
    classId: 'class-uuid-001',
    academicYear: '2025/2026',
    class: { id: 'class-uuid-001', name: 'X RPL 1' },
    teacher: { id: 'teacher-uuid-001', user: { fullName: 'Agus' } },
  },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  return {
    user:       { findUnique: jest.fn() },
    teacher:    { findUnique: jest.fn() },
    student:    { findUnique: jest.fn(), findMany: jest.fn() },
    teachingAssignment: { findUnique: jest.fn() },
    grade: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
      count:     jest.fn(),
    },
  };
}

// ── GradeService tests ────────────────────────────────────────────────────────

describe('GradeService', () => {
  let service: GradeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(GradeService);
    jest.clearAllMocks();
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const CREATE_DTO = {
      studentId:    'student-uuid-001',
      assignmentId: 'assign-uuid-001',
      semester:     1,
      score:        85,
      type:         'uts' as const,
    };

    function setupGuruResolve(teacherId = 'teacher-uuid-001') {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue({ id: teacherId });
    }

    it('GURU berhasil input nilai UTS baru', async () => {
      setupGuruResolve();
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
      prisma.grade.findFirst.mockResolvedValue(null); // belum ada UTS
      prisma.grade.create.mockResolvedValue(MOCK_GRADE);

      const result = await service.create(CREATE_DTO, GURU_USER);

      expect(result).toEqual(MOCK_GRADE);
      expect(prisma.grade.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submittedBy: 'user-uuid-guru',
            academicYear: '2025/2026',
          }),
        }),
      );
    });

    it('assignmentId tidak ada → NotFoundException', async () => {
      setupGuruResolve();
      prisma.teachingAssignment.findUnique.mockResolvedValue(null);

      await expect(service.create(CREATE_DTO, GURU_USER)).rejects.toThrow(NotFoundException);
    });

    it('assignment bukan milik guru ini → ForbiddenException', async () => {
      setupGuruResolve('other-teacher-uuid'); // teacher lain
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT); // teacherId = 'teacher-uuid-001'

      await expect(service.create(CREATE_DTO, GURU_USER)).rejects.toThrow(ForbiddenException);
    });

    it('studentId tidak ada → NotFoundException', async () => {
      setupGuruResolve();
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
      prisma.student.findUnique.mockResolvedValue(null); // siswa tidak ada

      await expect(service.create(CREATE_DTO, GURU_USER)).rejects.toThrow(NotFoundException);
    });

    it('GURU tidak punya profil teacher → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue(null); // tidak ada profil guru

      await expect(service.create(CREATE_DTO, GURU_USER)).rejects.toThrow(ForbiddenException);
    });

    describe('DOBEL GUARD — UTS/UAS', () => {
      it('UTS dobel → ConflictException (409)', async () => {
        setupGuruResolve();
        prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
        prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
        prisma.grade.findFirst.mockResolvedValue({ id: 'existing-grade' }); // sudah ada UTS

        await expect(service.create(CREATE_DTO, GURU_USER)).rejects.toThrow(ConflictException);
        expect(prisma.grade.create).not.toHaveBeenCalled();
      });

      it('UAS dobel → ConflictException (409)', async () => {
        setupGuruResolve();
        prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
        prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
        prisma.grade.findFirst.mockResolvedValue({ id: 'existing-grade' });

        const uasDto = { ...CREATE_DTO, type: 'uas' as const };
        await expect(service.create(uasDto, GURU_USER)).rejects.toThrow(ConflictException);
      });

      it('UH dobel → OK (boleh banyak)', async () => {
        setupGuruResolve();
        prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
        prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
        prisma.grade.create.mockResolvedValue({ ...MOCK_GRADE, type: 'uh' });

        const uhDto = { ...CREATE_DTO, type: 'uh' as const };
        await service.create(uhDto, GURU_USER);

        // findFirst TIDAK dipanggil untuk UH
        expect(prisma.grade.findFirst).not.toHaveBeenCalled();
        expect(prisma.grade.create).toHaveBeenCalledTimes(1);
      });

      it('praktik dobel → OK', async () => {
        setupGuruResolve();
        prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
        prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
        prisma.grade.create.mockResolvedValue({ ...MOCK_GRADE, type: 'praktik' });

        await service.create({ ...CREATE_DTO, type: 'praktik' as const }, GURU_USER);

        expect(prisma.grade.findFirst).not.toHaveBeenCalled();
      });

      it('UTS cek → findFirst dipanggil dengan filter yang benar', async () => {
        setupGuruResolve();
        prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
        prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-001' });
        prisma.grade.findFirst.mockResolvedValue(null);
        prisma.grade.create.mockResolvedValue(MOCK_GRADE);

        await service.create(CREATE_DTO, GURU_USER);

        expect(prisma.grade.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              studentId:    'student-uuid-001',
              assignmentId: 'assign-uuid-001',
              semester:     1,
              type:         'uts',
            },
          }),
        );
      });
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const BASE_QUERY = { page: 1, limit: 20 };

    beforeEach(() => {
      prisma.grade.findMany.mockResolvedValue([MOCK_GRADE]);
      prisma.grade.count.mockResolvedValue(1);
    });

    it('SA melihat semua nilai tanpa filter ownership', async () => {
      const result = await service.findAll(BASE_QUERY, SA_USER);

      expect(result.data).toHaveLength(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GURU hanya melihat nilai dari assignment sendiri', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });

      await service.findAll(BASE_QUERY, GURU_USER);

      const callWhere = prisma.grade.findMany.mock.calls[0][0].where;
      expect(callWhere.assignment).toEqual(
        expect.objectContaining({ teacherId: 'teacher-uuid-001' }),
      );
    });

    it('GURU + classId filter → assignment filter merged', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });

      await service.findAll({ ...BASE_QUERY, classId: 'class-uuid-001' }, GURU_USER);

      const callWhere = prisma.grade.findMany.mock.calls[0][0].where;
      expect(callWhere.assignment).toEqual({
        teacherId: 'teacher-uuid-001',
        classId:   'class-uuid-001',
      });
    });

    it('SISWA hanya melihat nilai sendiri — studentId dari query diabaikan', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-siswa' });
      prisma.student.findUnique.mockResolvedValue({ id: 'student-uuid-self' });

      await service.findAll({ ...BASE_QUERY, studentId: 'other-student' }, SISWA_USER);

      const callWhere = prisma.grade.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toBe('student-uuid-self'); // bukan 'other-student'
    });

    it('ORANG_TUA hanya melihat nilai anak', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([
        { id: 'child-uuid-001' },
        { id: 'child-uuid-002' },
      ]);

      await service.findAll(BASE_QUERY, ORANGTUA_USER);

      const callWhere = prisma.grade.findMany.mock.calls[0][0].where;
      expect(callWhere.studentId).toEqual({ in: ['child-uuid-001', 'child-uuid-002'] });
    });

    it('ORANG_TUA tanpa anak terdaftar → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-ortu' });
      prisma.student.findMany.mockResolvedValue([]); // tidak ada anak

      await expect(service.findAll(BASE_QUERY, ORANGTUA_USER)).rejects.toThrow(ForbiddenException);
    });

    it('filter semester + type diterapkan', async () => {
      await service.findAll({ ...BASE_QUERY, semester: 2, type: 'uts' }, SA_USER);

      const callWhere = prisma.grade.findMany.mock.calls[0][0].where;
      expect(callWhere.semester).toBe(2);
      expect(callWhere.type).toBe('uts');
    });

    it('pagination diterapkan', async () => {
      await service.findAll({ page: 3, limit: 10 }, SA_USER);

      const call = prisma.grade.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20); // (3-1)*10
      expect(call.take).toBe(10);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('SA berhasil edit nilai kapan saja (tidak ada batasan 7 hari)', async () => {
      prisma.grade.findUnique.mockResolvedValue({
        id: 'grade-uuid-001',
        submittedBy: 'some-user-id',
        createdAt: EIGHT_DAYS_AGO, // lebih dari 7 hari, tapi SA tetap bisa
      });
      prisma.grade.update.mockResolvedValue({ ...MOCK_GRADE, score: '90.00' });

      const result = await service.update('grade-uuid-001', { score: 90 }, SA_USER);

      expect(result.score).toBe('90.00');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GURU berhasil edit nilai dalam 7 hari', async () => {
      prisma.grade.findUnique.mockResolvedValue({
        id: 'grade-uuid-001',
        submittedBy: 'user-uuid-guru',
        createdAt: THREE_DAYS_AGO, // dalam 7 hari
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });
      prisma.grade.update.mockResolvedValue({ ...MOCK_GRADE, score: '90.00' });

      const result = await service.update('grade-uuid-001', { score: 90 }, GURU_USER);

      expect(result.score).toBe('90.00');
    });

    it('GURU edit nilai >7 hari → ForbiddenException', async () => {
      prisma.grade.findUnique.mockResolvedValue({
        id: 'grade-uuid-001',
        submittedBy: 'user-uuid-guru',
        createdAt: EIGHT_DAYS_AGO, // sudah > 7 hari
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });

      await expect(
        service.update('grade-uuid-001', { score: 90 }, GURU_USER),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.grade.update).not.toHaveBeenCalled();
    });

    it('GURU edit nilai yang bukan miliknya → ForbiddenException', async () => {
      prisma.grade.findUnique.mockResolvedValue({
        id: 'grade-uuid-001',
        submittedBy: 'other-user-uuid', // bukan guru ini
        createdAt: THREE_DAYS_AGO,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-uuid-guru' });

      await expect(
        service.update('grade-uuid-001', { score: 90 }, GURU_USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('grade tidak ditemukan → NotFoundException', async () => {
      prisma.grade.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { score: 90 }, SA_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('GURU tidak punya profil user → ForbiddenException', async () => {
      prisma.grade.findUnique.mockResolvedValue({
        id: 'grade-uuid-001',
        submittedBy: 'user-uuid-guru',
        createdAt: THREE_DAYS_AGO,
      });
      prisma.user.findUnique.mockResolvedValue(null); // user tidak ada

      await expect(
        service.update('grade-uuid-001', { score: 90 }, GURU_USER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

// ── GradeController tests ─────────────────────────────────────────────────────

describe('GradeController', () => {
  let controller: GradeController;
  let service: jest.Mocked<GradeService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradeController],
      providers: [
        {
          provide: GradeService,
          useValue: {
            create:  jest.fn().mockResolvedValue(MOCK_GRADE),
            findAll: jest.fn().mockResolvedValue({ data: [MOCK_GRADE], total: 1, page: 1, limit: 20 }),
            update:  jest.fn().mockResolvedValue(MOCK_GRADE),
          },
        },
      ],
    }).compile();

    controller = module.get(GradeController);
    service = module.get(GradeService);
    jest.clearAllMocks();
  });

  it('create — delegasi ke service dengan dto + user', async () => {
    const dto = {
      studentId: 'student-uuid-001', assignmentId: 'assign-uuid-001',
      semester: 1, score: 85, type: 'uts' as const,
    };
    await controller.create(dto, GURU_USER);
    expect(service.create).toHaveBeenCalledWith(dto, GURU_USER);
  });

  it('findAll — query valid → delegasi ke service', async () => {
    await controller.findAll({ semester: '1', type: 'uts' }, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ semester: 1, type: 'uts' }),
      SA_USER,
    );
  });

  it('findAll — query tidak valid → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ semester: 'invalid' }, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('update — delegasi ke service dengan id + dto + user', async () => {
    await controller.update('grade-uuid-001', { score: 90 }, GURU_USER);
    expect(service.update).toHaveBeenCalledWith('grade-uuid-001', { score: 90 }, GURU_USER);
  });
});

// ── GradeModule compilation ───────────────────────────────────────────────────

describe('GradeModule', () => {
  it('compiles dengan PrismaService di-override', async () => {
    const module = await Test.createTestingModule({
      imports: [GradeModule],
    })
      .overrideProvider(GradeService)
      .useValue({})
      .compile();

    expect(module).toBeDefined();
    expect(module.get(GradeController)).toBeDefined();
  });
});
