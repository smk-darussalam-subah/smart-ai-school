import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, UserRole } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import {
  CloseSemesterDto,
  CloseSemesterSchema,
  SemesterClosingQuerySchema,
} from './dto/semester-closing.dto';
import { SemesterClosingService } from './semester-closing.service';

const ACADEMIC_READER_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'GURU',
  'KEPALA_SEKOLAH' as UserRole,
  'WAKA_KURIKULUM' as UserRole,
  'KAPROG' as UserRole,
];

@Controller('semester-closing')
export class SemesterClosingController {
  constructor(private readonly service: SemesterClosingService) {}

  @Roles(...ACADEMIC_READER_ROLES)
  @Get('readiness')
  readiness(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = SemesterClosingQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.readiness(parsed.data, user);
  }

  @Roles('KEPALA_SEKOLAH' as UserRole)
  @RequirePermission('academic.semester.close')
  @Post('close')
  close(@Body(ZodPipe(CloseSemesterSchema)) dto: CloseSemesterDto, @CurrentUser() user: AuthUser) {
    return this.service.close(dto, user);
  }

  @Roles(...ACADEMIC_READER_ROLES)
  @RequirePermission('academic.final-report.read')
  @Get('closures')
  listClosures(@CurrentUser() user: AuthUser) {
    return this.service.listClosures(user);
  }

  @Roles(...ACADEMIC_READER_ROLES)
  @RequirePermission('academic.final-report.read')
  @Get('closures/:id')
  closureDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.closureDetail(id, user);
  }

  @Roles(...ACADEMIC_READER_ROLES)
  @RequirePermission('academic.final-report.read')
  @Get('closures/:id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportClosure(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.exportClosureCsv(id, user);
  }
}
