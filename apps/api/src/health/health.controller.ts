// =============================================================================
// GET /health — Status semua service
// Dipakai oleh: Uptime Kuma, GitHub Actions deploy check, load balancer
// =============================================================================

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private prisma: PrismaService,
  ) {}

  /**
   * GET /health
   * Response: { status: 'ok' | 'error', info: {...}, error: {...} }
   */
  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // PostgreSQL via Prisma
      () => this.prismaHealth.pingCheck('database', this.prisma),

      // Memory heap tidak boleh melebihi 500MB
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),

      // Memory RSS tidak boleh melebihi 1GB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
    ]);
  }
}
