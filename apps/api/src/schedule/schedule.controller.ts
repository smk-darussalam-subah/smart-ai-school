// =============================================================================
// ScheduleController — /schedules
//
// GET:  [SA, KS, TU, GURU, SISWA, ORANG_TUA] — ownership difilter di service
// POST: [SA, TU] — input timetable; konflik kelas/guru/ruang → 409
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
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { ScheduleService } from './schedule.service';
import { CreateScheduleSchema, CreateScheduleDto } from './dto/create-schedule.dto';
import { ListScheduleQuerySchema } from './dto/list-schedule.dto';

@Controller('schedules')
export class ScheduleController {
  constructor(private service: ScheduleService) {}

  /**
   * GET /schedules — Lihat jadwal dengan ownership filter per role.
   * Query opsional: classId, teacherId, dayOfWeek, academicYear, semester.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('academic.schedule.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListScheduleQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  /**
   * POST /schedules — SA/TU input timetable.
   * Konflik kelas (P2002) → 409 via PrismaExceptionFilter.
   * Konflik guru/ruang → 409 via ConflictException (app-level).
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('academic.schedule.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateScheduleSchema)) dto: CreateScheduleDto) {
    return this.service.create(dto);
  }
}
