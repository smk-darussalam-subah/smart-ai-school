// =============================================================================
// GamificationService — XP, levels, streaks for students (P15 — W3-3).
// SISWA: view own XP · GURU: manual award · KS/SA: leaderboard.
// Internal: addXp() called by GamificationListener for auto-award.
// Level thresholds: L1=0, L2=500, L3=1500, L4=3000, L5=5000, L6=8000.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSiswaId, resolveUserId, isElevated } from '../common/helpers/role-helpers';
import {
  AwardXpDto,
  LeaderboardXpDto,
  AddXpInternalDto,
} from './dto/gamification.dto';

// Level thresholds: index 0 = L1 (0 XP), index 1 = L2 (500 XP), etc.
const LEVEL_THRESHOLDS: number[] = [0, 500, 1500, 3000, 5000, 8000];

function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= (LEVEL_THRESHOLDS[i] ?? 0)) return i + 1;
  }
  return 1;
}

function nextLevelThreshold(level: number): number | null {
  const idx = level; // L1 → index 1 (500), L2 → index 2 (1500), etc.
  return idx < LEVEL_THRESHOLDS.length ? (LEVEL_THRESHOLDS[idx] ?? null) : null;
}

const XP_SELECT = {
  id: true,
  studentId: true,
  totalXp: true,
  level: true,
  streakDays: true,
  updatedAt: true,
  student: {
    select: {
      nis: true,
      user: { select: { fullName: true } },
      class: { select: { id: true, name: true } },
    },
  },
} as const;

const TX_SELECT = {
  id: true,
  amount: true,
  reason: true,
  source: true,
  createdAt: true,
} as const;

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** SISWA: view own XP, level, progress to next level */
  async findMyXp(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    let xp = await this.prisma.studentXp.findUnique({
      where: { studentId },
      select: XP_SELECT,
    });
    if (!xp) {
      // Auto-create XP record if not exists
      xp = await this.prisma.studentXp.create({
        data: { studentId, totalXp: 0, level: 1 },
        select: XP_SELECT,
      });
    }
    const nextThreshold = nextLevelThreshold(xp.level);
    return {
      ...xp,
      nextLevelXp: nextThreshold,
      xpToNextLevel: nextThreshold !== null ? nextThreshold - xp.totalXp : null,
    };
  }

  /** SISWA: view own XP transaction history */
  async findXpHistory(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    let xp = await this.prisma.studentXp.findUnique({
      where: { studentId },
      select: { id: true },
    });
    if (!xp) {
      xp = await this.prisma.studentXp.create({
        data: { studentId, totalXp: 0, level: 1 },
        select: { id: true },
      });
    }
    return this.prisma.xpTransaction.findMany({
      where: { studentXpId: xp.id },
      orderBy: { createdAt: 'desc' },
      select: TX_SELECT,
    });
  }

  /** GURU/KS/SA: view class XP leaderboard */
  async findLeaderboardXp(query: LeaderboardXpDto) {
    const where = query.classId
      ? { student: { classId: query.classId } }
      : {};
    const entries = await this.prisma.studentXp.findMany({
      where,
      orderBy: { totalXp: 'desc' },
      take: query.limit,
      select: XP_SELECT,
    });
    // Tie-aware ranking (competition-style): same XP = same rank
    const ranks: number[] = [];
    let prevXp: number | null = null;
    let currentRank = 0;
    for (let i = 0; i < entries.length; i++) {
      const xp = entries[i]?.totalXp ?? 0;
      if (prevXp === null || xp !== prevXp) {
        currentRank = i + 1;
        prevXp = xp;
      }
      ranks.push(currentRank);
    }
    return entries.map((entry, idx) => ({
      ...entry,
      rank: ranks[idx] ?? (idx + 1),
    }));
  }

  /** GURU: manually award XP to a student */
  async awardXp(dto: AwardXpDto, user: AuthUser) {
    if (!isElevated(user) && !user.roles.includes('GURU')) {
      throw new ForbiddenException('Hanya GURU/KS/SA yang dapat memberikan XP');
    }
    const userId = await resolveUserId(this.prisma, user.keycloakId);
    // reason includes userId for audit trail
    const reason = `[Manual by ${userId}] ${dto.reason}`;
    return this.addXp({
      studentId: dto.studentId,
      amount: dto.amount,
      reason,
      source: 'manual',
    });
  }

  /**
   * Internal: add XP to a student. Auto-creates StudentXp if not exists.
   * Idempotency: if idempotencyKey is provided, checks for existing transaction.
   * Fail-soft: errors are logged, not thrown (called from event listeners).
   */
  async addXp(dto: AddXpInternalDto): Promise<{ awarded: boolean; newTotal: number; level: number }> {
    try {
      // Ensure StudentXp exists
      let xp = await this.prisma.studentXp.findUnique({
        where: { studentId: dto.studentId },
        select: { id: true, totalXp: true, level: true },
      });
      if (!xp) {
        xp = await this.prisma.studentXp.create({
          data: { studentId: dto.studentId, totalXp: 0, level: 1 },
          select: { id: true, totalXp: true, level: true },
        });
      }

      // Idempotency check: if idempotencyKey provided, check for existing transaction
      if (dto.idempotencyKey) {
        const existing = await this.prisma.xpTransaction.findFirst({
          where: { studentXpId: xp.id, reason: dto.idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          logger.debug('[GamificationService] XP already awarded (idempotent skip)', {
            studentId: dto.studentId, idempotencyKey: dto.idempotencyKey,
          });
          return { awarded: false, newTotal: xp.totalXp, level: xp.level };
        }
      }

      // Create transaction
      const reason = dto.idempotencyKey ?? dto.reason;
      await this.prisma.xpTransaction.create({
        data: {
          studentXpId: xp.id,
          amount: dto.amount,
          reason,
          source: dto.source,
        },
      });

      // Update total and level
      const newTotal = xp.totalXp + dto.amount;
      const newLevel = calculateLevel(newTotal);
      await this.prisma.studentXp.update({
        where: { id: xp.id },
        data: { totalXp: newTotal, level: newLevel },
      });

      logger.info('[GamificationService] XP awarded', {
        studentId: dto.studentId, amount: dto.amount, newTotal, newLevel,
      });
      return { awarded: true, newTotal, level: newLevel };
    } catch (err) {
      logger.warn('[GamificationService] addXp error (fail-soft)', {
        studentId: dto.studentId, amount: dto.amount,
        error: err instanceof Error ? err.message : String(err),
      });
      return { awarded: false, newTotal: 0, level: 1 };
    }
  }
}
