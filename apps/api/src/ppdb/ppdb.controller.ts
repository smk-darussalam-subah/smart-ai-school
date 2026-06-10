// =============================================================================
// PpdbController — POST /ppdb/leads (publik) + pipeline TU
//
// KEAMANAN BERLAPIS untuk POST /ppdb/leads:
//   1. @Throttle — 10 req / 5 menit per IP (ketat, bukan 100/mnt global)
//   2. @Public() — tidak butuh JWT, tapi ThrottlerGuard tetap aktif
//   3. ZodPipe + .strict() — tolak field tak dikenal, validasi format phone
//   4. Honeypot _hp — jika terisi → bot → 400
//   5. Captcha hook — diaktifkan via PPDB_CAPTCHA_SECRET (opsional)
//   6. IP logging di service layer
//   7. Response publik HANYA { id, status } — bukan full lead
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { PpdbService } from './ppdb.service';
import { SubmitLeadSchema, SubmitLeadDto } from './dto/submit-lead.dto';
import { UpdateStatusSchema, UpdateStatusDto } from './dto/update-status.dto';
import { AssignLeadSchema, AssignLeadDto } from './dto/assign-lead.dto';
import { ListLeadsQuerySchema } from './dto/list-leads.dto';

@Controller('ppdb')
export class PpdbController {
  constructor(private ppdbService: PpdbService) {}

  /**
   * POST /ppdb/leads — form publik calon siswa.
   * Throttle KETAT: 10 per 5 menit (tidak boleh ikut global 100/mnt).
   * Response: hanya { id, status } — JANGAN kembalikan data lead lain.
   */
  @Throttle({ default: { ttl: 300_000, limit: 10 } })
  @Public()
  @Post('leads')
  async submit(
    @Body(ZodPipe(SubmitLeadSchema)) dto: SubmitLeadDto,
    @Req() req: FastifyRequest,
  ) {
    // Honeypot check — _hp divalidasi Zod (max 0 chars), tapi tetap cek eksplisit
    if (dto._hp) {
      throw new BadRequestException('Permintaan tidak valid');
    }

    // Ekstrak IP: prioritas CF-Connecting-IP → X-Forwarded-For → req.ip
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    return this.ppdbService.submitLead(dto, ip);
  }

  /**
   * GET /ppdb/leads — daftar lead dengan filter (TU, SA, KS).
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @RequirePermission('ppdb.read')
  @Get('leads')
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListLeadsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.ppdbService.findAll(parsed.data);
  }

  /**
   * GET /ppdb/stats — statistik per status + conversion rate (AGREGAT, tanpa PII).
   * GURU boleh akses statistik agregat (CLAUDE.md §6: GURU 👁 PPDB/CRM = stats saja).
   * GURU TIDAK boleh akses /leads (data individual calon siswa mengandung PII: nama, phone).
   * Harus SEBELUM leads/:id agar 'stats' tidak ditangkap sebagai :id.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('ppdb.stats.read')
  @Get('stats')
  getStats() {
    return this.ppdbService.getStats();
  }

  /**
   * GET /ppdb/leads/:id — detail satu lead.
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.read')
  @Get('leads/:id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.ppdbService.findById(id);
  }

  /**
   * PATCH /ppdb/leads/:id/status — transisi status lead.
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.update')
  @Patch('leads/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateStatusSchema)) dto: UpdateStatusDto,
  ) {
    return this.ppdbService.updateStatus(id, dto);
  }

  /**
   * PATCH /ppdb/leads/:id/assign — assign ke staff TU.
   * assignedTo: UUID staff, atau null untuk un-assign.
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.update')
  @Patch('leads/:id/assign')
  assignLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AssignLeadSchema)) dto: AssignLeadDto,
  ) {
    return this.ppdbService.assignLead(id, dto);
  }
}
