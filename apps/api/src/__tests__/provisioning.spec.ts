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
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserStatusService } from '../auth/user-status.service';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';

const SA_ACTOR: Actor = { keycloakId: 'kc-sa', roles: ['SUPER_ADMIN'] as UserRole[] };
const TU_ACTOR: Actor = { keycloakId: 'kc-tu', roles: ['TATA_USAHA'] as UserRole[] };

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
        email: 'guru@smk.sch.id',
      }, SA_ACTOR);

      expect(kc.createUser).toHaveBeenCalled();
      expect(kc.assignRealmRole).toHaveBeenCalledWith('kc-guru-1', 'GURU');
      expect(kc.setTempPassword).toHaveBeenCalled();

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
          email: 'g@smk.sch.id',
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
          email: 't@smk.sch.id',
        }, SA_ACTOR),
      ).rejects.toThrow('DB connection lost');

      expect(kc.deleteUser).toHaveBeenCalledWith('kc-db-fail');
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
        email: 'l@smk.sch.id',
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
        siswa: { nis: '12345', fullName: 'Siswa Baru' },
        ortu: { name: 'Ortu Baru', phone: '+6281234567890' },
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
        siswa: { nis: '54321', fullName: 'Siswa Exist' },
        ortu: { name: 'Ortu Exist', phone: '+6281234567890' },
        reuseParentByPhone: true,
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
          siswa: { nis: '11111', fullName: 'Duplikat' },
          ortu: { name: 'Ortu', phone: '+6281234567890' },
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
          siswa: { nis: '99999', fullName: 'Fail' },
          ortu: { name: 'Ortu', phone: '+6281234567890' },
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
        siswa: { nis: '2024001', fullName: 'Email Test' },
        ortu: { name: 'Ortu', phone: '+6281234567890' },
      }, SA_ACTOR);

      const createUserCall = kc.createUser.mock.calls.find(
        (call: unknown[]) => (call[0] as Record<string, unknown>).email === '2024001@siswa.smkdarussalamsubah.sch.id',
      );
      expect(createUserCall).toBeDefined();
    });
  });
});
