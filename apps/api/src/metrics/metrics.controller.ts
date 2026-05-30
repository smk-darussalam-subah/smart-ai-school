// =============================================================================
// GET /metrics — Prometheus scrape endpoint
// Di-exclude dari prefix api/v1 (lihat main.ts exclude list).
// @Public() agar tidak kena KeycloakGuard — Prometheus scraper tidak punya token.
// =============================================================================

import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * GET /metrics
   * Mengembalikan semua Prometheus metrics dalam teks format (text/plain; version=0.0.4).
   * Tidak membocorkan data siswa — hanya metrik teknis (CPU, heap, request count).
   */
  @Public()
  @Get()
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    void reply.header('Content-Type', this.metricsService.contentType).send(metrics);
  }
}
