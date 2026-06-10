// =============================================================================
// FinanceController — /finance/spp
//
// POST   /finance/spp               [SA, TU]         — record pembayaran
// GET    /finance/spp               [SA, KS, TU, SISWA, OT]  — list + ownership
// GET    /finance/spp/summary       [SA, KS, TU]     — agregat per bulan/tahun
// GET    /finance/spp/:studentId/history [SA, KS, TU, SISWA, OT] — histori 1 siswa
// POST   /finance/spp/:id/approve   [SA, KS]         — approve (bukan TU)
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';
import { CreateSppSchema, CreateSppDto } from './dto/create-spp.dto';
import { ListSppQuerySchema } from './dto/list-spp.dto';
import { SummarySppQuerySchema } from './dto/summary-spp.dto';

@Controller('finance/spp')
export class FinanceController {
  constructor(private service: FinanceService) {}

  /**
   * POST /finance/spp — TU/SA catat pembayaran baru.
   * KS tidak boleh input pembayaran (read + approve saja).
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('finance.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRecord(
    @Body(ZodPipe(CreateSppSchema)) dto: CreateSppDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createRecord(dto, user);
  }

  /**
   * GET /finance/spp — list pembayaran.
   * Ownership difilter di service: SISWA=self, OT=anak, SA/KS/TU=semua.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'SISWA', 'ORANG_TUA')
  @RequirePermission('finance.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListSppQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  /**
   * GET /finance/spp/summary — agregat total per bulan/tahun per status.
   * Harus didaftarkan sebelum /:studentId/history agar tidak salah capture.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @RequirePermission('finance.read')
  @Get('summary')
  summary(@Query() rawQuery: unknown) {
    const parsed = SummarySppQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.summary(parsed.data);
  }

  /**
   * GET /finance/spp/:studentId/history — histori pembayaran 1 siswa.
   * Ownership di service: SISWA=self, OT=anak, SA/KS/TU=semua.
   * KS ditambahkan (CLAUDE.md §6: KS 👁 Keuangan — konsisten dgn GET list + approve).
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'SISWA', 'ORANG_TUA')
  @RequirePermission('finance.read')
  @Get(':studentId/history')
  findHistory(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findHistory(studentId, user);
  }

  /**
   * POST /finance/spp/:id/approve — SA/KS setujui pembayaran.
   * TU tidak boleh approve (separation of duties).
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('finance.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approve(id, user);
  }
}
