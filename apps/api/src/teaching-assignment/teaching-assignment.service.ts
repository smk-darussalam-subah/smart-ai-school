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
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
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
} as const;

// ── Ownership helper ──────────────────────────────────────────────────────────

const ELEVATED_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] as const;

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
  private async validateForeignKeys(teacherId: string, classId: string): Promise<void> {
    const [teacher, kelas] = await Promise.all([
      this.prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true } }),
      this.prisma.class.findUnique({ where: { id: classId }, select: { id: true } }),
    ]);
    if (!teacher) throw new BadRequestException(`teacherId '${teacherId}' tidak ditemukan`);
    if (!kelas) throw new BadRequestException(`classId '${classId}' tidak ditemukan`);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(query: ListAssignmentsQuery, user: AuthUser) {
    const skip = (query.page - 1) * query.limit;

    // GURU: paksa filter ke teacherId sendiri, abaikan teacherId dari query
    let teacherIdFilter = query.teacherId;
    if (isGuruOnly(user)) {
      teacherIdFilter = await this.resolveTeacherId(user.keycloakId);
    }

    const where = {
      ...(teacherIdFilter && { teacherId: teacherIdFilter }),
      ...(query.classId && { classId: query.classId }),
      ...(query.academicYear && { academicYear: query.academicYear }),
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

    if (isGuruOnly(user)) {
      const myTeacherId = await this.resolveTeacherId(user.keycloakId);
      if (assignment.teacherId !== myTeacherId) {
        throw new ForbiddenException('Guru hanya bisa melihat assignment sendiri');
      }
    }

    return assignment;
  }

  async create(dto: CreateAssignmentDto) {
    await this.validateForeignKeys(dto.teacherId, dto.classId);
    // P2002 (duplikat unique constraint) → ditangani PrismaExceptionFilter global → 409
    return this.prisma.teachingAssignment.create({
      data: dto,
      select: ASSIGNMENT_SELECT,
    });
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      select: { id: true, teacherId: true, classId: true },
    });
    if (!existing) throw new NotFoundException('TeachingAssignment tidak ditemukan');

    // P2002 (duplikat unique constraint) → ditangani PrismaExceptionFilter global → 409
    return this.prisma.teachingAssignment.update({
      where: { id },
      data: dto,
      select: ASSIGNMENT_SELECT,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.teachingAssignment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('TeachingAssignment tidak ditemukan');

    await this.prisma.teachingAssignment.delete({ where: { id } });
    return { id, deleted: true };
  }
}
