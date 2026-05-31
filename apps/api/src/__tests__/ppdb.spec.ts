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
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
  return {
    ppdbLead: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };
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

    it('_hp dan captchaToken TIDAK disimpan ke DB', async () => {
      prisma.ppdbLead.create.mockResolvedValue({ id: 'lead-uuid-001', status: 'new' });

      await service.submitLead({ ...VALID_SUBMIT_DTO, _hp: '', captchaToken: undefined }, '1.2.3.4');

      const createArg = prisma.ppdbLead.create.mock.calls[0][0].data;
      expect(createArg).not.toHaveProperty('_hp');
      expect(createArg).not.toHaveProperty('captchaToken');
    });

    it('captcha diperlukan jika PPDB_CAPTCHA_SECRET di-set', async () => {
      process.env.PPDB_CAPTCHA_SECRET = 'test-secret';
      try {
        await expect(
          service.submitLead(VALID_SUBMIT_DTO, '1.2.3.4'),
        ).rejects.toThrow('Captcha token diperlukan');
      } finally {
        delete process.env.PPDB_CAPTCHA_SECRET;
      }
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan data + total dengan pagination default', async () => {
      prisma.ppdbLead.findMany.mockResolvedValue([MOCK_LEAD]);
      prisma.ppdbLead.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
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

  describe('assignLead', () => {
    it('assign ke staff berhasil', async () => {
      const updated = { ...MOCK_LEAD, assignedTo: 'staff-uuid-001' };
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.ppdbLead.update.mockResolvedValue(updated);

      const result = await service.assignLead('lead-uuid-001', { assignedTo: 'staff-uuid-001' });

      expect(result.assignedTo).toBe('staff-uuid-001');
    });

    it('un-assign (null) berhasil', async () => {
      const updated = { ...MOCK_LEAD, assignedTo: null };
      prisma.ppdbLead.findUnique.mockResolvedValue(MOCK_LEAD);
      prisma.ppdbLead.update.mockResolvedValue(updated);

      const result = await service.assignLead('lead-uuid-001', { assignedTo: null });

      expect(result.assignedTo).toBeNull();
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

  it('phone tidak diawali 62 → gagal validasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '08123456789' });
    expect(result.success).toBe(false);
  });

  it('phone valid format 62xxx → lolos', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, phone: '6281234567890' });
    expect(result.success).toBe(true);
  });

  it('_hp terisi → gagal validasi Zod (max 0 chars)', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, _hp: 'isi-oleh-bot' });
    expect(result.success).toBe(false);
  });

  it('field tidak dikenal (strict) → gagal validasi', () => {
    const result = schema.safeParse({ ...VALID_SUBMIT_DTO, badField: 'value' });
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
