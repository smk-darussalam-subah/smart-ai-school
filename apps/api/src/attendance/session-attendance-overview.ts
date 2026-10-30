import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SessionAttendanceOverviewQuery } from './student-session-attendance.dto';
import {
  consistentJpStatus,
  jpDailyTotals,
  sessionJpSlots,
} from './student-session-attendance.math';
import { readAttendancePeriod } from './attendance-period';

/** Aggregate only: never copies JP decisions into legacy daily Attendance or exposes a roster. */
export async function readSessionAttendanceOverview(
  db: Prisma.TransactionClient,
  query: SessionAttendanceOverviewQuery,
  authorized: Prisma.ClassSessionWhereInput,
  now = new Date(),
) {
  const period = await readAttendancePeriod(db, query);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = period.startDate.toISOString().slice(0, 10),
    end = period.endDate.toISOString().slice(0, 10);
  const to = query.to ?? (today < start ? start : today < end ? today : end);
  const from =
    query.from ??
    new Date(Math.max(Date.parse(start), Date.parse(to) - 30 * 86400000))
      .toISOString()
      .slice(0, 10);
  if (from < start || to > end || from > to)
    throw new BadRequestException('Tanggal harus berada dalam periode pilihan.');
  const observedTo = today < to ? today : to;
  const sessions = await db.classSession.findMany({
    where: {
      AND: [
        authorized,
        {
          semesterId: period.id,
          serviceDate: { gte: new Date(from), lte: new Date(observedTo) },
          status: { in: ['SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED'] },
          supersededAt: null,
          ...(query.subject ? { subjectSnapshot: query.subject } : {}),
          ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
        },
      ],
    },
    include: {
      bellScheduleProfile: { include: { segments: true } },
      class: {
        select: {
          students: {
            where: { status: 'active', deletedAt: null, user: { isActive: true, deletedAt: null } },
            select: { id: true, joinedAt: true },
            take: 1001,
          },
        },
      },
      studentAttendance: { select: { studentId: true, jp: true, status: true }, take: 4001 },
    },
    take: 10001,
  });
  if (sessions.length > 10000)
    throw new ConflictException('Pilih rentang atau kelas yang lebih kecil.');
  const holidays = await db.academicCalendar.findMany({
    where: {
      academicYearId: period.academicYear.id,
      type: { in: ['holiday', 'break'] },
      startDate: { lte: new Date(to) },
      endDate: { gte: new Date(from) },
    },
    select: { startDate: true, endDate: true },
  });
  const physical = new Map<string, { date: string; statuses: (string | null)[] }>();
  // The teacher's daily follow-up shares the same scoped read/roster as the JP
  // overview. Return only counts; do not send student identities or fetch each session.
  const sessionCompletion: {
    sessionId: string;
    scheduleId: string | null;
    classId: string;
    date: string;
    subject: string;
    jpStart: number;
    jpEnd: number;
    expected: number;
    recorded: number;
    unknown: number;
    complete: boolean;
  }[] = [];
  let cells = 0;
  for (const session of sessions) {
    if (
      session.serviceDate.getUTCDay() === 0 ||
      holidays.some((h) => session.serviceDate >= h.startDate && session.serviceDate <= h.endDate)
    )
      continue;
    const slots = sessionJpSlots(session);
    if (
      !slots.length ||
      slots.length > 40 ||
      session.class.students.length > 1000 ||
      session.studentAttendance.length > 4000
    )
      throw new ConflictException('Pola JP atau daftar siswa belum dapat diverifikasi lengkap.');
    const roster = new Set(
      session.class.students.filter((s) => s.joinedAt <= session.serviceDate).map((s) => s.id),
    );
    for (const record of session.studentAttendance) roster.add(record.studentId);
    cells += roster.size * slots.length;
    if (cells > 1000000)
      throw new ConflictException('Cakupan kehadiran terlalu besar; pilih kelas atau tanggal.');
    const date = session.serviceDate.toISOString().slice(0, 10);
    const records = new Map(
      session.studentAttendance.map((r) => [r.studentId + ':' + r.jp, r.status]),
    );
    if (session.studentAttendance.some((r) => !slots.some((s) => s.jp === r.jp)))
      throw new ConflictException('Catatan kehadiran tidak sesuai pola JP sesi.');
    let recorded = 0;
    for (const studentId of roster)
      for (const slot of slots) {
        if (records.has(studentId + ':' + slot.jp)) recorded++;
        const key = studentId + ':' + date + ':' + slot.jp;
        const cell = physical.get(key) ?? { date, statuses: [] };
        cell.statuses.push(records.get(studentId + ':' + slot.jp) ?? null);
        physical.set(key, cell);
      }
    if (query.scope === 'own' && from === to) {
      const expected = roster.size * slots.length;
      sessionCompletion.push({
        sessionId: session.id,
        scheduleId: session.scheduleId,
        classId: session.classId,
        date,
        subject: session.subjectSnapshot,
        jpStart: Math.min(...slots.map((s) => s.jp)),
        jpEnd: Math.max(...slots.map((s) => s.jp)),
        expected,
        recorded,
        unknown: expected - recorded,
        complete: expected > 0 && recorded === expected,
      });
    }
  }
  const summary = jpDailyTotals(
    [...physical.values()].map((cell) => ({
      date: cell.date,
      status: consistentJpStatus(cell.statuses),
    })),
  );
  return {
    academicYear: period.academicYear.code,
    semester: period.number,
    from,
    to,
    observedThrough: observedTo,
    generatedAt: now.toISOString(),
    unit: 'student_session_jp' as const,
    rosterBasis: 'current_roster_and_recorded_history' as const,
    scope: query.scope === 'own' ? ('own' as const) : ('authorized' as const),
    filters: {
      classId: query.classId ?? null,
      teacherId: query.teacherId ?? null,
      subject: query.subject ?? null,
      majorCode: query.majorCode ?? null,
    },
    ...summary,
    ...(query.scope === 'own' && from === to ? { sessionCompletion } : {}),
  };
}
