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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentService } from '../student/student.service';
import { StudentController } from '../student/student.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisioningService } from '../provisioning/provisioning.service';
import { CreateStudentSchema } from '../student/dto/create-student.dto';
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
      update: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    teacher: {
      findUnique: jest.fn(),
    },
    teachingAssignment: {
      findMany: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
    grade: {
      findMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ProvisioningService, useValue: { provisionOrtu: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentService);
    jest.clearAllMocks();
    prisma.class.findMany.mockResolvedValue([]);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan data + total dengan default pagination', async () => {
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, SA_USER);

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

      await service.findAll({ classId: 'class-uuid-001', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, SA_USER);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, classId: 'class-uuid-001' } }),
      );
    });

    it('filter berdasarkan status', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.findAll({ status: 'active', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, SA_USER);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, status: 'active' } }),
      );
    });

    it('filter search (nama/NIS)', async () => {
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);
      prisma.student.count.mockResolvedValue(1);

      await service.findAll({ search: 'Budi', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, SA_USER);

      const callArg = prisma.student.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeDefined();
    });

    it('sort by nis asc → orderBy { nis: asc }', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);
      await service.findAll({ page: 1, limit: 20, sortBy: 'nis', sortOrder: 'asc' }, SA_USER);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { nis: 'asc' } }),
      );
    });

    it('sort by fullName → orderBy via relasi user', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);
      await service.findAll({ page: 1, limit: 20, sortBy: 'fullName', sortOrder: 'desc' }, SA_USER);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { user: { fullName: 'desc' } } }),
      );
    });

    it('GURU list dibatasi ke kelas assignment dan wali', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'guru-db-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ classId: 'class-uuid-001' }]);
      prisma.class.findMany.mockResolvedValue([{ id: 'class-uuid-WALI' }]);
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);
      prisma.student.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, GURU_USER);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classId: { in: ['class-uuid-001', 'class-uuid-WALI'] },
          }),
        }),
      );
    });

    it('GURU wali-only boleh list kelas walinya tanpa teaching assignment', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'guru-db-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([{ id: 'class-uuid-WALI' }]);
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.findAll({ classId: 'class-uuid-WALI', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, GURU_USER);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classId: 'class-uuid-WALI' }),
        }),
      );
    });

    it('GURU list dengan classId di luar scope fail closed', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'guru-db-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ classId: 'class-uuid-001' }]);
      prisma.class.findMany.mockResolvedValue([{ id: 'class-uuid-WALI' }]);

      await expect(
        service.findAll({ classId: 'class-uuid-OTHER', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, GURU_USER),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
      expect(prisma.student.count).not.toHaveBeenCalled();
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

    it('GURU hanya bisa akses student di kelas yang diampu', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);
      prisma.user.findUnique.mockResolvedValue({ id: 'guru-db-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ classId: 'class-uuid-001' }]);

      const result = await service.findById('student-uuid-001', GURU_USER);

      expect(result).toEqual(MOCK_STUDENT);
    });

    it('GURU tidak bisa akses student di luar kelas yang diampu', async () => {
      prisma.student.findFirst.mockResolvedValue(MOCK_STUDENT);
      prisma.user.findUnique.mockResolvedValue({ id: 'guru-db-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([{ classId: 'class-uuid-OTHER' }]);

      await expect(service.findById('student-uuid-001', GURU_USER)).rejects.toThrow(
        ForbiddenException,
      );
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

  // ── findMyChildren (W1-1) ──────────────────────────────────────────────────

  describe('findMyChildren', () => {
    it('ORANG_TUA → daftar anak dengan parentId match', async () => {
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER);
      prisma.student.findMany.mockResolvedValue([MOCK_STUDENT]);

      const result = await service.findMyChildren(ORANGTUA_USER);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(MOCK_STUDENT);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parentId: 'ortu-db-user-id', deletedAt: null },
          orderBy: { joinedAt: 'asc' },
        }),
      );
    });

    it('ORANG_TUA tanpa anak → array kosong', async () => {
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER);
      prisma.student.findMany.mockResolvedValue([]);

      const result = await service.findMyChildren(ORANGTUA_USER);

      expect(result.data).toHaveLength(0);
    });

    it('resolveUserId via shared helper (user.findUnique dipanggil dengan keycloakId)', async () => {
      prisma.user.findUnique.mockResolvedValue(MOCK_ORTU_DB_USER);
      prisma.student.findMany.mockResolvedValue([]);

      await service.findMyChildren(ORANGTUA_USER);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { keycloakId: 'kc-ortu-uuid' } }),
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
        parentId: 'parent-db-user-id',
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
      const list = await service.findAll({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }, SA_USER);

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

  // ── 2J-3: update — reject parentId null bila ortu sudah ada ────────────────

  describe('update — 2J-3 guard parentId null', () => {
    it('parentId: null dengan ortu sudah ada → BadRequestException', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-uuid-001',
        status: 'active',
        parentId: 'ortu-db-user-id',
      });

      await expect(
        service.update('student-uuid-001', { parentId: null }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('parentId: null dengan ortu belum ada → boleh (update berhasil)', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-uuid-001',
        status: 'active',
        parentId: null,
      });
      prisma.student.update.mockResolvedValue(MOCK_STUDENT);

      const result = await service.update('student-uuid-001', { parentId: null });

      expect(prisma.student.update).toHaveBeenCalled();
      expect(result).toEqual(MOCK_STUDENT);
    });
  });

  // ── 2J-3: findWithoutParent ───────────────────────────────────────────────

  describe('findWithoutParent', () => {
    it('mengembalikan siswa tanpa parentId dengan pagination', async () => {
      const ORPHAN = { ...MOCK_STUDENT, parentId: null };
      prisma.student.findMany.mockResolvedValue([ORPHAN]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.findWithoutParent({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { parentId: null, deletedAt: null } }),
      );
    });

    it('halaman 2 menggunakan skip yang benar', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.findWithoutParent({ page: 2, limit: 10 });

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ── 2J-3: assignParent ────────────────────────────────────────────────────

  describe('assignParent', () => {
    const PROVISIONING_MOCK = {
      provisionOrtu: jest.fn(),
    };
    const ACTOR = { keycloakId: 'kc-tu', roles: ['TATA_USAHA'] as const };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('student sudah punya ortu → BadRequestException', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-uuid-001',
        userId: 'siswa-db-user-id',
        parentId: 'existing-parent',
        nis: '12345',
      });

      const svcWithProv = new (await import('../student/student.service')).StudentService(
        prisma as unknown as import('../prisma/prisma.service').PrismaService,
        { emit: jest.fn() } as unknown as EventEmitter2,
        PROVISIONING_MOCK as unknown as ProvisioningService,
      );

      await expect(
        svcWithProv.assignParent('student-uuid-001', {
          ortu: { name: 'Ortu', phone: '+6281234567890' },
          consent: true,
        }, ACTOR as unknown as import('../provisioning/provisioning.service').Actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('student tidak ditemukan → NotFoundException', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      const svcWithProv = new (await import('../student/student.service')).StudentService(
        prisma as unknown as import('../prisma/prisma.service').PrismaService,
        { emit: jest.fn() } as unknown as EventEmitter2,
        PROVISIONING_MOCK as unknown as ProvisioningService,
      );

      await expect(
        svcWithProv.assignParent('non-existent', {
          ortu: { name: 'Ortu', phone: '+6281234567890' },
          consent: true,
        }, ACTOR as unknown as import('../provisioning/provisioning.service').Actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('sukses: ortu baru dibuat, student diperbarui, consent_at dicatat', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 'student-uuid-001',
        userId: 'siswa-db-user-id',
        parentId: null,
        nis: '12345',
      });
      PROVISIONING_MOCK.provisionOrtu.mockResolvedValue({
        userId: 'new-ortu-id',
        keycloakId: 'kc-ortu-new',
        isNew: true,
        tempCredentials: [{ username: '+6281234567890', tempPassword: 'Abc123' }],
      });
      prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        prisma.user.update.mockResolvedValue({});
        prisma.student.update.mockResolvedValue({ ...MOCK_STUDENT, parentId: 'new-ortu-id' });
        return cb(prisma);
      });

      const svcWithProv = new (await import('../student/student.service')).StudentService(
        prisma as unknown as import('../prisma/prisma.service').PrismaService,
        { emit: jest.fn() } as unknown as EventEmitter2,
        PROVISIONING_MOCK as unknown as ProvisioningService,
      );

      const result = await svcWithProv.assignParent('student-uuid-001', {
        ortu: { name: 'Ortu Baru', phone: '+6281234567890' },
        consent: true,
      }, ACTOR as unknown as import('../provisioning/provisioning.service').Actor);

      expect(result.ortu.isNew).toBe(true);
      expect(result.tempCredentials).toHaveLength(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consentAt: expect.any(Date) }) }),
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
            findWithoutParent: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
            assignParent: jest.fn().mockResolvedValue({ student: MOCK_STUDENT, ortu: {}, tempCredentials: [] }),
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
    expect(service.findAll).toHaveBeenCalledWith(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      SA_USER,
    );
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
      parentId: 'parent-uid',
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

  it('findWithoutParent — delegasi ke service dengan pagination', async () => {
    await controller.findWithoutParent({ page: '1', limit: '10' } as unknown);
    expect(service.findWithoutParent).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('findWithoutParent — query tidak valid → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findWithoutParent({ page: 'tidak-valid' } as unknown);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('assignParent — delegasi ke service dengan actor dari CurrentUser', async () => {
    const dto = { ortu: { name: 'Ortu', phone: '+6281234567890' }, consent: true as const };
    await controller.assignParent('student-uuid-001', dto, SA_USER);
    expect(service.assignParent).toHaveBeenCalledWith(
      'student-uuid-001',
      dto,
      { keycloakId: SA_USER.keycloakId, roles: SA_USER.roles },
    );
  });
});

// ── 2J-3: CreateStudentSchema validation ─────────────────────────────────────

describe('CreateStudentSchema — 2J-3 parentId wajib', () => {
  it('tanpa parentId → invalid (Zod reject)', () => {
    const result = CreateStudentSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000001',
      nis: '20250001',
      joinedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('dengan parentId valid → valid (Zod parse sukses)', () => {
    const result = CreateStudentSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000001',
      nis: '20250001',
      parentId: '00000000-0000-0000-0000-000000000002',
      joinedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

// ── StudentModule compilation test ───────────────────────────────────────────

describe('StudentModule', () => {
  it('compiles — StudentController dapat di-resolve dengan mock providers', async () => {
    const prisma = buildPrisma();
    const module = await Test.createTestingModule({
      controllers: [StudentController],
      providers: [
        { provide: StudentService, useValue: { findAll: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), findGrades: jest.fn(), findAttendance: jest.fn(), findWithoutParent: jest.fn(), assignParent: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: ProvisioningService, useValue: { provisionOrtu: jest.fn() } },
      ],
    }).compile();

    expect(module).toBeDefined();
    expect(module.get(StudentController)).toBeDefined();
  });
});
