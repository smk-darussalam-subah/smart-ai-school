// =============================================================================
// PublicKioskService — data agregat untuk display publik "Ruang Guru" (R3).
// READ-ONLY, TANPA PII (tak ada nama siswa). Hanya bila token kiosk valid.
// =============================================================================

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { SchoolConfigService } from '../school-config/school-config.service';

const JP_COUNT = 8;

interface HeatRow { cells: { date: string; total: number; hadir: number; pct: number | null }[] }

@Injectable()
export class PublicKioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly school: SchoolConfigService,
  ) {}

  async getKiosk(token: string) {
    if (!(await this.school.validateKioskToken(token))) {
      throw new ForbiddenException('Token tidak valid');
    }

    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dow = wib.getUTCDay(); // 0=Minggu … 6=Sabtu

    const [profile, heat, teacherToday, totalGuru, totalKelas, schedules, calendar] = await Promise.all([
      this.school.getProfile() as Promise<{ name?: string }>,
      this.attendance.heatmap(10) as Promise<{ dates: string[]; classes: HeatRow[]; overall: { today: { pct: number | null } } }>,
      this.prisma.teacherAttendance.count({ where: { date: { gte: today, lt: tomorrow } } }),
      this.prisma.teacher.count({ where: { deletedAt: null } }),
      this.prisma.class.count({ where: { isActive: true } }),
      dow === 0 ? Promise.resolve([]) : this.prisma.schedule.findMany({
        where: { dayOfWeek: dow },
        select: {
          classId: true, jpStart: true, jpEnd: true, room: true,
          class: { select: { name: true, grade: true } },
          teachingAssignment: { select: { subject: true, teacher: { select: { user: { select: { fullName: true } } } } } },
        },
      }),
      this.school.getCalendarEvents() as Promise<{ id: string; name: string; startDate: Date; endDate: Date; type: string }[]>,
    ]);

    // Tren overall 10 hari (rata-rata kehadiran per hari).
    const n = heat.dates.length;
    const trenPcts: number[] = [];
    for (let i = 0; i < n; i++) {
      let h = 0, t = 0;
      for (const c of heat.classes) { const cell = c.cells[i]; if (cell) { h += cell.hadir; t += cell.total; } }
      trenPcts.push(t ? Math.round((h / t) * 1000) / 10 : 0);
    }

    // Papan rombel × JP (subjek + guru; bukan PII siswa).
    const byClass = new Map<string, { className: string; grade: number; cells: ({ subject: string; teacher: string; room: string | null } | null)[] }>();
    for (const s of schedules) {
      let entry = byClass.get(s.classId);
      if (!entry) { entry = { className: s.class.name, grade: s.class.grade, cells: Array(JP_COUNT).fill(null) }; byClass.set(s.classId, entry); }
      for (let jp = s.jpStart; jp <= s.jpEnd && jp <= JP_COUNT; jp++) {
        const idx = jp - 1;
        if (idx >= 0 && entry.cells[idx] === null) {
          entry.cells[idx] = { subject: s.teachingAssignment.subject, teacher: s.teachingAssignment.teacher.user.fullName, room: s.room };
        }
      }
    }
    const papanRows = Array.from(byClass.entries())
      .map(([classId, v]) => ({ classId, className: v.className, grade: v.grade, cells: v.cells }))
      .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className))
      .map(({ classId, className, cells }) => ({ classId, className, cells }));

    // Skor Kondisi Sekolah (siswa + guru nyata; KPI/pembelajaran Fase 2).
    const studentPct = heat.overall?.today?.pct ?? null;
    const guruPct = totalGuru > 0 ? Math.min(100, Math.round((teacherToday / totalGuru) * 100)) : null;
    const breakdown = [
      { label: 'Kehadiran Siswa', pct: studentPct !== null ? Math.round(studentPct) : null },
      { label: 'Kehadiran Guru', pct: guruPct },
      { label: 'KPI Guru', pct: null, fase2: true },
      { label: 'Ketercapaian Pembelajaran', pct: null, fase2: true },
    ];
    const avail = breakdown.filter((b) => !b.fase2 && b.pct !== null).map((b) => b.pct as number);
    const score = avail.length ? Math.round(avail.reduce((a, b) => a + b, 0) / avail.length) : null;

    return {
      schoolName: profile?.name ?? 'Sekolah',
      health: { score, delta: null, breakdown },
      kpi: { studentPct, teacherHadir: teacherToday, totalGuru, totalKelas },
      papanRows,
      tren: { dates: heat.dates, pcts: trenPcts },
      agenda: (calendar ?? []).map((e) => ({
        id: e.id, name: e.name,
        date: e.startDate.toISOString().slice(0, 10),
        endDate: e.endDate.toISOString().slice(0, 10),
        type: e.type,
      })),
    };
  }
}
