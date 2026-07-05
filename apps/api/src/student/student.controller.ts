// =============================================================================
// StudentController — GET/POST/PATCH/DELETE /students + sub-resources
// RBAC per §4 sprint plan. Ownership checks ada di service layer.
// ⚠️ R-05: Jangan input data siswa nyata sampai consent SMA-55 aktif.
// =============================================================================

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { StudentService } from './student.service';
import { CreateStudentSchema, CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentSchema, UpdateStudentDto } from './dto/update-student.dto';
import { AssignParentSchema, AssignParentDto } from './dto/assign-parent.dto';
import { ListStudentsQuerySchema } from './dto/list-students.dto';

@Controller('students')
export class StudentController {
  constructor(private studentService: StudentService) {}

  /**
   * GET /students/without-parent — siswa tanpa orang tua (untuk assign-parent wizard)
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('student.read')
  @Get('without-parent')
  findWithoutParent(@Query() rawQuery: unknown) {
    const parsed = ListStudentsQuerySchema.pick({ page: true, limit: true }).safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.studentService.findWithoutParent(parsed.data);
  }

  /**
   * GET /students — list dengan filter classId, status, search, page, limit
   * GURU: read-only access, future SMA-36 bisa tambah filter "assigned class" di query
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU')
  @RequirePermission('student.read')
  @Get()
  findAll(@Query() rawQuery: unknown, @CurrentUser() _user: AuthUser) {
    const parsed = ListStudentsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors);
    return this.studentService.findAll(parsed.data);
  }

  /**
   * GET /students/my-children — daftar semua anak untuk ORANG_TUA (parent-child resolution).
   * Resolve keycloakId → auth.users.id → students where parentId === userId.
   * Dideklarasikan SEBELUM :id agar tidak tertangkap sebagai route param.
   */
  @Roles('ORANG_TUA')
  @RequirePermission('student.read')
  @Get('my-children')
  findMyChildren(@CurrentUser() user: AuthUser) {
    return this.studentService.findMyChildren(user);
  }

  /**
   * P1 (S-09): GET /students/me/profile-cv — aggregated profile + stats for siswa.
   */
  @Roles('SISWA')
  @RequirePermission('student.read')
  @Get('me/profile-cv')
  profileCv(@CurrentUser() user: AuthUser) {
    return this.studentService.profileCv(user);
  }

  /**
   * GET /students/:id — ownership check (SISWA self, ORANG_TUA anak) di service
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('student.read')
  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.studentService.findById(id, user);
  }

  /**
   * POST /students — buat data siswa baru (wajib parentId — gunakan wizard provisioning)
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('student.create')
  @Post()
  create(@Body(ZodPipe(CreateStudentSchema)) dto: CreateStudentDto) {
    return this.studentService.create(dto);
  }

  /**
   * PATCH /students/:id — partial update data siswa
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('student.update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(UpdateStudentSchema)) dto: UpdateStudentDto,
  ) {
    return this.studentService.update(id, dto);
  }

  /**
   * PATCH /students/:id/assign-parent — tambahkan orang tua ke siswa tanpa ortu
   */
  @Roles('SUPER_ADMIN', 'TATA_USAHA')
  @RequirePermission('user.provision')
  @Patch(':id/assign-parent')
  assignParent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ZodPipe(AssignParentSchema)) dto: AssignParentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.studentService.assignParent(id, dto, {
      keycloakId: user.keycloakId,
      roles: user.roles,
    });
  }

  /**
   * DELETE /students/:id — SOFT DELETE: set deletedAt, record TIDAK dihapus dari DB
   */
  @Roles('SUPER_ADMIN')
  @RequirePermission('student.delete')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.remove(id);
  }

  /**
   * GET /students/:id/grades — nilai siswa
   * Ownership: SISWA self, ORANG_TUA anak. GURU: TODO SMA-36 tambah filter kelas sendiri.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('student.read')
  @Get(':id/grades')
  findGrades(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.studentService.findGrades(id, user);
  }

  /**
   * GET /students/:id/attendance — kehadiran siswa
   * Ownership: SISWA self, ORANG_TUA anak. GURU: TODO SMA-36 tambah filter kelas sendiri.
   */
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA')
  @RequirePermission('student.read')
  @Get(':id/attendance')
  findAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.studentService.findAttendance(id, user);
  }
}
