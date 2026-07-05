// =============================================================================
// TeacherAttendanceController — Presensi Guru (KamilEdu M8)
// check-in/out: GURU · rekap: SA/KS/TU (semua) + GURU (miliknya, di query)
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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { TeacherAttendanceService } from './teacher-attendance.service';
import {
  CheckInDto,
  CheckInSchema,
  CheckOutDto,
  CheckOutSchema,
  ListTeacherAttendanceQuerySchema,
} from './dto/teacher-attendance.dto';

@Controller('teacher-attendance')
export class TeacherAttendanceController {
  constructor(private readonly service: TeacherAttendanceService) {}

  @Roles('GURU')
  @RequirePermission('teacher.attendance.checkin')
  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  checkIn(
    @Body(ZodPipe(CheckInSchema)) dto: CheckInDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.checkIn(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('teacher.attendance.checkin')
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(
    @Body(ZodPipe(CheckOutSchema)) dto: CheckOutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.checkOut(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('teacher.attendance.checkin')
  @Get('today')
  myToday(@CurrentUser() user: AuthUser) {
    return this.service.myToday(user);
  }

  /** P1 (S-05): Today's summary for KS/SA dashboard — counts + roster. */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('teacher.attendance.read')
  @Get('today-summary')
  todaySummary() {
    return this.service.todaySummary();
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('teacher.attendance.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListTeacherAttendanceQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }
}
