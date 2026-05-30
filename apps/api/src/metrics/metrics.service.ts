// =============================================================================
// MetricsService — Wrapper untuk prom-client default registry
// =============================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, register } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  onModuleInit(): void {
    try {
      // Daftarkan default Node.js metrics: process CPU, heap, RSS, event loop lag, dll.
      // try-catch guard: prom-client throws jika collectDefaultMetrics() dipanggil dua kali
      // (contoh: hot-reload NestJS atau test yang import modul yang sama berulang).
      collectDefaultMetrics();
    } catch {
      // sudah terdaftar — abaikan
    }
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  get contentType(): string {
    return register.contentType;
  }
}
