// =============================================================================
// P15 W3-3: GamificationService — XP, levels, leaderboard, award, idempotency.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { GamificationService } from '../gamification/gamification.service';
import { PrismaService } from '../prisma/prisma.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

describe('GamificationService', () => {
  let service: GamificationService;
  const userFindUnique = jest.fn();
  const studentFindUnique = jest.fn();
  const studentXpFindUnique = jest.fn();
  const studentXpCreate = jest.fn();
  const studentXpFindMany = jest.fn();
  const studentXpUpdate = jest.fn();
  const xpTxnFindMany = jest.fn();
  const xpTxnFindFirst = jest.fn();
  const xpTxnCreate = jest.fn();

  beforeEach(async () => {
    [userFindUnique, studentFindUnique, studentXpFindUnique, studentXpCreate,
     studentXpFindMany, studentXpUpdate, xpTxnFindMany, xpTxnFindFirst, xpTxnCreate]
      .forEach((m) => m.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    studentFindUnique.mockResolvedValue({ id: 'student-1' });
    studentXpFindMany.mockResolvedValue([]);
    xpTxnFindMany.mockResolvedValue([]);

    const prisma = {
      user: { findUnique: userFindUnique },
      student: { findUnique: studentFindUnique },
      studentXp: { findUnique: studentXpFindUnique, create: studentXpCreate, findMany: studentXpFindMany, update: studentXpUpdate },
      xpTransaction: { findMany: xpTxnFindMany, findFirst: xpTxnFindFirst, create: xpTxnCreate },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [GamificationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(GamificationService);
  });

  // ── findMyXp ──────────────────────────────────────────────────────────────

  it('findMyXp auto-creates XP record if not exists', async () => {
    studentXpFindUnique.mockResolvedValue(null);
    studentXpCreate.mockResolvedValue({
      id: 'xp-1', studentId: 'student-1', totalXp: 0, level: 1, streakDays: 0,
      student: { nis: '101', user: { fullName: 'Ani' }, class: { id: 'c-1', name: 'X' } },
    });
    const res = await service.findMyXp(SISWA);
    expect(res.totalXp).toBe(0);
    expect(res.level).toBe(1);
    expect(res.nextLevelXp).toBe(500); // L2 threshold
    expect(res.xpToNextLevel).toBe(500);
  });

  it('findMyXp returns existing XP with next level info', async () => {
    studentXpFindUnique.mockResolvedValue({
      id: 'xp-1', studentId: 'student-1', totalXp: 600, level: 2, streakDays: 3,
      student: { nis: '101', user: { fullName: 'Ani' }, class: { id: 'c-1', name: 'X' } },
    });
    const res = await service.findMyXp(SISWA);
    expect(res.totalXp).toBe(600);
    expect(res.level).toBe(2);
    expect(res.nextLevelXp).toBe(1500); // L3 threshold
    expect(res.xpToNextLevel).toBe(900);
  });

  // ── findXpHistory ─────────────────────────────────────────────────────────

  it('findXpHistory returns transactions', async () => {
    studentXpFindUnique.mockResolvedValue({ id: 'xp-1' });
    xpTxnFindMany.mockResolvedValue([
      { id: 'tx-1', amount: 30, reason: 'grade', source: 'grade_submitted', createdAt: new Date() },
    ]);
    const res = await service.findXpHistory(SISWA);
    expect(res).toHaveLength(1);
    expect(res[0]!.amount).toBe(30);
  });

  // ── findLeaderboardXp ─────────────────────────────────────────────────────

  it('findLeaderboardXp returns ranked entries', async () => {
    studentXpFindMany.mockResolvedValue([
      { id: 'xp-1', totalXp: 1000, level: 2, studentId: 's-1', streakDays: 0, student: { nis: '101', user: { fullName: 'A' }, class: { id: 'c-1', name: 'X' } } },
      { id: 'xp-2', totalXp: 500, level: 2, studentId: 's-2', streakDays: 0, student: { nis: '102', user: { fullName: 'B' }, class: { id: 'c-1', name: 'X' } } },
      { id: 'xp-3', totalXp: 500, level: 2, studentId: 's-3', streakDays: 0, student: { nis: '103', user: { fullName: 'C' }, class: { id: 'c-1', name: 'X' } } },
    ]);
    const res = await service.findLeaderboardXp({ limit: 20 } as never);
    expect(res).toHaveLength(3);
    expect(res[0]!.rank).toBe(1);
    expect(res[1]!.rank).toBe(2); // same XP as #3 → tie
    expect(res[2]!.rank).toBe(2); // tie-aware: same rank as #2
  });

  it('findLeaderboardXp with classId filter', async () => {
    await service.findLeaderboardXp({ classId: 'class-1', limit: 20 } as never);
    expect(studentXpFindMany.mock.calls[0][0].where).toEqual({ student: { classId: 'class-1' } });
  });

  // ── awardXp ───────────────────────────────────────────────────────────────

  it('awardXp GURU → adds XP with manual source', async () => {
    studentXpFindUnique.mockResolvedValue({ id: 'xp-1', totalXp: 100, level: 1 });
    xpTxnFindFirst.mockResolvedValue(null); // not yet awarded
    const res = await service.awardXp({ studentId: 'student-1', amount: 50, reason: 'Good work' }, GURU);
    expect(res.awarded).toBe(true);
    expect(res.newTotal).toBe(150);
    expect(xpTxnCreate).toHaveBeenCalled();
    expect(studentXpUpdate).toHaveBeenCalled();
  });

  it('awardXp non-GURU/non-KS → Forbidden', async () => {
    await expect(service.awardXp({ studentId: 's-1', amount: 50, reason: 'X' }, SISWA))
      .rejects.toThrow(ForbiddenException);
  });

  // ── addXp (internal) ───────────────────────────────────────────────────────

  it('addXp auto-creates StudentXp if not exists', async () => {
    studentXpFindUnique.mockResolvedValue(null);
    studentXpCreate.mockResolvedValue({ id: 'xp-1', totalXp: 0, level: 1 });
    xpTxnFindFirst.mockResolvedValue(null);
    const res = await service.addXp({
      studentId: 'student-1', amount: 30, reason: 'test',
      source: 'grade_submitted', idempotencyKey: 'grade:g-1',
    });
    expect(res.awarded).toBe(true);
    expect(res.newTotal).toBe(30);
  });

  it('addXp idempotent → skips if already awarded', async () => {
    studentXpFindUnique.mockResolvedValue({ id: 'xp-1', totalXp: 30, level: 1 });
    xpTxnFindFirst.mockResolvedValue({ id: 'tx-1' }); // already exists
    const res = await service.addXp({
      studentId: 'student-1', amount: 30, reason: 'test',
      source: 'grade_submitted', idempotencyKey: 'grade:g-1',
    });
    expect(res.awarded).toBe(false);
    expect(res.newTotal).toBe(30); // unchanged
    expect(xpTxnCreate).not.toHaveBeenCalled();
  });

  it('addXp level-up when crossing threshold', async () => {
    studentXpFindUnique.mockResolvedValue({ id: 'xp-1', totalXp: 480, level: 1 });
    xpTxnFindFirst.mockResolvedValue(null);
    const res = await service.addXp({
      studentId: 'student-1', amount: 30, reason: 'test',
      source: 'grade_submitted',
    });
    expect(res.awarded).toBe(true);
    expect(res.newTotal).toBe(510);
    expect(res.level).toBe(2); // crossed 500 threshold
  });

  it('addXp fail-soft → returns awarded=false on error', async () => {
    studentXpFindUnique.mockRejectedValue(new Error('DB error'));
    const res = await service.addXp({
      studentId: 'student-1', amount: 30, reason: 'test',
      source: 'grade_submitted',
    });
    expect(res.awarded).toBe(false);
  });
});
