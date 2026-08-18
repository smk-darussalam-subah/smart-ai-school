import {
  BadRequestException,
  Body,
  Controller,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AssessmentService } from './assessment.service';
import {
  CancelRemedialSessionDto,
  CancelRemedialSessionSchema,
  CreateRemedialSessionDto,
  CreateRemedialSessionSchema,
  FamilyRemedialQuerySchema,
  FinalizeRemedialParticipantDto,
  FinalizeRemedialParticipantSchema,
  ListAssessmentSessionSchema,
  RemedialCandidatesQuerySchema,
  RetryRemedialParticipantDto,
  RetryRemedialParticipantSchema,
  UpdateRemedialSessionDto,
  UpdateRemedialSessionSchema,
} from './dto/assessment.dto';

const REMEDIAL_READ_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'WAKA_KURIKULUM',
  'GURU',
  'SISWA',
] as const;

@Controller('assessment/remedials')
export class RemedialController {
  constructor(private readonly service: AssessmentService) {}

  @Roles(...REMEDIAL_READ_ROLES)
  @RequirePermission(['academic.remedial.read', 'remedial.own.read', 'remedial.child.read'])
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListAssessmentSessionSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.listRemedials({ ...parsed.data, purpose: 'remedial' }, user);
  }

  @Roles('ORANG_TUA')
  @RequirePermission('remedial.child.read')
  @Get('family')
  family(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = FamilyRemedialQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.listFamilyRemedials(parsed.data, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Get('candidates')
  candidates(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = RemedialCandidatesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.listRemedialCandidates(parsed.data, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateRemedialSessionSchema)) dto: CreateRemedialSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createRemedialSession(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateRemedialSessionSchema)) dto: UpdateRemedialSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateRemedialSession(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Patch(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.activateRemedialSession(id, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(CancelRemedialSessionSchema)) dto: CancelRemedialSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelRemedialSession(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(FinalizeRemedialParticipantSchema)) dto: FinalizeRemedialParticipantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.finalizeRemedialParticipant(id, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('academic.remedial.manage')
  @Post(':id/retry')
  @HttpCode(HttpStatus.CREATED)
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(RetryRemedialParticipantSchema)) dto: RetryRemedialParticipantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.retryRemedialParticipant(id, dto, user);
  }
}
