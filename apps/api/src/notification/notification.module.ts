// =============================================================================
// NotificationModule
//
// Provider NOTIFICATION_ADAPTER dipilih via env NOTIF_PROVIDER:
//   fonnte → FonnteAdapter (FONNTE_API_KEY wajib ada)
//   smtp   → SmtpAdapter (SMTP_* wajib ada, belum diimplementasikan penuh — stub)
//   log    → LogAdapter (default: dev/CI, tidak kirim nyata)
//
// NotificationAdapter interface ada di @smk/types (anti lock-in).
// =============================================================================

import { Module } from '@nestjs/common';
import { NotificationAdapter } from '@smk/types';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';
import { LogAdapter } from './adapters/log.adapter';
import { FonnteAdapter } from './adapters/fonnte.adapter';
import { SmtpAdapter } from './adapters/smtp.adapter';
import { PrismaModule } from '../prisma/prisma.module';

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
    {
      provide: 'NOTIFICATION_ADAPTER',
      useFactory: buildAdapter,
    },
    NotificationService,
    NotificationListener,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
