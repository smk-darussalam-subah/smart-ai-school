// =============================================================================
// AnalyticsService — agregasi untuk Dasbor Eksekutif (KS/SA).
// Pola agregasi meniru attendance.heatmap() & finance.summary():
// Prisma groupBy/findMany ter-filter → post-process in-memory.
// Semua keluaran AGREGAT (tanpa PII per-siswa) — aman untuk konsumsi eksekutif.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import {
  isGuruOnly,
  isSiswaOnly,
  isOrangTuaOnly,
  resolveSiswaId,
  resolveGuruClassIds,
  resolveSiswaClassId,
  resolveUserId,
} from '../common/helpers/role-helpers';
import { AnalyticsQuery, StudentAnalyticsQuery } from './dto/analytics-query.dto';
import {
  AGING_BUCKETS,
  AT_RISK_ALPHA_MIN,
  AT_RISK_WINDOW_DAYS,
  KKM_DEFAULT,
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

const MATRIX_SUBJECT_LIMIT = 6; // kolom heatmap KKM agar terbaca
const SCATTER_POINT_CAP = 160; // batas titik scatter yang dikirim (r dihitung dari semua)

interface Period {
  academicYear: string;
  semester: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolConfigService,
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
      const fallbackYear =
        now.getUTCMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
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
      ...(query.classId ? { assignment: { classId: query.classId } } : {}),
      ...(query.majorCode
        ? { assignment: { class: { majorCode: query.majorCode } } }
        : {}),
    };
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

    for (const r of rows) {
      const s = Number(r.score);
      const major = r.assignment.class?.majorCode ?? '—';
      const subject = r.assignment.subject;
      all.push(s);
      pushTo(byMajor, major, s);
      pushTo(bySubject, subject, s);
      pushTo(matrix, `${major}|${subject}`, s);
    }

    // byMajor (box-plot)
    const majorRows = [...byMajor.entries()]
      .map(([majorCode, scores]) => ({
        majorCode,
        ...summarize(scores),
        kkmPassRate: kkmPassRate(scores, KKM_DEFAULT),
      }))
      .sort((a, b) => a.majorCode.localeCompare(b.majorCode));

    // bySubject (ringkas, urut jumlah terbanyak)
    const subjectRows = [...bySubject.entries()]
      .map(([subject, scores]) => ({
        subject,
        count: scores.length,
        mean: round1(mean(scores)),
        kkmPassRate: kkmPassRate(scores, KKM_DEFAULT),
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
          passRate: scores.length ? kkmPassRate(scores, KKM_DEFAULT) : null,
        });
      }
    }

    const correlation = await this.correlation(period, query, where);

    return {
      filters: { ...period, kkm: KKM_DEFAULT, majorCode: query.majorCode ?? null, classId: query.classId ?? null },
      overall: { ...summarize(all), kkmPassRate: kkmPassRate(all, KKM_DEFAULT) },
      byMajor: majorRows,
      bySubject: subjectRows,
      kkmMatrix: { majors, subjects, cells },
      correlation,
    };
  }

  // ── Korelasi kehadiran (%) per siswa vs rata² nilai per siswa ──────────────
  private async correlation(
    period: Period,
    query: AnalyticsQuery,
    gradeWhere: Prisma.GradeWhereInput,
  ) {
    // Jendela kehadiran = rentang tahun ajaran aktif (s.d. hari ini).
    let from: Date;
    let to: Date = new Date();
    try {
      const ay = await this.school.getActiveAcademicYear();
      from = ay.startDate;
      if (ay.endDate < to) to = ay.endDate;
    } catch {
      from = new Date(to.getTime() - 180 * 86_400_000); // fallback 6 bulan
    }

    const [attGroups, gradeGroups] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        where: { date: { gte: from, lte: to } },
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

    return { r, n, points };
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

    const byClassMap = new Map<string, { className: string; majorCode: string; grade: number; count: number }>();
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
        ...(query.classId ? { student: { classId: query.classId } } : {}),
        ...(query.majorCode ? { student: { class: { majorCode: query.majorCode } } } : {}),
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
    };
  }

  // ── 4. Kepatuhan guru: kehadiran GPS hari ini + RPP approval rate ─────────
  async teacherCompliance(query: AnalyticsQuery) {
    const period = await this.resolvePeriod(query);
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [totalTeachers, presentToday, rppGroups] = await Promise.all([
      this.prisma.teacher.count({ where: { deletedAt: null } }),
      this.prisma.teacherAttendance.count({ where: { date: { gte: today, lt: tomorrow } } }),
      this.prisma.rpp.groupBy({
        by: ['status'],
        where: { academicYear: period.academicYear, semester: period.semester },
        _count: { _all: true },
      }),
    ]);

    const rpp = { draft: 0, submitted: 0, approved: 0, revision: 0 };
    for (const g of rppGroups) {
      rpp[g.status as keyof typeof rpp] = g._count._all;
    }
    const rppActive = rpp.submitted + rpp.approved + rpp.revision; // non-draft
    const approvalRate = rppActive > 0 ? round1((rpp.approved / rppActive) * 100) : null;

    const gpsPct = totalTeachers > 0
      ? Math.min(100, Math.round((presentToday / totalTeachers) * 100))
      : null;

    return {
      totalTeachers,
      presentToday,
      gpsPct,
      rpp: { ...rpp, total: rpp.draft + rppActive, approvalRate },
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
      ...(query.classId ? { assignment: { classId: query.classId } } : {}),
    };

    // Fetch all grades with assignment details (includes teacher + class + subject)
    const grades = await this.prisma.grade.findMany({
      where,
      select: {
        score: true, type: true,
        assignment: {
          select: {
            subject: true,
            teacher: {
              select: { user: { select: { fullName: true } } },
            },
            class: { select: { name: true } },
          },
        },
      },
    });

    // Group by teacher|class|subject
    const key = (g: typeof grades[0]) =>
      `${g.assignment.teacher?.user?.fullName ?? '-'}|${g.assignment.class?.name ?? '-'}|${g.assignment.subject}`;

    const grouped = new Map<string, { scores: number[]; teacher: string; className: string; subject: string }>();
    for (const g of grades) {
      const k = key(g);
      const entry = grouped.get(k) ?? {
        scores: [] as number[],
        teacher: g.assignment.teacher?.user?.fullName ?? '-',
        className: g.assignment.class?.name ?? '-',
        subject: g.assignment.subject,
      };
      entry.scores.push(Number(g.score));
      grouped.set(k, entry);
    }

    const result = [...grouped.values()].map((e) => {
      const avg = e.scores.length > 0
        ? Math.round(e.scores.reduce((a, b) => a + b, 0) / e.scores.length * 100) / 100
        : 0;
      const tuntas = e.scores.filter((s) => s >= KKM_DEFAULT).length;
      return {
        teacher: e.teacher,
        className: e.className,
        subject: e.subject,
        count: e.scores.length,
        average: avg,
        tuntasCount: tuntas,
        tuntasPct: e.scores.length > 0 ? Math.round((tuntas / e.scores.length) * 100) : null,
      };
    }).sort((a, b) => a.teacher.localeCompare(b.teacher) || a.subject.localeCompare(b.subject));

    return { data: result, kkm: KKM_DEFAULT };
  }

  // ── T3-02 B6: Monitoring KBM (guru × kelas × mapel real-time status) ──────

  /** B6: Build monitoring matrix from existing grades + attendance + jurnal.
   *  No KBM session module needed — aggregates from current data.
   *  Resilient: returns empty array if any sub-query fails. */
  async monitoringKbm(query: AnalyticsQuery) {
    const period = await this.resolvePeriod(query);

    try {
      // Get all teaching assignments for the period
      const assignments = await this.prisma.teachingAssignment.findMany({
        where: { academicYear: period.academicYear },
        select: {
          id: true, subject: true, hoursPerWeek: true,
          teacher: { select: { user: { select: { fullName: true } } } },
          class: { select: { id: true, name: true } },
          grades: {
            where: { academicYear: period.academicYear, semester: period.semester },
            select: { score: true, type: true },
          },
          schedules: { select: { dayOfWeek: true, jpStart: true, jpEnd: true } },
        },
      });

      // Get today's attendance per class (resilient — may be empty)
      const todayISO = new Date().toISOString().slice(0, 10);
      const todayAtt = await this.prisma.attendance.groupBy({
        by: ['classId', 'status'],
        where: { date: { gte: new Date(todayISO), lt: new Date(todayISO + 'T23:59:59Z') } },
        _count: { _all: true },
      }).catch(() => []);

      // Get class activities (jurnal) — resilient
      const activities = await this.prisma.classActivity.findMany({
        where: { date: { gte: new Date(period.academicYear.slice(0, 4) + '-' + (period.semester === 1 ? '07' : '01') + '-01') } },
        select: { teacherId: true, classId: true, date: true, title: true, category: true },
        orderBy: { date: 'desc' },
        take: 200,
      }).catch(() => []);

    // Build monitoring rows
    const attByClass = new Map<string, { hadir: number; total: number }>();
    for (const a of todayAtt) {
      const entry = attByClass.get(a.classId) ?? { hadir: 0, total: 0 };
      entry.total += a._count._all;
      if (a.status === 'hadir') entry.hadir += a._count._all;
      attByClass.set(a.classId, entry);
    }

    const activitiesByTeacherClass = new Map<string, number>();
    for (const act of activities) {
      const key = `${act.teacherId}|${act.classId}`;
      activitiesByTeacherClass.set(key, (activitiesByTeacherClass.get(key) ?? 0) + 1);
    }

    const rows = assignments.map((a) => {
      const scores = a.grades.map((g) => Number(g.score));
      const avg = scores.length > 0 ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length * 100) / 100 : null;
      const tuntas = scores.filter((s) => s >= KKM_DEFAULT).length;
      const tuntasPct = scores.length > 0 ? Math.round((tuntas / scores.length) * 100) : null;

      const att = attByClass.get(a.class?.id ?? '') ?? { hadir: 0, total: 0 };
      const hadirPct = att.total > 0 ? Math.round((att.hadir / att.total) * 100) : null;

      const jurnalCount = activitiesByTeacherClass.get(`${a.id}|${a.class?.id ?? ''}`) ?? 0;

      // Status: 'on' if tuntasPct >= 75, 'warn' if >= 60, 'risk' otherwise
      const status: 'on' | 'warn' | 'risk' =
        tuntasPct !== null ? (tuntasPct >= 75 ? 'on' : tuntasPct >= 60 ? 'warn' : 'risk') : 'risk';

      return {
        guru: a.teacher?.user?.fullName ?? '-',
        mapel: a.subject,
        kelas: a.class?.name ?? '-',
        jp: a.hoursPerWeek,
        avg,
        tuntasPct,
        hadirPct,
        jurnalCount,
        gradeCount: scores.length,
        status,
      };
    });

    rows.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.mapel.localeCompare(b.mapel));

    return { data: rows, date: todayISO, kkm: KKM_DEFAULT };
    } catch {
      // Resilient: return empty if any query fails
      return { data: [], date: new Date().toISOString().slice(0, 10), kkm: KKM_DEFAULT };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // W2-A-3: CP Progress — progres ketercapaian per mapel + breakdown per CP.
  // Diagregasi dari Grade (NA per subject) + LmsModuleProgress.
  // Dipakai PembelajaranGuru + CapaianRapor untuk menggantikan MAPEL_PROG/CP_DATA/CP_RAPOR.
  // ═══════════════════════════════════════════════════════════════════════════

  async cpProgress(query: AnalyticsQuery, user: AuthUser) {
    const period = await this.resolvePeriod(query);

    // Ownership: scope classIds per role
    let scopeClassIds: string[] | null = null;
    if (isGuruOnly(user)) {
      scopeClassIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      if (scopeClassIds.length === 0) return { mapelProgress: [], cpBreakdown: [] };
    } else if (isSiswaOnly(user)) {
      const cid = await resolveSiswaClassId(this.prisma, user.keycloakId);
      scopeClassIds = cid ? [cid] : [];
      if (scopeClassIds.length === 0) return { mapelProgress: [], cpBreakdown: [] };
    }

    const gradeWhere: Prisma.GradeWhereInput = {
      academicYear: period.academicYear,
      semester: period.semester,
      ...(query.classId ? { assignment: { classId: query.classId } } : {}),
      ...(scopeClassIds ? { assignment: { classId: { in: scopeClassIds } } } : {}),
    };

    const grades = await this.prisma.grade.findMany({
      where: gradeWhere,
      select: {
        score: true, type: true, studentId: true,
        assignment: { select: { subject: true, classId: true, class: { select: { name: true } } } },
      },
    });

    // ── Per-mapel progress: group by subject, compute NA per student, tuntas rate ──
    // Student-grade-components per subject (mirror lib/academic.ts naOf)
    const subjectStudentMap = new Map<string, Map<string, { uh: number[]; praktik: number[]; sikap: number[]; uts: number[]; uas: number[] }>>();
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
    const computeNa = (c: { uh: number[]; praktik: number[]; sikap: number[]; uts: number[]; uas: number[] }): number | null => {
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const parts: { val: number; w: number }[] = [];
      const uh = avg(c.uh); if (uh !== null) parts.push({ val: uh, w: W.uh });
      const praktik = avg(c.praktik); if (praktik !== null) parts.push({ val: praktik, w: W.praktik });
      const sikap = avg(c.sikap); if (sikap !== null) parts.push({ val: sikap, w: W.sikap });
      const uts = avg(c.uts); if (uts !== null) parts.push({ val: uts, w: W.uts });
      const uas = avg(c.uas); if (uas !== null) parts.push({ val: uas, w: W.uas });
      if (parts.length === 0) return null;
      const wSum = parts.reduce((a, p) => a + p.w, 0);
      return Math.round((parts.reduce((a, p) => a + p.val * p.w, 0) / wSum) * 10) / 10;
    };

    const mapelProgress = [...subjectStudentMap.entries()].map(([subject, studentMap]) => {
      const nas: number[] = [];
      for (const comps of studentMap.values()) {
        const na = computeNa(comps);
        if (na !== null) nas.push(na);
      }
      const total = subjectTotalStudents.get(subject)?.size ?? nas.length;
      const tuntas = nas.filter((n) => n >= KKM_DEFAULT).length;
      const avgNa = nas.length ? Math.round((nas.reduce((a, b) => a + b, 0) / nas.length) * 10) / 10 : 0;
      const pct = nas.length ? Math.round((tuntas / nas.length) * 100) : 0;
      return { mapel: subject, progres: pct, na: avgNa, tuntas, total: Math.max(total, nas.length), tp: `${tuntas}/${Math.max(total, nas.length)} tuntas` };
    }).sort((a, b) => b.progres - a.progres);

    // ── CP breakdown: derive CPs from RPP body untuk classId / subjects ──
    // Ambil RPP untuk subject yang ada; CP info dari body.cpGoals / body.objectives
    const subjectsInScope = mapelProgress.map((m) => m.mapel);
    const scopeSubjects = subjectsInScope.length > 0 ? subjectsInScope : undefined;
    const rppWhere: Prisma.RppWhereInput = {
      status: 'approved',
      academicYear: period.academicYear,
      semester: period.semester,
      ...(scopeClassIds ? { classId: { in: scopeClassIds } } : query.classId ? { classId: query.classId } : {}),
      ...(scopeSubjects ? { subject: { in: scopeSubjects } } : {}),
    };
    const rpps = await this.prisma.rpp.findMany({
      where: rppWhere,
      select: { subject: true, body: true },
    });

    // Extract CP goals dari RPP body (JSON field — format bebas)
    interface CpEntry { cp: string; desc: string; subject: string }
    const cpList: CpEntry[] = [];
    for (const r of rpps) {
      const body = r.body as Record<string, unknown> | null;
      if (!body) continue;
      const cpGoals = (body.cpGoals ?? body.objectives ?? body.cp) as unknown;
      if (Array.isArray(cpGoals)) {
        cpGoals.forEach((cp, i) => {
          const desc = typeof cp === 'string' ? cp : (cp as Record<string, unknown>)?.desc as string ?? (cp as Record<string, unknown>)?.description as string ?? '—';
          cpList.push({ cp: `CP ${i + 1}`, desc, subject: r.subject });
        });
      }
    }

    // Bila tak ada CP dari RPP, turunkan dari grade types (sumatif → CP proxy)
    const cpBreakdown = cpList.length > 0 ? cpList.map((c) => {
      // Progres CP = avg tuntas rate untuk subject CP ini
      const subjProgress = mapelProgress.find((m) => m.mapel === c.subject);
      return { cp: c.cp, desc: c.desc, progres: subjProgress?.progres ?? 0, tuntas: subjProgress?.tuntas ?? 0, total: subjProgress?.total ?? 0 };
    }) : mapelProgress.slice(0, 4).map((m, i) => ({
      cp: `CP ${i + 1}`, desc: m.mapel, progres: m.progres, tuntas: m.tuntas, total: m.total,
    }));

    return { mapelProgress, cpBreakdown };
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
        id: true, nis: true,
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

    const statsMap = new Map<string, { hadir: number; izin: number; sakit: number; alpha: number; total: number }>();
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
      academicYear = query.academicYear ?? (now.getUTCMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`);
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

    // Group by studentId → subject → type → scores[]
    type CompArrays = { uh: number[]; praktik: number[]; sikap: number[]; uts: number[]; uas: number[] };
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
        const avg = (arr: number[]): number | undefined =>
          arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined;
        const naComponents: NaComponents = {
          uh: avg(comp.uh),
          praktik: avg(comp.praktik),
          sikap: avg(comp.sikap),
          uts: avg(comp.uts),
          uas: avg(comp.uas),
        };
        const na = naOf(naComponents);
        return {
          subject,
          uh: naComponents.uh ?? null,
          praktik: naComponents.praktik ?? null,
          sikap: naComponents.sikap ?? null,
          uts: naComponents.uts ?? null,
          uas: naComponents.uas ?? null,
          na,
          kktp: KKM_DEFAULT,
          status: na !== null ? (na >= KKM_DEFAULT ? 'tuntas' : 'remedial') : null,
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
