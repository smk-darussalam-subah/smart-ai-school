// =============================================================================
// NotificationService — Durability layer untuk notifikasi
//
// Pola (dari docs/tahap1-sprint-plan.md §5 + sprint3-design §1):
//   1. Tulis notification_logs status=pending SEBELUM kirim (crash-safe)
//   2. Idempotensi (N-9): jika sudah ada log sent untuk
//      refType+refId+recipient+channel → SKIP
//   3. Panggil adapter.send(). Sukses → sent; Gagal → failed + error (TIDAK throw)
//   4. onModuleInit: retry pending > 5 menit (batch 50) sebagai crash recovery
//
// Catatan: NotificationService tidak di-expose via controller di Sprint 3.
//          Hanya dipanggil via event wiring (SMA-43).
// =============================================================================

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationAdapter } from '@smk/types';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';

const RETRY_BATCH_LIMIT = 50;
const PENDING_STALE_MINUTES = 5;

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
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_ADAPTER')
    private readonly adapter: NotificationAdapter,
  ) {}

  // ── onModuleInit: startup retry ───────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const staleThreshold = new Date(Date.now() - PENDING_STALE_MINUTES * 60 * 1000);
    const stale = await this.prisma.notificationLog.findMany({
      where: { status: 'pending', createdAt: { lt: staleThreshold } },
      take: RETRY_BATCH_LIMIT,
      orderBy: { createdAt: 'asc' },
    });

    if (stale.length > 0) {
      logger.info(`[NotificationService] Startup retry: ${stale.length} pending stale`, {
        count: stale.length,
      });
    }

    for (const log of stale) {
      await this._attemptSend(log.id, log.channel as 'whatsapp' | 'email', log.recipient, log.body, log.subject ?? undefined);
    }
  }

  // ── notify() — entrypoint utama ───────────────────────────────────────────

  async notify(input: NotifyInput): Promise<void> {
    const { channel, to, body, subject, refType, refId } = input;

    // 1. Idempotensi: skip jika sudah terkirim dengan ref yang sama
    if (refType && refId) {
      const existing = await this.prisma.notificationLog.findFirst({
        where: { refType, refId, recipient: to, channel, status: 'sent' },
        select: { id: true },
      });
      if (existing) {
        logger.info('[NotificationService] Skip (sudah sent)', { refType, refId, channel, to });
        return;
      }
    }

    // 2. Tulis pending SEBELUM kirim (durability guardrail)
    const log = await this.prisma.notificationLog.create({
      data: { recipient: to, channel, subject, body, status: 'pending', refType, refId },
    });

    // 3. Kirim via adapter; fail-soft (tidak throw ke caller)
    await this._attemptSend(log.id, channel, to, body, subject);
  }

  // ── _attemptSend — update status setelah kirim ───────────────────────────

  private async _attemptSend(
    logId: string,
    channel: 'whatsapp' | 'email',
    to: string,
    body: string,
    subject?: string,
  ): Promise<void> {
    try {
      await this.adapter.send(channel, to, body, subject);
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[NotificationService] Pengiriman gagal (fail-soft)', { logId, channel, to, error: message });
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'failed', error: message },
      }).catch((updateErr: unknown) => {
        logger.error('[NotificationService] Gagal update status failed', { logId, updateErr });
      });
      // Sengaja tidak throw — kegagalan notif tidak boleh menggagalkan transaksi bisnis
    }
  }
}
