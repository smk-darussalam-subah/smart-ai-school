// =============================================================================
// BadgesService — badge system untuk prestasi siswa (P14 — W3-1).
// KS/SA: CRUD badge definitions · GURU/KS: award badge · SISWA: lihat own
// · ORANG_TUA: lihat child badges.
// Pola ownership/role mengikuti AssessmentService & RppService.
// =============================================================================

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { isElevated, resolveSiswaId, resolveUserId } from '../common/helpers/role-helpers';
import {
  AwardBadgeDto,
  CreateBadgeDto,
  ListBadgeDto,
} from './dto/badge.dto';

const BADGE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  icon: true,
  criteria: true,
  tier: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { studentBadges: true } },
} as const;

const STUDENT_BADGE_SELECT = {
  id: true,
  awardedAt: true,
  awardedBy: true,
  badge: {
    select: {
      id: true, code: true, name: true, description: true,
      icon: true, tier: true,
    },
  },
} as const;

@Injectable()
export class BadgesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Badge Definitions ──────────────────────────────────────────────────────

  async createBadge(dto: CreateBadgeDto, user: AuthUser) {
    // Only KS/SA can create badge definitions
    if (!isElevated(user)) {
      throw new ForbiddenException('Hanya KS/SA yang dapat membuat definisi badge');
    }
    return this.prisma.badge.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        icon: dto.icon,
        criteria: dto.criteria as Prisma.InputJsonValue,
        tier: dto.tier,
      },
      select: BADGE_SELECT,
    });
  }

  async findAll(query: ListBadgeDto) {
    const filters: Prisma.BadgeWhereInput = {
      isActive: true,
      ...(query.tier ? { tier: query.tier } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.badge.findMany({
        where: filters,
        orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: BADGE_SELECT,
      }),
      this.prisma.badge.count({ where: filters }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  // ── Student Badges ────────────────────────────────────────────────────────

  /** SISWA: list own badges */
  async findMyBadges(user: AuthUser) {
    const studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    return this.prisma.studentBadge.findMany({
      where: { studentId },
      orderBy: { awardedAt: 'desc' },
      select: STUDENT_BADGE_SELECT,
    });
  }

  /** ORANG_TUA: list child badges (with ownership check) */
  async findStudentBadges(studentId: string, user: AuthUser) {
    if (!user.roles.includes('ORANG_TUA') && !isElevated(user)) {
      throw new ForbiddenException('Akses ditolak');
    }

    if (user.roles.includes('ORANG_TUA') && !isElevated(user)) {
      // Verify ownership: studentId must belong to this parent
      const userId = await resolveUserId(this.prisma, user.keycloakId);
      const child = await this.prisma.student.findFirst({
        where: { id: studentId, parentId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!child) {
        throw new ForbiddenException('Siswa ini bukan anak Anda');
      }
    }

    return this.prisma.studentBadge.findMany({
      where: { studentId },
      orderBy: { awardedAt: 'desc' },
      select: STUDENT_BADGE_SELECT,
    });
  }

  /** GURU/KS: manually award a badge to a student */
  async awardBadge(dto: AwardBadgeDto, user: AuthUser) {
    if (!isElevated(user) && !user.roles.includes('GURU')) {
      throw new ForbiddenException('Hanya GURU/KS/SA yang dapat memberikan badge');
    }

    const userId = await resolveUserId(this.prisma, user.keycloakId);

    // Check badge exists and is active
    const badge = await this.prisma.badge.findUnique({
      where: { id: dto.badgeId },
      select: { id: true, name: true, isActive: true },
    });
    if (!badge) throw new NotFoundException('Badge tidak ditemukan');
    if (!badge.isActive) throw new ConflictException('Badge tidak aktif');

    // Check student exists
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');

    // Idempotency: check if already awarded (§17.5 #25)
    const existing = await this.prisma.studentBadge.findUnique({
      where: { badgeId_studentId: { badgeId: dto.badgeId, studentId: dto.studentId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Siswa sudah memiliki badge ini');
    }

    return this.prisma.studentBadge.create({
      data: {
        badgeId: dto.badgeId,
        studentId: dto.studentId,
        awardedBy: userId,
      },
      select: STUDENT_BADGE_SELECT,
    });
  }

  // ── Auto-Award (called by event listener) ────────────────────────────────

  /**
   * Check grade-based badge criteria after a grade is submitted.
   * Called by BadgesListener on GRADE_SUBMITTED event.
   * Fail-soft: errors are logged, not thrown (§17.5 #25).
   */
  async checkGradeBadges(studentId: string, subject: string, score: number): Promise<void> {
    try {
      const badges = await this.prisma.badge.findMany({
        where: {
          isActive: true,
          criteria: { path: ['type'], equals: 'grade_threshold' },
        },
        select: { id: true, name: true, criteria: true },
      });

      for (const badge of badges) {
        const criteria = badge.criteria as { type: string; threshold?: number; subject?: string };
        if (criteria.threshold === undefined) continue;
        if (criteria.subject && criteria.subject !== 'all' && criteria.subject !== subject) continue;

        if (score >= criteria.threshold) {
          await this.tryAwardBadge(badge.id, studentId, null);
        }
      }
    } catch (err) {
      logger.warn('[BadgesService] checkGradeBadges error (fail-soft)', {
        studentId, subject, score,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Try to award a badge idempotently. Returns true if awarded, false if already had it.
   * Internal method — callers must handle their own try/catch for fail-soft.
   */
  async tryAwardBadge(badgeId: string, studentId: string, awardedBy: string | null): Promise<boolean> {
    const existing = await this.prisma.studentBadge.findUnique({
      where: { badgeId_studentId: { badgeId, studentId } },
      select: { id: true },
    });
    if (existing) return false;

    await this.prisma.studentBadge.create({
      data: { badgeId, studentId, awardedBy },
    });
    logger.info('[BadgesService] Badge awarded', { badgeId, studentId });
    return true;
  }
}
