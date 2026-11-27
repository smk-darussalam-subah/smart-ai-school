import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { programStaffRoles } from './assessment-program-authority';
import { ProgramDraftSchema, ProgramKindSchema, ProgramProfileSchema, ProgramProctorSearchSchema, ShareProgramPackageSchema,
  type ProgramDraft, type ProgramKind, type ProgramProfile } from './assessment-program-contract';
import { AssessmentProgramService } from './assessment-program.service';

@Controller('assessment-programs')
export class AssessmentProgramController {
  constructor(private readonly programs: AssessmentProgramService) {}

  @Get('options')
  @Roles(...programStaffRoles)
  options(@CurrentUser() user: AuthUser) { return this.programs.options(user); }

  @Get('proctors')
  @Roles(...programStaffRoles)
  proctors(@Query(ZodPipe(ProgramProctorSearchSchema)) input: { q: string }, @CurrentUser() user: AuthUser) {
    return this.programs.proctors(input.q, user);
  }

  @Get()
  @Roles(...programStaffRoles)
  list(@CurrentUser() user: AuthUser) { return this.programs.list(user); }

  @Post('kinds')
  @Roles(...programStaffRoles)
  createKind(@Body(ZodPipe(ProgramKindSchema)) input: ProgramKind, @CurrentUser() user: AuthUser) {
    return this.programs.createKind(input, user);
  }

  @Put('packages/:id/share')
  @Roles('GURU')
  share(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(ShareProgramPackageSchema)) input: { shared: boolean },
    @CurrentUser() user: AuthUser) {
    return this.programs.sharePackage(id, input.shared, user);
  }

  @Post()
  @Roles(...programStaffRoles)
  create(@Body(ZodPipe(ProgramDraftSchema)) input: ProgramDraft, @CurrentUser() user: AuthUser) {
    return this.programs.create(input, user);
  }

  @Post(':id/complete')
  @Roles(...programStaffRoles)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.programs.complete(id, user);
  }

  @Get(':id/participants')
  @Roles(...programStaffRoles)
  participants(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.programs.participants(id, user);
  }

  @Get('my-profiles')
  @Roles('SISWA')
  profiles(@CurrentUser() user: AuthUser) { return this.programs.ownProfiles(user); }

  @Get(':id/profiles/:studentId')
  @Roles(...programStaffRoles)
  readProfile(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser) {
    return this.programs.readProfile(id, studentId, user);
  }

  @Put(':id/profiles/:studentId')
  @Roles(...programStaffRoles)
  profile(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(ZodPipe(ProgramProfileSchema)) input: ProgramProfile, @CurrentUser() user: AuthUser) {
    return this.programs.writeProfile(id, studentId, input, user);
  }
}
