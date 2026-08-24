// =============================================================================
// PublicKioskController — endpoint PUBLIK (tanpa login) untuk display Ruang Guru.
// Gerbang: token kiosk valid (di-validasi di service). Data agregat tanpa PII.
// =============================================================================

import { BadRequestException, Controller, Get, Header, Headers } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicKioskService } from './public-kiosk.service';

@Controller('public')
export class PublicKioskController {
  constructor(private readonly service: PublicKioskService) {}

  @Public()
  @Get('kiosk')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  kiosk(@Headers('x-diis-kiosk-token') legacyToken?: string) {
    if (!legacyToken) throw new BadRequestException('Link display lama telah dinonaktifkan. Gunakan pairing Display Sekolah.');
    return this.service.getKiosk(legacyToken);
  }
}
