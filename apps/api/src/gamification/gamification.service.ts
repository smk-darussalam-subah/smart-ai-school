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

  // ── T3-02 B1: Daily Quest (deterministic daily missions for siswa) ──────────

  /** B1: Generate deterministic daily quests based on date + student ID.
   *  No DB table needed — quests are derived from existing data.
   *  3 quest types: attend class, complete module progress, check grades. */
  async getDailyQuests(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    // Deterministic quest selection based on date hash
    const hash = (str: string): number => {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    const seed = hash(`${studentId}-${dateStr}`);

    const allQuests = [
      { id: 'q1', title: 'Hadiri semua pelajaran hari ini', desc: 'Tanpa alpha', xp: 50, icon: 'calendar-check', type: 'attendance' },
      { id: 'q2', title: 'Selesaikan 1 modul LMS', desc: 'Tandai modul sebagai selesai', xp: 30, icon: 'book', type: 'module' },
      { id: 'q3', title: 'Cek nilai terbaru', desc: 'Lihat hasil penilaian guru', xp: 10, icon: 'star', type: 'grade' },
      { id: 'q4', title: 'Buka 3 materi pembelajaran', desc: 'Aktif belajar hari ini', xp: 20, icon: 'book-open', type: 'module' },
      { id: 'q5', title: 'Capai kehadiran 5 hari beruntun', desc: 'Streak bonus', xp: 100, icon: 'flame', type: 'streak' },
      { id: 'q6', title: 'Kumpulkan 1 tugas tepat waktu', desc: 'Disiplin dengan deadline', xp: 40, icon: 'clock', type: 'assignment' },
    ];

    // Pick 3 quests deterministically
    const quests = [allQuests[seed % allQuests.length]!, allQuests[(seed + 2) % allQuests.length]!, allQuests[(seed + 4) % allQuests.length]!];

    // Check completion status from existing data
    const [todayAtt, lmsCompleted, recentGrades] = await Promise.all([
      this.prisma.attendance.findFirst({
        where: { studentId, date: { gte: new Date(dateStr), lt: new Date(dateStr + 'T23:59:59Z') }, status: 'alpha' },
        select: { id: true },
      }),
      this.prisma.lmsModuleProgress.findFirst({
        where: { studentId, status: 'completed', completedAt: { gte: new Date(dateStr) } },
        select: { id: true },
      }),
      this.prisma.grade.findFirst({
        where: { studentId, createdAt: { gte: new Date(dateStr) } },
        select: { id: true },
      }),
    ]);

    const completion: Record<string, boolean> = {
      attendance: !todayAtt, // no alpha = completed
      module: !!lmsCompleted,
      grade: !!recentGrades,
      streak: false, // simplified — real streak check would compute consecutive days
      assignment: false, // would check assignment submission
    };

    return {
      date: dateStr,
      quests: quests.map((q) => ({ ...q, completed: completion[q.type] ?? false })),
    };
  }

  // ── T3-02 B2: Personal academic calendar (siswa/ortu) ─────────────────────

  /** B2: Build personal calendar from student's schedule + school calendar events. */
  async getPersonalCalendar(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { classId: true, class: { select: { id: true, name: true } } },
    });
    if (!student?.classId) return { schedule: [], events: [] };

    // Student's weekly schedule (class-based)
    const schedule = await this.prisma.schedule.findMany({
      where: { classId: student.classId },
      select: {
        id: true, dayOfWeek: true, jpStart: true, jpEnd: true, room: true,
        teachingAssignment: {
          select: {
            subject: true,
            teacher: { select: { user: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { jpStart: 'asc' }],
    });

    // School-wide calendar events
    const events = await this.prisma.academicCalendar.findMany({
      orderBy: { startDate: 'asc' },
      take: 20,
      select: { id: true, name: true, startDate: true, endDate: true, type: true, description: true },
    });

    return {
      className: student.class?.name ?? '-',
      schedule: schedule.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        jpStart: s.jpStart,
        jpEnd: s.jpEnd,
        room: s.room,
        subject: s.teachingAssignment?.subject ?? '-',
        teacher: s.teachingAssignment?.teacher?.user?.fullName ?? '-',
      })),
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        start: e.startDate.toISOString().slice(0, 10),
        end: e.endDate.toISOString().slice(0, 10),
        type: e.type,
        description: e.description,
      })),
    };
  }
}
