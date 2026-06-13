// =============================================================================
// SubjectController — /subjects (DEV-03, 2K-4)
// GET: SA/KS/TU/GURU (baca referensi mapel untuk form dropdown)
// POST/PATCH: SA/TU saja
// Tanpa DELETE — gunakan isActive=false untuk menonaktifkan
// =============================================================================

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
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { SubjectService } from './subject.service';
import {
  CreateSubjectSchema,
  UpdateSubjectSchema,
  ListSubjectsQuerySchema,
  CreateSubjectDto,
  UpdateSubjectDto,
} from './dto/subject.dto';

@Controller('subjects')
export class SubjectController {
  constructor(private service: SubjectService) {}

  /** GET /subjects — list referensi mapel */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListSubjectsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data);
  }

  /** POST /subjects — tambah mapel baru */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateSubjectSchema)) dto: CreateSubjectDto) {
    return this.service.create(dto);
  }

  /** PATCH /subjects/:id — update nama/kode/isActive */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateSubjectSchema)) dto: UpdateSubjectDto,
  ) {
    return this.service.update(id, dto);
  }
}
