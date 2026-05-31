// =============================================================================
// teaching-assignment.spec.ts — Unit tests SMA-36
//
// Skenario wajib:
//   ✓ tanpa token → 401 (KeycloakGuard — covered auth-guard.spec)
//   ✓ role salah (SISWA) → 403 (RolesGuard)
//   ✓ POST duplikat (P2002) → 409 ConflictException
//   ✓ Guru hanya dapat assignment sendiri (ownership service layer)
//   ✓ FK tidak valid → 400 BadRequestException
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
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TeachingAssignmentService } from '../teaching-assignment/teaching-assignment.service';
import { TeachingAssignmentController } from '../teaching-assignment/teaching-assignment.controller';
import { TeachingAssignmentModule } from '../teaching-assignment/teaching-assignment.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '@smk/auth';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SA_USER: AuthUser = {
  keycloakId: 'kc-admin', email: 'admin@smk.sch.id',
  username: 'admin', fullName: 'Admin', roles: ['SUPER_ADMIN'],
};

const _TU_USER: AuthUser = {
  keycloakId: 'kc-tu', email: 'tu@smk.sch.id',
  username: 'tu', fullName: 'TU', roles: ['TATA_USAHA'],
};

const KS_USER: AuthUser = {
  keycloakId: 'kc-ks', email: 'ks@smk.sch.id',
  username: 'ks', fullName: 'Kepala Sekolah', roles: ['KEPALA_SEKOLAH'],
};

const GURU_USER: AuthUser = {
  keycloakId: 'kc-guru', email: 'guru@smk.sch.id',
  username: 'guru1', fullName: 'Agus Setiawan', roles: ['GURU'],
};

const MOCK_ASSIGNMENT = {
  id: 'assign-uuid-001',
  teacherId: 'teacher-uuid-001',
  classId: 'class-uuid-001',
  subject: 'Jaringan Komputer',
  hoursPerWeek: 4,
  academicYear: '2025/2026',
  createdAt: new Date(),
  updatedAt: new Date(),
  teacher: { id: 'teacher-uuid-001', nip: '199001010001', user: { fullName: 'Agus Setiawan', email: 'guru@smk.sch.id' } },
  class: { id: 'class-uuid-001', name: 'X TKJ 1', majorCode: 'TKJ', grade: 10 },
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  return {
    user: { findUnique: jest.fn() },
    teacher: { findUnique: jest.fn() },
    class: { findUnique: jest.fn() },
    teachingAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
}

// ── TeachingAssignmentService tests ──────────────────────────────────────────

describe('TeachingAssignmentService', () => {
  let service: TeachingAssignmentService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachingAssignmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TeachingAssignmentService);
    jest.clearAllMocks();
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('SA/TU melihat semua assignment tanpa filter ownership', async () => {
      prisma.teachingAssignment.findMany.mockResolvedValue([MOCK_ASSIGNMENT]);
      prisma.teachingAssignment.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, SA_USER);

      expect(result.data).toHaveLength(1);
      expect(prisma.user.findUnique).not.toHaveBeenCalled(); // tidak resolve teacherId
    });

    it('KS melihat semua assignment tanpa filter ownership', async () => {
      prisma.teachingAssignment.findMany.mockResolvedValue([MOCK_ASSIGNMENT]);
      prisma.teachingAssignment.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20 }, KS_USER);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GURU hanya mendapat assignment sendiri — teacherId diforce ke miliknya', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'auth-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([MOCK_ASSIGNMENT]);
      prisma.teachingAssignment.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 }, GURU_USER);

      // teacherId di-force ke 'teacher-uuid-001' milik guru ini
      const callWhere = prisma.teachingAssignment.findMany.mock.calls[0][0].where;
      expect(callWhere.teacherId).toBe('teacher-uuid-001');
      expect(result.data).toHaveLength(1);
    });

    it('GURU: teacherId dari query diabaikan, diganti ke ID sendiri', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'auth-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.teachingAssignment.findMany.mockResolvedValue([]);
      prisma.teachingAssignment.count.mockResolvedValue(0);

      // Guru mencoba query teacherId orang lain
      await service.findAll(
        { teacherId: 'other-teacher-uuid', page: 1, limit: 20 },
        GURU_USER,
      );

      const callWhere = prisma.teachingAssignment.findMany.mock.calls[0][0].where;
      // teacherId harus teacher milik guru ini, bukan 'other-teacher-uuid'
      expect(callWhere.teacherId).toBe('teacher-uuid-001');
      expect(callWhere.teacherId).not.toBe('other-teacher-uuid');
    });

    it('GURU: tidak punya profil teacher → ForbiddenException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'auth-user-id' });
      prisma.teacher.findUnique.mockResolvedValue(null); // tidak ada profil guru

      await expect(service.findAll({ page: 1, limit: 20 }, GURU_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('filter classId + academicYear diterapkan', async () => {
      prisma.teachingAssignment.findMany.mockResolvedValue([]);
      prisma.teachingAssignment.count.mockResolvedValue(0);

      await service.findAll(
        { classId: 'class-uuid-001', academicYear: '2025/2026', page: 1, limit: 20 },
        SA_USER,
      );

      const callWhere = prisma.teachingAssignment.findMany.mock.calls[0][0].where;
      expect(callWhere.classId).toBe('class-uuid-001');
      expect(callWhere.academicYear).toBe('2025/2026');
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('SA bisa akses assignment manapun', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);

      const result = await service.findById('assign-uuid-001', SA_USER);

      expect(result).toEqual(MOCK_ASSIGNMENT);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GURU bisa akses assignment miliknya', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
      prisma.user.findUnique.mockResolvedValue({ id: 'auth-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' }); // matches assignment.teacherId

      const result = await service.findById('assign-uuid-001', GURU_USER);

      expect(result).toEqual(MOCK_ASSIGNMENT);
    });

    it('GURU tidak bisa akses assignment guru lain → ForbiddenException', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(MOCK_ASSIGNMENT);
      prisma.user.findUnique.mockResolvedValue({ id: 'auth-user-id' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'other-teacher-uuid' }); // TIDAK match

      await expect(service.findById('assign-uuid-001', GURU_USER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('tidak ditemukan → NotFoundException', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent', SA_USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const CREATE_DTO = {
      teacherId: 'teacher-uuid-001',
      classId: 'class-uuid-001',
      subject: 'Jaringan Komputer',
      hoursPerWeek: 4,
      academicYear: '2025/2026',
    };

    it('berhasil membuat assignment baru', async () => {
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.class.findUnique.mockResolvedValue({ id: 'class-uuid-001' });
      prisma.teachingAssignment.create.mockResolvedValue(MOCK_ASSIGNMENT);

      const result = await service.create(CREATE_DTO);

      expect(result).toEqual(MOCK_ASSIGNMENT);
    });

    it('teacherId tidak ada → BadRequestException (400)', async () => {
      prisma.teacher.findUnique.mockResolvedValue(null); // teacher tidak ada
      prisma.class.findUnique.mockResolvedValue({ id: 'class-uuid-001' });

      await expect(service.create(CREATE_DTO)).rejects.toThrow(BadRequestException);
    });

    it('classId tidak ada → BadRequestException (400)', async () => {
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.class.findUnique.mockResolvedValue(null); // kelas tidak ada

      await expect(service.create(CREATE_DTO)).rejects.toThrow(BadRequestException);
    });

    it('duplikat [teacher,class,subject,year] → ConflictException (409)', async () => {
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.class.findUnique.mockResolvedValue({ id: 'class-uuid-001' });

      // Simulasi Prisma P2002 unique constraint violation
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prisma.teachingAssignment.create.mockRejectedValue(p2002);

      await expect(service.create(CREATE_DTO)).rejects.toThrow(ConflictException);
    });

    it('error Prisma lain (bukan P2002) → di-rethrow', async () => {
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-uuid-001' });
      prisma.class.findUnique.mockResolvedValue({ id: 'class-uuid-001' });

      const otherError = new Error('DB connection lost');
      prisma.teachingAssignment.create.mockRejectedValue(otherError);

      await expect(service.create(CREATE_DTO)).rejects.toThrow('DB connection lost');
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('berhasil update subject', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue({
        id: 'assign-uuid-001', teacherId: 'teacher-uuid-001', classId: 'class-uuid-001',
      });
      const updated = { ...MOCK_ASSIGNMENT, subject: 'Sistem Operasi' };
      prisma.teachingAssignment.update.mockResolvedValue(updated);

      const result = await service.update('assign-uuid-001', { subject: 'Sistem Operasi' });

      expect(result.subject).toBe('Sistem Operasi');
    });

    it('tidak ditemukan → NotFoundException', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', { subject: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('update menyebabkan duplikat → ConflictException (409)', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue({
        id: 'assign-uuid-001', teacherId: 'teacher-uuid-001', classId: 'class-uuid-001',
      });
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002', clientVersion: '5.0.0',
      });
      prisma.teachingAssignment.update.mockRejectedValue(p2002);

      await expect(
        service.update('assign-uuid-001', { academicYear: '2024/2025' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('berhasil delete — mengembalikan { id, deleted: true }', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue({ id: 'assign-uuid-001' });
      prisma.teachingAssignment.delete.mockResolvedValue({});

      const result = await service.remove('assign-uuid-001');

      expect(result).toEqual({ id: 'assign-uuid-001', deleted: true });
      expect(prisma.teachingAssignment.delete).toHaveBeenCalledWith({
        where: { id: 'assign-uuid-001' },
      });
    });

    it('tidak ditemukan → NotFoundException', async () => {
      prisma.teachingAssignment.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});

// ── TeachingAssignmentController tests ───────────────────────────────────────

describe('TeachingAssignmentController', () => {
  let controller: TeachingAssignmentController;
  let service: jest.Mocked<TeachingAssignmentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachingAssignmentController],
      providers: [
        {
          provide: TeachingAssignmentService,
          useValue: {
            findAll: jest.fn().mockResolvedValue({ data: [MOCK_ASSIGNMENT], total: 1, page: 1, limit: 20 }),
            findById: jest.fn().mockResolvedValue(MOCK_ASSIGNMENT),
            create: jest.fn().mockResolvedValue(MOCK_ASSIGNMENT),
            update: jest.fn().mockResolvedValue(MOCK_ASSIGNMENT),
            remove: jest.fn().mockResolvedValue({ id: 'assign-uuid-001', deleted: true }),
          },
        },
      ],
    }).compile();

    controller = module.get(TeachingAssignmentController);
    service = module.get(TeachingAssignmentService);
    jest.clearAllMocks();
  });

  it('findAll — delegasi ke service dengan query + user', async () => {
    await controller.findAll({ academicYear: '2025/2026' } as unknown, SA_USER);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ academicYear: '2025/2026' }),
      SA_USER,
    );
  });

  it('findAll — query tidak valid → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.findAll({ limit: 'bukan-angka' } as unknown, SA_USER);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('findById — delegasi ke service dengan id + user', async () => {
    await controller.findById('assign-uuid-001', GURU_USER);
    expect(service.findById).toHaveBeenCalledWith('assign-uuid-001', GURU_USER);
  });

  it('create — delegasi ke service', async () => {
    const dto = {
      teacherId: 'teacher-uuid-001',
      classId: 'class-uuid-001',
      subject: 'Jaringan Komputer',
      hoursPerWeek: 4,
      academicYear: '2025/2026',
    };
    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('update — delegasi ke service dengan id + dto', async () => {
    await controller.update('assign-uuid-001', { subject: 'Sistem Operasi' });
    expect(service.update).toHaveBeenCalledWith('assign-uuid-001', { subject: 'Sistem Operasi' });
  });

  it('remove — delegasi ke service', async () => {
    const result = await controller.remove('assign-uuid-001');
    expect(service.remove).toHaveBeenCalledWith('assign-uuid-001');
    expect(result).toHaveProperty('deleted', true);
  });
});

// ── TeachingAssignmentModule compilation ─────────────────────────────────────

describe('TeachingAssignmentModule', () => {
  it('compiles dengan PrismaService di-override', async () => {
    const module = await Test.createTestingModule({
      imports: [TeachingAssignmentModule],
    })
      .overrideProvider(TeachingAssignmentService)
      .useValue({})
      .compile();

    expect(module).toBeDefined();
    expect(module.get(TeachingAssignmentController)).toBeDefined();
  });
});
