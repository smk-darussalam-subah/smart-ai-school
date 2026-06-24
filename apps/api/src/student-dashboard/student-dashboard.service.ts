// =============================================================================
// StudentDashboardService — W2-5 (SPP) + W2-6 (Assignments) + W2-7 (CP) +
// W2-8 (Leaderboard). SISWA→own data, ORANG_TUA→children data.
// Reuses existing Prisma models (SppPayment, LmsModule, Grade, AssessmentSession).
// No new tables — aggregation endpoints only.
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSiswaOnly,
  isOrangTuaOnly,
  resolveSiswaId,
  resolveUserId,
} from '../common/helpers/role-helpers';
import { naOf, NaComponents, KKM_DEFAULT } from '../analytics/analytics.math';

interface StudentBrief {
  id: string;
  nis: string;
  name: string;
  classId: string | null;
  className: string | null;
}

@Injectable()
export class StudentDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveStudents(user: AuthUser): Promise<StudentBrief[]> {
    if (isSiswaOnly(user)) {
      const id = await resolveSiswaId(this.prisma, user.keycloakId);
      return [await this.fetchBrief(id)];
    }
    if (isOrangTuaOnly(user)) {
      const userId = await resolveUserId(this.prisma, user.keycloakId);
      const children = await this.prisma.student.findMany({
        where: { parentId: userId, deletedAt: null },
        select: {
          id: true, nis: true,
          user: { select: { fullName: true } },
          class: { select: { name: true } },
          classId: true,
        },
      });
      return children.map((c) => ({
        id: c.id, nis: c.nis, name: c.user.fullName,
        classId: c.classId, className: c.class?.name ?? null,
      }));
    }
    throw new NotFoundException('Hanya SISWA dan ORANG_TUA yang dapat mengakses endpoint ini');
  }

  private async fetchBrief(id: string): Promise<StudentBrief> {
    const s = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, nis: true, classId: true,
        user: { select: { fullName: true } },
        class: { select: { name: true } },
      },
    });
    if (!s) throw new NotFoundException('Siswa tidak ditemukan');
    return {
      id: s.id, nis: s.nis, name: s.user.fullName,
      classId: s.classId, className: s.class?.name ?? null,
    };
  }

  // ── W2-5: SPP Payments ────────────────────────────────────────────────────

  async getSpp(user: AuthUser) {
    const students = await this.resolveStudents(user);
    const data = await Promise.all(
      students.map(async (s) => {
        const payments = await this.prisma.sppPayment.findMany({
          where: { studentId: s.id },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          select: {
            id: true, month: true, year: true, amount: true, status: true,
            paidAt: true, receiptNo: true,
          },
        });
        return {
          studentId: s.id,
          studentName: s.name,
          payments: payments.map((p) => ({
            id: p.id,
            month: p.month,
            year: p.year,
            amount: Number(p.amount),
            status: p.status,
            paidAt: p.paidAt?.toISOString() ?? null,
            receiptNo: p.receiptNo,
          })),
        };
      }),
    );
    return { data };
  }

  // ── W2-6: Assignments (LMS modules + assessment sessions) ─────────────────

  async getAssignments(user: AuthUser) {
    const students = await this.resolveStudents(user);
    const data = await Promise.all(
      students.map(async (s) => {
        // LMS modules published for this student's class
        const lmsWhere = {
          status: 'published' as const,
          OR: [{ classId: s.classId ?? undefined }, { classId: null }],
        };
        const modules = await this.prisma.lmsModule.findMany({
          where: lmsWhere,
          orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }],
          select: {
            id: true, title: true, subject: true, kktp: true,
            teacher: { select: { user: { select: { fullName: true } } } },
            progress: {
              where: { studentId: s.id },
              select: { progress: true, status: true, completedAt: true },
            },
          },
        });
        const moduleAssignments = modules.map((m) => {
          const prog = m.progress[0];
          const status = !prog ? 'pending' : prog.status === 'completed' ? 'graded' : 'submitted';
          return {
            id: m.id,
            type: 'lms' as const,
            title: m.title,
            subject: m.subject,
            guru: m.teacher.user.fullName,
            status,
            progress: prog?.progress ?? 0,
            kktp: m.kktp,
          };
        });

        // Assessment sessions (active/completed) for this student's class
        const sessions = await this.prisma.assessmentSession.findMany({
          where: {
            status: { in: ['active', 'completed'] },
            OR: [{ classId: s.classId ?? undefined }, { classId: null }],
          },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true, title: true, type: true, status: true,
            module: { select: { subject: true } },
            responses: {
              where: { studentId: s.id },
              select: { score: true, submittedAt: true },
            },
          },
        });
        const sessionAssignments = sessions.map((sess) => {
          const resp = sess.responses[0];
          const status = !resp ? 'pending' : resp.score !== null ? 'graded' : 'submitted';
          return {
            id: sess.id,
            type: 'assessment' as const,
            title: sess.title,
            subject: sess.module?.subject ?? '—',
            guru: null,
            status,
            progress: resp?.score ?? 0,
            kktp: KKM_DEFAULT,
          };
        });

        return {
          studentId: s.id,
          studentName: s.name,
          assignments: [...moduleAssignments, ...sessionAssignments],
        };
      }),
    );
    return { data };
  }

  // ── W2-7: CP Progress (NA per subject) ─────────────────────────────────────

  async getCpProgress(user: AuthUser) {
    const students = await this.resolveStudents(user);
    const data = await Promise.all(
      students.map(async (s) => {
        const grades = await this.prisma.grade.findMany({
          where: { studentId: s.id },
          select: {
            score: true, type: true,
            assignment: { select: { subject: true } },
            academicYear: true, semester: true,
          },
        });

        // Group by subject → type → scores
        const bySubject = new Map<string, NaComponents>();
        for (const g of grades) {
          const subject = g.assignment.subject;
          const comp = bySubject.get(subject) ?? {};
          const score = Number(g.score);
          if (g.type === 'uh') comp.uh = avg(comp.uh, score);
          else if (g.type === 'praktik') comp.praktik = avg(comp.praktik, score);
          else if (g.type === 'sikap') comp.sikap = avg(comp.sikap, score);
          else if (g.type === 'uts') comp.uts = avg(comp.uts, score);
          else if (g.type === 'uas') comp.uas = avg(comp.uas, score);
          bySubject.set(subject, comp);
        }

        const subjects = [...bySubject.entries()].map(([subject, comp]) => {
          const na = naOf(comp);
          return {
            subject,
            na,
            kktp: KKM_DEFAULT,
            status: na !== null ? (na >= KKM_DEFAULT ? 'tuntas' : 'remedial') : null,
            components: {
              uh: comp.uh ?? null,
              praktik: comp.praktik ?? null,
              sikap: comp.sikap ?? null,
              uts: comp.uts ?? null,
              uas: comp.uas ?? null,
            },
          };
        });

        return {
          studentId: s.id,
          studentName: s.name,
          subjects,
        };
      }),
    );
    return { data };
  }

  // ── W2-8: Leaderboard (class ranking by average NA) ────────────────────────

  async getLeaderboard(user: AuthUser) {
    const students = await this.resolveStudents(user);
    const data = await Promise.all(
      students.map(async (s) => {
        if (!s.classId) {
          return { studentId: s.id, studentName: s.name, className: null, entries: [] };
        }

        // Get all active students in the same class
        const classmates = await this.prisma.student.findMany({
          where: { classId: s.classId, deletedAt: null, status: 'active' },
          select: { id: true, nis: true, user: { select: { fullName: true } } },
        });

        // Compute average NA for each classmate
        const entries = await Promise.all(
          classmates.map(async (c) => {
            const grades = await this.prisma.grade.findMany({
              where: { studentId: c.id },
              select: { score: true, type: true, assignment: { select: { subject: true } } },
            });

            const bySubject = new Map<string, NaComponents>();
            for (const g of grades) {
              const subject = g.assignment.subject;
              const comp = bySubject.get(subject) ?? {};
              const score = Number(g.score);
              if (g.type === 'uh') comp.uh = avg(comp.uh, score);
              else if (g.type === 'praktik') comp.praktik = avg(comp.praktik, score);
              else if (g.type === 'sikap') comp.sikap = avg(comp.sikap, score);
              else if (g.type === 'uts') comp.uts = avg(comp.uts, score);
              else if (g.type === 'uas') comp.uas = avg(comp.uas, score);
              bySubject.set(subject, comp);
            }

            const nas = [...bySubject.values()].map((comp) => naOf(comp)).filter((v): v is number => v !== null);
            const avgNa = nas.length > 0 ? Math.round((nas.reduce((a, b) => a + b, 0) / nas.length) * 10) / 10 : null;

            return {
              studentId: c.id,
              name: c.user.fullName,
              avgNa,
              isMe: c.id === s.id,
            };
          }),
        );

        // Sort by avgNa descending, nulls last
        entries.sort((a, b) => {
          if (a.avgNa === null && b.avgNa === null) return 0;
          if (a.avgNa === null) return 1;
          if (b.avgNa === null) return -1;
          return b.avgNa - a.avgNa;
        });

        // Assign ranks (1-based, ties get same rank)
        let rank = 0;
        let prevScore: number | null = null;
        const ranked = entries.map((e, idx) => {
          if (e.avgNa !== prevScore) {
            rank = idx + 1;
            prevScore = e.avgNa;
          }
          return { ...e, rank };
        });

        return {
          studentId: s.id,
          studentName: s.name,
          className: s.className,
          entries: ranked,
        };
      }),
    );
    return { data };
  }
}

/** Helper: compute running average for a component (last value wins per type, then average within type). */
function avg(existing: number | undefined, newScore: number): number {
  // For simplicity, take the latest score per type (same as analytics service)
  // In a full implementation, this would average all scores of the same type
  return newScore;
}
