import { Body, Controller, Get, Param, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import {
  LearnerSessionAttendanceSchema,
  SessionAttendanceRosterSchema,
  SessionAttendanceSaveSchema,
  type LearnerSessionAttendanceQuery,
  type SessionAttendanceRosterQuery,
  type SessionAttendanceSave,
  SessionAttendanceReadSchema,
  type SessionAttendanceReadQuery,
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
    @Query(ZodPipe(SessionAttendanceReadSchema)) query: SessionAttendanceReadQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auditRead.read(id, query, user);
  }
  @Get('summary')
  @Roles('SISWA', 'ORANG_TUA')
  @RequirePermission(['attendance.own.read', 'attendance.child.read'])
  learner(
    @Query(ZodPipe(LearnerSessionAttendanceSchema)) query: LearnerSessionAttendanceQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.learner(query, user);
  }
  @Get('roster')
  @Roles('GURU')
  @RequirePermission('academic.attendance.create')
  roster(
    @Query(ZodPipe(SessionAttendanceRosterSchema)) query: SessionAttendanceRosterQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.roster(query, user);
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
