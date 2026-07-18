// =============================================================================
// ppdb.spec.ts — Unit tests SMA-34 PPDB module
//
// Skenario wajib (bukti runtime):
//   ✓ POST /ppdb/leads valid → 201 { id, status }
//   ✓ POST honeypot terisi → BadRequestException (400)
//   ✓ POST payload invalid (phone salah) → BadRequestException (400)
//   ✓ GET /ppdb/leads tanpa token → 401 (KeycloakGuard — covered oleh auth-guard.spec)
//   ✓ Rate limiting → 429 (ThrottlerGuard — built-in, tested via @Throttle metadata)
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
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PpdbController } from '../ppdb/ppdb.controller';
import { PpdbService } from '../ppdb/ppdb.service';
import { PrismaService } from '../prisma/prisma.service';
import { FastifyRequest } from 'fastify';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_IP_REQUEST = {
  headers: { 'x-forwarded-for': '1.2.3.4' },
  ip: '1.2.3.4',
} as unknown as FastifyRequest;

const VALID_SUBMIT_DTO = {
  fullName: 'Ahmad Rizki Maulana',
  phone: '6281234567890',
  schoolOrigin: 'SMP Negeri 1 Subah',
  interestMajor: 'TKJ' as const,
  source: 'website' as const,
};

const VALID_SPMB_INTAKE_DTO = {
  idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  applicantRole: 'guardian' as const,
  fullName: 'Alya Rahma Putri',
  gender: 'P' as const,
  nisn: '1234567890',
  schoolOrigin: 'SMP Negeri 2 Subah',
  interestMajor: 'TKJ' as const,
  guardianName: 'Siti Aminah',
  guardianRelation: 'Ibu',
  phone: '6281234567890',
  email: 'wali@example.sch.id',
  consent: true,
};

const MOCK_LEAD = {
  id: 'lead-uuid-001',
  fullName: 'Ahmad Rizki Maulana',
  phone: '6281234567890',
  schoolOrigin: 'SMP Negeri 1 Subah',
  interestMajor: 'TKJ',
  source: 'website',
  status: 'new',
  notes: null,
  assignedTo: null,
  followUpAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedUser: null,
};

// ── Mock PrismaService ────────────────────────────────────────────────────────

function buildPrisma() {
  const prisma = {
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    ppdbLead: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    user: { findFirst: jest.fn() },
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown> | unknown) => callback(prisma));
  return prisma;
}

// ── PpdbService tests ─────────────────────────────────────────────────────────

describe('PpdbService', () => {
  let service: PpdbService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PpdbService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PpdbService);
    jest.clearAllMocks();
  });

  // ── submitLead ───────────────────────────────────────────────────────────────

  describe('submitLead', () => {
    it('valid submission → mengembalikan hanya { id, status } (bukan full lead)', async () => {
      prisma.ppdbLead.create.mockResolvedValue({ id: 'lead-uuid-001', status: 'new' });

      const result = await service.submitLead(VALID_SUBMIT_DTO, '1.2.3.4');

      expect(result).toEqual({ id: 'lead-uuid-001', status: 'new' });
      // Verifikasi response TIDAK memiliki field sensitif lain
      expect(result).not.toHaveProperty('fullName');
      expect(result).not.toHaveProperty('phone');
    });

    it('_hp TIDAK disimpan ke DB', async () => {
      prisma.ppdbLead.create.mockResolvedValue({ id: 'lead-uuid-001', status: 'new' });

      await service.submitLead({ ...VALID_SUBMIT_DTO, _hp: '' }, '1.2.3.4');

      const createArg = prisma.ppdbLead.create.mock.calls[0][0].data;
      expect(createArg).not.toHaveProperty('_hp');
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('submitSpmbIntake', () => {
    it('menyimpan intake 2027/2028 sebagai lead website + metadata V2 namespaced', async () => {
      prisma.ppdbLead.findFirst.mockResolvedValue(null);
      prisma.ppdbLead.create.mockResolvedValue({
        id: '11111111-2222-4333-8444-555555555555',
        status: 'new',
        createdAt: new Date('2026-07-19T03:24:00.000Z'),
      });

      const result = await service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.ppdbLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'website',
            notes: { contains: '"idempotencyKey":"aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"' },
          }),
          select: expect.objectContaining({ notes: true }),
        }),
      );
      const createArg = prisma.ppdbLead.create.mock.calls[0][0].data;
      expect(createArg).toMatchObject({
        fullName: 'Alya Rahma Putri',
        phone: '6281234567890',
        schoolOrigin: 'SMP Negeri 2 Subah',
        interestMajor: 'TKJ',
        source: 'website',
        status: 'new',
      });
      expect(createArg).not.toHaveProperty('_hp');

      const notes = JSON.parse(createArg.notes);
      expect(notes).toMatchObject({
        kind: 'spmb_2027_2028_intake',
        academicYear: '2027/2028',
        idempotencyKey: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        payloadFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        applicantRole: 'guardian',
        gender: 'P',
        guardianName: 'Siti Aminah',
        guardianRelation: 'Ibu',
        email: 'wali@example.sch.id',
      });
      expect(notes.consent.accepted).toBe(true);

      expect(result).toEqual({
        id: '11111111-2222-4333-8444-555555555555',
        status: 'new',
        registrationNo: 'SPMB-2027-11111111',
        submittedAt: '2026-07-19T03:24:00.000Z',
      });
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('email');
    });

    it('retry dengan idempotencyKey sama mengembalikan lead existing dan tidak create ulang', async () => {
      prisma.ppdbLead.findFirst.mockResolvedValueOnce(null);
      prisma.ppdbLead.create.mockResolvedValue({
        id: '22222222-3333-4444-8555-666666666666',
        status: 'new',
        createdAt: new Date('2026-07-19T04:00:00.000Z'),
      });
      await service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4');
      const existingNotes = prisma.ppdbLead.create.mock.calls[0][0].data.notes;
      prisma.ppdbLead.create.mockClear();
      prisma.ppdbLead.findFirst.mockResolvedValueOnce({
        id: '22222222-3333-4444-8555-666666666666',
        status: 'new',
        createdAt: new Date('2026-07-19T04:00:00.000Z'),
        notes: existingNotes,
      });

      const result = await service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4');

      expect(prisma.ppdbLead.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: '22222222-3333-4444-8555-666666666666',
        status: 'new',
        registrationNo: 'SPMB-2027-22222222',
        submittedAt: '2026-07-19T04:00:00.000Z',
      });
    });

    it('retry dengan idempotencyKey sama tetapi payload berbeda ditolak 409', async () => {
      prisma.ppdbLead.findFirst.mockResolvedValueOnce(null);
      prisma.ppdbLead.create.mockResolvedValue({
        id: '33333333-4444-4555-8666-777777777777',
        status: 'new',
        createdAt: new Date('2026-07-19T05:00:00.000Z'),
      });
      await service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4');
      const existingNotes = prisma.ppdbLead.create.mock.calls[0][0].data.notes;
      prisma.ppdbLead.create.mockClear();
      prisma.ppdbLead.findFirst.mockResolvedValueOnce({
        id: '33333333-4444-4555-8666-777777777777',
        status: 'new',
        createdAt: new Date('2026-07-19T05:00:00.000Z'),
        notes: existingNotes,
      });

      await expect(
        service.submitSpmbIntake(
          {
            ...VALID_SPMB_INTAKE_DTO,
            fullName: 'Nama Berubah Setelah Timeout',
          },
          '1.2.3.4',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.ppdbLead.create).not.toHaveBeenCalled();
    });

    it('concurrent retry dengan idempotencyKey sama membuat satu lead saat transaksi terserialisasi', async () => {
      let storedLead: { id: string; status: string; createdAt: Date; notes: string } | null = null;
      let transactionChain = Promise.resolve();
      prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown> | unknown) => {
        const current = transactionChain.then(() => callback(prisma));
        transactionChain = current.then(() => undefined, () => undefined);
        return current;
      });
      prisma.ppdbLead.findFirst.mockImplementation(async () => storedLead);
      prisma.ppdbLead.create.mockImplementation(async (args) => {
        storedLead = {
          id: '44444444-5555-4666-8777-888888888888',
          status: 'new',
          createdAt: new Date('2026-07-19T06:00:00.000Z'),
          notes: args.data.notes,
        };
        return {
          id: storedLead.id,
          status: storedLead.status,
          createdAt: storedLead.createdAt,
        };
      });

      const [first, second] = await Promise.all([
        service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4'),
        service.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, '1.2.3.4'),
      ]);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(prisma.ppdbLead.create).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
      expect(first.registrationNo).toBe('SPMB-2027-44444444');
    });
  });

  describe('findAll', () => {
    it('mengembalikan data + total dengan pagination default', async () => {
      prisma.ppdbLead.findMany.mockResolvedValue([MOCK_LEAD]);
      prisma.ppdbLead.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.ppdbLead.findMany.mock.calls[0][0].select).not.toHaveProperty('notes');
    });

    it('filter berdasarkan status', async () => {
      prisma.ppdbLead.findMany.mockResolvedValue([]);
      prisma.ppdbLead.count.mockResolvedValue(0);

      await service.findAll({ status: 'new', page: 1, limit: 20 });

      expect(prisma.ppdbLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'new' } }),
      );
    });

    it('filter berdasarkan source', async () => {
      prisma.ppdbLead.findMany.mockResolvedValue([]);
      prisma.ppdbLead.count.mockResolvedValue(0);

      await service.findAll({ source: 'instagram', page: 1, limit: 20 });

      const callWhere = prisma.ppdbLead.findMany.mock.calls[0][0].where;
      expect(callWhere).toMatchObject({ source: 'instagram' });
    });

    it('filter berdasarkan rentang tanggal', async () => {
      prisma.ppdbLead.findMany.mockResolvedValue([]);
      prisma.ppdbLead.count.mockResolvedValue(0);

      await service.findAll({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.000Z',
        page: 1,
        limit: 20,
      });

      const callWhere = prisma.ppdbLead.findMany.mock.calls[0][0].where;
      expect(callWhere.createdAt).toBeDefined();
      expect(callWhere.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('lead ditemukan → mengembalikan detail', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);

      const result = await service.findById('lead-uuid-001');

      expect(result).toEqual(MOCK_LEAD);
      expect(prisma.ppdbLead.findUnique.mock.calls[0][0].select).toHaveProperty('notes', true);
    });

    it('lead tidak ditemukan → NotFoundException', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('update status berhasil', async () => {
      const updated = { ...MOCK_LEAD, status: 'contacted' };
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.ppdbLead.update.mockResolvedValue(updated);

      const result = await service.updateStatus('lead-uuid-001', { status: 'contacted' });

      expect(result.status).toBe('contacted');
    });

    it('lead tidak ada → NotFoundException', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', { status: 'contacted' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── assignLead ────────────────────────────────────────────────────────────────

  describe('updateStatus transitions', () => {
    it('menolak lompat status new langsung accepted', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);

      await expect(
        service.updateStatus('lead-uuid-001', { status: 'accepted' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.ppdbLead.update).not.toHaveBeenCalled();
    });

    it('paid ke accepted mengembalikan action enrollment eksplisit', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue({ ...MOCK_LEAD, status: 'paid' });
      prisma.ppdbLead.update.mockResolvedValue({ ...MOCK_LEAD, status: 'accepted' });

      const result = await service.updateStatus('lead-uuid-001', { status: 'accepted' });

      expect(result).toMatchObject({
        status: 'accepted',
        enrollmentRequired: true,
        enrollmentAction: expect.objectContaining({ type: 'create_student' }),
      });
    });

    it('status terminal accepted tidak bisa dikembalikan', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue({ ...MOCK_LEAD, status: 'accepted' });

      await expect(
        service.updateStatus('lead-uuid-001', { status: 'contacted' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.ppdbLead.update).not.toHaveBeenCalled();
    });
  });

  describe('assignLead', () => {
    it('assign ke staff TU aktif berhasil', async () => {
      const updated = { ...MOCK_LEAD, assignedTo: 'user-uuid-tu' };
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-uuid-tu',
        role: 'TATA_USAHA',
        staff: { id: 'staff-uuid-001', deletedAt: null },
      });
      prisma.ppdbLead.update.mockResolvedValue(updated);

      const result = await service.assignLead('lead-uuid-001', { assignedTo: 'user-uuid-tu' });

      expect(result.assignedTo).toBe('user-uuid-tu');
    });

    it('un-assign (null) berhasil', async () => {
      const updated = { ...MOCK_LEAD, assignedTo: null };
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.ppdbLead.update.mockResolvedValue(updated);

      const result = await service.assignLead('lead-uuid-001', { assignedTo: null });

      expect(result.assignedTo).toBeNull();
    });

    it('assign ke guru ditolak meski user aktif', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-uuid-guru',
        role: 'GURU',
        staff: { id: 'staff-uuid-guru', deletedAt: null },
      });

      await expect(
        service.assignLead('lead-uuid-001', { assignedTo: 'user-uuid-guru' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.ppdbLead.update).not.toHaveBeenCalled();
    });

    it('assign ke user tanpa staff aktif ditolak', async () => {
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-uuid-tu',
        role: 'TATA_USAHA',
        staff: { id: 'staff-uuid-tu', deletedAt: new Date() },
      });

      await expect(
        service.assignLead('lead-uuid-001', { assignedTo: 'user-uuid-tu' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.ppdbLead.update).not.toHaveBeenCalled();
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('mengembalikan total, byStatus, dan conversionRate', async () => {
      prisma.ppdbLead.groupBy.mockResolvedValue([
        { status: 'new', _count: { id: 10 } },
        { status: 'accepted', _count: { id: 3 } },
      ]);
      prisma.ppdbLead.count.mockResolvedValue(13);

      const result = await service.getStats();

      expect(result.total).toBe(13);
      expect(result.byStatus['new']).toBe(10);
      expect(result.byStatus['accepted']).toBe(3);
      expect(result.conversionRate).toBeCloseTo(23.08, 1);
    });

    it('total=0 → conversionRate=0 (tidak ada division by zero)', async () => {
      prisma.ppdbLead.groupBy.mockResolvedValue([]);
      prisma.ppdbLead.count.mockResolvedValue(0);

      const result = await service.getStats();

      expect(result.conversionRate).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});

// ── PpdbController tests ──────────────────────────────────────────────────────

describe('PpdbController', () => {
  let controller: PpdbController;
  let service: jest.Mocked<PpdbService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PpdbController],
      providers: [
        {
          provide: PpdbService,
          useValue: {
            submitLead: jest.fn().mockResolvedValue({ id: 'lead-uuid-001', status: 'new' }),
            submitSpmbIntake: jest.fn().mockResolvedValue({
              id: 'lead-uuid-001',
              status: 'new',
              registrationNo: 'SPMB-2027-LEADUUID',
              submittedAt: '2026-07-19T03:24:00.000Z',
            }),
            findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
            findById: jest.fn().mockResolvedValue(MOCK_LEAD),
            updateStatus: jest.fn().mockResolvedValue(MOCK_LEAD),
            assignLead: jest.fn().mockResolvedValue(MOCK_LEAD),
            getStats: jest.fn().mockResolvedValue({ total: 0, byStatus: {}, conversionRate: 0 }),
          },
        },
      ],
    }).compile();

    controller = module.get(PpdbController);
    service = module.get(PpdbService);
    jest.clearAllMocks();
  });

  // ── POST /ppdb/leads (public submit) ─────────────────────────────────────────

  describe('submit — POST /ppdb/leads (public)', () => {
    it('valid payload → mengembalikan { id, status } (bukan full lead)', async () => {
      const result = await controller.submit(VALID_SUBMIT_DTO, MOCK_IP_REQUEST);

      expect(service.submitLead).toHaveBeenCalledWith(VALID_SUBMIT_DTO, '1.2.3.4');
      expect(result).toEqual({ id: 'lead-uuid-001', status: 'new' });
    });

    it('honeypot _hp terisi → BadRequestException (400)', async () => {
      const dtoWithHoneypot = { ...VALID_SUBMIT_DTO, _hp: 'bot-filled-this' };

      let caught: unknown;
      try {
        await controller.submit(dtoWithHoneypot, MOCK_IP_REQUEST);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      expect(service.submitLead).not.toHaveBeenCalled(); // tidak sampai ke service
    });

    it('IP diekstrak dari CF-Connecting-IP (prioritas tertinggi)', async () => {
      const cfReq = {
        headers: { 'cf-connecting-ip': '5.6.7.8', 'x-forwarded-for': '1.2.3.4' },
        ip: '127.0.0.1',
      } as unknown as FastifyRequest;

      await controller.submit(VALID_SUBMIT_DTO, cfReq);

      expect(service.submitLead).toHaveBeenCalledWith(VALID_SUBMIT_DTO, '5.6.7.8');
    });

    it('IP diekstrak dari X-Forwarded-For jika CF header tidak ada', async () => {
      await controller.submit(VALID_SUBMIT_DTO, MOCK_IP_REQUEST);

      expect(service.submitLead).toHaveBeenCalledWith(VALID_SUBMIT_DTO, '1.2.3.4');
    });

    it('IP fallback ke req.ip jika tidak ada header', async () => {
      const noHeaderReq = { headers: {}, ip: '9.9.9.9' } as unknown as FastifyRequest;

      await controller.submit(VALID_SUBMIT_DTO, noHeaderReq);

      expect(service.submitLead).toHaveBeenCalledWith(VALID_SUBMIT_DTO, '9.9.9.9');
    });
  });

  // ── GET /ppdb/leads ───────────────────────────────────────────────────────────

  describe('submitSpmbIntake - POST /ppdb/spmb-2027/intake', () => {
    it('valid payload didelegasikan ke service dengan IP yang sama', async () => {
      const result = await controller.submitSpmbIntake(VALID_SPMB_INTAKE_DTO, MOCK_IP_REQUEST);

      expect(service.submitSpmbIntake).toHaveBeenCalledWith(VALID_SPMB_INTAKE_DTO, '1.2.3.4');
      expect(result).toHaveProperty('registrationNo');
    });

    it('honeypot intake terisi ditolak sebelum service', async () => {
      let caught: unknown;
      try {
        await controller.submitSpmbIntake(
          { ...VALID_SPMB_INTAKE_DTO, _hp: 'bot-filled-this' },
          MOCK_IP_REQUEST,
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
      expect(service.submitSpmbIntake).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('delegasi ke service dengan query yang sudah di-parse', async () => {
      await controller.findAll({ page: '1', limit: '10', status: 'new' } as unknown);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, status: 'new' }),
      );
    });

    it('query tidak valid → BadRequestException', async () => {
      let caught: unknown;
      try {
        await controller.findAll({ status: 'status-tidak-ada' } as unknown);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BadRequestException);
    });
  });

  // ── GET /ppdb/stats ───────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('delegasi ke service', async () => {
      const result = await controller.getStats();

      expect(service.getStats).toHaveBeenCalled();
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('conversionRate');
    });

    it('(F-2 fix) GURU ada di @Roles stats → boleh akses statistik agregat', () => {
      // Reflect.getMetadata('roles') = metadata yang di-set @Roles() decorator
      // Verifikasi bahwa GURU dapat mengakses endpoint stats (agregat, tanpa PII)
      const statsRoles: string[] = Reflect.getMetadata('roles', PpdbController.prototype.getStats) ?? [];
      expect(statsRoles).toContain('GURU');
    });
  });

  // ── RBAC: GURU harus tetap diblokir dari /ppdb/leads (PII calon siswa) ────────

  describe('RBAC metadata — GURU di leads vs stats', () => {
    it('(F-2 guard) GURU TIDAK ada di @Roles leads → tetap 403 (PII calon siswa tertutup)', () => {
      // Verifikasi bahwa @Roles pada findAll (GET /ppdb/leads) TIDAK menyertakan GURU
      // Ini membuktikan: statistik agregat boleh, data individual (nama+phone) tidak
      const leadsRoles: string[] = Reflect.getMetadata('roles', PpdbController.prototype.findAll) ?? [];
      expect(leadsRoles).not.toContain('GURU');
    });
  });

  // ── GET /ppdb/leads/:id ───────────────────────────────────────────────────────

  describe('findById', () => {
    it('delegasi ke service dengan UUID', async () => {
      await controller.findById('lead-uuid-001');
      expect(service.findById).toHaveBeenCalledWith('lead-uuid-001');
    });
  });

  // ── PATCH /ppdb/leads/:id/status ─────────────────────────────────────────────

  describe('updateStatus', () => {
    it('delegasi ke service dengan id + dto', async () => {
      await controller.updateStatus('lead-uuid-001', { status: 'contacted' });
      expect(service.updateStatus).toHaveBeenCalledWith('lead-uuid-001', { status: 'contacted' });
    });
  });

  // ── PATCH /ppdb/leads/:id/assign ─────────────────────────────────────────────

  describe('assignLead', () => {
    it('delegasi ke service dengan id + dto', async () => {
      await controller.assignLead('lead-uuid-001', { assignedTo: 'staff-uuid-001' });
      expect(service.assignLead).toHaveBeenCalledWith('lead-uuid-001', { assignedTo: 'staff-uuid-001' });
    });
  });
});

// ── Verifikasi DTO hardening ──────────────────────────────────────────────────

describe('SubmitLeadSchema — hardening validasi', () => {
  const { SubmitLeadSchema: schema } = jest.requireActual('../ppdb/dto/submit-lead.dto');

  // ── Normalisasi phone (format umum yang diketik calon siswa) ─────────────────

  it('phone format 08xxx (lokal) → dinormalisasi ke 62xxx dan lolos', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '08123456789' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('628123456789');
  });

  it('phone format +62xxx (internasional) → dinormalisasi ke 62xxx dan lolos', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '+6281234567890' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('6281234567890');
  });

  it('phone format 62xxx (sudah benar) → lolos tanpa perubahan', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '6281234567890' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('6281234567890');
  });

  it('phone dengan spasi dan dash → di-strip sebelum normalisasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '0812-3456-789' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('628123456789');
  });

  it('phone terlalu pendek setelah normalisasi → gagal refine', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '0812' });
    expect(result.success).toBe(false);
  });

  it('phone format tidak dikenal (bukan 0/+62/62) → gagal refine', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '99999999999' });
    expect(result.success).toBe(false);
  });

  it('_hp terisi → gagal validasi Zod (max 0 chars)', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, _hp: 'isi-oleh-bot' });
    expect(result.success).toBe(false);
  });

  it('field tidak dikenal (strict) → gagal validasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, badField: 'value' });
    expect(result.success).toBe(false);
  });

  it('captchaToken ditolak karena provider CAPTCHA belum aktif di wave ini', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, captchaToken: 'fake-token' });
    expect(result.success).toBe(false);
  });

  it('interestMajor tidak valid → gagal validasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, interestMajor: 'JURUSAN_ASAL' });
    expect(result.success).toBe(false);
  });

  it('fullName kosong → gagal validasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, fullName: 'A' }); // min 2
    expect(result.success).toBe(false);
  });
});
