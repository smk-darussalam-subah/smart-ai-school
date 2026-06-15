// =============================================================================
// PublicKioskController — endpoint PUBLIK (tanpa login) untuk display Ruang Guru.
// Gerbang: token kiosk valid (di-validasi di service). Data agregat tanpa PII.
// =============================================================================

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicKioskService } from './public-kiosk.service';

@Controller('public')
export class PublicKioskController {
  constructor(private readonly service: PublicKioskService) {}

  @Public()
  @Get('kiosk')
  kiosk(@Query('token') token?: string) {
    if (!token) throw new BadRequestException('token wajib');
    return this.service.getKiosk(token);
  }
}
