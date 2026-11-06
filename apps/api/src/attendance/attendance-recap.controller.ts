import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AttendanceRecapSchema } from './attendance-recap.dto';
import { AttendanceRecapService } from './attendance-recap.service';

@Controller('attendance/student-sessions/recap')
export class AttendanceRecapController {
  constructor(private readonly service: AttendanceRecapService) {}

  /** Query coercion belongs at the real HTTP boundary, not the body-only shared pipe. */
  @Get()
  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'GURU', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG')
  @RequirePermission('academic.attendance.read')
  read(@Query() raw: unknown, @CurrentUser() user: AuthUser) {
    const parsed = AttendanceRecapSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Filter rekap kehadiran tidak valid.');
    return this.service.read(parsed.data, user);
  }
}
