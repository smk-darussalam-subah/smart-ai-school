// =============================================================================
// NotificationService — Durability + Queue
//
// Flow:
//   1. notify() → idempotensi check → tulis pending → queue.add() → return
//   2. NotificationWorker pick up job → adapter.send() → update to sent/failed
//   3. Retry + rate-limit + backoff di-handle BullMQ (queue.config.ts)
//   4. onModuleInit: stale pending jobs → queue.add() (recovery)
// =============================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { NotifJob, NOTIFICATION_QUEUE } from './queue.config';

const STALE_MINUTES = 5;
const STALE_RETRY_LIMIT = 50;

export interface NotifyInput {
  channel: 'whatsapp' | 'email';
  to: string;
  body: string;
  subject?: string;
  refType?: string;
  refId?: string;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private queue: Queue<NotifJob> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  setQueue(queue: Queue<NotifJob>): void {
    this.queue = queue;
  }

  async onModuleInit(): Promise<void> {
    // Startup recovery: ambil pending stale > 5 menit → masukkan ke queue
    if (!this.queue) {
      logger.warn('[NotificationService] Queue not ready, skipping startup recovery');
      return;
    }

    try {
      const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
      const stale = await this.prisma.notificationLog.findMany({
        where: { status: 'pending', createdAt: { lt: staleThreshold } },
        take: STALE_RETRY_LIMIT,
        orderBy: { createdAt: 'asc' },
      });

      if (stale.length > 0) {
        logger.info(`[NotificationService] Recovery: adding ${stale.length} stale jobs to queue`);

        for (const log of stale) {
          await this.queue.add(log.channel as 'whatsapp' | 'email', {
            logId: log.id,
            channel: log.channel as 'whatsapp' | 'email',
            to: log.recipient,
            body: log.body,
            subject: log.subject ?? undefined,
          }, { jobId: log.id });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[NotificationService] Startup recovery skipped', { error: message });
    }
  }

  async notify(input: NotifyInput): Promise<void> {
    if (!this.queue) {
      logger.error('[NotificationService] Queue not initialized — notification skipped', input);
      return;
    }

    const { channel, to, body, subject, refType, refId } = input;

    // 1. Idempotensi
    if (refType && refId) {
      const existing = await this.prisma.notificationLog.findFirst({
        where: { refType, refId, recipient: to, channel, status: 'sent' },
        select: { id: true },
      });
      if (existing) {
        logger.info('[NotificationService] Skip (already sent)', { refType, refId, channel });
        return;
      }
    }

    // 2. Tulis pending (durability)
    const log = await this.prisma.notificationLog.create({
      data: { recipient: to, channel, subject, body, status: 'pending', refType, refId },
    });

    // 3. Queue job — fire and forget
    await this.queue.add(channel, {
      logId: log.id,
      channel,
      to,
      body,
      subject,
    }, { jobId: log.id });

    logger.debug('[NotificationService] Queued', { logId: log.id, channel });
  }
}
