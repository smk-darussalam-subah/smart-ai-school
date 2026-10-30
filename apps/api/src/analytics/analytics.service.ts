// =============================================================================
// AnalyticsService — agregasi untuk Dasbor Eksekutif (KS/SA).
// Pola agregasi meniru attendance.heatmap() & finance.summary():
// Prisma groupBy/findMany ter-filter → post-process in-memory.
// Semua keluaran AGREGAT (tanpa PII per-siswa) — aman untuk konsumsi eksekutif.
// =============================================================================

import { Injectable, ForbiddenException } from '@nestjs/common';
import { readSchedulingMonitoring, type MonitoringCapabilities } from './scheduling-dashboard';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { AttendanceQuerySchema } from '../staff-attendance/staff-attendance.dto';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { resolveOwnTeachingRead } from '../common/helpers/own-teaching-read';
import { SchoolConfigService } from '../school-config/school-config.service';
import { readAttendancePeriod } from '../attendance/attendance-period';
import {
  isGuruOnly,
  isSiswaOnly,
  isOrangTuaOnly,
  resolveSiswaId,
  resolveTeacherId,
  resolveGuruClassIds,
  resolveUserId,
} from '../common/helpers/role-helpers';
import { AnalyticsQuery, CpProgressQuery, StudentAnalyticsQuery } from './dto/analytics-query.dto';
import {
  AGING_BUCKETS,
  AT_RISK_ALPHA_MIN,
  AT_RISK_WINDOW_DAYS,
  NaComponents,
  agingBucketIndex,
  diffDays,
  kkmPassRate,
  mean,
  naOf,
  pearson,
  round1,
  summarize,
} from './analytics.math';
import { resolveKktpThreshold, type ResolvedKktp } from '../academic/kktp-resolver';

const MATRIX_SUBJECT_LIMIT = 6; // kolom heatmap KKM agar terbaca
const SCATTER_POINT_CAP = 160; // batas titik scatter yang dikirim (r dihitung dari semua)

interface Period {
  academicYear: string;
  semester: number;
}

export function jakartaDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function databaseDateRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolConfigService,
    private readonly staff: StaffAttendanceService,
  ) {}

  // ── Helper periode aktif ──────────────────────────────────────────────────
  private async resolvePeriod(query: AnalyticsQuery): Promise<Period> {
    if (query.academicYear && query.semester) {
      return { academicYear: query.academicYear, semester: query.semester };
    }
    try {
      const sem = await this.school.getActiveSemester();
      return {
        academicYear: query.academicYear ?? sem.academicYear.code,
        semester: query.semester ?? sem.number,
      };
    } catch {
      // Tak ada semester aktif → turunkan dari tanggal (Jul=awal TA baru).
      const now = new Date();
      const y = now.getUTCFullYear();
      const fallbackYear = now.getUTCMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
      return {
        academicYear: query.academicYear ?? fallbackYear,
        semester: query.semester ?? 1,
      };
    }
  }

  private gradeWhere(period: Period, query: AnalyticsQuery): Prisma.GradeWhereInput {
    return {
      academicYear: period.academicYear,
      semester: period.semester,
      ...(query.classId || query.majorCode ? { assignment: {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
      } } : {}),
    };
  }

  private async resolveKktpCatalog(subjects: Iterable<string>, period: Period) {
    const uniqueSubjects = [...new Set(subjects)].sort((a, b) => a.localeCompare(b));
    const entries = await Promise.all(
      uniqueSubjects.map(
        async (subject) =>
          [
            subject,
            await resolveKktpThreshold(this.prisma, {
              subject,
              academicYear: period.academicYear,
              semester: period.semester,
            }),
          ] as const,
      ),
    );
    return new Map<string, ResolvedKktp>(entries);
  }

  private kktpValue(catalog: Map<string, ResolvedKktp>, subject: string): number | null {
    return catalog.get(subject)?.value ?? null;
  }

  // ── 1. Analitik nilai: distribusi + ketuntasan KKM + korelasi ─────────────
  async grades(query: AnalyticsQuery) {
    const period = await this.resolvePeriod(query);
    const where = this.gradeWhere(period, query);

    const rows = await this.prisma.grade.findMany({
      where,
      select: {
        score: true,
        assignment: {
          select: { subject: true, class: { select: { majorCode: true } } },
        },
      },
    });

    const all: number[] = [];
    const byMajor = new Map<string, number[]>();
    const bySubject = new Map<string, number[]>();
    const matrix = new Map<string, number[]>(); // `${major}|${subject}`

    const kktpCatalog = await this.resolveKktpCatalog(
      rows.map((row) => row.assignment.subject),
      period,
    );
    const passByMajor = new Map<string, { passed: number; total: number }>();
    let overallPassed = 0;
    let overallComparable = 0;

    for (const r of rows) {
      const s = Number(r.score);
      const major = r.assignment.class?.majorCode ?? '—';
      const subject = r.assignment.subject;
      all.push(s);
      pushTo(byMajor, major, s);
      pushTo(bySubject, subject, s);
      pushTo(matrix, `${major}|${subject}`, s);
      const threshold = this.kktpValue(kktpCatalog, subject);
      if (threshold !== null) {
        const majorPass = passByMajor.get(major) ?? { passed: 0, total: 0 };
        majorPass.total += 1;
        overallComparable += 1;
        if (s >= threshold) {
          majorPass.passed += 1;
          overallPassed += 1;
        }
        passByMajor.set(major, majorPass);
      }
    }

    // byMajor (box-plot)
    const majorRows = [...byMajor.entries()]
      .map(([majorCode, scores]) => ({
        majorCode,
        ...summarize(scores),
        kkmPassRate: passByMajor.get(majorCode)?.total
          ? round1((passByMajor.get(majorCode)!.passed / passByMajor.get(majorCode)!.total) * 100)
          : null,
      }))
      .sort((a, b) => a.majorCode.localeCompare(b.majorCode));

    // bySubject (ringkas, urut jumlah terbanyak)
    const subjectRows = [...bySubject.entries()]
      .map(([subject, scores]) => ({
        subject,
        count: scores.length,
        mean: round1(mean(scores)),
        kkmPassRate:
          this.kktpValue(kktpCatalog, subject) === null
            ? null
            : kkmPassRate(scores, this.kktpValue(kktpCatalog, subject)!),
        kktp: this.kktpValue(kktpCatalog, subject),
        kktpProvenance: kktpCatalog.get(subject)?.provenance ?? 'unconfigured',
      }))
      .sort((a, b) => b.count - a.count);

    // Matriks KKM: jurusan × mapel (top-N mapel agar terbaca)
    const majors = majorRows.map((m) => m.majorCode);
    const subjects = subjectRows.slice(0, MATRIX_SUBJECT_LIMIT).map((s) => s.subject);
    const cells = [];
    for (const major of majors) {
      for (const subject of subjects) {
        const scores = matrix.get(`${major}|${subject}`) ?? [];
        cells.push({
          majorCode: major,
          subject,
          count: scores.length,
          passRate:
            scores.length && this.kktpValue(kktpCatalog, subject) !== null
              ? kkmPassRate(scores, this.kktpValue(kktpCatalog, subject)!)
              : null,
          kktp: this.kktpValue(kktpCatalog, subject),
        });
      }
    }

    const correlation = await this.correlation(period, query, where);

    return {
      filters: {
        ...period,
        kkm: null,
        thresholdMode: 'authoritative_per_subject',
        majorCode: query.majorCode ?? null,
        classId: query.classId ?? null,
      },
      overall: {
        ...summarize(all),
        kkmPassRate:
          overallComparable > 0 ? round1((overallPassed / overallComparable) * 100) : null,
      },
      byMajor: majorRows,
      bySubject: subjectRows,
      kkmMatrix: { majors, subjects, cells },
      kktpCatalog: [...kktpCatalog.entries()].map(([subject, value]) => ({ subject, ...value })),
      correlation,
    };
  }

  // ── Korelasi kehadiran (%) per siswa vs rata² nilai per siswa ──────────────
  private async correlation(
    period: Period,
    query: AnalyticsQuery,
    gradeWhere: Prisma.GradeWhereInput,
  ) {
    const official = await readAttendancePeriod(this.prisma, period);
    const from = official.startDate;
    const today = new Date(`${jakartaDateKey(new Date())}T00:00:00.000Z`);
    const to = official.endDate < today ? official.endDate : today;
    const basis = { unit: 'student_daily' as const, from: from.toISOString().slice(0, 10),
      to: from <= to ? to.toISOString().slice(0, 10) : null };
    if (from > to) return { r: 0, n: 0, points: [], basis };

    const [attGroups, gradeGroups] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        where: { date: { gte: from, lte: to },
          ...(query.classId ? { classId: query.classId } : {}),
          class: { academicYear: period.academicYear, ...(query.majorCode ? { majorCode: query.majorCode } : {}) },
        },
        _count: { _all: true },
      }),
      this.prisma.grade.groupBy({
        by: ['studentId'],
        where: gradeWhere,
        _avg: { score: true },
      }),
    ]);

    const attTotal = new Map<string, { hadir: number; total: number }>();
    for (const g of attGroups) {
      const cur = attTotal.get(g.studentId) ?? { hadir: 0, total: 0 };
      cur.total += g._count._all;
      if (g.status === 'hadir') cur.hadir += g._count._all;
      attTotal.set(g.studentId, cur);
    }

    const xs: number[] = [];
    const ys: number[] = [];
    for (const g of gradeGroups) {
      const att = attTotal.get(g.studentId);
      if (!att || att.total === 0 || g._avg.score === null) continue;
      xs.push(round1((att.hadir / att.total) * 100));
      ys.push(round1(Number(g._avg.score)));
    }

    const r = pearson(xs, ys);
    // Sampling titik (deterministik via stride) agar payload ringkas.
    const n = xs.length;
    const stride = n > SCATTER_POINT_CAP ? Math.ceil(n / SCATTER_POINT_CAP) : 1;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i += stride) points.push({ x: xs[i]!, y: ys[i]! });

    return { r, n, points, basis };
  }

  // ── 2. Siswa berisiko (alpha kronis) — agregat tanpa PII ──────────────────
  async atRisk(query: AnalyticsQuery) {
    const since = new Date(Date.now() - AT_RISK_WINDOW_DAYS * 86_400_000);
    const grouped = await this.prisma.attendance.groupBy({
      by: ['studentId'],
      where: { status: 'alpha', date: { gte: since } },
      _count: { _all: true },
    });
    const riskyIds = grouped
      .filter((g) => g._count._all >= AT_RISK_ALPHA_MIN)
      .map((g) => g.studentId);

    if (riskyIds.length === 0) {
      return {
        total: 0,
        byClass: [],
        windowDays: AT_RISK_WINDOW_DAYS,
        threshold: AT_RISK_ALPHA_MIN,
      };
    }

    const students = await this.prisma.student.findMany({
      where: {
        id: { in: riskyIds },
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
      },
      select: { class: { select: { name: true, grade: true, majorCode: true } } },
    });

    const byClassMap = new Map<
      string,
      { className: string; majorCode: string; grade: number; count: number }
    >();
    for (const s of students) {
      if (!s.class) continue;
      const key = s.class.name;
      const cur = byClassMap.get(key) ?? {
        className: s.class.name,
        majorCode: s.class.majorCode,
        grade: s.class.grade,
        count: 0,
      };
      cur.count += 1;
      byClassMap.set(key, cur);
    }

    const byClass = [...byClassMap.values()].sort((a, b) => b.count - a.count);
    const total = byClass.reduce((sum, c) => sum + c.count, 0);
    return { total, byClass, windowDays: AT_RISK_WINDOW_DAYS, threshold: AT_RISK_ALPHA_MIN };
  }

  // ── 3. Aging tunggakan SPP (unpaid/late) ──────────────────────────────────
  async financeAging(query: AnalyticsQuery) {
    const rows = await this.prisma.sppPayment.findMany({
      where: {
        status: { in: ['unpaid', 'late'] },
        ...(query.classId || query.majorCode ? { student: {
          ...(query.classId ? { classId: query.classId } : {}),
          ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
        } } : {}),
      },
      select: { amount: true, month: true, year: true, studentId: true },
    });

    const today = new Date();
    const buckets = AGING_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      amount: 0,
      students: new Set<string>(),
    }));
    const allStudents = new Set<string>();
    let totalAmount = 0;

    for (const r of rows) {
      const periodStart = new Date(Date.UTC(r.year, r.month - 1, 1));
      const age = diffDays(today, periodStart);
      const idx = agingBucketIndex(age);
      const b = buckets[idx]!;
      const amt = Number(r.amount);
      b.amount += amt;
      b.students.add(r.studentId);
      totalAmount += amt;
      allStudents.add(r.studentId);
    }

    return {
      buckets: buckets.map((b) => ({
        key: b.key,
        label: b.label,
        amount: Math.round(b.amount),
        students: b.students.size,
      })),
      totalAmount: Math.round(totalAmount),
      totalStudents: allStudents.size,
      scope: { period: 'all_years' as const, majorCode: query.majorCode || null, classId: query.classId || null },
    };
  }

  // ── 4. Kepatuhan guru: kehadiran GPS hari ini + RPP approval rate ─────────
  async teacherCompliance(query: AnalyticsQuery, canReadRpp = false, canReadAssignments = false, canReadStudents = false) {
    if (
      (query.classId || query.majorCode || query.teacherId || query.subject) &&
      !canReadAssignments
    )
      throw new ForbiddenException('Izin membaca cakupan penugasan tidak tersedia');
    const active =
      query.academicYear && query.semester ? null : await this.school.getActiveSemester();
    const period = {
      academicYear: query.academicYear ?? active!.academicYear.code,
      semester: query.semester ?? active!.number,
    };
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));

    const teacherIds =
      query.classId || query.majorCode || query.teacherId || query.subject
        ? (
            await this.prisma.teachingAssignment.findMany({
              where: {
                academicYear: period.academicYear,
                ...(query.classId ? { classId: query.classId } : {}),
                ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
                ...(query.teacherId ? { teacherId: query.teacherId } : {}),
                ...(query.subject ? { subject: query.subject } : {}),
              },
              select: { teacherId: true },
              distinct: ['teacherId'],
            })
          ).map((row) => row.teacherId)
        : undefined;
    const [report, rppGroups, studentsActive] = await Promise.all([
      this.staff.report(
        AttendanceQuerySchema.parse({
          from: today.toISOString().slice(0, 10),
          to: today.toISOString().slice(0, 10),
          unit: 'TEACHER',
        }),
        teacherIds,
      ),
      canReadRpp
        ? this.prisma.rpp.groupBy({
            by: ['status'],
            where: {
              academicYear: period.academicYear,
              semester: period.semester,
              ...(teacherIds ? { teacherId: { in: teacherIds } } : {}),
              ...(query.classId ? { classId: query.classId } : {}),
              ...(query.subject ? { subject: query.subject } : {}),
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canReadStudents ? this.prisma.student.count({ where: {
        status: 'active', deletedAt: null,
        user: { isActive: true, deletedAt: null },
        class: { isActive: true, academicYear: period.academicYear,
          ...(query.majorCode ? { majorCode: query.majorCode } : {}),
          ...(query.classId ? { id: query.classId } : {}),
        },
      } }) : Promise.resolve(null),
    ]);

    const rpp = { draft: 0, submitted: 0, approved: 0, revision: 0, curriculum_reviewed: 0 };
    for (const g of rppGroups) {
      if (g.status in rpp) rpp[g.status as keyof typeof rpp] = g._count._all;
    }
    const rppActive = rpp.submitted + rpp.approved + rpp.revision + rpp.curriculum_reviewed;
    const approvalRate = rppActive > 0 ? round1((rpp.approved / rppActive) * 100) : null;

    const canonical = report.teacherSummary;
    const totalTeachers = canonical.total,
      presentToday = canonical.present;
    // GPS verifies location of a recorded arrival, not the obligation/absence of every teacher.
    const gpsPct = presentToday > 0 ? round1((canonical.inside / presentToday) * 100) : null;
    const attendancePct =
      canonical.unknown === 0 && canonical.dueRequired > 0
        ? round1((canonical.presentRequired / canonical.dueRequired) * 100)
        : null;

    return {
      totalTeachers,
      studentsActive,
      scope: { academicYear: period.academicYear, semester: period.semester, majorCode: query.majorCode ?? null, classId: query.classId ?? null },
      presentToday,
      gpsPct,
      attendancePct,
      attendance: {
        ...canonical,
        date: today.toISOString().slice(0, 10),
        source: 'StaffAttendance',
        unit: 'teacher_daily_arrivals',
      },
      rpp: {
        ...rpp,
        total: rpp.draft + rppActive,
        approvalRate,
        state: canReadRpp ? 'ready' : 'denied',
      },
      // Sub-metrik ketepatan input nilai/absen = Fase 2 (butuh modul KBM 2M).
    };
  }

  // ── T3-02 B7: Rekap audit per guru×kelas×mapel ────────────────────────────

  /** B7: Aggregate grades by teacher × class × subject for KS audit recap. */
  async rekapAudit(query: AnalyticsQuery) {
    const period = await this.resolvePeriod(query);
    const where = {
      academicYear: period.academicYear,
      semester: period.semester,
      assignment: {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
        ...(query.subject ? { subject: query.subject } : {}),
      },
    };

    // Fetch all grades with assignment details (includes teacher + class + subject)
    const grades = await this.prisma.grade.findMany({
      where,
      select: {
        score: true,
        type: true,
        assignment: {
          select: {
            id: true,
            teacherId: true,
            classId: true,
            subject: true,
            teacher: {
              select: { user: { select: { fullName: true } } },
            },
            class: { select: { name: true } },
          },
        },
      },
    });

    // Names are labels only; homonyms and competency-specific assignments remain distinct.
    const key = (g: (typeof grades)[0]) => g.assignment.id;

    const grouped = new Map<
      string,
      {
        assignmentId: string;
        teacherId: string;
        classId: string;
        scores: number[];
        teacher: string;
        className: string;
        subject: string;
      }
    >();
    for (const g of grades) {
      const k = key(g);
      const entry = grouped.get(k) ?? {
        assignmentId: g.assignment.id,
        teacherId: g.assignment.teacherId,
        classId: g.assignment.classId,
        scores: [] as number[],
        teacher: g.assignment.teacher?.user?.fullName ?? '-',
        className: g.assignment.class?.name ?? '-',
        subject: g.assignment.subject,
      };
      entry.scores.push(Number(g.score));
      grouped.set(k, entry);
    }

    const kktpCatalog = await this.resolveKktpCatalog(
      grades.map((grade) => grade.assignment.subject),
      period,
    );
    const result = [...grouped.values()]
      .map((e) => {
        const avg =
          e.scores.length > 0
            ? Math.round((e.scores.reduce((a, b) => a + b, 0) / e.scores.length) * 100) / 100
            : 0;
        const kktp = this.kktpValue(kktpCatalog, e.subject);
        const tuntas = kktp === null ? 0 : e.scores.filter((s) => s >= kktp).length;
        return {
          assignmentId: e.assignmentId,
          teacherId: e.teacherId,
          classId: e.classId,
          teacher: e.teacher,
          className: e.className,
          subject: e.subject,
          count: e.scores.length,
          average: avg,
          tuntasCount: tuntas,
          tuntasPct:
            e.scores.length > 0 && kktp !== null
              ? Math.round((tuntas / e.scores.length) * 100)
              : null,
          kktp,
          kktpProvenance: kktpCatalog.get(e.subject)?.provenance ?? 'unconfigured',
        };
      })
      .sort((a, b) => a.teacher.localeCompare(b.teacher) || a.subject.localeCompare(b.subject));

    return { data: result, thresholdMode: 'authoritative_per_subject' };
  }

  // ── T3-02 B6: Monitoring KBM (guru × kelas × mapel real-time status) ──────

  /** Domain-gated monitoring with stable IDs and explicit availability. */
  async monitoringKbm(query: AnalyticsQuery, now = new Date(), caps?: MonitoringCapabilities) {
    const period =
      query.academicYear && query.semester
        ? { academicYear: query.academicYear, semester: query.semester }
        : await this.school.getActiveSemester().then((semester) => ({
            academicYear: semester.academicYear.code,
            semester: semester.number,
          }));
    return readSchedulingMonitoring(
      this.prisma,
      {
        ...query,
        academicYear: query.academicYear ?? period.academicYear,
        semester: query.semester ?? period.semester,
      },
      caps,
      now,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // W2-A-3: CP Progress — progres ketercapaian per mapel + breakdown per CP.
  // Diagregasi dari Grade (NA per subject) + LmsModuleProgress.
  // Dipakai PembelajaranGuru + CapaianRapor untuk menggantikan MAPEL_PROG/CP_DATA/CP_RAPOR.
  // ═══════════════════════════════════════════════════════════════════════════

  async cpProgress(query: CpProgressQuery, user: AuthUser) {
    const ownTeacherId = await resolveOwnTeachingRead(
      this.prisma,
      user,
      query.scope,
      query.teacherId,
    );
    const active =
      query.academicYear && query.semester ? null : await this.school.getActiveSemester();
    const period = {
      academicYear: query.academicYear ?? active!.academicYear.code,
      semester: query.semester ?? active!.number,
    };
    const configured = await this.prisma.semester.findFirst({
      where: { number: period.semester, academicYear: { code: period.academicYear } },
      select: { id: true },
    });
    if (!configured) throw new ForbiddenException('Periode nilai belum dikonfigurasi.');

    const gradeWhere: Prisma.GradeWhereInput = {
      academicYear: period.academicYear,
      semester: period.semester,
      ...(isSiswaOnly(user)
        ? { studentId: await resolveSiswaId(this.prisma, user.keycloakId) }
        : {}),
      assignment: {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(ownTeacherId
          ? { teacherId: ownTeacherId }
          : isGuruOnly(user)
            ? { teacherId: await resolveTeacherId(this.prisma, user.keycloakId) }
            : {}),
      },
    };

    const grades = await this.prisma.grade.findMany({
      where: gradeWhere,
      select: {
        score: true,
        type: true,
        studentId: true,
        assignment: { select: { subject: true, classId: true, class: { select: { name: true } } } },
      },
    });

    // ── Per-mapel progress: group by subject, compute NA per student, tuntas rate ──
    // Student-grade-components per subject (mirror lib/academic.ts naOf)
    const subjectStudentMap = new Map<
      string,
      Map<
        string,
        { uh: number[]; praktik: number[]; sikap: number[]; uts: number[]; uas: number[] }
      >
    >();
    const subjectTotalStudents = new Map<string, Set<string>>();

    for (const g of grades) {
      const subject = g.assignment.subject;
      if (!subjectStudentMap.has(subject)) subjectStudentMap.set(subject, new Map());
      if (!subjectTotalStudents.has(subject)) subjectTotalStudents.set(subject, new Set());
      subjectTotalStudents.get(subject)!.add(g.studentId);

      const studentMap = subjectStudentMap.get(subject)!;
      if (!studentMap.has(g.studentId)) {
        studentMap.set(g.studentId, { uh: [], praktik: [], sikap: [], uts: [], uas: [] });
      }
      const comp = studentMap.get(g.studentId)!;
      const score = Number(g.score);
      const t = String(g.type).toLowerCase();
      if (t === 'uh' || t === 'formatif') comp.uh.push(score);
      else if (t === 'praktik') comp.praktik.push(score);
      else if (t === 'sikap') comp.sikap.push(score);
      else if (t === 'uts') comp.uts.push(score);
      else if (t === 'uas' || t === 'sumatif') comp.uas.push(score);
    }

    const W = { uh: 0.2, praktik: 0.25, sikap: 0.15, uts: 0.2, uas: 0.2 };
    const computeNa = (c: {
      uh: number[];
      praktik: number[];
      sikap: number[];
      uts: number[];
      uas: number[];
    }): number | null => {
      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const parts: { val: number; w: number }[] = [];
      const uh = avg(c.uh);
      if (uh !== null) parts.push({ val: uh, w: W.uh });
      const praktik = avg(c.praktik);
      if (praktik !== null) parts.push({ val: praktik, w: W.praktik });
      const sikap = avg(c.sikap);
      if (sikap !== null) parts.push({ val: sikap, w: W.sikap });
      const uts = avg(c.uts);
      if (uts !== null) parts.push({ val: uts, w: W.uts });
      const uas = avg(c.uas);
      if (uas !== null) parts.push({ val: uas, w: W.uas });
      if (parts.length === 0) return null;
      const wSum = parts.reduce((a, p) => a + p.w, 0);
      return Math.round((parts.reduce((a, p) => a + p.val * p.w, 0) / wSum) * 10) / 10;
    };

    const kktpCatalog = await this.resolveKktpCatalog(subjectStudentMap.keys(), period);
    const mapelProgress = [...subjectStudentMap.entries()]
      .map(([subject, studentMap]) => {
        const nas: number[] = [];
        for (const comps of studentMap.values()) {
          const na = computeNa(comps);
          if (na !== null) nas.push(na);
        }
        const total = subjectTotalStudents.get(subject)?.size ?? nas.length;
        const kktp = this.kktpValue(kktpCatalog, subject);
        const tuntas = kktp === null ? null : nas.filter((n) => n >= kktp).length;
        const avgNa = nas.length
          ? Math.round((nas.reduce((a, b) => a + b, 0) / nas.length) * 10) / 10
          : null;
        const pct = nas.length && tuntas !== null ? Math.round((tuntas / nas.length) * 100) : null;
        return {
          mapel: subject,
          progres: pct,
          na: avgNa,
          tuntas,
          total: Math.max(total, nas.length),
          tp:
            kktp === null
              ? 'KKTP belum dikonfigurasi'
              : `${tuntas}/${Math.max(total, nas.length)} tuntas`,
          kktp,
          kktpProvenance: kktpCatalog.get(subject)?.provenance ?? 'unconfigured',
        };
      })
      .sort((a, b) => (b.progres ?? -1) - (a.progres ?? -1));

    // Grade records do not prove individual CP/TP attainment. No RPP query under a grade-only grant.
    return {
      mapelProgress,
      cpBreakdown: [],
      cpState: 'unavailable',
      cpReason: 'Relasi bukti asesmen per CP belum tersedia; ketuntasan nilai bukan progres CP.',
    };
  }
}

function pushTo(map: Map<string, number[]>, key: string, value: number): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

// ── W1-3 + W1-4: Student-level analytics (with ownership) ───────────────────
// Per-student attendance stats + grade analytics for SiswaDashboard/OrtuDashboard.
// Ownership: SISWA→own, ORANG_TUA→children, GURU→own classes, SA/KS/TU→all.
// Berbeda dari endpoint exec (aggregate, no PII) — ini per-student dengan PII.
// ────────────────────────────────────────────────────────────────────────────

interface StudentBrief {
  id: string;
  nis: string;
  user: { fullName: string };
  class: { name: string } | null;
}

@Injectable()
export class StudentAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveKktpCatalog(subjects: Iterable<string>, period: Period) {
    const uniqueSubjects = [...new Set(subjects)].sort((a, b) => a.localeCompare(b));
    const entries = await Promise.all(
      uniqueSubjects.map(
        async (subject) =>
          [
            subject,
            await resolveKktpThreshold(this.prisma, {
              subject,
              academicYear: period.academicYear,
              semester: period.semester,
            }),
          ] as const,
      ),
    );
    return new Map<string, ResolvedKktp>(entries);
  }

  private kktpValue(catalog: Map<string, ResolvedKktp>, subject: string): number | null {
    return catalog.get(subject)?.value ?? null;
  }

  /** Resolve studentIds berdasarkan role (ownership check di service layer). */
  private async resolveStudentIds(query: StudentAnalyticsQuery, user: AuthUser): Promise<string[]> {
    if (isSiswaOnly(user)) {
      return [await resolveSiswaId(this.prisma, user.keycloakId)];
    }
    if (isOrangTuaOnly(user)) {
      const userId = await resolveUserId(this.prisma, user.keycloakId);
      const children = await this.prisma.student.findMany({
        where: { parentId: userId, deletedAt: null },
        select: { id: true },
      });
      return children.map((c) => c.id);
    }
    if (isGuruOnly(user)) {
      const classIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      if (classIds.length === 0) return [];
      const students = await this.prisma.student.findMany({
        where: { classId: { in: classIds }, deletedAt: null },
        select: { id: true },
      });
      return students.map((s) => s.id);
    }
    // ELEVATED (SA/KS/TU): optional studentId or classId filter
    if (query.studentId) return [query.studentId];
    if (query.classId) {
      const students = await this.prisma.student.findMany({
        where: { classId: query.classId, deletedAt: null },
        select: { id: true },
      });
      return students.map((s) => s.id);
    }
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true },
    });
    return students.map((s) => s.id);
  }

  private async fetchStudentBriefs(studentIds: string[]): Promise<StudentBrief[]> {
    if (studentIds.length === 0) return [];
    return this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: {
        id: true,
        nis: true,
        user: { select: { fullName: true } },
        class: { select: { name: true } },
      },
    });
  }

  // ── W1-3: Attendance aggregation per student ──────────────────────────────

  async attendanceStats(query: StudentAnalyticsQuery, user: AuthUser) {
    const studentIds = await this.resolveStudentIds(query, user);
    if (studentIds.length === 0) return { data: [] };

    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
    if (query.dateTo) dateFilter.lte = new Date(query.dateTo);
    const hasDate = Object.keys(dateFilter).length > 0;

    const grouped = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        studentId: { in: studentIds },
        ...(hasDate ? { date: dateFilter } : {}),
      },
      _count: { _all: true },
    });

    const statsMap = new Map<
      string,
      { hadir: number; izin: number; sakit: number; alpha: number; total: number }
    >();
    for (const g of grouped) {
      const cur = statsMap.get(g.studentId) ?? { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 };
      cur.total += g._count._all;
      if (g.status === 'hadir') cur.hadir += g._count._all;
      else if (g.status === 'izin') cur.izin += g._count._all;
      else if (g.status === 'sakit') cur.sakit += g._count._all;
      else if (g.status === 'alpha') cur.alpha += g._count._all;
      statsMap.set(g.studentId, cur);
    }

    const students = await this.fetchStudentBriefs(studentIds);
    const data = students.map((s) => {
      const stats = statsMap.get(s.id) ?? { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 };
      const pct: number = stats.total > 0 ? Math.round((stats.hadir / stats.total) * 1000) / 10 : 0;
      return {
        studentId: s.id,
        studentName: s.user.fullName,
        nis: s.nis,
        className: s.class?.name ?? null,
        stats: { ...stats, pct },
      };
    });

    return { data };
  }

  // ── W1-4: Grade analytics per student (NA computation) ────────────────────

  async studentGrades(query: StudentAnalyticsQuery, user: AuthUser) {
    const studentIds = await this.resolveStudentIds(query, user);
    if (studentIds.length === 0) return { data: [] };

    // Resolve period (academicYear + semester)
    let academicYear: string;
    let semester: number;
    if (query.academicYear && query.semester) {
      academicYear = query.academicYear;
      semester = query.semester;
    } else {
      const now = new Date();
      const y = now.getUTCFullYear();
      academicYear =
        query.academicYear ?? (now.getUTCMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`);
      semester = query.semester ?? 1;
    }

    const grades = await this.prisma.grade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYear,
        semester,
      },
      select: {
        studentId: true,
        score: true,
        type: true,
        assignment: { select: { subject: true } },
      },
    });
    const kktpCatalog = await this.resolveKktpCatalog(
      grades.map((grade) => grade.assignment.subject),
      {
        academicYear,
        semester,
      },
    );

    // Group by studentId → subject → type → scores[]
    type CompArrays = {
      uh: number[];
      praktik: number[];
      sikap: number[];
      uts: number[];
      uas: number[];
    };
    const map = new Map<string, Map<string, CompArrays>>();
    for (const g of grades) {
      if (!map.has(g.studentId)) map.set(g.studentId, new Map());
      const subjectMap = map.get(g.studentId)!;
      const subject = g.assignment.subject;
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, { uh: [], praktik: [], sikap: [], uts: [], uas: [] });
      }
      const comp = subjectMap.get(subject)!;
      const score = Number(g.score);
      if (g.type === 'uh') comp.uh.push(score);
      else if (g.type === 'praktik') comp.praktik.push(score);
      else if (g.type === 'sikap') comp.sikap.push(score);
      else if (g.type === 'uts') comp.uts.push(score);
      else if (g.type === 'uas') comp.uas.push(score);
    }

    const students = await this.fetchStudentBriefs(studentIds);
    const data = students.map((s) => {
      const subjectMap = map.get(s.id) ?? new Map<string, CompArrays>();
      const subjects = [...subjectMap.entries()].map(([subject, comp]) => {
        // Do not round components before the official one-decimal weighted NA.
        const avg = (arr: number[]): number | undefined => {
          const valid = arr
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
            .sort((a, b) => a - b);
          return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined;
        };
        const naComponents: NaComponents = {
          uh: avg(comp.uh),
          praktik: avg(comp.praktik),
          sikap: avg(comp.sikap),
          uts: avg(comp.uts),
          uas: avg(comp.uas),
        };
        const na = naOf(naComponents);
        const kktp = this.kktpValue(kktpCatalog, subject);
        return {
          subject,
          uh: naComponents.uh ?? null,
          praktik: naComponents.praktik ?? null,
          sikap: naComponents.sikap ?? null,
          uts: naComponents.uts ?? null,
          uas: naComponents.uas ?? null,
          na,
          kktp,
          kktpProvenance: kktpCatalog.get(subject)?.provenance ?? 'unconfigured',
          status: na !== null && kktp !== null ? (na >= kktp ? 'tuntas' : 'remedial') : null,
        };
      });
      return {
        studentId: s.id,
        studentName: s.user.fullName,
        nis: s.nis,
        className: s.class?.name ?? null,
        subjects,
      };
    });

    return { data };
  }
}
