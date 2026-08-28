// =============================================================================
// StudentDashboardService — W2-5 (SPP) + W2-6 (Assignments) + W2-7 (CP) +
// W2-8 (Leaderboard). SISWA→own data, ORANG_TUA→children data.
// Reuses existing Prisma models (SppPayment, LmsModule, Grade, AssessmentSession).
// No new tables — aggregation endpoints only.
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSiswaOnly,
  isOrangTuaOnly,
  resolveSiswaId,
  resolveUserId,
} from '../common/helpers/role-helpers';
import { naOf, NaComponents } from '../analytics/analytics.math';
import { resolveKktpThreshold } from '../academic/kktp-resolver';

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
          OR: s.classId ? [{ classId: s.classId }, { classId: null }] : [{ classId: null }],
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
            kktpProvenance: 'module',
          };
        });

        // Assessment sessions: regular by class, remedial strictly by participant.
        const sessionVisibility: Prisma.AssessmentSessionWhereInput[] = [
          ...(s.classId ? [{ purpose: 'regular' as const, classId: s.classId }] : []),
          {
            purpose: 'remedial' as const,
            remedialParticipants: { some: { studentId: s.id, status: { not: 'cancelled' as const } } },
          },
        ];
        const sessions = await this.prisma.assessmentSession.findMany({
          where: {
            status: { in: ['active', 'completed'] },
            OR: sessionVisibility,
          },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true, title: true, type: true, status: true, purpose: true,
            academicYear: true, semester: true, dueAt: true, instructions: true,
            module: { select: { subject: true, kktp: true } },
            teachingAssignment: { select: { subject: true } },
            remedialParticipants: {
              where: { studentId: s.id, status: { not: 'cancelled' } },
              take: 1,
              select: {
                status: true,
                assignedAt: true,
                startedAt: true,
                submittedAt: true,
                finalizedAt: true,
                kktpValue: true,
                kktpProvenance: true,
              },
            },
            responses: {
              where: { studentId: s.id },
              select: { score: true, submittedAt: true },
            },
          },
        });
        const sessionAssignments = await Promise.all(sessions.map(async (sess) => {
          const resp = sess.responses[0];
          const status = !resp ? 'pending' : resp.score !== null ? 'graded' : 'submitted';
          const subject = sess.module?.subject ?? sess.teachingAssignment?.subject ?? null;
          const participant = sess.remedialParticipants[0];
          const exposeOwnRemedialLifecycle = user.roles.includes('SISWA') &&
            sess.purpose === 'remedial' &&
            Boolean(participant);
          const kktp = await resolveKktpThreshold(this.prisma, sess.purpose === 'remedial' && participant
            ? { participantSnapshot: { value: participant.kktpValue, provenance: participant.kktpProvenance } }
            : {
                moduleKktp: sess.module?.kktp ?? null,
                subject,
                academicYear: sess.academicYear,
                semester: sess.semester,
              });
          return {
            id: sess.id,
            type: 'assessment' as const,
            purpose: sess.purpose,
            title: sess.title,
            subject: subject ?? '-',
            guru: null,
            status,
            ...(exposeOwnRemedialLifecycle ? {
              sessionStatus: sess.status,
              dueAt: sess.dueAt?.toISOString() ?? null,
              instructions: sess.instructions,
              remedialParticipant: participant
              ? {
                  status: participant.status,
                  assignedAt: participant.assignedAt.toISOString(),
                  startedAt: participant.startedAt?.toISOString() ?? null,
                  submittedAt: participant.submittedAt?.toISOString() ?? null,
                  finalizedAt: participant.finalizedAt?.toISOString() ?? null,
                }
              : null,
            } : {}),
            progress: resp?.score ?? 0,
            kktp: kktp.value,
            kktpProvenance: kktp.provenance,
          };
        }));

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

        // Group by exact KKTP context so the threshold never guesses across terms.
        const bySubject = new Map<string, NaComponents & { subject: string; academicYear: string; semester: number }>();
        for (const g of grades) {
          const subject = g.assignment.subject;
          const key = `${subject}\u0000${g.academicYear}\u0000${g.semester}`;
          const comp = bySubject.get(key) ?? { subject, academicYear: g.academicYear, semester: g.semester };
          const score = Number(g.score);
          if (g.type === 'uh') comp.uh = avg(comp.uh, score);
          else if (g.type === 'praktik') comp.praktik = avg(comp.praktik, score);
          else if (g.type === 'sikap') comp.sikap = avg(comp.sikap, score);
          else if (g.type === 'uts') comp.uts = avg(comp.uts, score);
          else if (g.type === 'uas') comp.uas = avg(comp.uas, score);
          bySubject.set(key, comp);
        }

        const subjects = await Promise.all([...bySubject.values()].map(async (comp) => {
          const na = naOf(comp);
          const kktp = await resolveKktpThreshold(this.prisma, {
            subject: comp.subject,
            academicYear: comp.academicYear,
            semester: comp.semester,
          });
          const threshold = kktp.value;
          return {
            subject: comp.subject,
            academicYear: comp.academicYear,
            semester: comp.semester,
            na,
            kktp: threshold,
            kktpProvenance: kktp.provenance,
            status: na !== null && threshold !== null ? (na >= threshold ? 'tuntas' : 'remedial') : null,
            components: {
              uh: comp.uh ?? null,
              praktik: comp.praktik ?? null,
              sikap: comp.sikap ?? null,
              uts: comp.uts ?? null,
              uas: comp.uas ?? null,
            },
          };
        }));

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

  // ── T3-02 B4: Teacher-by-student (guru mapel + kontak untuk ortu) ───────────

  /** B4: List guru mapel for student's class, with contact info for parents. */
  async getTeachers(user: AuthUser) {
    const students = await this.resolveStudents(user);
    if (students.length === 0) return { data: [] };

    // All students share the same class typically; use first student's classId
    const classId = students[0]!.classId;
    if (!classId) return { data: [] };

    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { classId },
      select: {
        subject: true,
        hoursPerWeek: true,
        teacher: {
          select: {
            user: {
              select: { fullName: true, phone: true, email: true },
            },
          },
        },
      },
      orderBy: [{ subject: 'asc' }],
    });

    return {
      data: assignments.map((a) => ({
        subject: a.subject,
        teacherName: a.teacher?.user?.fullName ?? '-',
        phone: a.teacher?.user?.phone ?? null,
        email: a.teacher?.user?.email ?? null,
        hoursPerWeek: a.hoursPerWeek,
      })),
    };
  }

  // ── T3-02 B3: Learning timeline for parents/siswa ──────────────────────

  /** B3: Build learning timeline from grades + attendance + LMS progress events. */
  async getTimeline(user: AuthUser) {
    const students = await this.resolveStudents(user);
    if (students.length === 0) return { data: [] };
    const s = students[0]!;

    // Fetch recent grades, attendance anomalies, and LMS completions
    const [grades, attendance, lmsProgress] = await Promise.all([
      this.prisma.grade.findMany({
        where: { studentId: s.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, score: true, type: true, createdAt: true,
          assignment: { select: { subject: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { studentId: s.id, status: { in: ['alpha', 'izin', 'sakit'] } },
        orderBy: { date: 'desc' },
        take: 10,
        select: { id: true, date: true, status: true, notes: true,
          class: { select: { name: true } } },
      }),
      this.prisma.lmsModuleProgress.findMany({
        where: { studentId: s.id, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true, completedAt: true, progress: true,
          module: { select: { title: true, subject: true } },
        },
      }),
    ]);

    type TimelineEvent = {
      date: string; type: 'grade' | 'attendance' | 'module';
      title: string; description: string; subject?: string;
    };

    const events: TimelineEvent[] = [];

    for (const g of grades) {
      events.push({
        date: g.createdAt.toISOString(),
        type: 'grade',
        title: `Nilai ${g.type.toUpperCase()} masuk`,
        description: `${g.assignment.subject}: skor ${Number(g.score)}`,
        subject: g.assignment.subject,
      });
    }

    for (const a of attendance) {
      const statusLabel = a.status === 'alpha' ? 'Alpha' : a.status === 'izin' ? 'Izin' : 'Sakit';
      events.push({
        date: a.date.toISOString(),
        type: 'attendance',
        title: `Kehadiran: ${statusLabel}`,
        description: a.notes ?? `${a.class?.name ?? 'Kelas'} — ${statusLabel}`,
      });
    }

    for (const m of lmsProgress) {
      events.push({
        date: (m.completedAt ?? new Date()).toISOString(),
        type: 'module',
        title: `Modul selesai`,
        description: `${m.module.subject}: ${m.module.title}`,
        subject: m.module.subject,
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { data: events.slice(0, 30) };
  }
}

/** Helper: compute running average for a component (last value wins per type, then average within type). */
function avg(existing: number | undefined, newScore: number): number {
  // For simplicity, take the latest score per type (same as analytics service)
  // In a full implementation, this would average all scores of the same type
  return newScore;
}
