// =============================================================================
// NotificationService - durable notification queue
//
// Flow:
//   1. notify() writes a pending log row.
//   2. BullMQ receives a deterministic jobId equal to notificationLog.id.
//   3. NotificationWorker sends and marks the row sent/failed.
//   4. Startup and periodic recovery requeue stale pending rows.
// =============================================================================

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { NotifJob } from './queue.config';

const STALE_MINUTES = 5;
const STALE_RETRY_LIMIT = 50;
const PENDING_RECOVERY_INTERVAL_MS = 60_000;

export interface NotifyInput {
  channel: 'whatsapp' | 'email';
  to: string;
  body: string;
  subject?: string;
  refType?: string;
  refId?: string;
}

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue<NotifJob> | null = null;
  private pendingRecoveryTimer: NodeJS.Timeout | null = null;
  private pendingRecoveryRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  setQueue(queue: Queue<NotifJob>): void {
    this.queue = queue;
  }

  async onModuleInit(): Promise<void> {
    if (!this.queue) {
      logger.warn('[NotificationService] Queue not ready during startup recovery');
      throw new Error('Notification queue not initialized');
    }

    await this.recoverPendingNotifications('startup');
    this.pendingRecoveryTimer = setInterval(
      () => void this.recoverPendingNotifications('interval'),
      PENDING_RECOVERY_INTERVAL_MS,
    );
    this.pendingRecoveryTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.pendingRecoveryTimer) {
      clearInterval(this.pendingRecoveryTimer);
      this.pendingRecoveryTimer = null;
    }
  }

  async notify(input: NotifyInput): Promise<void> {
    if (!this.queue) {
      logger.error('[NotificationService] Queue not initialized - notification requires retry', {
        channel: input.channel,
        hasRef: Boolean(input.refType && input.refId),
      });
      throw new Error('Notification queue not initialized');
    }

    const { channel, to, body, subject, refType, refId } = input;

    if (refType && refId) {
      const existing = await this.findExistingRefLog({ refType, refId, to, channel });
      if (existing && await this.handleExistingRefLog(existing, { refType, refId, channel })) return;
    }

    const log = await this.prisma.notificationLog.create({
      data: { recipient: to, channel, subject, body, status: 'pending', refType, refId },
    }).catch(async (error: unknown) => {
      if (refType && refId && this.isUniqueConstraintError(error)) {
        const existing = await this.findExistingRefLog({ refType, refId, to, channel });
        if (existing && await this.handleExistingRefLog(existing, { refType, refId, channel })) return null;
      }
      throw error;
    });
    if (!log) return;

    await this.enqueuePendingLog({
      id: log.id,
      channel,
      recipient: to,
      body,
      subject,
    });

    logger.debug('[NotificationService] Queued', { logId: log.id, channel });
  }

  private async recoverPendingNotifications(source: 'startup' | 'interval'): Promise<void> {
    if (!this.queue) return;
    if (this.pendingRecoveryRunning) return;
    this.pendingRecoveryRunning = true;
    try {
      const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
      const stale = await this.prisma.notificationLog.findMany({
        where: { status: 'pending', createdAt: { lt: staleThreshold } },
        take: STALE_RETRY_LIMIT,
        orderBy: { createdAt: 'asc' },
      });

      if (stale.length > 0) {
        logger.info(`[NotificationService] Recovery: adding ${stale.length} stale jobs to queue`);
      }

      for (const log of stale) {
        await this.enqueuePendingLog({
          id: log.id,
          channel: log.channel as 'whatsapp' | 'email',
          recipient: log.recipient,
          body: log.body,
          subject: log.subject ?? undefined,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[NotificationService] Pending recovery skipped', { source, error: message });
    } finally {
      this.pendingRecoveryRunning = false;
    }
  }

  private async findExistingRefLog(input: {
    refType: string;
    refId: string;
    to: string;
    channel: 'whatsapp' | 'email';
  }) {
    return this.prisma.notificationLog.findFirst({
      where: {
        refType: input.refType,
        refId: input.refId,
        recipient: input.to,
        channel: input.channel,
        status: { in: ['pending', 'sent'] },
      },
      select: { id: true, status: true, channel: true, recipient: true, body: true, subject: true },
    });
  }

  private async handleExistingRefLog(
    existing: {
      id: string;
      status: string;
      channel: string;
      recipient: string;
      body: string;
      subject: string | null;
    },
    context: { refType: string; refId: string; channel: 'whatsapp' | 'email' },
  ): Promise<boolean> {
    if (existing.status === 'sent') {
      logger.info('[NotificationService] Skip (already sent)', {
        refType: context.refType,
        refId: context.refId,
        channel: context.channel,
        status: existing.status,
      });
      return true;
    }

    await this.enqueuePendingLog({
      id: existing.id,
      channel: existing.channel as 'whatsapp' | 'email',
      recipient: existing.recipient,
      body: existing.body,
      subject: existing.subject ?? undefined,
    });
    logger.info('[NotificationService] Requeued pending notification log', {
      refType: context.refType,
      refId: context.refId,
      channel: context.channel,
      logId: existing.id,
    });
    return true;
  }

  private async enqueuePendingLog(log: {
    id: string;
    channel: 'whatsapp' | 'email';
    recipient: string;
    body: string;
    subject?: string;
  }): Promise<void> {
    await this.queue!.add(log.channel, {
      logId: log.id,
      channel: log.channel,
      to: log.recipient,
      body: log.body,
      subject: log.subject,
    }, { jobId: log.id });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
  }
}
