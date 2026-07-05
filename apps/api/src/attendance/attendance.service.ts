// =============================================================================
// AttendanceService — Bulk insert + ownership absensi
//
// POST (bulk):
//   Hanya GURU yang mengajar di classId tersebut (via TeachingAssignment).
//   Bulk insert atomik via prisma.$transaction — sebagian gagal → seluruh
//   transaksi di-rollback. P2002 (unique [studentId,classId,date]) propagate ke
//   PrismaExceptionFilter global → 409. Jangan try/catch manual di sini.
//   recordedBy = auth.users.id (bukan teacherId, konsisten dengan audit field policy).
//
// GET:
//   SA/KS/TU: semua; GURU: hanya kelas yang ia ajar; SISWA: diri sendiri;
//   ORANG_TUA: nilai anak.
//   Filter classId + date range opsional.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { isGuruOnly, isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveTeacherId, resolveGuruClassIds, resolveSiswaId } from '../common/helpers/role-helpers';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { ListAttendanceQuery } from './dto/list-attendance.dto';
import { AttendanceSessionsQuery } from './dto/attendance-sessions.dto';
import { EVENTS, AttendanceRecordedPayload } from '../events/events.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse 'YYYY-MM-DD' → UTC midnight Date tanpa ambiguitas timezone */
function parseDateStr(s: string): Date {
  const parts = s.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(Date.UTC(y, m - 1, d));
}

// ── Select shape ─────────────────────────────────────────────────────────────

const ATTENDANCE_SELECT = {
  id:         true,
  studentId:  true,
  classId:    true,
  date:       true,
  status:     true,
  notes:      true,
  recordedBy: true,
  createdAt:  true,
  student: {
    select: {
      id:  true,
      nis: true,
      user: { select: { fullName: true } },
    },
  },
  class: { select: { id: true, name: true, majorCode: true } },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** keycloakId → student.id[] (satu atau lebih anak untuk ORANG_TUA) */
  private async resolveChildStudentIds(keycloakId: string): Promise<string[]> {
    const userId = await resolveUserId(this.prisma, keycloakId);
    const children = await this.prisma.student.findMany({
      where: { parentId: userId },
      select: { id: true },
    });
    if (children.length === 0) {
      throw new ForbiddenException('Tidak ada data anak yang terdaftar untuk akun ini');
    }
    return children.map((c) => c.id);
  }

  // ── bulkCreate ──────────────────────────────────────────────────────────────

  async bulkCreate(dto: CreateAttendanceDto, user: AuthUser) {
    // 1. Resolve userId untuk recordedBy
    const userId = await resolveUserId(this.prisma, user.keycloakId);

    // 2. Pastikan guru mengajar di classId ini (ownership POST)
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classId: dto.classId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Guru tidak mengajar di kelas ini');
    }

    // 3. Pastikan kelas ada
    const kelas = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');

    // 4. Parse date string → Date (UTC tengah malam)
    const date = parseDateStr(dto.date);

    // 5. Bulk insert atomik via $transaction
    // Jika ada P2002 (unique [studentId,classId,date]) → seluruh transaksi di-rollback
    // → error propagate ke PrismaExceptionFilter global → 409
    const results = await this.prisma.$transaction(
      dto.records.map((r) =>
        this.prisma.attendance.create({
          data: {
            studentId:  r.studentId,
            classId:    dto.classId,
            date,
            status:     r.status as AttendanceStatus,
            notes:      r.notes,
            recordedBy: userId,
          },
          select: ATTENDANCE_SELECT,
        }),
      ),
    );

    // Emit attendance.recorded hanya untuk alpha/sakit (guardrail SMA-43)
    for (const record of results) {
      if (record.status === 'alpha' || record.status === 'sakit') {
        const absPayload: AttendanceRecordedPayload = {
          attendanceId: record.id,
          studentId:    record.studentId,
          classId:      record.classId,
          date:         dto.date,
          status:       record.status as 'alpha' | 'sakit',
        };
        this.eventEmitter.emit(EVENTS.ATTENDANCE_RECORDED, absPayload);
      }
    }

    return {
      count:   results.length,
      date:    dto.date,
      classId: dto.classId,
      data:    results,
    };
  }

  // ── findAll ─────────────────────────────────────────────────────────────────

  async findAll(query: ListAttendanceQuery, user: AuthUser) {
    const where: Prisma.AttendanceWhereInput = {};

    // Date range filter
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = parseDateStr(query.dateFrom);
      if (query.dateTo)   dateFilter.lte = parseDateStr(query.dateTo);
      where.date = dateFilter;
    }

    // Ownership filter per role
    if (isGuruOnly(user)) {
      const myClassIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      if (myClassIds.length === 0) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      if (query.classId) {
        if (!myClassIds.includes(query.classId)) {
          throw new ForbiddenException('Guru tidak mengajar di kelas ini');
        }
        where.classId = query.classId;
      } else {
        where.classId = { in: myClassIds };
      }
    } else if (isSiswaOnly(user)) {
      where.studentId = await resolveSiswaId(this.prisma, user.keycloakId);
      // query.studentId diabaikan — paksa ke diri sendiri
      if (query.classId) where.classId = query.classId;
    } else if (isOrangTuaOnly(user)) {
      const childIds = await this.resolveChildStudentIds(user.keycloakId);
      where.studentId = { in: childIds };
      if (query.classId) where.classId = query.classId;
    } else {
      // ELEVATED (SA/KS/TU): filter opsional
      if (query.classId)   where.classId   = query.classId;
      if (query.studentId) where.studentId = query.studentId;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take:    query.limit,
        select:  ATTENDANCE_SELECT,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Heatmap Kehadiran per Kelas × Hari (referensi KamilEdu Modul 1)
  // Grid N hari terakhir (default 10): pct hadir per kelas per hari.
  // Agregasi penuh di DB (groupBy classId+date+status) — bukan scan baris di JS.
  // ═══════════════════════════════════════════════════════════════════════════

  async heatmap(days: number) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const [classes, grouped] = await Promise.all([
      this.prisma.class.findMany({
        where: { isActive: true },
        select: { id: true, name: true, grade: true },
        orderBy: [{ grade: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.attendance.groupBy({
        by: ['classId', 'date', 'status'],
        where: { date: { gte: from, lte: today } },
        _count: { _all: true },
      }),
    ]);

    // (classId|date) → { total, hadir }
    const cellMap = new Map<string, { total: number; hadir: number }>();
    for (const g of grouped) {
      const dateKey = g.date.toISOString().slice(0, 10);
      const key = `${g.classId}|${dateKey}`;
      const cell = cellMap.get(key) ?? { total: 0, hadir: 0 };
      cell.total += g._count._all;
      if (g.status === 'hadir') cell.hadir += g._count._all;
      cellMap.set(key, cell);
    }

    const rows = classes.map((c) => ({
      classId: c.id,
      className: c.name,
      grade: c.grade,
      cells: dates.map((date) => {
        const cell = cellMap.get(`${c.id}|${date}`);
        if (!cell || cell.total === 0) return { date, total: 0, hadir: 0, pct: null };
        return {
          date,
          total: cell.total,
          hadir: cell.hadir,
          pct: Math.round((cell.hadir / cell.total) * 1000) / 10,
        };
      }),
    }));

    const overallFor = (date: string) => {
      let total = 0;
      let hadir = 0;
      for (const c of classes) {
        const cell = cellMap.get(`${c.id}|${date}`);
        if (cell) {
          total += cell.total;
          hadir += cell.hadir;
        }
      }
      return {
        date,
        total,
        hadir,
        pct: total > 0 ? Math.round((hadir / total) * 1000) / 10 : null,
      };
    };

    const todayKey = dates[dates.length - 1] as string;
    const yesterdayKey = dates.length > 1 ? (dates[dates.length - 2] as string) : null;

    return {
      from: dates[0],
      to: todayKey,
      dates,
      classes: rows,
      overall: {
        today: overallFor(todayKey),
        yesterday: yesterdayKey ? overallFor(yesterdayKey) : null,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // W2-A-1: Rekap kehadiran per sesi (group by date + class + subject).
  // Absensi GURU sudah aktif (POST /attendance) — yang belum ada adalah agregasi
  // per-sesi. Endpoint ini mengagregasi record Attendance yang sudah tersimpan
  // menjadi: sessions (rekap), attention (siswa perlu perhatian), trend (10 hari).
  // ═══════════════════════════════════════════════════════════════════════════

  async sessions(query: AttendanceSessionsQuery, user: AuthUser) {
    // Ownership filter: GURU hanya kelas yang diampu; ELEVATED semua.
    const dateWhere: Prisma.AttendanceWhereInput['date'] = {};
    if (query.from) dateWhere.gte = parseDateStr(query.from);
    if (query.to) dateWhere.lte = parseDateStr(query.to);

    let scopeClassIds: string[] | null = null;
    if (isGuruOnly(user)) {
      scopeClassIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      if (scopeClassIds.length === 0) {
        return { sessions: [], attention: [], trend: [] };
      }
    }

    const where: Prisma.AttendanceWhereInput = {
      ...(Object.keys(dateWhere).length ? { date: dateWhere } : {}),
      ...(query.classId ? { classId: query.classId } : scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
    };

    // Ambil record + class + recordedBy (trace ke subject via teacher assignment)
    const records = await this.prisma.attendance.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        classId: true,
        date: true,
        status: true,
        notes: true,
        recordedBy: true,
        student: { select: { id: true, nis: true, user: { select: { fullName: true } } } },
        class: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    // Resolve subject per (classId, recordedBy) via teacher → teaching-assignment.
    // recordedBy = auth.users.id; teacher.userId = auth.users.id.
    const teacherUserIds = [...new Set(records.map((r) => r.recordedBy))];
    const classIdsInData = [...new Set(records.map((r) => r.classId))];
    const subjectMap = new Map<string, string>(); // key: `${userId}|${classId}` → subject
    if (teacherUserIds.length > 0 && classIdsInData.length > 0) {
      const teachers = await this.prisma.teacher.findMany({
        where: { userId: { in: teacherUserIds } },
        select: { id: true, userId: true, assignments: { select: { classId: true, subject: true } } },
      });
      for (const t of teachers) {
        for (const a of t.assignments) {
          subjectMap.set(`${t.userId}|${a.classId}`, a.subject);
        }
      }
    }

    // ── Aggregate sessions: group by date + classId + recordedBy(subject) ──
    interface SessionAgg {
      date: Date; className: string; subject: string;
      hadir: number; izin: number; sakit: number; alpha: number; total: number;
      notesSet: Set<string>;
    }
    const sessionMap = new Map<string, SessionAgg>();
    for (const r of records) {
      const subject = subjectMap.get(`${r.recordedBy}|${r.classId}`) ?? '—';
      // Bila filter subject diberikan, skip record yang tak cocok
      if (query.subject && subject !== query.subject) continue;
      const key = `${r.date.toISOString()}|${r.classId}|${subject}`;
      let agg = sessionMap.get(key);
      if (!agg) {
        agg = { date: r.date, className: r.class.name, subject, hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, notesSet: new Set() };
        sessionMap.set(key, agg);
      }
      agg.total++;
      if (r.status === 'hadir') agg.hadir++;
      else if (r.status === 'izin') agg.izin++;
      else if (r.status === 'sakit') agg.sakit++;
      else if (r.status === 'alpha') agg.alpha++;
      if (r.notes) agg.notesSet.add(r.notes);
    }

    const sessions = [...sessionMap.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        subject: s.subject,
        className: s.className,
        hadir: s.hadir,
        izin: s.izin,
        sakit: s.sakit,
        alpha: s.alpha,
        total: s.total,
        pct: s.total > 0 ? Math.round((s.hadir / s.total) * 100) : 0,
        notes: [...s.notesSet].join('; ') || null,
      }));

    // ── Attention list: siswa dengan alpha berulang (≥2) dalam window ──
    const alphaByStudent = new Map<string, { studentId: string; name: string; className: string; subject: string; alphaCount: number; sakitCount: number; izinCount: number }>();
    for (const r of records) {
      if (r.status !== 'alpha' && r.status !== 'sakit' && r.status !== 'izin') continue;
      const subject = subjectMap.get(`${r.recordedBy}|${r.classId}`) ?? '—';
      if (query.subject && subject !== query.subject) continue;
      const key = r.studentId;
      let entry = alphaByStudent.get(key);
      if (!entry) {
        entry = { studentId: r.studentId, name: r.student.user.fullName, className: r.class.name, subject, alphaCount: 0, sakitCount: 0, izinCount: 0 };
        alphaByStudent.set(key, entry);
      }
      if (r.status === 'alpha') entry.alphaCount++;
      if (r.status === 'sakit') entry.sakitCount++;
      if (r.status === 'izin') entry.izinCount++;
    }
    const attention = [...alphaByStudent.values()]
      .filter((a) => a.alphaCount >= 1 || (a.alphaCount + a.sakitCount + a.izinCount) >= 2)
      .sort((a, b) => b.alphaCount - a.alphaCount || (b.alphaCount + b.sakitCount + b.izinCount) - (a.alphaCount + a.sakitCount + a.izinCount))
      .slice(0, 12)
      .map((a) => ({
        studentName: a.name,
        className: a.className,
        subject: a.subject,
        alphaCount: a.alphaCount,
        reason: [
          a.alphaCount > 0 ? `${a.alphaCount} alpha` : null,
          a.sakitCount > 0 ? `${a.sakitCount} sakit` : null,
          a.izinCount > 0 ? `${a.izinCount} izin` : null,
        ].filter(Boolean).join(' · ') || 'Kehadiran rendah',
      }));

    // ── Trend: pct kehadiran harian N hari terakhir ──
    const trendDays = query.trendDays;
    const nowTrend = new Date();
    const todayTrend = new Date(Date.UTC(nowTrend.getUTCFullYear(), nowTrend.getUTCMonth(), nowTrend.getUTCDate()));
    const trendFrom = new Date(todayTrend);
    trendFrom.setUTCDate(trendFrom.getUTCDate() - (trendDays - 1));

    const trendDates: string[] = [];
    for (let i = 0; i < trendDays; i++) {
      const d = new Date(trendFrom);
      d.setUTCDate(d.getUTCDate() + i);
      trendDates.push(d.toISOString().slice(0, 10));
    }

    const trendWhere: Prisma.AttendanceWhereInput = {
      date: { gte: trendFrom, lte: todayTrend },
      ...(query.classId ? { classId: query.classId } : scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
      ...(query.subject ? {} : {}),
    };
    const trendRecords = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: trendWhere,
      _count: { _all: true },
    });
    const trendCellMap = new Map<string, { total: number; hadir: number }>();
    for (const g of trendRecords) {
      const dateKey = g.date.toISOString().slice(0, 10);
      const cell = trendCellMap.get(dateKey) ?? { total: 0, hadir: 0 };
      cell.total += g._count._all;
      if (g.status === 'hadir') cell.hadir += g._count._all;
      trendCellMap.set(dateKey, cell);
    }
    const trend = trendDates.map((date) => {
      const cell = trendCellMap.get(date);
      return { date, pct: cell && cell.total > 0 ? Math.round((cell.hadir / cell.total) * 100) : null };
    });

    return { sessions, attention, trend };
  }

}
