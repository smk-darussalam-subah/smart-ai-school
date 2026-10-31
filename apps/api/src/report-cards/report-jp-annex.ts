import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AttendancePeriod } from '../attendance/attendance-period';
import {
  jpDailyTotals,
  physicalJpAttendance,
  sessionJpSlots,
} from '../attendance/student-session-attendance.math';
import { getSchoolDate } from '../common/helpers/school-date.helper';

type Student = { id: string; joinedAt: Date; eligible: boolean };
type SessionRow = {
  id: string;
  date: string;
  subject: string;
  teacher: string;
  className: string;
  slots: {
    jp: number;
    startAt: string;
    endAt: string;
    status: string | null;
    notes: string | null;
    revision: number | null;
    updatedAt: string | null;
  }[];
};

/** Snapshot one authorized class in a bounded batch; never mutate the daily ledger. */
export async function readReportJpAnnexes(
  db: Prisma.TransactionClient,
  period: AttendancePeriod,
  classId: string,
  students: readonly Student[],
  now = new Date(),
) {
  const from = period.startDate.toISOString().slice(0, 10),
    to = period.endDate.toISOString().slice(0, 10);
  const today = getSchoolDate(now).toISOString().slice(0, 10);
  const observedThrough = today < from ? null : today < to ? today : to;
  if (
    students.length > 1000 ||
    period.endDate.getTime() - period.startDate.getTime() > 366 * 86400000
  )
    throw new ConflictException('Cakupan lampiran kehadiran terlalu besar.');
  const rows = new Map(students.map((s) => [s.id, [] as SessionRow[]]));
  if (students.length && observedThrough) {
    const [sessions, holidays] = await Promise.all([
      db.classSession.findMany({
        where: {
          classId,
          semesterId: period.id,
          serviceDate: { gte: period.startDate, lte: new Date(observedThrough) },
          supersededAt: null,
          status: { in: ['SCHEDULED', 'REASSIGNED', 'STARTED', 'COMPLETED'] },
        },
        include: {
          bellScheduleProfile: { include: { segments: true } },
          studentAttendance: {
            where: { studentId: { in: students.map((s) => s.id) } },
            take: 4001,
          },
        },
        orderBy: [{ serviceDate: 'asc' }, { scheduledStartAt: 'asc' }, { id: 'asc' }],
        take: 10001,
      }),
      db.academicCalendar.findMany({
        where: {
          academicYearId: period.academicYear.id,
          type: { in: ['holiday', 'break'] },
          startDate: { lte: new Date(observedThrough) },
          endDate: { gte: period.startDate },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);
    if (sessions.length > 10000)
      throw new ConflictException('Terlalu banyak sesi untuk satu lampiran rapor.');
    let cells = 0;
    for (const session of sessions) {
      if (session.classId !== classId || session.semesterId !== period.id)
        throw new ConflictException('Konteks lampiran kehadiran tidak sesuai rapor.');
      if (
        session.serviceDate.getUTCDay() === 0 ||
        holidays.some((h) => session.serviceDate >= h.startDate && session.serviceDate <= h.endDate)
      )
        continue;
      const slots = sessionJpSlots(session);
      if (
        !slots.length ||
        slots.length > 40 ||
        session.studentAttendance.length > 4000 ||
        session.studentAttendance.some((r) => !slots.some((s) => s.jp === r.jp))
      )
        throw new ConflictException('Rincian JP belum dapat diverifikasi lengkap.');
      const records = new Map(session.studentAttendance.map((r) => [r.studentId + ':' + r.jp, r]));
      const recordedStudents = new Set(session.studentAttendance.map((r) => r.studentId));
      for (const student of students) {
        if (
          !(student.eligible && student.joinedAt <= session.serviceDate) &&
          !recordedStudents.has(student.id)
        )
          continue;
        cells += slots.length;
        if (cells > 1000000)
          throw new ConflictException('Cakupan JP terlalu besar untuk satu kelas.');
        rows.get(student.id)!.push({
          id: session.id,
          date: session.serviceDate.toISOString().slice(0, 10),
          subject: session.subjectSnapshot,
          teacher: session.assignedTeacherName,
          className: session.classNameSnapshot,
          slots: slots.map((slot) => {
            const record = records.get(student.id + ':' + slot.jp);
            return {
              ...slot,
              status: record?.status ?? null,
              notes: record?.notes ?? null,
              revision: record?.revision ?? null,
              updatedAt: record?.updatedAt.toISOString() ?? null,
            };
          }),
        });
      }
    }
  }
  let snapshotBytes = 0;
  return new Map(
    students.map((student) => {
      const sessions = rows.get(student.id)!;
      const annex = {
        version: 1 as const,
        unit: 'student_session_jp' as const,
        studentId: student.id,
        classId,
        academicYear: period.academicYear.code,
        semester: period.number,
        semesterId: period.id,
        from,
        to,
        observedThrough,
        generatedAt: now.toISOString(),
        rosterBasis: 'current_roster_and_recorded_history' as const,
        ...jpDailyTotals(physicalJpAttendance(sessions)),
        sessions,
      };
      const bytes = Buffer.byteLength(JSON.stringify(annex));
      snapshotBytes += bytes;
      if (bytes > 2 * 1024 * 1024 || snapshotBytes > 32 * 1024 * 1024)
        throw new ConflictException('Lampiran kehadiran terlalu besar. Hubungi pengelola sekolah.');
      return [student.id, annex];
    }),
  );
}

/** Don't expose a corrupt cross-student annex through an otherwise readable report. */
export function reportAttendanceForRead(
  value: Prisma.JsonValue | null,
  report: { studentId: string; classId: string; academicYear: string; semester: number },
) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('jp' in value)) return value;
  const jp = value.jp;
  if (
    !jp ||
    typeof jp !== 'object' ||
    Array.isArray(jp) ||
    jp.studentId !== report.studentId ||
    jp.classId !== report.classId ||
    jp.academicYear !== report.academicYear ||
    jp.semester !== report.semester
  )
    return { ...value, jp: { unavailable: true } };
  return value;
}

/** List pages don't transport every private session note before a detail is opened. */
export function reportAttendanceForList(
  value: Prisma.JsonValue | null,
  report: Parameters<typeof reportAttendanceForRead>[1],
) {
  const readable = reportAttendanceForRead(value, report);
  if (!readable || typeof readable !== 'object' || Array.isArray(readable) || !('jp' in readable))
    return readable;
  const { jp, ...daily } = readable;
  return { ...daily, jpAvailable: jp !== undefined };
}
