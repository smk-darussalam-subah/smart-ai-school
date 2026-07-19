// =============================================================================
// provisioning.spec.ts — Unit tests ProvisioningService
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

jest.mock('../common/helpers/phone', () => {
  const { BadRequestException } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common');
  return {
    ...jest.requireActual('../common/helpers/phone'),
    normalizeOrThrow: jest.fn((raw: string) => {
      if (raw === '081234567890' || raw === '+6281234567890') return '+6281234567890';
      if (raw === '089876543210' || raw === '+6289876543210') return '+6289876543210';
      if (/^\+62\d{8,13}$/.test(raw)) return raw;
      throw new BadRequestException('Invalid phone');
    }),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ProvisioningService, Actor } from '../provisioning/provisioning.service';
import { ProvisionStudentSchema, ProvisionStudentsBulkSchema, ProvisionUserSchema } from '../provisioning/dto/provision.dto';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserStatusService } from '../auth/user-status.service';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';

const SA_ACTOR: Actor = { keycloakId: 'kc-sa', roles: ['SUPER_ADMIN'] as UserRole[] };
const TU_ACTOR: Actor = { keycloakId: 'kc-tu', roles: ['TATA_USAHA'] as UserRole[] };
const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const PPDB_LEAD_ID = '22222222-2222-4222-8222-222222222222';

function mockKc() {
  return {
    createUser: jest.fn(),
    assignRealmRole: jest.fn(),
    removeRealmRole: jest.fn(),
    setTempPassword: jest.fn(),
    setEnabled: jest.fn(),
    findByUsername: jest.fn(),
    findByEmail: jest.fn(),
    getUserRealmRoles: jest.fn(),
    deleteUser: jest.fn(),
  };
}

interface PrismaMock {
  user: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  student: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  teacher: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  staff: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  ppdbLead: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

function mockPrisma(): PrismaMock {
  const tx: PrismaMock = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    student: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    teacher: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    staff: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    ppdbLead: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  tx.$transaction.mockImplementation((cb: (t: PrismaMock) => Promise<unknown>) => cb(tx));
  return tx;
}

async function buildService(kcMock: ReturnType<typeof mockKc>, prismaMock: ReturnType<typeof mockPrisma>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ProvisioningService,
      { provide: KeycloakAdminService, useValue: kcMock },
      { provide: PrismaService, useValue: prismaMock },
      { provide: PermissionsService, useValue: { invalidateUser: jest.fn(), invalidateAll: jest.fn() } },
      { provide: UserStatusService, useValue: { invalidate: jest.fn(), invalidateAll: jest.fn() } },
    ],
  }).compile();
  return module.get(ProvisioningService);
}

describe('ProvisioningService', () => {
  // ── provisionUser ──────────────────────────────────────────────────────────

  describe('provisionUser', () => {
    it('guru sukses → urutan KC(create→role→pw)→DB benar', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-guru-1');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u-guru-1',
        keycloakId: 'kc-guru-1',
        email: 'guru@smk.sch.id',
        fullName: 'Guru Baru',
        role: 'GURU',
      });

      const svc = await buildService(kc, prisma);

      const result = await svc.provisionUser({
        role: 'GURU',
        fullName: 'Guru Baru',
        gender: 'L',
        email: 'guru@smk.sch.id',
        niy: 'Y0500',
        employmentStatus: 'GTY',
      }, SA_ACTOR);

      expect(kc.createUser).toHaveBeenCalled();
      expect(kc.assignRealmRole).toHaveBeenCalledWith('kc-guru-1', 'GURU');
      expect(kc.setTempPassword).toHaveBeenCalled();

      // Guru → baris staff (identitas) + teacher (mengajar) dibuat.
      expect(prisma.staff.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ niy: 'Y0500', employmentStatus: 'GTY' }) }),
      );
      expect(prisma.teacher.create).toHaveBeenCalled();

      expect(result.tempCredentials).toHaveLength(1);
      expect(result.tempCredentials[0]!.tempPassword).toBeDefined();
    });

    it('TU provision SUPER_ADMIN → 403', async () => {
      const kc = mockKc();
      const prisma = mockPrisma();
      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionUser({
          role: 'SUPER_ADMIN',
          fullName: 'Admin Baru',
          gender: 'L',
          email: 'sa@smk.sch.id',
        }, TU_ACTOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TU provision GURU → sukses', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-g-2');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'ug2', keycloakId: 'kc-g-2', email: 'g@smk.sch.id', fullName: 'G', role: 'GURU',
      });

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionUser({
          role: 'GURU',
          fullName: 'G',
          gender: 'L',
          email: 'g@smk.sch.id',
          niy: 'Y0501',
          employmentStatus: 'GTT',
        }, TU_ACTOR),
      ).resolves.toBeDefined();
    });

    it('DB gagal → deleteUser KC untuk user BARU saja', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-db-fail');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);
      kc.deleteUser.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('DB connection lost'));

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionUser({
          role: 'GURU',
          fullName: 'Test',
          gender: 'L',
          email: 't@smk.sch.id',
          niy: 'Y0502',
          employmentStatus: 'GTY',
        }, SA_ACTOR),
      ).rejects.toThrow('DB connection lost');

      expect(kc.deleteUser).toHaveBeenCalledWith('kc-db-fail');
    });

    it('NIY duplikat → 409 pre-flight (KC tidak dipanggil)', async () => {
      const kc = mockKc();
      kc.findByUsername.mockResolvedValue(null);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.staff.findUnique.mockResolvedValue({ id: 'existing-staff' });

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionUser({
          role: 'GURU',
          fullName: 'Dup',
          gender: 'L',
          email: 'dup@smk.sch.id',
          niy: 'Y0001',
          employmentStatus: 'GTY',
        }, SA_ACTOR),
      ).rejects.toThrow(ConflictException);

      expect(kc.createUser).not.toHaveBeenCalled();
    });

    it('TU sukses → baris staff dibuat, TANPA teacher', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-tu-1');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u-tu-1', keycloakId: 'kc-tu-1', email: 'tu@smk.sch.id', fullName: 'TU Baru', role: 'TATA_USAHA',
      });

      const svc = await buildService(kc, prisma);

      await svc.provisionUser({
        role: 'TATA_USAHA',
        fullName: 'TU Baru',
        gender: 'P',
        email: 'tu@smk.sch.id',
        niy: 'Y0700',
        employmentStatus: 'PTY',
      }, SA_ACTOR);

      expect(prisma.staff.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ niy: 'Y0700', employmentStatus: 'PTY' }) }),
      );
      expect(prisma.teacher.create).not.toHaveBeenCalled();
    });

    it('SISWA via /provision/users → 400 (Zod refine)', async () => {
      const kc = mockKc();
      const prisma = mockPrisma();
      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionUser({
          role: 'SISWA',
          fullName: 'Siswa',
          email: 's@smk.sch.id',
        } as never, SA_ACTOR),
      ).rejects.toThrow();
    });

    it('email sintetis ortu tanpa email', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-ortu-1');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'uo1', keycloakId: 'kc-ortu-1', email: '6281234567890@ortu.smkdarussalamsubah.sch.id', fullName: 'Ortu', role: 'ORANG_TUA',
      });

      const svc = await buildService(kc, prisma);

      const result = await svc.provisionUser({
        role: 'ORANG_TUA',
        fullName: 'Ortu',
        gender: 'P',
        phone: '+6281234567890',
      }, SA_ACTOR);

      expect(kc.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: expect.stringContaining('@ortu.smkdarussalamsubah.sch.id'),
      }));
      // Username ortu = phone E.164; tempPassword sekali-tampil 12 char
      expect(result.tempCredentials).toEqual([
        expect.objectContaining({ username: '+6281234567890' }),
      ]);
      expect(result.tempCredentials[0]!.tempPassword).toHaveLength(12);
      expect(result.tempCredentials[0]!.tempPassword).toMatch(/[A-Z]/);
      expect(result.tempCredentials[0]!.tempPassword).toMatch(/[a-z]/);
      expect(result.tempCredentials[0]!.tempPassword).toMatch(/[2-9]/);
      expect(result.tempCredentials[0]!.tempPassword).toMatch(/[!@#$%^&*?]/);
    });

    it('tempPassword tak pernah masuk argumen logger', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-log-test');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'ult', keycloakId: 'kc-log-test', email: 'l@smk.sch.id', fullName: 'Log Test', role: 'GURU',
      });

      const svc = await buildService(kc, prisma);

      const result = await svc.provisionUser({
        role: 'GURU',
        fullName: 'Log Test',
        gender: 'L',
        email: 'l@smk.sch.id',
        niy: 'Y0503',
        employmentStatus: 'GTY',
      }, SA_ACTOR);

      const pw = result.tempCredentials[0]!.tempPassword;
      const infoSpy = logger.info as jest.Mock;
      const allArgs = infoSpy.mock.calls.flatMap((c) => c.map(String));
      expect(allArgs.join(' ')).not.toContain(pw);
    });
  });

  // ── provisionStudent ───────────────────────────────────────────────────────

  describe('provisionStudent', () => {
    it('siswa+ortu baru → 2 createUser + parentId terisi', async () => {
      const kc = mockKc();
      let createCount = 0;
      kc.createUser.mockImplementation(() => Promise.resolve(`kc-new-${++createCount}`));
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data, id: `u-${args.data.keycloakId}`, keycloakId: args.data.keycloakId }),
      );
      prisma.student.create.mockResolvedValue({ id: 'st-1', nis: '12345' });

      const svc = await buildService(kc, prisma);

      const result = await svc.provisionStudent({
        siswa: { nis: '12345', fullName: 'Siswa Baru', classId: CLASS_ID },
        ortu: { name: 'Ortu Baru', phone: '+6281234567890' },
        consent: true,
      }, SA_ACTOR);

      expect(kc.createUser).toHaveBeenCalledTimes(2);
      expect(result.tempCredentials).toHaveLength(2); // ortu + siswa
    });

    it('ortu existing (input 0812 match DB +628...) → 1 createUser saja', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-siswa-only');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue({
        id: 'existing-ortu', keycloakId: 'kc-ortu-existing',
      });
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data, id: 'u-siswa', keycloakId: args.data.keycloakId }),
      );
      prisma.student.create.mockResolvedValue({ id: 'st-2', nis: '54321' });

      const svc = await buildService(kc, prisma);

      const result = await svc.provisionStudent({
        siswa: { nis: '54321', fullName: 'Siswa Exist', classId: CLASS_ID },
        ortu: { name: 'Ortu Exist', phone: '+6281234567890' },
        reuseParentByPhone: true,
        consent: true,
      }, SA_ACTOR);

      expect(kc.createUser).toHaveBeenCalledTimes(1); // hanya siswa
      expect(result.tempCredentials).toHaveLength(1);
    });

    it('NIS duplikat → 409 pre-flight (KC tidak dipanggil)', async () => {
      const kc = mockKc();
      kc.findByUsername.mockResolvedValue(null);

      const prisma = mockPrisma();
      prisma.student.findUnique.mockResolvedValue({ id: 'existing-nis' });
      prisma.user.findFirst.mockResolvedValue(null);

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionStudent({
          siswa: { nis: '11111', fullName: 'Duplikat', classId: CLASS_ID },
          ortu: { name: 'Ortu', phone: '+6281234567890' },
          consent: true,
        }, SA_ACTOR),
      ).rejects.toThrow(ConflictException);

      expect(kc.createUser).not.toHaveBeenCalled();
    });

    it('gagal KC siswa → hapus KC ortu baru saja, TANPA hapus ortu existing', async () => {
      const kc = mockKc();
      kc.createUser
        .mockResolvedValueOnce('kc-ortu-new') // ortu berhasil
        .mockRejectedValueOnce(new Error('KC down')); // siswa gagal
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);
      kc.deleteUser.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue(null);

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionStudent({
          siswa: { nis: '99999', fullName: 'Fail', classId: CLASS_ID },
          ortu: { name: 'Ortu', phone: '+6281234567890' },
          consent: true,
        }, SA_ACTOR),
      ).rejects.toThrow('KC down');

      expect(kc.deleteUser).toHaveBeenCalledWith('kc-ortu-new');
    });

    it('email sintetis siswa benar: {nis}@siswa.smkdarussalamsubah.sch.id', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-em-siswa');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data, id: 'u-s', keycloakId: args.data.keycloakId }),
      );
      prisma.student.create.mockResolvedValue({ id: 'st-em' });

      const svc = await buildService(kc, prisma);

      await svc.provisionStudent({
        siswa: { nis: '2024001', fullName: 'Email Test', classId: CLASS_ID },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
        consent: true,
      }, SA_ACTOR);

      const createUserCall = kc.createUser.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).email === '2024001@siswa.smkdarussalamsubah.sch.id',
      );
      expect(createUserCall).toBeDefined();
    });

    it('ppdbLeadId accepted → lead ditandai enrolled setelah student dibuat', async () => {
      const kc = mockKc();
      let createCount = 0;
      kc.createUser.mockImplementation(() => Promise.resolve(`kc-ppdb-${++createCount}`));
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.ppdbLead.findUnique.mockResolvedValue({
        id: PPDB_LEAD_ID,
        status: 'accepted',
        notes: '{"kind":"spmb_2027_2028_intake"}',
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data, id: `u-${args.data.keycloakId}`, keycloakId: args.data.keycloakId }),
      );
      prisma.student.create.mockResolvedValue({ id: 'student-from-ppdb', nis: '2024002' });

      const svc = await buildService(kc, prisma);

      await svc.provisionStudent({
        siswa: { nis: '2024002', fullName: 'PPDB Student', classId: CLASS_ID },
        ppdbLeadId: PPDB_LEAD_ID,
        ortu: { name: 'Ortu PPDB', phone: '+6281234567890' },
        consent: true,
      }, SA_ACTOR);

      expect(prisma.ppdbLead.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: PPDB_LEAD_ID },
        data: {
          notes: expect.stringContaining('"studentId":"student-from-ppdb"'),
        },
      }));
    });

    it('ppdbLeadId yang sudah enrolled → 409 dan Keycloak tidak dipanggil', async () => {
      const kc = mockKc();
      const prisma = mockPrisma();
      prisma.ppdbLead.findUnique.mockResolvedValue({
        id: PPDB_LEAD_ID,
        status: 'accepted',
        notes: '{"enrollment":{"studentId":"existing-student"}}',
      });

      const svc = await buildService(kc, prisma);

      await expect(
        svc.provisionStudent({
          siswa: { nis: '2024003', fullName: 'PPDB Duplicate', classId: CLASS_ID },
          ppdbLeadId: PPDB_LEAD_ID,
          ortu: { name: 'Ortu PPDB', phone: '+6281234567890' },
          consent: true,
        }, SA_ACTOR),
      ).rejects.toThrow(ConflictException);

      expect(kc.createUser).not.toHaveBeenCalled();
    });
  });

  // ── 2J-3: ProvisionStudentSchema consent validation ─────────────────────────

  describe('ProvisionStudentSchema — consent wajib true', () => {
    it('consent: true → valid (Zod parse sukses)', () => {
      const result = ProvisionStudentSchema.safeParse({
        siswa: { nis: '12345', fullName: 'Siswa', classId: CLASS_ID },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
        consent: true,
      });
      expect(result.success).toBe(true);
    });

    it('classId hilang → invalid agar siswa baru tidak tanpa kelas', () => {
      const result = ProvisionStudentSchema.safeParse({
        siswa: { nis: '12345', fullName: 'Siswa' },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
        consent: true,
      });
      expect(result.success).toBe(false);
    });

    it('consent: false → invalid (Zod reject)', () => {
      const result = ProvisionStudentSchema.safeParse({
        siswa: { nis: '12345', fullName: 'Siswa', classId: CLASS_ID },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
        consent: false,
      });
      expect(result.success).toBe(false);
    });

    it('consent absent → invalid (Zod reject)', () => {
      const result = ProvisionStudentSchema.safeParse({
        siswa: { nis: '12345', fullName: 'Siswa', classId: CLASS_ID },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
      });
      expect(result.success).toBe(false);
    });
  });

  // ── 2J-4: ProvisionUserSchema (gender + NIY/status per-role) ─────────────────

  describe('bulkProvisionStudents', () => {
    it('baris valid sukses dan baris invalid gagal tanpa menghentikan import', async () => {
      const kc = mockKc();
      let createCount = 0;
      kc.createUser.mockImplementation(() => Promise.resolve(`kc-bulk-${++createCount}`));
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.student.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...args.data, id: `u-${args.data.keycloakId}`, keycloakId: args.data.keycloakId }),
      );
      prisma.student.create.mockResolvedValue({ id: 'st-bulk', nis: '2026001' });

      const svc = await buildService(kc, prisma);
      const result = await svc.bulkProvisionStudents([
        {
          siswa: { nis: '2026001', fullName: 'Siswa Bulk', gender: 'L', classId: CLASS_ID, joinedAt: '2026-07-15', status: 'active' },
          ortu: { name: 'Wali Bulk', phone: '+6281234567890' },
          consent: true,
        },
        {
          siswa: { nis: '2026002', fullName: 'Tanpa Consent', classId: CLASS_ID },
          ortu: { name: 'Wali', phone: '+6289876543210' },
        },
      ], SA_ACTOR);

      expect(result.summary).toEqual({ ok: 1, fail: 1, total: 2 });
      expect(result.results[0]).toEqual(expect.objectContaining({ index: 0, status: 'ok' }));
      expect(result.results[1]).toEqual(expect.objectContaining({ index: 1, status: 'error' }));
      expect(kc.createUser).toHaveBeenCalledTimes(2);
      expect(prisma.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nis: '2026001',
            joinedAt: new Date('2026-07-15'),
            status: 'active',
          }),
        }),
      );
    });

    it('NIS duplikat dalam request ditolak sebelum Keycloak dipanggil', async () => {
      const kc = mockKc();
      const prisma = mockPrisma();
      const svc = await buildService(kc, prisma);

      const row = {
        siswa: { nis: '2026999', fullName: 'Duplikat Bulk', classId: CLASS_ID },
        ortu: { name: 'Wali', phone: '+6281234567890' },
        consent: true,
      };
      const result = await svc.bulkProvisionStudents([row, row], SA_ACTOR);

      expect(result.summary).toEqual({ ok: 0, fail: 2, total: 2 });
      expect(result.results.every((item) => item.error?.includes('duplikat'))).toBe(true);
      expect(kc.createUser).not.toHaveBeenCalled();
    });

    it('schema bulk siswa membatasi 100 baris per request', () => {
      const rows = Array.from({ length: 101 }, (_, i) => ({
        siswa: { nis: `2026${i}`, fullName: `Siswa ${i}`, classId: CLASS_ID },
        ortu: { name: 'Wali', phone: '+6281234567890' },
        consent: true,
      }));

      expect(ProvisionStudentsBulkSchema.safeParse({ students: rows }).success).toBe(false);
    });
  });

  describe('ProvisionUserSchema — validasi 2J-4', () => {
    const guru = {
      role: 'GURU', fullName: 'X', gender: 'L', email: 'x@smk.sch.id',
      niy: 'Y1', employmentStatus: 'GTY',
    };

    it('guru lengkap → valid', () => {
      expect(ProvisionUserSchema.safeParse(guru).success).toBe(true);
    });

    it('gender hilang → invalid', () => {
      const { gender: _gender, ...rest } = guru;
      expect(ProvisionUserSchema.safeParse(rest).success).toBe(false);
    });

    it('pegawai tanpa status → invalid', () => {
      const { employmentStatus: _es, ...rest } = guru;
      expect(ProvisionUserSchema.safeParse(rest).success).toBe(false);
    });

    it('pegawai tanpa NIY (tapi ada status) → valid (NIY opsional)', () => {
      const { niy: _niy, ...rest } = guru;
      expect(ProvisionUserSchema.safeParse(rest).success).toBe(true);
    });

    it('industri dgn niy → invalid (non-pegawai tak boleh)', () => {
      expect(ProvisionUserSchema.safeParse({
        role: 'INDUSTRI', fullName: 'PT', gender: 'L', email: 'pt@x.id',
        niy: 'Y2', employmentStatus: 'PTY',
      }).success).toBe(false);
    });

    it('industri tanpa niy → valid', () => {
      expect(ProvisionUserSchema.safeParse({
        role: 'INDUSTRI', fullName: 'PT', gender: 'L', email: 'pt@x.id',
      }).success).toBe(true);
    });
  });

  // ── 2J-4: bulkProvisionUsers (skip baris invalid) ───────────────────────────

  describe('bulkProvisionUsers', () => {
    it('1 valid + 1 invalid → 1 ok, 1 error (skip-invalid)', async () => {
      const kc = mockKc();
      kc.createUser.mockResolvedValue('kc-bulk-1');
      kc.findByUsername.mockResolvedValue(null);
      kc.assignRealmRole.mockResolvedValue(undefined);
      kc.setTempPassword.mockResolvedValue(undefined);

      const prisma = mockPrisma();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'ub1', keycloakId: 'kc-bulk-1', email: 'b1@smk.sch.id', fullName: 'B1', role: 'GURU',
      });

      const svc = await buildService(kc, prisma);

      const res = await svc.bulkProvisionUsers([
        { role: 'GURU', fullName: 'B1', gender: 'L', email: 'b1@smk.sch.id', niy: 'Y0600', employmentStatus: 'GTY' },
        { role: 'GURU', fullName: 'B2', gender: 'L' }, // invalid: email & niy & status hilang
      ], SA_ACTOR);

      expect(res.summary).toEqual({ ok: 1, fail: 1, total: 2 });
      expect(res.results[0]!.status).toBe('ok');
      expect(res.results[1]!.status).toBe('error');
      expect(kc.createUser).toHaveBeenCalledTimes(1);
    });
  });
});
