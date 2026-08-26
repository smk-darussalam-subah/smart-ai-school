import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { logger } from '@smk/logger';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';

const SCAN_INTERVAL_MS = 60_000;
const CLAIM_LIMIT = 100;
const CLAIM_LEASE_MS = 2 * 60_000;

interface ClaimedAlert {
  id: string;
  claimToken: string;
}

export function isClassSessionAlertDue(dueAt: Date, now: Date) {
  return dueAt.getTime() <= now.getTime();
}

@Injectable()
export class ClassSessionDueService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bells: BellScheduleService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDueScan(), SCAN_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runDueScan(now = new Date()) {
    if (this.running) return { skipped: true, reason: 'OVERLAP_GUARD' };
    this.running = true;
    try {
      const missedCount = await this.markMissed(now);
      const claims = await this.claimDueAlerts(now);
      let dispatchedCount = 0;
      let suppressedCount = 0;
      let pendingRecoveryCount = 0;
      for (const claim of claims) {
        try {
          const result = await this.dispatchClaim(claim, now);
          if (result.suppressed) suppressedCount += 1;
          else dispatchedCount += 1;
          pendingRecoveryCount += result.pendingRecovery ? 1 : 0;
        } catch (error) {
          await this.releaseClaim(claim);
          logger.warn('[ClassSessionDue] Claim released for retry', {
            alertId: claim.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { skipped: false, missedCount, claimedCount: claims.length, dispatchedCount, suppressedCount, pendingRecoveryCount };
    } finally {
      this.running = false;
    }
  }

  private async markMissed(now: Date) {
    const missed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE academic.class_sessions
        SET status = 'MISSED'::academic."ClassSessionStatus",
            missed_at = ${now},
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT id FROM academic.class_sessions
          WHERE status IN ('SCHEDULED'::academic."ClassSessionStatus", 'REASSIGNED'::academic."ClassSessionStatus")
            AND scheduled_end_at <= ${now}
          ORDER BY scheduled_end_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${CLAIM_LIMIT}
        )
        RETURNING id
      `);
      if (rows.length > 0) {
        await tx.classSessionEvent.createMany({
          data: rows.map((row) => ({
            sessionId: row.id,
            eventType: 'MISSED',
            eventKey: `class-session:missed:${row.id}`,
            actorType: 'SYSTEM',
            metadata: { reason: 'scheduled-end-without-start' },
            occurredAt: now,
          })),
          skipDuplicates: true,
        });
        await tx.classSessionAlert.updateMany({
          where: { sessionId: { in: rows.map((row) => row.id) }, status: { in: ['PENDING', 'CLAIMED'] } },
          data: {
            status: 'CANCELLED', cancelledAt: now, cancellationReason: 'SESSION_MISSED',
            claimToken: null, claimedAt: null, leaseUntil: null,
          },
        });
      }
      return rows;
    });
    return missed.length;
  }

  private async claimDueAlerts(now: Date): Promise<ClaimedAlert[]> {
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
    const claimToken = randomUUID();
    return this.prisma.$queryRaw<ClaimedAlert[]>(Prisma.sql`
      UPDATE academic.class_session_alerts
      SET status = 'CLAIMED'::academic."ClassSessionAlertStatus",
          claim_token = ${claimToken}::uuid,
          claimed_at = ${now},
          lease_until = ${leaseUntil},
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT alert.id
        FROM academic.class_session_alerts alert
        JOIN academic.class_sessions session ON session.id = alert.session_id
        WHERE alert.due_at <= ${now}
          AND (
            alert.status = 'PENDING'::academic."ClassSessionAlertStatus"
            OR (alert.status = 'CLAIMED'::academic."ClassSessionAlertStatus" AND alert.lease_until < ${now})
          )
          AND session.status IN ('SCHEDULED'::academic."ClassSessionStatus", 'REASSIGNED'::academic."ClassSessionStatus")
        ORDER BY alert.due_at
        FOR UPDATE OF alert SKIP LOCKED
        LIMIT ${CLAIM_LIMIT}
      )
      RETURNING id, claim_token AS "claimToken"
    `);
  }

  private async dispatchClaim(claim: ClaimedAlert, now: Date) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.classSessionAlert.findFirst({
        where: { id: claim.id, claimToken: claim.claimToken, status: 'CLAIMED' },
        include: {
          session: {
            include: {
              assignedTeacher: { select: { user: { select: { keycloakId: true } } } },
              bellScheduleProfile: { select: { id: true } },
            },
          },
        },
      });
      if (!alert) return { suppressed: true, notificationLogIds: [] as string[] };
      await tx.$queryRaw(Prisma.sql`SELECT id FROM academic.class_sessions WHERE id = ${alert.sessionId}::uuid FOR UPDATE`);
      const session = await tx.classSession.findUniqueOrThrow({
        where: { id: alert.sessionId },
        include: { assignedTeacher: { select: { user: { select: { keycloakId: true } } } } },
      });
      const suppression = await this.findSuppressionReason(tx, session, now);
      if (suppression) {
        await tx.classSessionAlert.update({
          where: { id: alert.id },
          data: {
            status: 'CANCELLED', cancelledAt: now, cancellationReason: suppression,
            claimToken: null, claimedAt: null, leaseUntil: null,
          },
        });
        await tx.classSessionEvent.createMany({
          data: [{
            sessionId: session.id,
            eventType: 'ALERT_CANCELLED',
            eventKey: `class-session:alert-cancelled:${alert.id}`,
            actorType: 'SYSTEM',
            reason: suppression,
          }],
          skipDuplicates: true,
        });
        return { suppressed: true, notificationLogIds: [] as string[] };
      }

      const notificationLogIds: string[] = [];
      if (alert.stage === 'ROOM_T10') {
        const devices = await tx.displayDevice.findMany({
          where: {
            status: 'ACTIVE', revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            profile: { in: ['RUANG_GURU', 'RUANG_TU'] },
          },
          select: { id: true, profile: true, audioEnabled: true, isAudibleLeader: true },
        });
        await tx.classSessionAlertDelivery.createMany({
          data: devices.map((device) => ({
            alertId: alert.id,
            deviceId: device.id,
            audible: device.profile === 'RUANG_GURU' && device.audioEnabled && device.isAudibleLeader,
          })),
          skipDuplicates: true,
        });
      } else {
        const recipients = alert.stage === 'PRIVATE_T5'
          ? [session.assignedTeacher.user.keycloakId]
          : await this.resolveEscalationRecipients(tx, session.academicYearId, now);
        const uniqueRecipients = [...new Set(recipients)].filter(Boolean);
        if (uniqueRecipients.length > 0) {
          await tx.notificationLog.createMany({
            data: uniqueRecipients.map((recipient) => ({
              recipient,
              channel: 'push' as const,
              subject: alert.stage === 'PRIVATE_T5' ? 'Konfirmasi sesi pembelajaran' : 'Eskalasi sesi pembelajaran',
              body: alert.stage === 'PRIVATE_T5'
                ? `Konfirmasi kehadiran mengajar untuk ${session.classNameSnapshot} - ${session.subjectSnapshot}.`
                : `Sesi ${session.classNameSnapshot} - ${session.subjectSnapshot} belum dikonfirmasi.`,
              status: 'pending' as const,
              refType: 'class_session_alert',
              refId: alert.id,
            })),
            skipDuplicates: true,
          });
          const logs = await tx.notificationLog.findMany({
            where: {
              refType: 'class_session_alert', refId: alert.id,
              recipient: { in: uniqueRecipients }, status: 'pending', channel: 'push',
            },
            select: { id: true },
          });
          notificationLogIds.push(...logs.map((log) => log.id));
        }
      }

      await tx.classSessionAlert.update({
        where: { id: alert.id },
        data: {
          status: 'DISPATCHED', dispatchedAt: now,
          claimToken: null, claimedAt: null, leaseUntil: null,
        },
      });
      await tx.classSessionEvent.createMany({
        data: [{
          sessionId: session.id,
          eventType: 'ALERT_CREATED',
          eventKey: `class-session:alert-dispatched:${alert.id}`,
          actorType: 'SYSTEM',
          metadata: { stage: alert.stage },
        }],
        skipDuplicates: true,
      });
      return { suppressed: false, notificationLogIds };
    });

    let pendingRecovery = false;
    if (outcome.notificationLogIds.length > 0) {
      try {
        await this.notifications.enqueueCommittedPendingLogs(outcome.notificationLogIds);
      } catch (error) {
        pendingRecovery = true;
        logger.warn('[ClassSessionDue] Durable notification awaits queue recovery', {
          alertId: claim.id,
          count: outcome.notificationLogIds.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { suppressed: outcome.suppressed, pendingRecovery };
  }

  private async findSuppressionReason(
    tx: Prisma.TransactionClient,
    session: {
      id: string;
      status: string;
      serviceDate: Date;
      academicYearId: string;
      semesterId: string;
      bellScheduleProfileId: string;
      scheduleId: string;
      classId: string;
      teachingAssignmentId: string;
    },
    now: Date,
  ): Promise<string | null> {
    if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) return `SESSION_${session.status}`;
    const [years, semesters] = await Promise.all([
      tx.academicYear.findMany({ where: { isActive: true }, take: 2, select: { id: true } }),
      tx.semester.findMany({ where: { isActive: true }, take: 2, select: { id: true, academicYearId: true } }),
    ]);
    if (
      years.length !== 1 || semesters.length !== 1
      || years[0]!.id !== session.academicYearId
      || semesters[0]!.id !== session.semesterId
      || semesters[0]!.academicYearId !== years[0]!.id
    ) return 'STALE_OR_AMBIGUOUS_PERIOD';
    const holiday = await tx.academicCalendar.findFirst({
      where: {
        academicYearId: session.academicYearId, type: 'holiday',
        startDate: { lte: session.serviceDate }, endDate: { gte: session.serviceDate },
      },
      select: { id: true },
    });
    if (holiday) return 'HOLIDAY';
    const schedule = await tx.schedule.findUnique({
      where: { id: session.scheduleId },
      select: { classId: true, teachingAssignmentId: true },
    });
    if (!schedule || schedule.classId !== session.classId || schedule.teachingAssignmentId !== session.teachingAssignmentId) {
      return 'STALE_SCHEDULE_SOURCE';
    }
    try {
      const bell = await this.bells.resolveForDate(session.serviceDate, 'SCHOOL', tx);
      if (bell.id !== session.bellScheduleProfileId) return 'STALE_BELL_PROFILE';
    } catch {
      return 'INVALID_BELL_PROFILE';
    }
    const acknowledged = await tx.classSessionAlertAcknowledgement.findFirst({
      where: { delivery: { alert: { sessionId: session.id } } },
      select: { id: true },
    });
    if (acknowledged) return 'DISPLAY_ACKNOWLEDGED';
    if (session.serviceDate > now) return 'FUTURE_SESSION_DATE';
    return null;
  }

  private async resolveEscalationRecipients(tx: Prisma.TransactionClient, academicYearId: string, now: Date) {
    const appointments = await tx.appointment.findMany({
      where: {
        academicYearId,
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
        position: { code: { in: ['WAKA_KURIKULUM', 'KEPALA_SEKOLAH'] }, isActive: true },
        staff: { deletedAt: null, user: { isActive: true, deletedAt: null } },
      },
      select: { staff: { select: { user: { select: { keycloakId: true } } } } },
    });
    const tataUsaha = await tx.user.findMany({
      where: { role: 'TATA_USAHA', isActive: true, deletedAt: null },
      select: { keycloakId: true },
    });
    return [
      ...appointments.map((appointment) => appointment.staff.user.keycloakId),
      ...tataUsaha.map((user) => user.keycloakId),
    ];
  }

  private async releaseClaim(claim: ClaimedAlert) {
    await this.prisma.classSessionAlert.updateMany({
      where: { id: claim.id, claimToken: claim.claimToken, status: 'CLAIMED' },
      data: { status: 'PENDING', claimToken: null, claimedAt: null, leaseUntil: null },
    });
  }
}
