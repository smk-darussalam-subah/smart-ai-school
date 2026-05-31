// =============================================================================
// AttendanceController — /attendance
//
// POST:  [GURU] — bulk insert absensi untuk satu classId+date
// GET:   [SA, KS, TU, GURU, SISWA, ORANG_TUA] — ownership difilter di service
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceSchema, CreateAttendanceDto } from './dto/create-attendance.dto';
import { ListAttendanceQuerySchema } from './dto/list-attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private service: AttendanceService) {}

  /**
   * POST /attendance — Guru input absensi bulk untuk satu kelas + tanggal.
   * Transaksi atomik: sebagian gagal → rollback semua.
   * Duplikat (siswa+kelas+tanggal sama) → P2002 → PrismaExceptionFilter → 409.
   */
  @Roles('GURU')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  bulkCreate(
    @Body(ZodPipe(CreateAttendanceSchema)) dto: CreateAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.bulkCreate(dto, user);
  }

  /**
   * GET /attendance — List absensi dengan ownership filter per role.
   * Query: classId, studentId, dateFrom, dateTo, page, limit.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListAttendanceQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }
}
