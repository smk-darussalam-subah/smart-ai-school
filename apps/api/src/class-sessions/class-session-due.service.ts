import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { logger } from '@smk/logger';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassSessionService } from './class-session.service';
import {
  lockSessionActivation,
  lockSessionInputs,
  sessionAlertSuppression,
  sessionSchoolDate,
} from '../common/helpers/class-session-activation';
import { OPERATIONAL_TEACHER_SELECT } from '../common/helpers/operational-teacher';

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
    private readonly sessions: ClassSessionService,
  ) {}

  onModuleInit() {
    void this.runDueScan().catch((error) => {
      logger.warn('[ClassSessionDue] Startup scan failed closed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    });
    this.timer = setInterval(
      () =>
        void this.runDueScan().catch((error) => {
          logger.warn('[ClassSessionDue] Scan failed closed', {
            errorType: error instanceof Error ? error.name : 'unknown',
          });
        }),
      SCAN_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runDueScan(at?: Date) {
    if (this.running) return { skipped: true, reason: 'OVERLAP_GUARD' };
    this.running = true;
    try {
      const prepared = await this.sessions.prepareToday(at);
      if (['ACTIVATION_DISABLED', 'SUNDAY', 'HOLIDAY'].includes(prepared.suppressed ?? ''))
        return { skipped: true, reason: prepared.suppressed };
      const now = at ?? new Date();
      const missedCount = await this.markMissed(now);
      const claims = await this.claimDueAlerts(now);
      let dispatchedCount = 0;
      let suppressedCount = 0;
      let pendingRecoveryCount = 0;
      for (const claim of claims) {
        try {
          const result = await this.dispatchClaim(claim, at);
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
      return {
        skipped: false,
        missedCount,
        claimedCount: claims.length,
        dispatchedCount,
        suppressedCount,
        pendingRecoveryCount,
      };
    } finally {
      this.running = false;
    }
  }

  private async markMissed(now: Date) {
    const missed = await this.prisma.$transaction(async (tx) => {
      await lockSessionInputs(tx);
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT cs.id FROM academic.class_sessions cs
          WHERE cs.status IN ('SCHEDULED'::academic."ClassSessionStatus", 'REASSIGNED'::academic."ClassSessionStatus")
            AND cs.scheduled_end_at <= ${now}
            AND cs.service_date = ${new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)}::date
            AND EXISTS (SELECT 1 FROM academic.class_session_activations a
              JOIN school.semesters sem ON sem.id=a.semester_id
              JOIN school.academic_years ay ON ay.id=sem.academic_year_id
              WHERE a.semester_id=cs.semester_id AND a.enabled AND sem.is_active AND ay.is_active
                AND EXISTS (SELECT 1 FROM academic.class_session_events e WHERE e.session_id=cs.id
                  AND e.event_key='class-session:activation:' || cs.id::text || ':' || a.revision::text))
            AND NOT EXISTS (
              SELECT 1 FROM academic.schedules s
              JOIN academic.schedule_concurrency_groups g ON g.id = s.concurrency_group_id
              WHERE s.id = cs.schedule_id AND (g.expires_on < cs.service_date OR
                (g.mode = 'AUTHORIZED_EXCEPTION' AND g.expires_on IS NULL))
            )
          ORDER BY cs.scheduled_end_at
          FOR UPDATE OF cs SKIP LOCKED
          LIMIT ${CLAIM_LIMIT}
      `);
      await lockSessionActivation(tx);
      const eligible: { id: string }[] = [];
      for (const row of rows) {
        const session = await tx.classSession.findUniqueOrThrow({ where: { id: row.id } });
        if (!(await sessionAlertSuppression(tx, this.bells, session, now, 'missed')))
          eligible.push(row);
      }
      if (eligible.length)
        await tx.classSession.updateMany({
          where: {
            id: { in: eligible.map((row) => row.id) },
            status: { in: ['SCHEDULED', 'REASSIGNED'] },
          },
          data: { status: 'MISSED', missedAt: now, version: { increment: 1 } },
        });
      if (eligible.length > 0) {
        await tx.classSessionEvent.createMany({
          data: eligible.map((row) => ({
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
          where: {
            sessionId: { in: eligible.map((row) => row.id) },
            status: { in: ['PENDING', 'CLAIMED'] },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancellationReason: 'SESSION_MISSED',
            claimToken: null,
            claimedAt: null,
            leaseUntil: null,
          },
        });
      }
      return eligible;
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

  private async dispatchClaim(claim: ClaimedAlert, at?: Date) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockSessionInputs(tx);
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
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM academic.class_sessions WHERE id = ${alert.sessionId}::uuid FOR UPDATE`,
      );
      await lockSessionActivation(tx);
      const now = at ?? new Date();
      const session = await tx.classSession.findUniqueOrThrow({
        where: { id: alert.sessionId },
        include: { assignedTeacher: { select: OPERATIONAL_TEACHER_SELECT } },
      });
      const suppression = await this.findSuppressionReason(tx, session, now);
      if (suppression) {
        await tx.classSessionAlert.update({
          where: { id: alert.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancellationReason: suppression,
            claimToken: null,
            claimedAt: null,
            leaseUntil: null,
          },
        });
        await tx.classSessionEvent.createMany({
          data: [
            {
              sessionId: session.id,
              eventType: 'ALERT_CANCELLED',
              eventKey: `class-session:alert-cancelled:${alert.id}`,
              actorType: 'SYSTEM',
              reason: suppression,
            },
          ],
          skipDuplicates: true,
        });
        return { suppressed: true, notificationLogIds: [] as string[] };
      }

      const notificationLogIds: string[] = [];
      if (alert.stage === 'ROOM_T10') {
        const devices = await tx.displayDevice.findMany({
          where: {
            status: 'ACTIVE',
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            profile: { in: ['RUANG_GURU', 'RUANG_TU'] },
          },
          select: { id: true, profile: true, audioEnabled: true, isAudibleLeader: true },
        });
        await tx.classSessionAlertDelivery.createMany({
          data: devices.map((device) => ({
            alertId: alert.id,
            deviceId: device.id,
            audible:
              device.profile === 'RUANG_GURU' && device.audioEnabled && device.isAudibleLeader,
          })),
          skipDuplicates: true,
        });
      } else {
        const recipients =
          alert.stage === 'PRIVATE_T5'
            ? [session.assignedTeacher.user.id]
            : await this.resolveEscalationRecipients(tx, session.academicYearId, now);
        const uniqueRecipients = [...new Set(recipients)].filter(Boolean);
        if (uniqueRecipients.length > 0) {
          await tx.notificationLog.createMany({
            data: uniqueRecipients.map((recipient) => ({
              recipient,
              channel: 'push' as const,
              subject:
                alert.stage === 'PRIVATE_T5'
                  ? 'Konfirmasi sesi pembelajaran'
                  : 'Eskalasi sesi pembelajaran',
              body:
                alert.stage === 'PRIVATE_T5'
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
              refType: 'class_session_alert',
              refId: alert.id,
              recipient: { in: uniqueRecipients },
              status: 'pending',
              channel: 'push',
            },
            select: { id: true },
          });
          notificationLogIds.push(...logs.map((log) => log.id));
        }
      }

      await tx.classSessionAlert.update({
        where: { id: alert.id },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: now,
          claimToken: null,
          claimedAt: null,
          leaseUntil: null,
        },
      });
      await tx.classSessionEvent.createMany({
        data: [
          {
            sessionId: session.id,
            eventType: 'ALERT_CREATED',
            eventKey: `class-session:alert-dispatched:${alert.id}`,
            actorType: 'SYSTEM',
            metadata: { stage: alert.stage },
          },
        ],
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
      assignedTeacherId: string;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
    },
    now: Date,
  ): Promise<string | null> {
    return sessionAlertSuppression(tx, this.bells, session, now);
  }

  private async resolveEscalationRecipients(
    tx: Prisma.TransactionClient,
    academicYearId: string,
    now: Date,
  ) {
    const schoolDate = new Date(sessionSchoolDate(now));
    const appointments = await tx.appointment.findMany({
      where: {
        academicYearId,
        status: 'ACTIVE',
        effectiveFrom: { lte: schoolDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: schoolDate } }],
        majorId: null,
        position: {
          code: { in: ['WAKA_KURIKULUM', 'KEPALA_SEKOLAH'] },
          scopeType: 'NONE',
          isActive: true,
        },
        staff: { deletedAt: null, user: { isActive: true, deletedAt: null } },
      },
      select: { staff: { select: { user: { select: { id: true } } } } },
    });
    const tataUsaha = await tx.user.findMany({
      where: { role: 'TATA_USAHA', isActive: true, deletedAt: null },
      select: { id: true },
    });
    return [
      ...appointments.map((appointment) => appointment.staff.user.id),
      ...tataUsaha.map((user) => user.id),
    ];
  }

  private async releaseClaim(claim: ClaimedAlert) {
    await this.prisma.classSessionAlert.updateMany({
      where: { id: claim.id, claimToken: claim.claimToken, status: 'CLAIMED' },
      data: { status: 'PENDING', claimToken: null, claimedAt: null, leaseUntil: null },
    });
  }
}
