import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { BellScheduleService } from '../../bell-schedule/bell-schedule.service';
import { isScheduleOperational } from '../../schedule/schedule-validity';
import { acquireIdentityMutationLock } from './identity-mutation-lock';
import { lockOperationalTeachers } from './operational-teacher';
import { APPOINTMENT_ACTIVATION_LOCK_KEY } from '../../appointments/appointments.service';

/** Shared order: schedule -> period -> session -> activation -> identity. */
export async function lockSessionInputs(tx: Prisma.TransactionClient) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
  );
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`,
  );
}

export const SESSION_ACTIVATION_LOCK = 'academic:class-session:activation:v1';
export type SessionActivation = {
  id: string;
  semesterId: string;
  enabled: boolean;
  revision: number;
  activatedAt: Date | null;
  changedBy: string;
  createdAt: Date;
  updatedAt: Date;
};
export const sessionActivationBindingKey = (sessionId: string, revision: number) =>
  `class-session:activation:${sessionId}:${revision}`;
export const sessionSchoolDate = (now: Date) =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** Must follow session/schedule/cutover locks and precede identity locks. */
export async function lockSessionActivation(tx: Prisma.TransactionClient) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${SESSION_ACTIVATION_LOCK}))`,
  );
}

/** Explicit SQL keeps the local client isolated from shared generated dependencies. */
export async function readSessionActivation(
  tx: Prisma.TransactionClient,
  semesterId: string,
): Promise<SessionActivation | null> {
  const rows = await tx.$queryRaw<SessionActivation[]>(Prisma.sql`
    SELECT id, semester_id AS "semesterId", enabled, revision, activated_at AS "activatedAt",
      changed_by AS "changedBy", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM academic.class_session_activations WHERE semester_id = ${semesterId}::uuid`);
  return rows[0] ?? null;
}

/** Caller owns activation + fresh actor locks; CAS additionally rejects stale UI. */
export async function writeSessionActivation(
  tx: Prisma.TransactionClient,
  semesterId: string,
  enabled: boolean,
  expectedRevision: number,
  actorId: string,
  now: Date,
): Promise<SessionActivation> {
  const current = await readSessionActivation(tx, semesterId);
  if ((current?.revision ?? 0) !== expectedRevision || current?.enabled === enabled)
    throw new ConflictException('Status otomasi berubah. Muat ulang lalu periksa kembali.');
  if (!current) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO academic.class_session_activations
      (semester_id, enabled, revision, activated_at, changed_by, updated_at)
      VALUES (${semesterId}::uuid, ${enabled}, 1, ${enabled ? now : null}, ${actorId}, ${now})`);
  } else {
    const changed = await tx.$executeRaw(Prisma.sql`UPDATE academic.class_session_activations
      SET enabled=${enabled}, revision=revision+1, activated_at=${enabled ? now : current.activatedAt},
        changed_by=${actorId}, updated_at=${now} WHERE id=${current.id}::uuid AND revision=${expectedRevision}`);
    if (changed !== 1)
      throw new ConflictException('Status otomasi berubah. Muat ulang lalu coba lagi.');
  }
  const result = await readSessionActivation(tx, semesterId);
  if (!result) throw new Error('Activation write not persisted');
  await tx.auditLog.create({
    data: {
      actorId,
      actorUsername: null,
      actorRoles: [],
      action: enabled ? 'classSession.activation.enable' : 'classSession.activation.disable',
      resourceType: 'class_session_activation',
      resourceId: result.id,
      method: 'POST',
      path: '/class-sessions/activation',
      statusCode: 200,
      outcome: 'success',
      metadata: { semesterId, revision: result.revision, enabled },
    },
  });
  return result;
}

/** Canonical alert gate, reused before dispatch, queue retry and display playback. */
export async function sessionAlertSuppression(
  tx: Prisma.TransactionClient,
  bells: BellScheduleService,
  session: {
    id: string;
    status: string;
    semesterId: string;
    academicYearId: string;
    serviceDate: Date;
    assignedTeacherId: string;
    scheduleId: string;
    classId: string;
    teachingAssignmentId: string;
    bellScheduleProfileId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
  },
  now: Date,
  mode: 'alert' | 'start' | 'missed' = 'alert',
): Promise<string | null> {
  if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) return `SESSION_${session.status}`;
  const today = sessionSchoolDate(now);
  if (session.serviceDate.toISOString().slice(0, 10) !== today) return 'NOT_TODAY';
  if (new Date(today).getUTCDay() === 0) return 'SUNDAY';
  if (
    mode === 'missed'
      ? now < session.scheduledEndAt
      : now < new Date(session.scheduledStartAt.getTime() - (mode === 'start' ? 600_000 : 0)) ||
        now >= session.scheduledEndAt
  )
    return 'OUTSIDE_SESSION_WINDOW';
  const activation = await readSessionActivation(tx, session.semesterId);
  if (!activation?.enabled) return 'ACTIVATION_DISABLED';
  const binding = await tx.classSessionEvent.findUnique({
    where: { eventKey: sessionActivationBindingKey(session.id, activation.revision) },
    select: { id: true },
  });
  if (!binding) return 'STALE_ACTIVATION';
  const periods = await tx.semester.findMany({
    where: { isActive: true },
    select: {
      id: true,
      number: true,
      academicYearId: true,
      startDate: true,
      endDate: true,
      academicYear: { select: { code: true, isActive: true, startDate: true, endDate: true } },
      closure: { select: { id: true } },
    },
    take: 2,
  });
  const years = await tx.academicYear.count({ where: { isActive: true } });
  const period = periods[0];
  if (
    years !== 1 ||
    periods.length !== 1 ||
    !period ||
    period.id !== session.semesterId ||
    period.academicYearId !== session.academicYearId ||
    !period.academicYear.isActive ||
    period.closure ||
    session.serviceDate < period.startDate ||
    session.serviceDate > period.endDate ||
    session.serviceDate < period.academicYear.startDate ||
    session.serviceDate > period.academicYear.endDate
  )
    return 'STALE_OR_CLOSED_PERIOD';
  if (
    await tx.academicCalendar.findFirst({
      where: {
        academicYearId: session.academicYearId,
        type: { in: ['holiday', 'break'] },
        startDate: { lte: session.serviceDate },
        endDate: { gte: session.serviceDate },
      },
      select: { id: true },
    })
  )
    return 'HOLIDAY';
  const schedule = await tx.schedule.findUnique({
    where: { id: session.scheduleId },
    select: {
      classId: true,
      teachingAssignmentId: true,
      academicYear: true,
      semester: true,
      jpStart: true,
      jpEnd: true,
      concurrencyGroup: { select: { mode: true, expiresOn: true } },
    },
  });
  if (
    !schedule ||
    schedule.classId !== session.classId ||
    schedule.teachingAssignmentId !== session.teachingAssignmentId ||
    schedule.academicYear !== period.academicYear.code ||
    schedule.semester !== period.number
  )
    return 'STALE_SCHEDULE_SOURCE';
  if (!isScheduleOperational(schedule.concurrencyGroup, today)) return 'EXPIRED_CONCURRENCY';
  let bell;
  try {
    bell = await bells.resolveForDate(session.serviceDate, 'SCHOOL', tx);
  } catch {
    return 'INVALID_BELL_PROFILE';
  }
  if (bell.id !== session.bellScheduleProfileId) return 'STALE_BELL_PROFILE';
  const window = bells.resolveInstructionWindow(today, bell, schedule.jpStart, schedule.jpEnd);
  if (
    window.startAt.getTime() !== session.scheduledStartAt.getTime() ||
    window.endAt.getTime() !== session.scheduledEndAt.getTime()
  )
    return 'STALE_SESSION_WINDOW';
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes() + 420;
  const day = new Date(today).getUTCDay();
  const daily = bell.segments.some((segment) => segment.dayOfWeek !== 0);
  if (
    mode === 'alert' &&
    !bell.segments.some(
      (segment) =>
        segment.dayOfWeek === (daily ? day : 0) &&
        segment.type === 'INSTRUCTION' &&
        segment.jpNumber !== null &&
        segment.jpNumber >= schedule.jpStart &&
        segment.jpNumber <= schedule.jpEnd &&
        minute % 1440 >= segment.startMinute &&
        minute % 1440 < segment.endMinute,
    )
  )
    return 'OUTSIDE_INSTRUCTION';
  await acquireIdentityMutationLock(tx);
  if (
    !(await lockOperationalTeachers(tx, [session.assignedTeacherId])).has(session.assignedTeacherId)
  )
    return 'INELIGIBLE_TEACHER';
  if (
    mode === 'alert' &&
    (await tx.classSessionAlertAcknowledgement.findFirst({
      where: { delivery: { alert: { sessionId: session.id } } },
      select: { id: true },
    }))
  )
    return 'DISPLAY_ACKNOWLEDGED';
  return null;
}
