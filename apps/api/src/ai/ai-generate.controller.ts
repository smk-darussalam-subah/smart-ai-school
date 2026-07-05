// =============================================================================
// AiGenerateController — /ai/generate-* (P16 — W3-5)
// GURU: generate questions, material, ATP from RPP/CP/TP.
// Rate limited via ThrottlerModule 'aichat' config (20 req/min).
// =============================================================================

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { AiGenerateService } from './ai-generate.service';
import {
  GenerateAtpSchema, GenerateMaterialSchema, GenerateQuestionsSchema, GenerateRppStepSchema,
} from './dto/generate.dto';

@Controller('ai')
export class AiGenerateController {
  constructor(private readonly service: AiGenerateService) {}

  @Roles('GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-questions')
  @HttpCode(HttpStatus.CREATED)
  generateQuestions(
    @Body(ZodPipe(GenerateQuestionsSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateQuestions(dto as Parameters<typeof this.service.generateQuestions>[0], user);
  }

  @Roles('GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-material')
  @HttpCode(HttpStatus.CREATED)
  generateMaterial(
    @Body(ZodPipe(GenerateMaterialSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateMaterial(dto as Parameters<typeof this.service.generateMaterial>[0], user);
  }

  @Roles('GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-atp')
  @HttpCode(HttpStatus.CREATED)
  generateAtp(
    @Body(ZodPipe(GenerateAtpSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateAtp(dto as Parameters<typeof this.service.generateAtp>[0], user);
  }

  // P4 (S-12): Generic RPP step generation (8 steps: CP/TP, Profil, Sarana, etc.)
  @Roles('GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH')
  @RequirePermission('lms.own.manage')
  @Throttle({ aichat: { ttl: 60_000, limit: 10 } })
  @Post('generate-rpp-step')
  @HttpCode(HttpStatus.CREATED)
  generateRppStep(
    @Body(ZodPipe(GenerateRppStepSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generateRppStep(dto as Parameters<typeof this.service.generateRppStep>[0], user);
  }
}
