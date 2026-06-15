// =============================================================================
// AnalyticsService — agregasi untuk Dasbor Eksekutif (KS/SA).
// Pola agregasi meniru attendance.heatmap() & finance.summary():
// Prisma groupBy/findMany ter-filter → post-process in-memory.
// Semua keluaran AGREGAT (tanpa PII per-siswa) — aman untuk konsumsi eksekutif.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolConfigService } from '../school-config/school-config.service';
import { AnalyticsQuery } from './dto/analytics-query.dto';
import {
  AGING_BUCKETS,
  AT_RISK_ALPHA_MIN,
  AT_RISK_WINDOW_DAYS,
  KKM_DEFAULT,
  agingBucketIndex,
  diffDays,
  kkmPassRate,
  mean,
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
}

function pushTo(map: Map<string, number[]>, key: string, value: number): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
