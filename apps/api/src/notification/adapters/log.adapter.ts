import { NotificationAdapter } from '@smk/types';
import { logger } from '@smk/logger';

export class LogAdapter implements NotificationAdapter {
  async send(
    channel: 'whatsapp' | 'email',
    to: string,
    body: string,
    subject?: string,
  ): Promise<void> {
    logger.info('[LogAdapter] Notification (dev/CI only — tidak dikirim nyata)', {
      channel,
      to,
      subject,
      bodyLength: body.length,
    });
  }
}
