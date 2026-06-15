// =============================================================================
// analytics.spec.ts — Unit tests Dasbor Eksekutif (2N)
//
// Cakupan:
//   ✓ Math murni: mean/median/quantile/summarize/kkmPassRate/pearson/aging
//   ✓ Service.grades: distribusi per jurusan + matriks KKM + korelasi
//   ✓ Service.atRisk: ambang alpha kronis ≥3/30 hari (+empty)
//   ✓ Service.financeAging: bucket umur tunggakan, totalAmount konsisten
//   ✓ Service.teacherCompliance: gpsPct + RPP approvalRate (non-draft)
//   ✓ Controller: delegasi + query invalid → BadRequestException
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsController } from '../analytics/analytics.controller';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import {
  agingBucketIndex,
  kkmPassRate,
  mean,
  median,
  pearson,
  quantile,
  summarize,
} from '../analytics/analytics.math';

// ── Math murni ─────────────────────────────────────────────────────────────
describe('analytics.math', () => {
  it('mean & median', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it('quantile (interpolasi linear R-7)', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(quantile(xs, 0)).toBe(1);
    expect(quantile(xs, 1)).toBe(5);
    expect(quantile(xs, 0.5)).toBe(3);
    expect(quantile(xs, 0.25)).toBe(2);
  });

  it('summarize → count/min/max/median/q1/q3', () => {
    const s = summarize([60, 70, 80, 90, 100]);
    expect(s.count).toBe(5);
    expect(s.min).toBe(60);
    expect(s.max).toBe(100);
    expect(s.median).toBe(80);
  });

  it('kkmPassRate: ≥ ambang', () => {
    expect(kkmPassRate([70, 75, 80, 90], 75)).toBe(75); // 3 dari 4
    expect(kkmPassRate([], 75)).toBe(0);
  });

  it('pearson: positif sempurna / negatif / konstan', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBe(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBe(-1);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('agingBucketIndex', () => {
    expect(agingBucketIndex(10)).toBe(0);
    expect(agingBucketIndex(45)).toBe(1);
    expect(agingBucketIndex(75)).toBe(2);
    expect(agingBucketIndex(400)).toBe(3);
  });
});

// ── Mock Prisma ──────────────────────────────────────────────────────────────
function buildPrisma() {
  return {
    grade: { findMany: jest.fn(), groupBy: jest.fn() },
    attendance: { groupBy: jest.fn() },
    student: { findMany: jest.fn() },
    sppPayment: { findMany: jest.fn() },
    teacher: { count: jest.fn() },
    teacherAttendance: { count: jest.fn() },
    rpp: { groupBy: jest.fn() },
  };
}

const schoolMock = {
  getActiveSemester: jest.fn().mockResolvedValue({ number: 1, academicYear: { code: '2025/2026' } }),
  getActiveAcademicYear: jest.fn().mockResolvedValue({
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
  }),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchoolConfigService, useValue: schoolMock },
      ],
    }).compile();
    service = module.get(AnalyticsService);
    jest.clearAllMocks();
  });

  // ── grades ────────────────────────────────────────────────────────────────
  describe('grades', () => {
    it('agregasi distribusi + matriks KKM + korelasi', async () => {
      prisma.grade.findMany.mockResolvedValue([
        { score: '80', assignment: { subject: 'Matematika', class: { majorCode: 'TKRO' } } },
        { score: '60', assignment: { subject: 'Matematika', class: { majorCode: 'TKRO' } } },
        { score: '90', assignment: { subject: 'B.Indonesia', class: { majorCode: 'AKL' } } },
        { score: '75', assignment: { subject: 'B.Indonesia', class: { majorCode: 'AKL' } } },
      ]);
      // korelasi: 3 siswa, kehadiran naik → nilai naik
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's1', status: 'hadir', _count: { _all: 7 } },
        { studentId: 's1', status: 'alpha', _count: { _all: 3 } },
        { studentId: 's2', status: 'hadir', _count: { _all: 9 } },
        { studentId: 's2', status: 'alpha', _count: { _all: 1 } },
        { studentId: 's3', status: 'hadir', _count: { _all: 10 } },
      ]);
      prisma.grade.groupBy.mockResolvedValue([
        { studentId: 's1', _avg: { score: '70' } },
        { studentId: 's2', _avg: { score: '85' } },
        { studentId: 's3', _avg: { score: '95' } },
      ]);

      const res = await service.grades({});

      expect(res.filters.kkm).toBe(75);
      expect(res.overall.count).toBe(4);
      // 80,90,75 ≥75 → 3 dari 4 = 75%
      expect(res.overall.kkmPassRate).toBe(75);
      expect(res.byMajor.map((m) => m.majorCode).sort()).toEqual(['AKL', 'TKRO']);
      expect(res.kkmMatrix.majors).toContain('TKRO');
      expect(res.kkmMatrix.subjects).toContain('Matematika');
      // korelasi positif kuat
      expect(res.correlation.n).toBe(3);
      expect(res.correlation.r).toBeGreaterThan(0.9);
    });

    it('filter majorCode diteruskan ke where grade', async () => {
      prisma.grade.findMany.mockResolvedValue([]);
      prisma.attendance.groupBy.mockResolvedValue([]);
      prisma.grade.groupBy.mockResolvedValue([]);

      await service.grades({ majorCode: 'TKRO' });

      const where = prisma.grade.findMany.mock.calls[0][0].where;
      expect(where.assignment).toMatchObject({ class: { majorCode: 'TKRO' } });
      expect(where.academicYear).toBe('2025/2026');
      expect(where.semester).toBe(1);
    });
  });

  // ── atRisk ──────────────────────────────────────────────────────────────────
  describe('atRisk', () => {
    it('hanya siswa dengan alpha ≥ 3 yang dihitung', async () => {
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 's1', _count: { _all: 5 } },
        { studentId: 's2', _count: { _all: 3 } },
        { studentId: 's3', _count: { _all: 2 } }, // di bawah ambang
      ]);
      prisma.student.findMany.mockResolvedValue([
        { class: { name: 'XI TKRO 1', grade: 11, majorCode: 'TKRO' } },
        { class: { name: 'XI TKRO 1', grade: 11, majorCode: 'TKRO' } },
      ]);

      const res = await service.atRisk({});

      // groupBy hanya dipanggil utk siswa berisiko (s3 ditolak sebelum findMany)
      const whereIn = prisma.student.findMany.mock.calls[0][0].where.id.in;
      expect(whereIn).toEqual(['s1', 's2']);
      expect(res.total).toBe(2);
      expect(res.byClass[0]).toMatchObject({ className: 'XI TKRO 1', count: 2 });
      expect(res.threshold).toBe(3);
    });

    it('tidak ada siswa berisiko → kosong tanpa query student', async () => {
      prisma.attendance.groupBy.mockResolvedValue([{ studentId: 's3', _count: { _all: 1 } }]);

      const res = await service.atRisk({});

      expect(res.total).toBe(0);
      expect(res.byClass).toEqual([]);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  // ── financeAging ─────────────────────────────────────────────────────────────
  describe('financeAging', () => {
    it('bucket umur + totalAmount konsisten', async () => {
      prisma.sppPayment.findMany.mockResolvedValue([
        { amount: '250000', month: 1, year: 2000, studentId: 'a' }, // sangat lama → 90+
        { amount: '150000', month: 1, year: 2000, studentId: 'b' }, // 90+
      ]);

      const res = await service.financeAging({});

      expect(res.totalAmount).toBe(400000);
      expect(res.totalStudents).toBe(2);
      const sumBuckets = res.buckets.reduce((s, b) => s + b.amount, 0);
      expect(sumBuckets).toBe(res.totalAmount);
      const last = res.buckets[res.buckets.length - 1]!;
      expect(last.amount).toBe(400000); // semua jatuh di >90 hari
    });

    it('hanya status unpaid/late di-query', async () => {
      prisma.sppPayment.findMany.mockResolvedValue([]);
      await service.financeAging({});
      const where = prisma.sppPayment.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['unpaid', 'late'] });
    });
  });

  // ── teacherCompliance ────────────────────────────────────────────────────────
  describe('teacherCompliance', () => {
    it('gpsPct + RPP approvalRate (non-draft)', async () => {
      prisma.teacher.count.mockResolvedValue(20);
      prisma.teacherAttendance.count.mockResolvedValue(19);
      prisma.rpp.groupBy.mockResolvedValue([
        { status: 'draft', _count: { _all: 4 } },
        { status: 'submitted', _count: { _all: 2 } },
        { status: 'approved', _count: { _all: 6 } },
        { status: 'revision', _count: { _all: 2 } },
      ]);

      const res = await service.teacherCompliance({});

      expect(res.gpsPct).toBe(95); // 19/20
      // approved 6 dari non-draft (2+6+2=10) = 60%
      expect(res.rpp.approvalRate).toBe(60);
      expect(res.rpp.total).toBe(14);
    });

    it('tanpa guru → gpsPct null; tanpa RPP non-draft → approvalRate null', async () => {
      prisma.teacher.count.mockResolvedValue(0);
      prisma.teacherAttendance.count.mockResolvedValue(0);
      prisma.rpp.groupBy.mockResolvedValue([{ status: 'draft', _count: { _all: 3 } }]);

      const res = await service.teacherCompliance({});

      expect(res.gpsPct).toBeNull();
      expect(res.rpp.approvalRate).toBeNull();
    });
  });
});

// ── Controller ─────────────────────────────────────────────────────────────
describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  const mockService = {
    grades: jest.fn().mockResolvedValue({}),
    atRisk: jest.fn().mockResolvedValue({}),
    financeAging: jest.fn().mockResolvedValue({}),
    teacherCompliance: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockService }],
    }).compile();
    controller = module.get(AnalyticsController);
    jest.clearAllMocks();
  });

  it('grades — query valid (coerce semester) → delegasi', async () => {
    await controller.grades({ semester: '1', majorCode: 'TKRO' });
    expect(mockService.grades).toHaveBeenCalledWith(
      expect.objectContaining({ semester: 1, majorCode: 'TKRO' }),
    );
  });

  it('query invalid (classId bukan uuid) → BadRequestException', async () => {
    let caught: unknown;
    try {
      await controller.grades({ classId: 'bukan-uuid' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
  });

  it('financeAging & teacherCompliance & atRisk delegasi', async () => {
    await controller.financeAging({});
    await controller.teacherCompliance({});
    await controller.atRisk({});
    expect(mockService.financeAging).toHaveBeenCalled();
    expect(mockService.teacherCompliance).toHaveBeenCalled();
    expect(mockService.atRisk).toHaveBeenCalled();
  });
});
