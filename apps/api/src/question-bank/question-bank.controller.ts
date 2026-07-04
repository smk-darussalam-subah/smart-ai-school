// =============================================================================
// QuestionBankController — /questions + /question-sets (P14 — W3-2)
// GURU: CRUD soal + question sets milik sendiri · KS/SA: baca semua.
// =============================================================================

import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { QuestionBankService } from './question-bank.service';
import {
  CreateQuestionSchema, CreateQuestionSetSchema, ImportQuestionsSchema,
  ListQuestionSchema, ListQuestionSetSchema, UpdateQuestionSchema,
} from './dto/question.dto';

@Controller('questions')
export class QuestionController {
  constructor(private readonly service: QuestionBankService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListQuestionSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data, user);
  }

  // U2 Wave 4: Export CSV — must come before @Get(':id') to avoid route conflict
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get('export')
  exportCsv(@Query('subject') subject: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.exportQuestionsCsv(subject, user);
  }

  // U2 Wave 4: Import CSV — accepts parsed CSV rows as JSON
  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Post('import')
  @HttpCode(HttpStatus.OK)
  importCsv(
    @Body(ZodPipe(ImportQuestionsSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.importQuestionsCsv(dto as Parameters<typeof this.service.importQuestionsCsv>[0], user);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateQuestionSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto as Parameters<typeof this.service.create>[0], user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateQuestionSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto as Parameters<typeof this.service.update>[1], user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}

@Controller('question-sets')
export class QuestionSetController {
  constructor(private readonly service: QuestionBankService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'GURU')
  @RequirePermission('lms.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ListQuestionSetSchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findSets(parsed.data, user);
  }

  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ZodPipe(CreateQuestionSetSchema)) dto: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createSet(dto as Parameters<typeof this.service.createSet>[0], user);
  }
}
