// =============================================================================
// ClassesController — Manajemen Kelas (referensi KamilEdu Modul 4)
// RBAC: read = staf+guru; tulis = SUPER_ADMIN/TATA_USAHA; delete = SUPER_ADMIN.
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { ClassesService } from './classes.service';
import {
  CreateClassDto,
  CreateClassSchema,
  ListClassesQuerySchema,
  UpdateClassDto,
  UpdateClassSchema,
} from './dto/class.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @Get()
  findAll(@Query() rawQuery: unknown) {
    const parsed = ListClassesQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.service.findAll(parsed.data);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ZodPipe(CreateClassSchema)) dto: CreateClassDto) {
    return this.service.create(dto);
  }

  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateClassSchema)) dto: UpdateClassDto,
  ) {
    return this.service.update(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
