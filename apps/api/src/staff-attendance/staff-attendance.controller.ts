import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import {
  AttendanceCorrectionSchema,
  AttendanceLocationSchema,
  AttendanceNoteSchema,
  AttendancePolicySchema,
  AttendanceQuerySchema,
  type AttendanceLocation,
} from './staff-attendance.dto';
import { StaffAttendanceService } from './staff-attendance.service';

@Controller('staff-attendance')
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}
  @Get('context')
  @RequirePermission('staff.attendance.checkin')
  context(@CurrentUser() user: AuthUser) {
    return this.service.context(user);
  }
  @Post('location')
  @RequirePermission('staff.attendance.checkin')
  location(
    @Body(ZodPipe(AttendanceLocationSchema)) dto: AttendanceLocation,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.location(dto, user);
  }
  @Post('check-in')
  @RequirePermission('staff.attendance.checkin')
  @Audit({ action: 'staffAttendance.checkIn', captureBody: false })
  checkIn(
    @Body(ZodPipe(AttendanceLocationSchema)) dto: AttendanceLocation,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.record(dto, user);
  }
  @Post('check-out')
  @RequirePermission('staff.attendance.checkin')
  @Audit({ action: 'staffAttendance.checkOut', captureBody: false })
  checkOut(
    @Body(ZodPipe(AttendanceLocationSchema)) dto: AttendanceLocation,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.record(dto, user, true);
  }
  @Get('history')
  @RequirePermission('staff.attendance.checkin')
  history(@CurrentUser() user: AuthUser) {
    return this.service.history(user);
  }
  @Get('report')
  @RequirePermission('staff.attendance.read')
  report(@Query() rawQuery: unknown) {
    const parsed = AttendanceQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.report(parsed.data);
  }
  @Get(':id')
  @RequirePermission('staff.attendance.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Patch('policy')
  @Roles('SUPER_ADMIN')
  @RequirePermission('staff.attendance.manage')
  @Audit({ action: 'staffAttendance.policy', captureBody: true })
  policy(@Body(ZodPipe(AttendancePolicySchema)) dto: z.infer<typeof AttendancePolicySchema>, @CurrentUser() user: AuthUser) {
    return this.service.updatePolicy(dto, user);
  }
  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @RequirePermission('staff.attendance.manage')
  @Audit({ action: 'staffAttendance.correction', captureBody: false })
  correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AttendanceCorrectionSchema)) dto: z.infer<typeof AttendanceCorrectionSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.correct(id, dto, user);
  }
  @Post(':id/notes')
  @Roles('SUPER_ADMIN')
  @RequirePermission('staff.attendance.manage')
  @Audit({ action: 'staffAttendance.note', captureBody: false })
  note(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AttendanceNoteSchema)) dto: z.infer<typeof AttendanceNoteSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.note(id, dto.reason, user);
  }
}
