import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { PpdbService } from './ppdb.service';
import {
  SubmitLeadSchema,
  SubmitLeadDto,
  SubmitSpmbIntakeSchema,
  SubmitSpmbIntakeDto,
} from './dto/submit-lead.dto';
import { UpdateStatusSchema, UpdateStatusDto } from './dto/update-status.dto';
import { AssignLeadSchema, AssignLeadDto } from './dto/assign-lead.dto';
import { ListLeadsQuerySchema } from './dto/list-leads.dto';

@Controller('ppdb')
export class PpdbController {
  constructor(private ppdbService: PpdbService) {}

  private extractClientIp(req: FastifyRequest): string {
    return (
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown'
    );
  }

  @Throttle({ default: { ttl: 300_000, limit: 10 } })
  @Public()
  @Post('leads')
  async submit(
    @Body(ZodPipe(SubmitLeadSchema)) dto: SubmitLeadDto,
    @Req() req: FastifyRequest,
  ) {
    if (dto._hp) {
      throw new BadRequestException('Permintaan tidak valid');
    }

    return this.ppdbService.submitLead(dto, this.extractClientIp(req));
  }

  @Throttle({ default: { ttl: 300_000, limit: 10 } })
  @Public()
  @Post('spmb-2027/intake')
  async submitSpmbIntake(
    @Body(ZodPipe(SubmitSpmbIntakeSchema)) dto: SubmitSpmbIntakeDto,
    @Req() req: FastifyRequest,
  ) {
    if (dto._hp) {
      throw new BadRequestException('Permintaan tidak valid');
    }

    return this.ppdbService.submitSpmbIntake(dto, this.extractClientIp(req));
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @RequirePermission('ppdb.read')
  @Get('leads')
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListLeadsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.ppdbService.findAll(parsed.data);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('ppdb.stats.read')
  @Get('stats')
  getStats() {
    return this.ppdbService.getStats();
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.read')
  @Get('leads/:id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.ppdbService.findById(id);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.update')
  @Patch('leads/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateStatusSchema)) dto: UpdateStatusDto,
  ) {
    return this.ppdbService.updateStatus(id, dto);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('ppdb.update')
  @Patch('leads/:id/assign')
  assignLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AssignLeadSchema)) dto: AssignLeadDto,
  ) {
    return this.ppdbService.assignLead(id, dto);
  }
}
