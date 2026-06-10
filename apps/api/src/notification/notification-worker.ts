import { Worker, Job } from 'bullmq';
import { NotificationAdapter } from '@smk/types';
import { PrismaService } from '../prisma/prisma.service';
import { logger } from '@smk/logger';
import { NotifJob, NOTIFICATION_QUEUE } from './queue.config';

const CONCURRENCY = parseInt(process.env.NOTIF_QUEUE_CONCURRENCY || '1', 10);

export function createNotificationWorker(
  connection: Record<string, unknown>,
  adapter: NotificationAdapter,
  prisma: PrismaService,
): Worker<NotifJob> {
  const worker = new Worker<NotifJob>(
    NOTIFICATION_QUEUE,
    async (job: Job<NotifJob>) => {
      const { logId, channel, to, body, subject } = job.data;

      logger.debug('[NotifWorker] Processing', { logId, channel, attempt: job.attemptsMade + 1 });

      try {
        await adapter.send(channel, to, body, subject);

        await prisma.notificationLog.update({
          where: { id: logId },
          data: { status: 'sent', sentAt: new Date() },
        });

        logger.info('[NotifWorker] Sent', { logId, channel });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const willRetry = job.attemptsMade + 1 < (job.opts.attempts || 5);

        logger.warn('[NotifWorker] Failed', {
          logId, channel, attempt: job.attemptsMade + 1,
          willRetry, error: message,
        });

        if (!willRetry) {
          await prisma.notificationLog.update({
            where: { id: logId },
            data: { status: 'failed', error: message },
          }).catch((updateErr: unknown) => {
            logger.error('[NotifWorker] Gagal update status failed', { logId, updateErr });
          });
        }

        throw err; // Re-throw agar BullMQ retry
      }
    },
    {
      connection: connection as never,
      concurrency: CONCURRENCY,
      autorun: true,
    },
  );

  worker.on('completed', (job) => {
    logger.debug('[NotifWorker] Completed', { jobId: job.id, logId: job.data.logId });
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error('[NotifWorker] Final failure', {
        jobId: job.id, logId: job.data.logId,
        attempts: job.attemptsMade, error: err.message,
      });
    }
  });

  logger.info('[NotifWorker] Started', { concurrency: CONCURRENCY });
  return worker;
}
