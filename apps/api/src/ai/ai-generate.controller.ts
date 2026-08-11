import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AiGenerateService } from './ai-generate.service';
import {
  AcceptQuestionDraftDto,
  AcceptQuestionDraftSchema,
  GenerateQuestionDraftDto,
  GenerateQuestionDraftSchema,
  GenerateRppStepDto,
  GenerateRppStepSchema,
  RejectQuestionDraftDto,
  RejectQuestionDraftSchema,
  RegenerateQuestionDraftItemDto,
  RegenerateQuestionDraftItemSchema,
} from './dto/generate.dto';

@Controller('ai')
export class AiGenerateController {
  constructor(private readonly service: AiGenerateService) {}

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-questions')
  @HttpCode(HttpStatus.GONE)
  generateQuestions() {
    return this.service.rejectLegacyGeneration();
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('question-drafts')
  @HttpCode(HttpStatus.CREATED)
  generateQuestionDrafts(
    @Body(ZodPipe(GenerateQuestionDraftSchema)) dto: GenerateQuestionDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateQuestionDrafts(dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 20 } })
  @Post('question-drafts/:generationId/accept')
  @HttpCode(HttpStatus.CREATED)
  acceptQuestionDrafts(
    @Param('generationId') generationId: string,
    @Body(ZodPipe(AcceptQuestionDraftSchema)) dto: AcceptQuestionDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acceptQuestionDrafts(generationId, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('question-drafts/:generationId/items/:itemKey/regenerate')
  @HttpCode(HttpStatus.CREATED)
  regenerateQuestionDraftItem(
    @Param('generationId') generationId: string,
    @Param('itemKey') itemKey: string,
    @Body(ZodPipe(RegenerateQuestionDraftItemSchema)) dto: RegenerateQuestionDraftItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.regenerateQuestionDraftItem(generationId, itemKey, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 20 } })
  @Post('question-drafts/:generationId/reject')
  @HttpCode(HttpStatus.OK)
  rejectQuestionDrafts(
    @Param('generationId') generationId: string,
    @Body(ZodPipe(RejectQuestionDraftSchema)) dto: RejectQuestionDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rejectQuestionDrafts(generationId, dto, user);
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-material')
  @HttpCode(HttpStatus.GONE)
  generateMaterial() {
    return this.service.rejectLegacyGeneration();
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-atp')
  @HttpCode(HttpStatus.GONE)
  generateAtp() {
    return this.service.rejectLegacyGeneration();
  }

  @Roles('GURU')
  @RequirePermission('rpp.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-rpp-step')
  @HttpCode(HttpStatus.CREATED)
  generateRppStep(
    @Body(ZodPipe(GenerateRppStepSchema)) dto: GenerateRppStepDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateRppStep(dto, user);
  }
}
