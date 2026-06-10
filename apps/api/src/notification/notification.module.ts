// =============================================================================
// NotificationModule
//
// Provider NOTIFICATION_ADAPTER dipilih via env NOTIF_PROVIDER:
//   fonnte → FonnteAdapter (FONNTE_API_KEY wajib ada)
//   smtp   → SmtpAdapter (SMTP_* wajib ada, belum diimplementasikan penuh — stub)
//   log    → LogAdapter (default: dev/CI, tidak kirim nyata)
//
// BullMQ Queue + Worker untuk durability dan rate-limiting.
// NotificationAdapter interface ada di @smk/types (anti lock-in).
// =============================================================================

import { Module } from '@nestjs/common';
import { NotificationAdapter } from '@smk/types';
import { Queue, RedisOptions } from 'bullmq';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';
import { LogAdapter } from './adapters/log.adapter';
import { FonnteAdapter } from './adapters/fonnte.adapter';
import { SmtpAdapter } from './adapters/smtp.adapter';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { createNotificationQueue, NotifJob } from './queue.config';
import { createNotificationWorker } from './notification-worker';

function buildRedisConnection(): RedisOptions {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

function buildAdapter(): NotificationAdapter {
  const provider = process.env['NOTIF_PROVIDER'] ?? 'log';
  if (provider === 'fonnte') {
    const apiKey = process.env['FONNTE_API_KEY'];
    if (!apiKey) throw new Error('FONNTE_API_KEY wajib ada saat NOTIF_PROVIDER=fonnte');
    return new FonnteAdapter(apiKey);
  }
  if (provider === 'smtp') {
    const host = process.env['SMTP_HOST'] ?? '';
    const port = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
    const user = process.env['SMTP_USER'] ?? '';
    const pass = process.env['SMTP_PASSWORD'] ?? '';
    return new SmtpAdapter(host, port, user, pass);
  }
  return new LogAdapter();
}

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: 'NOTIFICATION_ADAPTER', useFactory: buildAdapter },
    { provide: 'REDIS_CONNECTION', useFactory: buildRedisConnection },
    {
      provide: 'NOTIFICATION_QUEUE',
      useFactory: (conn: RedisOptions) => createNotificationQueue(conn as unknown as Record<string, unknown>),
      inject: ['REDIS_CONNECTION'],
    },
    {
      provide: 'NOTIFICATION_WORKER',
      useFactory: (conn: RedisOptions, adapter: NotificationAdapter, prisma: PrismaService) =>
        createNotificationWorker(conn as unknown as Record<string, unknown>, adapter, prisma),
      inject: ['REDIS_CONNECTION', 'NOTIFICATION_ADAPTER', PrismaService],
    },
    {
      provide: NotificationService,
      useFactory: (prisma: PrismaService, queue: Queue<NotifJob>) => {
        const service = new NotificationService(prisma);
        service.setQueue(queue);
        return service;
      },
      inject: [PrismaService, 'NOTIFICATION_QUEUE'],
    },
    NotificationListener,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
