// =============================================================================
// student.spec.ts — Unit tests StudentService + StudentController (SMA-32)
//
// Coverage wajib ≥70%: findAll, findById (ownership), create, update,
// remove (soft delete), findGrades, findAttendance.
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentService } from '../student/student.service';
import { StudentController } from '../student/student.controller';
import { StudentModule } from '../student/student.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SA_USER: AuthUser = {
  keycloakId: 'kc-admin-uuid',
  email: 'admin@smk.sch.id',
  username: 'admin',
  fullName: 'Administrator',
  roles: ['SUPER_ADMIN'],
};

const GURU_USER: AuthUser = {
  keycloakId: 'kc-guru-uuid',
  email: 'guru@smk.sch.id',
  username: 'guru1',
  fullName: 'Agus Setiawan',
  roles: ['GURU'],
};

const SISWA_USER: AuthUser = {
  keycloakId: 'kc-siswa-uuid',
  email: 'siswa@smk.sch.id',
  username: 'siswa1',
  fullName: 'Budi Santoso',
  roles: ['SISWA'],
};

const ORANGTUA_USER: AuthUser = {
  keycloakId: 'kc-ortu-uuid',
  email: 'ortu@smk.sch.id',
  username: 'ortu1',
  fullName: 'Pak Santoso',
  roles: ['ORANG_TUA'],
};

const MOCK_SISWA_DB_USER = { id: 'siswa-db-user-id' };
const MOCK_ORTU_DB_USER = { id: 'ortu-db-user-id' };

const MOCK_STUDENT = {
  id: 'student-uuid-001',
  userId: 'siswa-db-user-id',   // matches MOCK_SISWA_DB_USER.id
  parentId: 'ortu-db-user-id',  // matches MOCK_ORTU_DB_USER.id
  nis: '20250001',
  status: 'active',
  joinedAt: new Date('2025-07-14'),
  classId: 'class-uuid-001',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'siswa-db-user-id', fullName: 'Budi Santoso', email: 'siswa@smk.sch.id', phone: null },
  class: { id: 'class-uuid-001', name: 'X TKJ 1', majorCode: 'TKJ', grade: 10 },
};

// ── Mock PrismaService factory ────────────────────────────────────────────────

function buildPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    grade: {
      findMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
    },
  };
}

// ── StudentService tests ──────────────────────────────────────────────────────

describe('StudentService', () => {
  let service: StudentService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(StudentService);
    jest.clearAllMocks();
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan data + total dengan default pagination', async () => {
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null }, skip: 0, take: 20 }),
      );
    });

    it('filter berdasarkan classId', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.findAll({ classId: 'class-uuid-001', page: 1, limit: 20 });

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, classId: 'class-uuid-001' } }),
      );
    });

    it('filter berdasarkan status', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.findAll({ status: 'active', page: 1, limit: 20 });

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, status: 'active' } }),
      );
    });

    it('filter search (nama/NIS)', async () => {
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);
      prisma.student.count.mockResolvedValue(1);

      await service.findAll({ search: 'Budi', page: 1, limit: 20 });

      const callArg = prisma.student.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeDefined();
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('SA bisa akses student manapun', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);

      const result = await service.findById('student-uuid-001', SA_USER);

      expect(result).toEqual(MOCK_STUDENT);
      expect(prisma.user.findUnique).not.toHaveBeenCalled(); // no ownership check
    });

    it('GURU bisa akses student manapun tanpa ownership check', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);

      const result = await service.findById('student-uuid-001', GURU_USER);

      expect(result).toEqual(MOCK_STUDENT);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('SISWA bisa akses data diri sendiri', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);
      prisma.user.findUnique.mockResolvedValue(MOCK_SISWA_DB_USER); // userId match

      const result = await service.findById('student-uuid-001', SISWA_USER);

      expect(result).toEqual(MOCK_STUDENT);
    });

    it('SISWA tidak bisa akses data siswa lain → ForbiddenException', async () => {
      const otherStudent = { ...MOCK_STUDENT, userId: 'other-user-id' };
      prisma.student.findFirst.mockResolvedValue(otherStudent);
      prisma.user.findUnique.mockResolvedValue(MOCK_SISWA_DB_USER); // userId tidak match

      await expect(service.findById('student-uuid-001', SISWA_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ORANG_TUA bisa akses data anak sendiri', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER); // parentId match

      const result = await service.findById('student-uuid-001', ORANGTUA_USER);

      expect(result).toEqual(MOCK_STUDENT);
    });

    it('ORANG_TUA tidak bisa akses anak orang lain → ForbiddenException', async () => {
      const otherStudent = { ...MOCK_STUDENT, parentId: 'other-parent-id' };
      prisma.student.findFirst.mockResolvedValue(otherStudent);
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER); // parentId tidak match

      await expect(service.findById('student-uuid-001', ORANGTUA_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('student tidak ada / soft-deleted → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.findById('non-existent', SA_USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('membuat student baru dan mengembalikan record', async () => {
      prisma.student.create.mockResolvedValue(MOCK_STUDENT);

      const dto = {
        userId: 'siswa-db-user-id',
        nis: '20250001',
        status: 'active' as const,
        joinedAt: new Date('2025-07-14'),
      };

      const result = await service.create(dto);

      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: dto }),
      );
      expect(result).toEqual(MOCK_STUDENT);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('update berhasil jika student ada', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-uuid-001' });
      const updated = { ...MOCK_STUDENT, status: 'graduated' };
      prisma.student.update.mockResolvedValue(updated);

      const result = await service.update('student-uuid-001', { status: 'graduated' });

      expect(result.status).toBe('graduated');
    });

    it('update gagal jika student tidak ada → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.update('non-existent', { status: 'active' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove (soft delete) ─────────────────────────────────────────────────

  describe('remove — soft delete', () => {
    it('soft delete: set deletedAt, TIDAK menghapus record dari DB', async () => {
      const now = new Date();
      prisma.student.findFirst.mockResolvedValue({ id: 'student-uuid-001' });
      prisma.student.update.mockResolvedValue({
        id: 'student-uuid-001',
        nis: '20250001',
        deletedAt: now,
      });

      const result = await service.remove('student-uuid-001');

      // Verifikasi update dipanggil dengan data: { deletedAt: ... }
      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'student-uuid-001' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      // deletedAt terisi — bukan null
      expect(result.deletedAt).toBeTruthy();
    });

    it('soft delete gagal jika student tidak ada → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    // ── Verifikasi: setelah DELETE, GET endpoint tidak mengembalikan record ──

    it('setelah remove() — findById menggunakan filter {deletedAt: null} → NotFoundException', async () => {
      // Langkah 1: soft delete berhasil
      prisma.student.findFirst
        .mockResolvedValueOnce({ id: 'student-uuid-001' }) // cek existence di remove()
        .mockResolvedValueOnce(null);                       // findById: record ter-filter karena deletedAt set
      prisma.student.update.mockResolvedValue({
        id: 'student-uuid-001',
        nis: '20250001',
        deletedAt: new Date(),
      });
      await service.remove('student-uuid-001');

      // Langkah 2: findById → null (filter deletedAt: null tidak menemukan record)
      await expect(service.findById('student-uuid-001', SA_USER)).rejects.toThrow(
        NotFoundException,
      );

      // Verifikasi filter yang dikirim ke Prisma
      const findByIdCall = prisma.student.findFirst.mock.calls[1][0];
      expect(findByIdCall.where).toMatchObject({ id: 'student-uuid-001', deletedAt: null });
    });

    it('setelah remove() — findAll menggunakan filter {deletedAt: null}, record tidak muncul', async () => {
      // Langkah 1: soft delete
      prisma.student.findFirst.mockResolvedValue({ id: 'student-uuid-001' });
      prisma.student.update.mockResolvedValue({
        id: 'student-uuid-001',
        nis: '20250001',
        deletedAt: new Date(),
      });
      await service.remove('student-uuid-001');

      // Langkah 2: findAll — DB mengembalikan kosong (soft-deleted tidak lolos filter)
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);
      const list = await service.findAll({ page: 1, limit: 20 });

      expect(list.data).toHaveLength(0);
      expect(list.total).toBe(0);

      // Verifikasi filter deletedAt: null ada di query
      const findManyCall = prisma.student.findMany.mock.calls[0][0];
      expect(findManyCall.where).toMatchObject({ deletedAt: null });
    });
  });

  // ── findGrades ───────────────────────────────────────────────────────────

  describe('findGrades', () => {
    const STUDENT_SLIM = {
      id: 'student-uuid-001',
      userId: 'siswa-db-user-id',
      parentId: 'ortu-db-user-id',
    };

    it('SA bisa akses grades siswa manapun', async () => {
      prisma.student.findFirst.mockResolvedValue(STUDENT_SLIM);
      prisma.grade.findMany.mockResolvedValue([]);

      await service.findGrades('student-uuid-001', SA_USER);

      expect(prisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: 'student-uuid-001' } }),
      );
    });

    it('SISWA bisa akses grades diri sendiri', async () => {
      prisma.student.findFirst.mockResolvedValue(STUDENT_SLIM);
      prisma.user.findUnique.mockResolvedValue(MOCK_SISWA_DB_USER);
      prisma.grade.findMany.mockResolvedValue([]);

      await service.findGrades('student-uuid-001', SISWA_USER);

      expect(prisma.grade.findMany).toHaveBeenCalled();
    });

    it('SISWA tidak bisa akses grades siswa lain → ForbiddenException', async () => {
      prisma.student.findFirst.mockResolvedValue({ ...STUDENT_SLIM, userId: 'other-id' });
      prisma.user.findUnique.mockResolvedValue(MOCK_SISWA_DB_USER);

      await expect(service.findGrades('student-uuid-001', SISWA_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('student tidak ditemukan → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.findGrades('non-existent', SA_USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findAttendance ───────────────────────────────────────────────────────

  describe('findAttendance', () => {
    const STUDENT_SLIM = {
      id: 'student-uuid-001',
      userId: 'siswa-db-user-id',
      parentId: 'ortu-db-user-id',
    };

    it('SA bisa akses attendance siswa manapun', async () => {
      prisma.student.findFirst.mockResolvedValue(STUDENT_SLIM);
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.findAttendance('student-uuid-001', SA_USER);

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: 'student-uuid-001' } }),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('ORANG_TUA bisa akses attendance anak sendiri', async () => {
      prisma.student.findFirst.mockResolvedValue(STUDENT_SLIM);
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER);
      prisma.attendance.findMany.mockResolvedValue([]);

      await service.findAttendance('student-uuid-001', ORANGTUA_USER);

      expect(prisma.attendance.findMany).toHaveBeenCalled();
    });

    it('ORANG_TUA tidak bisa akses attendance anak orang lain → ForbiddenException', async () => {
      prisma.student.findFirst.mockResolvedValue({ ...STUDENT_SLIM, parentId: 'other-parent' });
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER);

      await expect(
        service.findAttendance('student-uuid-001', ORANGTUA_USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('student tidak ditemukan untuk attendance → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.findAttendance('non-existent', SA_USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── resolveAuthUserId gagal ───────────────────────────────────────────────

  describe('ownership check — user tidak ditemukan di DB', () => {
    it('SISWA dengan keycloakId tidak ada di DB → ForbiddenException', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);
      prisma.user.findUnique.mockResolvedValue(null); // user tidak ada di DB

      await expect(service.findById('student-uuid-001', SISWA_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

// ── StudentController tests ───────────────────────────────────────────────────

describe('StudentController', () => {
  let controller: StudentController;
  let service: jest.Mocked<StudentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentController],
      providers: [
        {
          provide: StudentService,
          useValue: {
            findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
            findById: jest.fn().mockResolvedValue(MOCK_STUDENT),
            create: jest.fn().mockResolvedValue(MOCK_STUDENT),
            update: jest.fn().mockResolvedValue(MOCK_STUDENT),
            remove: jest.fn().mockResolvedValue({ id: 'x', nis: '001', deletedAt: new Date() }),
            findGrades: jest.fn().mockResolvedValue([]),
            findAttendance: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get(StudentController);
    service = module.get(StudentService);
    jest.clearAllMocks();
  });

  it('findAll — delegasi ke service dengan query yang sudah di-parse', async () => {
    await controller.findAll({ page: '1', limit: '10' } as unknown, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('findAll — status tidak valid → BadRequestException (400)', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ status: 'bukan-status-valid' } as unknown, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('findById — meneruskan user ke service untuk ownership check', async () => {
    await controller.findById('student-uuid-001', SISWA_USER);
    expect(service.findById).toHaveBeenCalledWith('student-uuid-001', SISWA_USER);
  });

  it('create — meneruskan DTO ke service', async () => {
    const dto = {
      userId: 'uid',
      nis: '20250001',
      status: 'active' as const,
      joinedAt: new Date(),
    };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('remove — soft delete response mengandung deletedAt', async () => {
    const result = await controller.remove('student-uuid-001');
    expect(result).toHaveProperty('deletedAt');
    expect(result.deletedAt).toBeTruthy();
  });

  it('update — meneruskan id + DTO ke service', async () => {
    await controller.update('student-uuid-001', { status: 'graduated' });
    expect(service.update).toHaveBeenCalledWith('student-uuid-001', { status: 'graduated' });
  });

  it('findGrades — meneruskan id + user ke service', async () => {
    await controller.findGrades('student-uuid-001', SISWA_USER);
    expect(service.findGrades).toHaveBeenCalledWith('student-uuid-001', SISWA_USER);
  });

  it('findAttendance — meneruskan id + user ke service', async () => {
    await controller.findAttendance('student-uuid-001', ORANGTUA_USER);
    expect(service.findAttendance).toHaveBeenCalledWith('student-uuid-001', ORANGTUA_USER);
  });
});

// ── StudentModule compilation test ───────────────────────────────────────────

describe('StudentModule', () => {
  it('compiles — student.module.ts @Module decorator terkover', async () => {
    // Override StudentService agar PrismaService tidak dibutuhkan di scope ini
    const module = await Test.createTestingModule({
      imports: [StudentModule],
    })
      .overrideProvider(StudentService)
      .useValue({ findAll: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), findGrades: jest.fn(), findAttendance: jest.fn() })
      .compile();

    expect(module).toBeDefined();
    expect(module.get(StudentController)).toBeDefined();
  });
});
