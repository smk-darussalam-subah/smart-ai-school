// =============================================================================
// TeachingAssignmentService — CRUD + Guru ownership
//
// Ownership "Guru(own)" — di SERVICE layer (pola SMA-32):
//   GURU hanya bisa baca assignment miliknya sendiri.
//   Flow resolve: keycloakId → auth.users.id → teacher.teachers.id
//   → filter TeachingAssignment.teacherId === teacher.id
//
// 409 Conflict untuk unique [teacherId, classId, subject, academicYear].
// 400 BadRequest jika FK teacherId / classId tidak ada.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertClassInKaprogScope,
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ListAssignmentsQuery } from './dto/list-assignments.dto';

// ── Select shape ─────────────────────────────────────────────────────────────

const ASSIGNMENT_SELECT = {
  id: true,
  teacherId: true,
  classId: true,
  subject: true,
  hoursPerWeek: true,
  academicYear: true,
  createdAt: true,
  updatedAt: true,
  teacher: {
    select: {
      id: true,
      user: { select: { fullName: true, email: true, staff: { select: { niy: true } } } },
    },
  },
  class: { select: { id: true, name: true, majorCode: true, grade: true } },
  schedules: { select: { id: true, semester: true, jpStart: true, jpEnd: true } },
} as const;

type AssignmentDb = PrismaService | Prisma.TransactionClient;

// ── Ownership helper ──────────────────────────────────────────────────────────

const ELEVATED_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'WAKA_KURIKULUM',
] as const;

function isGuruOnly(user: AuthUser): boolean {
  return (
    user.roles.includes('GURU') &&
    !user.roles.some((r) => (ELEVATED_ROLES as readonly string[]).includes(r))
  );
}

@Injectable()
export class TeachingAssignmentService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Resolve keycloakId → teacher.id (dua langkah: user → teacher).
   * Dipanggil hanya ketika isGuruOnly() === true.
   */
  private async resolveTeacherId(keycloakId: string): Promise<string> {
    const authUser = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    if (!authUser) throw new ForbiddenException('User tidak ditemukan');

    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: authUser.id },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('Profil guru tidak ditemukan untuk akun ini');

    return teacher.id;
  }

  /** Validasi FK teacherId dan classId sebelum CREATE — beri 400 yang jelas. */
  private async validateAssignmentContext(
    teacherId: string,
    classId: string,
    subjectName: string,
    academicYear: string,
    db: AssignmentDb = this.prisma,
  ): Promise<string> {
    const [teacher, kelas, subject, year] = await Promise.all([
      db.teacher.findFirst({
        where: {
          id: teacherId,
          deletedAt: null,
          user: { isActive: true, deletedAt: null, role: 'GURU', staff: { is: { deletedAt: null } } },
        },
        select: { id: true },
      }),
      db.class.findFirst({
        where: { id: classId, isActive: true },
        select: { id: true, academicYear: true },
      }),
      db.subject.findFirst({
        where: { name: { equals: subjectName, mode: 'insensitive' }, isActive: true },
        select: { name: true },
      }),
      db.academicYear.findUnique({
        where: { code: academicYear },
        select: { code: true },
      }),
    ]);
    if (!teacher) throw new BadRequestException('Guru tidak aktif atau profil guru tidak ditemukan');
    if (!kelas) throw new BadRequestException('Kelas tidak aktif atau tidak ditemukan');
    if (kelas.academicYear !== academicYear) {
      throw new BadRequestException('Tahun ajaran penugasan harus sama dengan tahun ajaran kelas');
    }
    if (!subject) throw new BadRequestException('Mata pelajaran tidak aktif atau tidak ditemukan');
    if (!year) throw new BadRequestException('Tahun ajaran tidak terdaftar');
    return subject.name;
  }

  async findActiveOptions(user: AuthUser) {
    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      const assignments = await this.prisma.teachingAssignment.findMany({
        where: { class: kaprogClassWhere(scope), academicYear: scope.academicYearCode },
        select: {
          teacher: { select: { id: true, user: { select: { fullName: true, staff: { select: { niy: true } } } } } },
          class: { select: { id: true, name: true, grade: true, majorCode: true, academicYear: true } },
          subject: true,
        },
      });
      const teachers = [...new Map(assignments.map((item) => [item.teacher.id, item.teacher])).values()]
        .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));
      const classes = [...new Map(assignments.map((item) => [item.class.id, item.class])).values()]
        .sort((a, b) => a.name.localeCompare(b.name));
      const subjects = [...new Set(assignments.map((item) => item.subject))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, code: name, name }));
      return {
        teachers,
        classes,
        subjects,
        academicYears: [{ id: scope.academicYearId, code: scope.academicYearCode, isActive: true }],
        scope: { type: 'major' as const, labels: scope.majorCodes },
      };
    }
    const [teachers, classes, subjects, academicYears] = await Promise.all([
      this.prisma.teacher.findMany({
        where: {
          deletedAt: null,
          user: { isActive: true, deletedAt: null, role: 'GURU', staff: { is: { deletedAt: null } } },
        },
        select: {
          id: true,
          user: { select: { fullName: true, staff: { select: { niy: true } } } },
        },
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.class.findMany({
        where: { isActive: true },
        select: { id: true, name: true, grade: true, majorCode: true, academicYear: true },
        orderBy: [{ academicYear: 'desc' }, { grade: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.subject.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.academicYear.findMany({
        select: { id: true, code: true, isActive: true },
        orderBy: { startDate: 'desc' },
      }),
    ]);
    return { teachers, classes, subjects, academicYears, scope: { type: 'global' as const, labels: [] } };
  }

  async findMyTeacherContext(user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { code: true },
    });
    const activeAssignmentCount = activeYear
      ? await this.prisma.teachingAssignment.count({
          where: {
            teacherId,
            academicYear: activeYear.code,
            class: { isActive: true },
          },
        })
      : 0;
    return { teacherId, activeAssignmentCount, academicYear: activeYear?.code ?? null };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(query: ListAssignmentsQuery, user: AuthUser) {
    const skip = (query.page - 1) * query.limit;

    // GURU: paksa filter ke teacherId sendiri, abaikan teacherId dari query
    let teacherIdFilter = query.teacherId;
    let kaprogClassFilter: Prisma.ClassWhereInput | undefined;
    let academicYearFilter = query.academicYear;
    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      if (query.classId) {
        await assertClassInKaprogScope(this.prisma, query.classId, scope);
      }
      if (query.academicYear && query.academicYear !== scope.academicYearCode) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      academicYearFilter = scope.academicYearCode;
      kaprogClassFilter = kaprogClassWhere(scope);
    } else if (isGuruOnly(user)) {
      teacherIdFilter = await this.resolveTeacherId(user.keycloakId);
    }

    const where: Prisma.TeachingAssignmentWhereInput = {
      ...(teacherIdFilter && { teacherId: teacherIdFilter }),
      ...(query.classId && { classId: query.classId }),
      ...(academicYearFilter && { academicYear: academicYearFilter }),
      ...(kaprogClassFilter && { class: kaprogClassFilter }),
      ...(query.subject && { subject: query.subject }),
      ...(query.search && {
        OR: [
          { subject: { contains: query.search, mode: 'insensitive' } },
          { teacher: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } },
          { class: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.teachingAssignment.findMany({
        where,
        skip,
        take: query.limit,
        select: ASSIGNMENT_SELECT,
        orderBy: [{ academicYear: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.teachingAssignment.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  async findById(id: string, user: AuthUser) {
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) throw new NotFoundException('TeachingAssignment tidak ditemukan');

    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      await assertClassInKaprogScope(this.prisma, assignment.classId, scope);
    } else if (isGuruOnly(user)) {
      const myTeacherId = await this.resolveTeacherId(user.keycloakId);
      if (assignment.teacherId !== myTeacherId) {
        throw new ForbiddenException('Guru hanya bisa melihat assignment sendiri');
      }
    }

    return assignment;
  }

  async create(dto: CreateAssignmentDto) {
    const subject = await this.validateAssignmentContext(
      dto.teacherId,
      dto.classId,
      dto.subject,
      dto.academicYear,
    );
    // P2002 (duplikat unique constraint) → ditangani PrismaExceptionFilter global → 409
    return this.prisma.teachingAssignment.create({
      data: { ...dto, subject },
      select: ASSIGNMENT_SELECT,
    });
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM academic.teaching_assignments WHERE id = ${id}::uuid FOR UPDATE`,
      );
      const existing = await tx.teachingAssignment.findUnique({
      where: { id },
      select: {
        id: true,
        teacherId: true,
        classId: true,
        subject: true,
        academicYear: true,
        schedules: { select: { semester: true, jpStart: true, jpEnd: true } },
      },
      });
      if (!existing) throw new NotFoundException('TeachingAssignment tidak ditemukan');

    // P2002 (duplikat unique constraint) → ditangani PrismaExceptionFilter global → 409
      const canonicalSubject = await this.validateAssignmentContext(
        existing.teacherId,
        existing.classId,
        dto.subject ?? existing.subject,
        dto.academicYear ?? existing.academicYear,
        tx,
      );
      if (dto.subject !== undefined || dto.academicYear !== undefined) {
        const dependentCount = await this.countContextDependencies(tx, existing, id);
        if (dependentCount > 0) {
          throw new ConflictException(
            'Mapel atau tahun ajaran tidak dapat diubah karena penugasan sudah dipakai oleh data akademik',
          );
        }
      }
      if (dto.hoursPerWeek !== undefined) {
        const scheduledBySemester = new Map<number, number>();
        for (const slot of existing.schedules) {
          const hours = slot.jpEnd - slot.jpStart + 1;
          scheduledBySemester.set(slot.semester, (scheduledBySemester.get(slot.semester) ?? 0) + hours);
        }
        const overLimit = [...scheduledBySemester.entries()].find(([, hours]) => hours > dto.hoursPerWeek!);
        if (overLimit) {
          throw new ConflictException(
            `JP per minggu tidak boleh kurang dari ${overLimit[1]} JP yang sudah dijadwalkan pada semester ${overLimit[0]}`,
          );
        }
      }
      return tx.teachingAssignment.update({
        where: { id },
        data: { ...dto, ...(dto.subject !== undefined ? { subject: canonicalSubject } : {}) },
        select: ASSIGNMENT_SELECT,
      });
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM academic.teaching_assignments WHERE id = ${id}::uuid FOR UPDATE`,
      );
      const existing = await tx.teachingAssignment.findUnique({
        where: { id },
        select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true },
      });
      if (!existing) throw new NotFoundException('TeachingAssignment tidak ditemukan');

      const dependentCount = await this.countContextDependencies(tx, existing, id);
      if (dependentCount > 0) {
        throw new ConflictException(
          'Penugasan tidak dapat dihapus karena sudah dipakai oleh jadwal atau data pembelajaran',
        );
      }
      await tx.teachingAssignment.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  private async countContextDependencies(
    db: AssignmentDb,
    assignment: { teacherId: string; classId: string; subject: string; academicYear: string },
    assignmentId?: string,
  ): Promise<number> {
    const context = {
      teacherId: assignment.teacherId,
      classId: assignment.classId,
      subject: assignment.subject,
      academicYear: assignment.academicYear,
    };
    const [schedules, grades, rpp, lms, sessions] = await Promise.all([
      assignmentId ? db.schedule.count({ where: { teachingAssignmentId: assignmentId } }) : Promise.resolve(0),
      assignmentId ? db.grade.count({ where: { assignmentId } }) : Promise.resolve(0),
      db.rpp.count({ where: context }),
      db.lmsModule.count({ where: context }),
      db.assessmentSession.count({
        where: {
          teacherId: assignment.teacherId,
          classId: assignment.classId,
          academicYear: assignment.academicYear,
          module: { subject: assignment.subject },
        },
      }),
    ]);
    return schedules + grades + rpp + lms + sessions;
  }

  // ── W2-A-4: Wali kelas detection ──────────────────────────────────────────
  // Kelas tempat guru ini adalah wali kelas (Class.teacherId = teacher.id).
  // Teacher.isWaliKelas flag juga dicek untuk konsistensi.
  async findWaliClasses(user: AuthUser) {
    const [teacher, activeYear] = await Promise.all([
      this.prisma.teacher.findFirst({
        where: { user: { keycloakId: user.keycloakId }, deletedAt: null },
        select: { id: true, isWaliKelas: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { code: true },
      }),
    ]);
    if (!teacher || !activeYear) return { classes: [], isWaliKelas: false };

    const classes = await this.prisma.class.findMany({
      where: { teacherId: teacher.id, isActive: true, academicYear: activeYear.code },
      select: { id: true, name: true, majorCode: true, grade: true, academicYear: true },
      orderBy: [{ grade: 'asc' }, { name: 'asc' }],
    });

    return { classes, isWaliKelas: teacher.isWaliKelas || classes.length > 0 };
  }
}
