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
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { isKaprogScopedReader } from '../common/helpers/appointment-scope.helper';
import { isOrangTuaOnly, isSiswaOnly } from '../common/helpers/role-helpers';
import { PermissionsService } from '../permissions/permissions.service';
import { ScheduleService } from './schedule.service';
import { CreateScheduleSchema, CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleSchema, UpdateScheduleDto } from './dto/update-schedule.dto';
import { AutoGenerateScheduleQuerySchema, ListScheduleQuerySchema } from './dto/list-schedule.dto';

@Controller('schedules')
export class ScheduleController {
  constructor(
    private service: ScheduleService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * GET /schedules — Lihat jadwal dengan ownership filter per role.
   * Query opsional: classId, teacherId, dayOfWeek, academicYear, semester.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'WAKA_KURIKULUM', 'KAPROG')
  @RequirePermission(['academic.schedule.read', 'student.own.read', 'student.child.read'])
  @Get()
  async findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListScheduleQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    // Match service scope precedence after RolesGuard resolves active authority.
    let requiredPermission = 'academic.schedule.read';
    if (!isKaprogScopedReader(user)) {
      if (isSiswaOnly(user)) requiredPermission = 'student.own.read';
      else if (isOrangTuaOnly(user)) requiredPermission = 'student.child.read';
    }
    if (!await this.permissions.hasPermission(user.keycloakId, user.roles, requiredPermission)) {
      throw new ForbiddenException(`Permission '${requiredPermission}' diperlukan untuk konteks jadwal ini`);
    }
    return this.service.findAll(parsed.data, user);
  }

  /**
   * POST /schedules — SA/TU input timetable.
   * Konflik kelas (P2002) → 409 via PrismaExceptionFilter.
   * Konflik guru/ruang → 409 via ConflictException (app-level).
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Post()
  @Audit({ action: 'schedule.create', resourceType: 'Schedule', captureBody: false })
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateScheduleSchema)) dto: CreateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  /** PATCH /schedules/:id — ubah slot (hari/JP/ruang/semester); re-cek konflik. */
  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateScheduleSchema)) dto: UpdateScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  /** DELETE /schedules/:id — hard delete (template mingguan tanpa dependen). */
  @Roles('SUPER_ADMIN', 'TATA_USAHA', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  /** T3-02 B8: GET /schedules/auto-generate — preview auto-scheduling result.
   *  Greedy constraint-based: fills day×JP slots avoiding conflicts.
   *  Returns preview without persisting. */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM')
  @RequirePermission('academic.schedule.manage')
  @Get('auto-generate')
  autoGenerate(@Query() rawQuery: unknown) {
    const parsed = AutoGenerateScheduleQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    const { academicYear, semester, days, jpPerDay, maxJpGuru } = parsed.data;
    return this.service.autoGenerate(academicYear, semester, { days, jpPerDay, maxJpGuru });
  }
}
