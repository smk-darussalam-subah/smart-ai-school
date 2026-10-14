import type { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsQuery } from './dto/analytics-query.dto';
import { resolveKktpThreshold } from '../academic/kktp-resolver';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';

export type ReadState = 'ready' | 'denied' | 'unavailable';
export interface MonitoringCapabilities {
  assignments: boolean;
  attendance: boolean;
  journal: boolean;
  schedules: boolean;
  sessions: boolean;
  lms: boolean;
}
const DENIED: MonitoringCapabilities = {
  assignments: false,
  attendance: false,
  journal: false,
  schedules: false,
  sessions: false,
  lms: false,
};
const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** Read-only, domain-gated aggregates. Daily attendance and teacher/class journals are never session evidence. */
export async function readSchedulingMonitoring(
  db: PrismaService,
  query: AnalyticsQuery & { academicYear: string; semester: number },
  caps: MonitoringCapabilities = DENIED,
  now = new Date(),
) {
  const date = dayKey(now);
  const meta = {
    academicYear: query.academicYear,
    semester: query.semester,
    date,
    generatedAt: now.toISOString(),
    scope: 'authorized_school_aggregate' as const,
    filters: {
      teacherId: query.teacherId ?? null,
      subject: query.subject ?? null,
      classId: query.classId ?? null,
      majorCode: query.majorCode ?? null,
    },
  };
  const empty = (state: ReadState, reason: string) => ({
    ...meta,
    state,
    reason,
    data: [],
    domains: {},
    thresholdMode: 'unavailable',
    window: null,
  });
  if (!caps.assignments) return empty('denied', 'Izin membaca penugasan tidak tersedia.');
  const period = await db.semester.findFirst({
    where: { number: query.semester, academicYear: { code: query.academicYear } },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!period) return empty('unavailable', 'Periode belum dikonfigurasi.');
  const from = period.startDate,
    end = new Date(period.endDate);
  end.setUTCDate(end.getUTCDate() + 1);
  const today = new Date(`${date}T00:00:00Z`);
  const observedEnd = new Date(
    Math.max(from.getTime(), Math.min(end.getTime(), today.getTime() + 86400000)),
  );
  const currentDayInPeriod = today >= from && today < end;
  const window =
    observedEnd > from
      ? {
          from: from.toISOString().slice(0, 10),
          to: new Date(observedEnd.getTime() - 86400000).toISOString().slice(0, 10),
          semesterEnd: period.endDate.toISOString().slice(0, 10),
        }
      : null;
  const assignments = await db.teachingAssignment.findMany({
    where: {
      academicYear: query.academicYear,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.majorCode ? { class: { majorCode: query.majorCode } } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.subject ? { subject: query.subject } : {}),
    },
    select: {
      id: true,
      teacherId: true,
      classId: true,
      subject: true,
      hoursPerWeek: true,
      teacher: { select: { user: { select: { fullName: true } } } },
      class: { select: { name: true } },
      grades: {
        where: { academicYear: query.academicYear, semester: query.semester },
        select: { score: true },
      },
    },
    orderBy: { id: 'asc' },
    take: 5001,
  });
  if (assignments.length > 5000)
    return empty('unavailable', 'Cakupan terlalu besar. Pilih kelas atau guru.');
  const classIds = [...new Set(assignments.map((a) => a.classId))],
    teacherIds = [...new Set(assignments.map((a) => a.teacherId))];
  const assignmentIds = assignments.map((a) => a.id);
  async function read<T>(
    allowed: boolean,
    request: () => Promise<T>,
    fallback: T,
  ): Promise<{ state: ReadState; data: T }> {
    if (!allowed) return { state: 'denied', data: fallback };
    try {
      return { state: 'ready', data: await request() };
    } catch {
      return { state: 'unavailable', data: fallback };
    }
  }
  const [attendance, journal, schedules, sessions, lms] = await Promise.all([
    read(
      caps.attendance,
      () =>
        currentDayInPeriod
          ? db.attendance.groupBy({
              by: ['classId', 'status'],
              where: {
                classId: { in: classIds },
                date: { gte: today, lt: new Date(today.getTime() + 86400000) },
              },
              _count: { _all: true },
            })
          : Promise.resolve([]),
      [],
    ),
    read(
      caps.journal,
      () =>
        db.classActivity.groupBy({
          by: ['teacherId', 'classId'],
          where: {
            teacherId: { in: teacherIds },
            classId: { in: classIds },
            date: { gte: from, lt: observedEnd },
          },
          _count: { _all: true },
        }),
      [],
    ),
    read(
      caps.schedules,
      () =>
        db.schedule.findMany({
          where: {
            teachingAssignmentId: { in: assignmentIds },
            academicYear: query.academicYear,
            semester: query.semester,
          },
          select: { teachingAssignmentId: true, dayOfWeek: true, jpStart: true, jpEnd: true },
        }),
      [],
    ),
    read(
      caps.sessions,
      () =>
        db.classSession.groupBy({
          by: ['assignedTeacherId', 'classId', 'teachingAssignmentId', 'status'],
          where: {
            assignedTeacherId: { in: teacherIds },
            classId: { in: classIds },
            semesterId: period.id,
            serviceDate: { gte: from, lt: observedEnd },
            scheduledStartAt: { lte: now },
          },
          _count: { _all: true },
        }),
      [],
    ),
    read(
      caps.lms,
      () =>
        db.lmsModule.findMany({
          where: {
            teacherId: { in: teacherIds },
            classId: { in: classIds },
            academicYear: query.academicYear,
            semester: query.semester,
            status: 'published',
          },
          select: {
            teacherId: true,
            classId: true,
            subject: true,
            progress: { select: { status: true } },
          },
        }),
      [],
    ),
  ]);
  const instructionDays = await read(
    caps.schedules,
    () =>
      new BellScheduleService(db).instructionDaysForPeriod(db, query.academicYear, query.semester),
    new Map<number, Set<number>>(),
  );
  const domains = {
    attendance: attendance.state,
    journal: journal.state,
    schedules: schedules.state,
    sessions: sessions.state,
    lms: lms.state,
  };
  const thresholds = new Map(
    await Promise.all(
      [...new Set(assignments.map((a) => a.subject))].map(
        async (subject) =>
          [
            subject,
            await resolveKktpThreshold(db, {
              subject,
              academicYear: query.academicYear,
              semester: query.semester,
            }),
          ] as const,
      ),
    ),
  );
  const data = assignments.map((a) => {
    const scores = a.grades.map((g) => Number(g.score)),
      threshold = thresholds.get(a.subject);
    const passed =
      threshold?.value == null ? null : scores.filter((score) => score >= threshold.value!).length;
    const tuntasPct =
      passed !== null && scores.length ? Math.round((passed / scores.length) * 100) : null;
    const att = attendance.data.filter((row) => row.classId === a.classId),
      total = att.reduce((sum, row) => sum + row._count._all, 0),
      hadir = att
        .filter((row) => row.status === 'hadir')
        .reduce((sum, row) => sum + row._count._all, 0);
    const journalClass =
      journal.data.find((row) => row.teacherId === a.teacherId && row.classId === a.classId)?._count
        ._all ?? 0;
    const operational = sessions.data.filter(
      (row) =>
        row.assignedTeacherId === a.teacherId &&
        row.classId === a.classId &&
        row.teachingAssignmentId === a.id,
    );
    const count = (status: string) =>
      operational
        .filter((row) => row.status === status)
        .reduce((sum, row) => sum + row._count._all, 0);
    const completed = count('COMPLETED'),
      due =
        count('SCHEDULED') + count('REASSIGNED') + count('STARTED') + completed + count('MISSED');
    const progress = lms.data
      .filter(
        (module) =>
          module.teacherId === a.teacherId &&
          module.classId === a.classId &&
          module.subject === a.subject,
      )
      .flatMap((module) => module.progress);
    const stored = schedules.data.filter((row) => row.teachingAssignmentId === a.id);
    const rangesValid =
      instructionDays.state === 'ready' &&
      stored.every(
        (row) =>
          row.jpStart >= 1 &&
          row.jpEnd >= row.jpStart &&
          Array.from(
            { length: row.jpEnd - row.jpStart + 1 },
            (_, index) => row.jpStart + index,
          ).every((jp) => instructionDays.data.get(row.dayOfWeek)?.has(jp)),
      );
    return {
      assignmentId: a.id,
      teacherId: a.teacherId,
      classId: a.classId,
      guru: a.teacher.user.fullName,
      kelas: a.class.name,
      mapel: a.subject,
      jp: a.hoursPerWeek,
      scheduledJp:
        schedules.state === 'ready' && rangesValid
          ? stored.reduce((sum, row) => sum + row.jpEnd - row.jpStart + 1, 0)
          : null,
      avg: scores.length
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
        : null,
      gradeCount: scores.length,
      passedGradeCount: passed,
      tuntasPct,
      kktp: threshold?.value ?? null,
      kktpProvenance: threshold?.provenance ?? 'unconfigured',
      hadirPct: attendance.state === 'ready' && total ? Math.round((hadir / total) * 100) : null,
      attendance: {
        unit: 'daily_class_records',
        present: attendance.state === 'ready' ? hadir : null,
        recorded: attendance.state === 'ready' ? total : null,
        date,
      },
      jurnalCount: journal.state === 'ready' ? journalClass : null,
      journalScope: 'teacher_class' as const,
      sessions: {
        due: sessions.state === 'ready' ? due : null,
        completed: sessions.state === 'ready' ? completed : null,
        active: sessions.state === 'ready' ? count('STARTED') : null,
        missed: sessions.state === 'ready' ? count('MISSED') : null,
        cancelled: sessions.state === 'ready' ? count('CANCELLED') : null,
        superseded: sessions.state === 'ready' ? count('SUPERSEDED') : null,
        unit: 'materialized_due_sessions',
      },
      lms: {
        completed:
          lms.state === 'ready'
            ? progress.filter((row) => row.status === 'completed').length
            : null,
        recorded: lms.state === 'ready' ? progress.length : null,
        unit: 'module_progress_records',
      },
      status:
        tuntasPct === null ? 'unknown' : tuntasPct >= 75 ? 'on' : tuntasPct >= 60 ? 'warn' : 'risk',
    };
  });
  return {
    ...meta,
    state: 'ready',
    reason: null,
    data,
    domains,
    thresholdMode: 'authoritative_per_subject',
    window,
  };
}
