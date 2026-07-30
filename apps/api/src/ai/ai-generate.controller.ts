import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { AiGenerateService } from './ai-generate.service';
import { GenerateRppStepDto, GenerateRppStepSchema } from './dto/generate.dto';

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
