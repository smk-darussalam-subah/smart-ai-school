// =============================================================================
// FonnteAdapter — kirim WhatsApp via Fonnte API
// Docs: https://fonnte.com/docs/api
// Menggunakan fetch bawaan Node 20 (tidak perlu axios/node-fetch).
// Hanya mendukung channel 'whatsapp'; 'email' → throw (tidak terpakai via factory).
// =============================================================================

import { NotificationAdapter } from '@smk/types';
import { logger } from '@smk/logger';

const FONNTE_URL = 'https://api.fonnte.com/send';

export class FonnteAdapter implements NotificationAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(
    channel: 'whatsapp' | 'email',
    to: string,
    body: string,
    _subject?: string,
  ): Promise<void> {
    if (channel !== 'whatsapp') {
      throw new Error(`FonnteAdapter hanya mendukung channel whatsapp, bukan ${channel}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(FONNTE_URL, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target: to, message: body }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '(empty body)');
        throw new Error(`Fonnte API ${res.status}: ${text}`);
      }

      logger.info('[FonnteAdapter] WA terkirim', { to });
    } finally {
      clearTimeout(timeout);
    }
  }
}
