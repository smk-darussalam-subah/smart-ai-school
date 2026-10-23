import { Worker, Job, WorkerOptions } from 'bullmq';
import { NotificationAdapter } from '@smk/types';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { logger } from '@smk/logger';
import { NotifJob, NOTIFICATION_QUEUE, resolveNotificationQueuePrefix } from './queue.config';
import { resolveNotificationIntent } from '../common/helpers/class-session-notification';

const CONCURRENCY = parseInt(process.env.NOTIF_QUEUE_CONCURRENCY || '1', 10);

export function buildNotificationWorkerOptions(
  connection: Record<string, unknown>,
  prefix = resolveNotificationQueuePrefix(),
): WorkerOptions {
  return {
    connection: connection as never,
    prefix,
    concurrency: CONCURRENCY,
    autorun: true,
  };
}

export function createNotificationWorker(
  connection: Record<string, unknown>,
  adapter: NotificationAdapter,
  prisma: PrismaService,
  prefix = resolveNotificationQueuePrefix(),
  pushService?: PushService,
): Worker<NotifJob> {
  const worker = new Worker<NotifJob>(
    NOTIFICATION_QUEUE,
    async (job: Job<NotifJob>) => {
      const { logId } = job.data;
      const pending = await resolvePendingNotificationIntent(prisma, logId);
      if (!pending) {
        logger.info('[NotifWorker] Skipped inactive notification intent', { logId });
        return;
      }
      const channel = pending.channel;
      const to = pending.recipient;
      const body = pending.body;
      const subject = pending.subject ?? undefined;

      logger.debug('[NotifWorker] Processing', { logId, channel, attempt: job.attemptsMade + 1 });

      try {
        if (channel === 'push') {
          if (!pushService) throw new Error('Push service not initialized');
          await pushService.dispatchNotificationLog({
            logId,
            userId: to,
            title: subject ?? 'Notifikasi DIIS',
            body,
            ...(pending.refType==='student_session_attendance'?{kind:'student-attendance' as const}:{}),
            ...(['class_session_alert', 'student_session_attendance'].includes(pending.refType ?? '')
              ? {
                  beforeSend: async () =>
                    Boolean(await resolvePendingNotificationIntent(prisma, logId)),
                }
              : {}),
          });
        } else {
          await adapter.send(channel, to, body, subject);
        }

        const marked = await prisma.notificationLog.updateMany({
          where: { id: logId, status: 'pending' },
          data: { status: 'sent', sentAt: new Date() },
        });

        logger.info(
          marked.count ? '[NotifWorker] Sent' : '[NotifWorker] Intent stopped during dispatch',
          { logId, channel },
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const willRetry = job.attemptsMade + 1 < (job.opts.attempts || 5);

        logger.warn('[NotifWorker] Failed', {
          logId,
          channel,
          attempt: job.attemptsMade + 1,
          willRetry,
          error: message,
        });

        if (!willRetry) {
          await prisma.notificationLog
            .updateMany({
              where: { id: logId, status: 'pending' },
              data: { status: 'failed', error: message },
            })
            .catch((updateErr: unknown) => {
              logger.error('[NotifWorker] Gagal update status failed', { logId, updateErr });
            });
        }

        throw err; // Re-throw agar BullMQ retry
      }
    },
    buildNotificationWorkerOptions(connection, prefix),
  );

  worker.on('completed', (job) => {
    logger.debug('[NotifWorker] Completed', { jobId: job.id, logId: job.data.logId });
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error('[NotifWorker] Final failure', {
        jobId: job.id,
        logId: job.data.logId,
        attempts: job.attemptsMade,
        error: err.message,
      });
    }
  });

  logger.info('[NotifWorker] Started', { concurrency: CONCURRENCY, prefix });
  return worker;
}

export async function resolvePendingNotificationIntent(prisma: PrismaService, logId: string) {
  return resolveNotificationIntent(prisma, logId);
}
