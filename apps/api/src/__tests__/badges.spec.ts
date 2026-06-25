// =============================================================================
// P14 W3-1: BadgesService — award, findMy, findStudent, auto-award, idempotency.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { BadgesService } from '../badges/badges.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'ks1', roles: ['KEPALA_SEKOLAH'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const ORTU: AuthUser = { keycloakId: 'kc-ortu', username: 'ortu1', roles: ['ORANG_TUA'] } as AuthUser;

const baseBadgeCreate = {
  code: 'GRADE_A',
  name: 'Juara Kelas',
  icon: '🏆',
  criteria: { type: 'grade_threshold' as const, threshold: 90, subject: 'all' },
  tier: 'gold' as const,
};

describe('BadgesService', () => {
  let service: BadgesService;
  const userFindUnique = jest.fn();
  const studentFindUnique = jest.fn();
  const studentFindFirst = jest.fn();
  const badgeFindMany = jest.fn();
  const badgeCount = jest.fn();
  const badgeFindUnique = jest.fn();
  const badgeCreate = jest.fn();
  const studentBadgeFindMany = jest.fn();
  const studentBadgeFindUnique = jest.fn();
  const studentBadgeCreate = jest.fn();

  beforeEach(async () => {
    [userFindUnique, studentFindUnique, studentFindFirst, badgeFindMany, badgeCount,
     badgeFindUnique, badgeCreate, studentBadgeFindMany, studentBadgeFindUnique, studentBadgeCreate]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    studentFindUnique.mockResolvedValue({ id: 'student-1' });
    badgeFindMany.mockResolvedValue([]);
    badgeCount.mockResolvedValue(0);
    studentBadgeFindMany.mockResolvedValue([]);
    studentBadgeFindUnique.mockResolvedValue(null);

    const prisma = {
      user: { findUnique: userFindUnique },
      student: { findUnique: studentFindUnique, findFirst: studentFindFirst },
      badge: { findMany: badgeFindMany, count: badgeCount, findUnique: badgeFindUnique, create: badgeCreate },
      studentBadge: { findMany: studentBadgeFindMany, findUnique: studentBadgeFindUnique, create: studentBadgeCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [BadgesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(BadgesService);
  });

  // ── Badge Definitions ──────────────────────────────────────────────────────

  it('createBadge KS → creates badge', async () => {
    badgeCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'b-1', ...a.data, _count: { studentBadges: 0 } }));
    const res = await service.createBadge(baseBadgeCreate, KS);
    expect(res.id).toBe('b-1');
    expect(badgeCreate.mock.calls[0][0].data.code).toBe('GRADE_A');
  });

  it('createBadge GURU → Forbidden', async () => {
    await expect(service.createBadge(baseBadgeCreate, GURU)).rejects.toThrow(ForbiddenException);
  });

  it('findAll → returns active badges with count', async () => {
    badgeFindMany.mockResolvedValue([{ id: 'b-1', code: 'GRADE_A', name: 'Juara', _count: { studentBadges: 5 } }]);
    badgeCount.mockResolvedValue(1);
    const res = await service.findAll({ page: 1, limit: 50 } as never);
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  // ── Student Badges ──────────────────────────────────────────────────────────

  it('findMyBadges SISWA → returns own badges', async () => {
    studentBadgeFindMany.mockResolvedValue([
      { id: 'sb-1', awardedAt: new Date(), badge: { id: 'b-1', name: 'Juara', icon: '🏆', tier: 'gold' } },
    ]);
    const res = await service.findMyBadges(SISWA);
    expect(res).toHaveLength(1);
    expect(studentBadgeFindMany.mock.calls[0][0].where.studentId).toBe('student-1');
  });

  it('findStudentBadges ORTU child → returns badges', async () => {
    studentFindFirst.mockResolvedValue({ id: 'student-1' });
    studentBadgeFindMany.mockResolvedValue([]);
    await service.findStudentBadges('student-1', ORTU);
    expect(studentFindFirst.mock.calls[0][0].where.parentId).toBe('user-1');
  });

  it('findStudentBadges ORTU not child → Forbidden', async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(service.findStudentBadges('student-LAIN', ORTU)).rejects.toThrow(ForbiddenException);
  });

  // ── Award Badge ────────────────────────────────────────────────────────────

  it('awardBadge GURU → creates studentBadge with awardedBy', async () => {
    badgeFindUnique.mockResolvedValue({ id: 'b-1', name: 'Juara', isActive: true });
    studentFindUnique.mockResolvedValue({ id: 'student-1' });
    studentBadgeFindUnique.mockResolvedValue(null); // not yet awarded
    studentBadgeCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'sb-1', ...a.data, badge: { id: 'b-1', name: 'Juara', icon: '🏆', tier: 'gold' } }));
    await service.awardBadge({ badgeId: 'b-1', studentId: 'student-1' }, GURU);
    expect(studentBadgeCreate.mock.calls[0][0].data.awardedBy).toBe('user-1');
  });

  it('awardBadge already awarded → Conflict', async () => {
    badgeFindUnique.mockResolvedValue({ id: 'b-1', name: 'Juara', isActive: true });
    studentFindUnique.mockResolvedValue({ id: 'student-1' });
    studentBadgeFindUnique.mockResolvedValue({ id: 'sb-1' }); // already exists
    await expect(service.awardBadge({ badgeId: 'b-1', studentId: 'student-1' }, GURU))
      .rejects.toThrow(ConflictException);
  });

  it('awardBadge inactive badge → Conflict', async () => {
    badgeFindUnique.mockResolvedValue({ id: 'b-1', name: 'Old', isActive: false });
    await expect(service.awardBadge({ badgeId: 'b-1', studentId: 'student-1' }, GURU))
      .rejects.toThrow(ConflictException);
  });

  it('awardBadge badge not found → NotFound', async () => {
    badgeFindUnique.mockResolvedValue(null);
    await expect(service.awardBadge({ badgeId: 'b-x', studentId: 'student-1' }, GURU))
      .rejects.toThrow(NotFoundException);
  });

  // ── Auto-Award (checkGradeBadges) ──────────────────────────────────────────

  it('checkGradeBadges score >= threshold → awards badge', async () => {
    badgeFindMany.mockResolvedValue([
      { id: 'b-1', name: 'Juara', criteria: { type: 'grade_threshold', threshold: 90, subject: 'all' } },
    ]);
    studentBadgeFindUnique.mockResolvedValue(null); // not yet awarded
    const awarded = await service.tryAwardBadge('b-1', 'student-1', null);
    expect(awarded).toBe(true);
    expect(studentBadgeCreate).toHaveBeenCalled();
  });

  it('checkGradeBadges already has badge → no duplicate', async () => {
    badgeFindMany.mockResolvedValue([
      { id: 'b-1', name: 'Juara', criteria: { type: 'grade_threshold', threshold: 90, subject: 'all' } },
    ]);
    studentBadgeFindUnique.mockResolvedValue({ id: 'sb-1' }); // already exists
    await service.checkGradeBadges('student-1', 'Matematika', 95);
    expect(studentBadgeCreate).not.toHaveBeenCalled();
  });

  it('checkGradeBadges score < threshold → no award', async () => {
    badgeFindMany.mockResolvedValue([
      { id: 'b-1', name: 'Juara', criteria: { type: 'grade_threshold', threshold: 90, subject: 'all' } },
    ]);
    await service.checkGradeBadges('student-1', 'Matematika', 80);
    expect(studentBadgeCreate).not.toHaveBeenCalled();
  });

  it('checkGradeBadges subject filter → only matching subject', async () => {
    badgeFindMany.mockResolvedValue([
      { id: 'b-1', name: 'Mtk A', criteria: { type: 'grade_threshold', threshold: 90, subject: 'Matematika' } },
    ]);
    await service.checkGradeBadges('student-1', 'B.Inggris', 95);
    expect(studentBadgeCreate).not.toHaveBeenCalled(); // subject mismatch
  });

  it('tryAwardBadge already awarded → returns false', async () => {
    studentBadgeFindUnique.mockResolvedValue({ id: 'sb-1' });
    const awarded = await service.tryAwardBadge('b-1', 'student-1', null);
    expect(awarded).toBe(false);
    expect(studentBadgeCreate).not.toHaveBeenCalled();
  });
});
