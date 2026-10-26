import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import {
  LearnerSessionAttendanceSchema,
  SessionAttendanceRosterSchema,
  SessionAttendanceSaveSchema,
  type SessionAttendanceSave,
  SessionAttendanceReadSchema,
} from './student-session-attendance.dto';
import { StudentSessionAttendanceService } from './student-session-attendance.service';
import { StudentSessionAttendanceReadService } from './student-session-attendance-read.service';

@Controller('attendance/student-sessions')
export class StudentSessionAttendanceController {
  constructor(
    private readonly service: StudentSessionAttendanceService,
    private readonly auditRead: StudentSessionAttendanceReadService,
  ) {}
  @Get('sessions/:id')
  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'GURU', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG')
  @RequirePermission('academic.class-session.read')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() rawQuery: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = SessionAttendanceReadSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.auditRead.read(id, parsed.data, user);
  }
  @Get('summary')
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['attendance.own.read', 'attendance.child.read'])
  learner(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    // The shared ZodPipe deliberately validates bodies only. HTTP query values
    // must be parsed here so semester reaches the period lookup as a number.
    const parsed = LearnerSessionAttendanceSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.learner(parsed.data, user);
  }
  @Get('roster')
  @Roles('GURU')
  @RequirePermission('academic.attendance.create')
  roster(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = SessionAttendanceRosterSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.roster(parsed.data, user);
  }
  @Post(':id')
  @Roles('GURU')
  @RequirePermission('academic.attendance.create')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(SessionAttendanceSaveSchema)) dto: SessionAttendanceSave,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }
}
