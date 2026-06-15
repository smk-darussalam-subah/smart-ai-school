import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../auth/decorators/public.decorator';
import { SchoolConfigService } from './school-config.service';
import { UpdateProfileSchema } from './dto/update-profile.dto';
import { CreateAcademicYearSchema, UpdateAcademicYearSchema } from './dto/academic-year.dto';
import { CreateSemesterSchema, UpdateSemesterSchema } from './dto/semester.dto';
import { CreateCalendarEventSchema, UpdateCalendarEventSchema } from './dto/calendar-event.dto';
import { CreateMajorSchema, UpdateMajorSchema } from './dto/major.dto';

@Controller('school')
export class SchoolConfigController {
  constructor(private readonly service: SchoolConfigService) {}

  // ═══ Profile ═══════════════════════════════════════════════════════════════

  @Public()
  @Get('profile')
  getProfile() {
    return this.service.getProfile();
  }

  @Roles('SUPER_ADMIN')
  @Put('profile')
  updateProfile(@Body(ZodPipe(UpdateProfileSchema)) dto: Record<string, unknown>) {
    return this.service.updateProfile(dto);
  }

  // ═══ Majors ════════════════════════════════════════════════════════════════

  @Get('majors')
  getMajors(@Query('activeOnly') activeOnly?: string) {
    return this.service.getMajors(activeOnly === 'true');
  }

  @Roles('SUPER_ADMIN')
  @Post('majors')
  createMajor(@Body(ZodPipe(CreateMajorSchema)) dto: Record<string, unknown>) {
    return this.service.createMajor(dto as { code: string; name: string; description?: string | null; isActive?: boolean });
  }

  @Roles('SUPER_ADMIN')
  @Patch('majors/:id')
  updateMajor(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(UpdateMajorSchema)) dto: Record<string, unknown>) {
    return this.service.updateMajor(id, dto);
  }

  // ═══ Academic Years ════════════════════════════════════════════════════════

  @Get('academic-years')
  getAcademicYears() {
    return this.service.getAcademicYears();
  }

  @Public()
  @Get('academic-years/active')
  getActiveAcademicYear() {
    return this.service.getActiveAcademicYear();
  }

  @Roles('SUPER_ADMIN')
  @Post('academic-years')
  createAcademicYear(@Body(ZodPipe(CreateAcademicYearSchema)) dto: Record<string, unknown>) {
    return this.service.createAcademicYear(dto as { code: string; startDate: Date; endDate: Date; isActive?: boolean });
  }

  @Roles('SUPER_ADMIN')
  @Patch('academic-years/:id')
  updateAcademicYear(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(UpdateAcademicYearSchema)) dto: Record<string, unknown>) {
    return this.service.updateAcademicYear(id, dto);
  }

  // ═══ Semesters ═════════════════════════════════════════════════════════════

  @Get('semesters')
  getSemesters(@Query('academicYearId') academicYearId?: string) {
    return this.service.getSemesters(academicYearId);
  }

  @Public()
  @Get('semesters/active')
  getActiveSemester() {
    return this.service.getActiveSemester();
  }

  @Roles('SUPER_ADMIN')
  @Post('semesters')
  createSemester(@Body(ZodPipe(CreateSemesterSchema)) dto: Record<string, unknown>) {
    return this.service.createSemester(dto as {
      academicYearId: string; number: number; startDate: Date; endDate: Date; isActive?: boolean;
    });
  }

  @Roles('SUPER_ADMIN')
  @Patch('semesters/:id')
  updateSemester(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(UpdateSemesterSchema)) dto: Record<string, unknown>) {
    return this.service.updateSemester(id, dto);
  }

  // ═══ Academic Calendar ═════════════════════════════════════════════════════

  @Get('calendar')
  getCalendarEvents(@Query('academicYearId') academicYearId?: string, @Query('type') type?: string) {
    return this.service.getCalendarEvents(academicYearId, type);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @Post('calendar')
  createCalendarEvent(@Body(ZodPipe(CreateCalendarEventSchema)) dto: Record<string, unknown>) {
    return this.service.createCalendarEvent(dto as {
      academicYearId: string; name: string; startDate: Date; endDate: Date;
      type: 'holiday' | 'exam' | 'event' | 'break'; description?: string | null;
    });
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @Patch('calendar/:id')
  updateCalendarEvent(@Param('id', ParseUUIDPipe) id: string, @Body(ZodPipe(UpdateCalendarEventSchema)) dto: Record<string, unknown>) {
    return this.service.updateCalendarEvent(id, dto);
  }

  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')
  @Delete('calendar/:id')
  deleteCalendarEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCalendarEvent(id);
  }
}
