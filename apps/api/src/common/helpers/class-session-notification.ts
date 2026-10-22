import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BellScheduleService } from '../../bell-schedule/bell-schedule.service';
import {
  lockSessionActivation,
  lockSessionInputs,
  sessionAlertSuppression,
  sessionSchoolDate,
} from './class-session-activation';
import { OPERATIONAL_TEACHER_SELECT } from './operational-teacher';
import { studentAttendanceNoticeTarget } from './student-session-notification';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function resolveNotificationIntent(prisma: PrismaService, logId: string) {
  const select = {
    status: true,
    channel: true,
    recipient: true,
    body: true,
    subject: true,
    refType: true,
    refId: true,
    createdAt: true,
  } as const;
  const log = await prisma.notificationLog.findUnique({ where: { id: logId }, select });
  if (log?.status !== 'pending') return null;
  if (log.refType === 'student_session_attendance') {
    if (await studentAttendanceNoticeTarget(prisma, log)) return log;
    await prisma.notificationLog.updateMany({where:{id:logId,status:'pending'},data:{status:'failed',error:'ATTENDANCE_SCOPE_OR_VERSION_CHANGED'}});
    return null;
  }
  if (log.refType !== 'class_session_alert') return log;
  if (!UUID.test(log.refId ?? '') || !UUID.test(log.recipient)) {
    await prisma.notificationLog.updateMany({
      where: { id: logId, status: 'pending' },
      data: { status: 'failed', error: 'INVALID_CLASS_SESSION_REF' },
    });
    return null;
  }
  return prisma.$transaction(async (tx) => {
    await lockSessionInputs(tx);
    const alert = await tx.classSessionAlert.findUnique({
      where: { id: log.refId! },
      select: { sessionId: true },
    });
    if (!alert) {
      await tx.notificationLog.updateMany({
        where: { id: logId, status: 'pending' },
        data: { status: 'failed', error: 'MISSING_ALERT' },
      });
      return null;
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM academic.class_sessions WHERE id=${alert.sessionId}::uuid FOR UPDATE`,
    );
    await lockSessionActivation(tx);
    const fresh = await tx.notificationLog.findUnique({ where: { id: logId }, select });
    if (fresh?.status !== 'pending') return null;
    const current = await tx.classSessionAlert.findUnique({
      where: { id: log.refId! },
      include: {
        session: { include: { assignedTeacher: { select: OPERATIONAL_TEACHER_SELECT } } },
      },
    });
    const now = new Date();
    let reason =
      !current || current.status !== 'DISPATCHED'
        ? 'INACTIVE_ALERT'
        : await sessionAlertSuppression(tx, new BellScheduleService(prisma), current.session, now);
    if (!reason && current) {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM auth.users WHERE id=${fresh.recipient}::uuid FOR SHARE`,
      );
      const recipient = await tx.user.findFirst({
        where: {
          id: fresh.recipient,
          isActive: true,
          deletedAt: null,
          staff: { is: { deletedAt: null } },
        },
        select: { id: true, role: true },
      });
      if (!recipient) reason = 'INACTIVE_RECIPIENT';
      else if (
        current.stage === 'PRIVATE_T5' &&
        recipient.id !== current.session.assignedTeacher.user.id
      )
        reason = 'STALE_RECIPIENT';
      else if (
        current.stage === 'ESCALATION_T15' &&
        recipient.role !== 'TATA_USAHA' &&
        !(await tx.appointment.count({
          where: {
            academicYearId: current.session.academicYearId,
            status: 'ACTIVE',
            effectiveFrom: { lte: new Date(sessionSchoolDate(now)) },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: new Date(sessionSchoolDate(now)) } },
            ],
            majorId: null,
            staff: { userId: recipient.id, deletedAt: null },
            position: {
              code: { in: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM'] },
              scopeType: 'NONE',
              isActive: true,
            },
          },
        }))
      )
        reason = 'STALE_ESCALATION_RECIPIENT';
    }
    if (reason) {
      await tx.notificationLog.updateMany({
        where: { id: logId, status: 'pending' },
        data: { status: 'failed', error: reason },
      });
      return null;
    }
    return fresh;
  });
}
