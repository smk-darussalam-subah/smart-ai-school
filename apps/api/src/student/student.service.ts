// =============================================================================
// StudentService — CRUD + ownership checks
//
// Ownership rules (service layer, NOT guard):
//   SISWA  → hanya bisa baca data diri sendiri (student.userId === auth.users.id)
//   ORANG_TUA → hanya bisa baca data anak (student.parentId === auth.users.id)
//   SA/KS/TU/GURU → tidak ada pembatasan ownership (tapi GURU future: cek class di SMA-36)
//
// ⚠️ DATA PRIVACY (R-05): Jangan input data siswa nyata sampai consent SMA-55 aktif.
// =============================================================================

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisioningService, Actor } from '../provisioning/provisioning.service';
import { normalizeOrThrow } from '../common/helpers/phone';
import { isGuruOnly, resolveGuruClassIds, resolveUserId } from '../common/helpers/role-helpers';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { AssignParentDto } from './dto/assign-parent.dto';
import { ListStudentsQuery } from './dto/list-students.dto';
import {
  EVENTS,
  StudentEnrolledPayload,
  StudentStatusChangedPayload,
} from '../events/events.types';

// ── Select shapes ────────────────────────────────────────────────────────────

const STUDENT_BASE_SELECT = {
  id: true,
  userId: true,
  parentId: true,
  nis: true,
  status: true,
  joinedAt: true,
  classId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  class: { select: { id: true, name: true, majorCode: true, grade: true } },
} as const;

const GRADE_SELECT = {
  id: true,
  semester: true,
  academicYear: true,
  score: true,
  type: true,
  notes: true,
  submittedBy: true,
  createdAt: true,
  assignment: {
    select: {
      id: true,
      subject: true,
      academicYear: true,
      class: { select: { name: true } },
    },
  },
} as const;

const ATTENDANCE_SELECT = {
  id: true,
  date: true,
  status: true,
  notes: true,
  recordedBy: true,
  createdAt: true,
  class: { select: { id: true, name: true, majorCode: true } },
} as const;

// ── Ownership helpers ────────────────────────────────────────────────────────

const RESTRICTED_ROLES = ['SISWA', 'ORANG_TUA'] as const;

function needsOwnershipCheck(user: AuthUser): boolean {
  return user.roles.some((r) => (RESTRICTED_ROLES as readonly string[]).includes(r));
}

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly provisioning: ProvisioningService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Cek kepemilikan data: SISWA harus diri sendiri, ORANG_TUA harus anak sendiri.
   * Dipanggil setelah student record sudah di-fetch (avoid double query).
   * keycloakId → auth.users.id via shared helper (role-helpers.ts).
   */
  private assertOwnership(
    student: { userId: string; parentId: string | null },
    authUserId: string,
    requestUser: AuthUser,
  ): void {
    if (requestUser.roles.includes('SISWA') && student.userId !== authUserId) {
      throw new ForbiddenException('Siswa hanya bisa mengakses data diri sendiri');
    }
    if (
      requestUser.roles.includes('ORANG_TUA') &&
      student.parentId !== authUserId
    ) {
      throw new ForbiddenException('Orang tua hanya bisa mengakses data anak sendiri');
    }
  }

  private async assertGuruCanReadStudent(
    student: { classId: string | null },
    requestUser: AuthUser,
  ): Promise<void> {
    if (!isGuruOnly(requestUser)) return;
    const classIds = await resolveGuruClassIds(this.prisma, requestUser.keycloakId);
    if (!student.classId || !classIds.includes(student.classId)) {
      throw new ForbiddenException('Guru hanya bisa mengakses siswa pada kelas yang diampu');
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(query: ListStudentsQuery, requestUser: AuthUser) {
    const { classId, status, search, sortBy, sortOrder, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      ...(classId && { classId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { nis: { contains: search, mode: 'insensitive' as const } },
          { user: { fullName: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    if (isGuruOnly(requestUser)) {
      const classIds = await resolveGuruClassIds(this.prisma, requestUser.keycloakId);
      if (classId && !classIds.includes(classId)) {
        throw new ForbiddenException('Guru hanya bisa melihat siswa pada kelas yang diampu');
      }
      where.classId = classId ?? { in: classIds };
    }

    // orderBy dari whitelist (fullName via relasi user).
    const orderBy =
      sortBy === 'fullName' ? { user: { fullName: sortOrder } }
      : sortBy === 'nis' ? { nis: sortOrder }
      : sortBy === 'status' ? { status: sortOrder }
      : { createdAt: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        select: STUDENT_BASE_SELECT,
        orderBy,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string, requestUser: AuthUser) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: STUDENT_BASE_SELECT,
    });

    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await resolveUserId(this.prisma, requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }
    await this.assertGuruCanReadStudent(student, requestUser);

    return student;
  }

  /**
   * GET /students/my-children — daftar semua anak untuk ORANG_TUA.
   * Resolve keycloakId → auth.users.id → students where parentId === userId.
   * Mengembalikan array (orang tua bisa punya >1 anak terdaftar).
   * Pola sama dengan resolveChildStudentIds() di grade/attendance/finance service,
   * tapi mengembalikan record lengkap (bukan hanya id[]) untuk konsumsi dashboard ortu.
   */
  async findMyChildren(requestUser: AuthUser) {
    const userId = await resolveUserId(this.prisma, requestUser.keycloakId);
    const data = await this.prisma.student.findMany({
      where: { parentId: userId, deletedAt: null },
      select: STUDENT_BASE_SELECT,
      orderBy: { joinedAt: 'asc' },
    });
    return { data };
  }

  /**
   * P1 (S-09): Profile CV aggregate — identity + academic stats for siswa profile screen.
   * Combines user identity, grade average, attendance pct, module progress, XP.
   */
  async profileCv(requestUser: AuthUser) {
    const userId = await resolveUserId(this.prisma, requestUser.keycloakId);
    const student = await this.prisma.student.findFirst({
      where: { userId, deletedAt: null },
      select: {
        ...STUDENT_BASE_SELECT,
        user: { select: { id: true, fullName: true, email: true, phone: true } },
      },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan');

    // Aggregate grades
    const grades = await this.prisma.grade.findMany({
      where: { studentId: student.id },
      select: { score: true },
    });
    const scores = grades.map((g) => Number(g.score)).filter((n) => !Number.isNaN(n));
    const avgGrade = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    // Aggregate attendance
    const attendances = await this.prisma.attendance.findMany({
      where: { studentId: student.id },
      select: { status: true },
    });
    const attTotal = attendances.length;
    const attHadir = attendances.filter((a) => a.status === 'hadir').length;
    const attendancePct = attTotal ? Math.round((attHadir / attTotal) * 100) : null;

    // Modules completed
    const modulesCompleted = await this.prisma.lmsModuleProgress.count({
      where: { studentId: student.id, status: 'completed' },
    });

    // Streak: consecutive days with 'hadir' ending today or yesterday
    const recentAtt = await this.prisma.attendance.findMany({
      where: { studentId: student.id, status: 'hadir' },
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    });
    let streak = 0;
    if (recentAtt.length > 0) {
      const dayMs = 86400000;
      let prev = new Date(recentAtt[0]!.date.getTime());
      streak = 1;
      for (let i = 1; i < recentAtt.length; i++) {
        const diff = (prev.getTime() - new Date(recentAtt[i]!.date).getTime()) / dayMs;
        if (diff > 1.5) break;
        streak++;
        prev = new Date(recentAtt[i]!.date.getTime());
      }
    }

    // XP + level + streak from gamification.student_xp (P15 W3-3)
    const xpRecord = await this.prisma.studentXp.findFirst({
      where: { studentId: student.id },
      select: { totalXp: true, level: true, streakDays: true },
    });
    const totalXP = xpRecord?.totalXp ?? 0;
    const level = xpRecord?.level ?? 1;

    return {
      name: student.user?.fullName ?? '—',
      nis: student.nis,
      email: student.user?.email ?? '—',
      phone: student.user?.phone ?? '—',
      class: student.class?.name ?? '—',
      school: 'SMK Darussalam Subah',
      enrollmentDate: student.joinedAt?.toISOString().slice(0, 10) ?? '—',
      xp: totalXP,
      level,
      avgGrade,
      attendance: attendancePct,
      modulesCompleted,
      streak,
    };
  }

  async create(dto: CreateStudentDto) {
    const student = await this.prisma.student.create({
      data: dto,
      select: STUDENT_BASE_SELECT,
    });

    // Emit student.enrolled — fire-and-forget (tidak boleh gagalkan transaksi)
    const enrollPayload: StudentEnrolledPayload = {
      studentId: student.id,
      nis:       student.nis,
      fullName:  student.user.fullName,
      parentId:  student.parentId,
    };
    this.eventEmitter.emit(EVENTS.STUDENT_ENROLLED, enrollPayload);

    return student;
  }

  async update(id: string, dto: UpdateStudentDto) {
    const existing = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, parentId: true },
    });
    if (!existing) throw new NotFoundException('Student tidak ditemukan');

    if (dto.parentId === null && existing.parentId !== null) {
      throw new BadRequestException('Tidak boleh menghapus orang tua siswa yang sudah terdaftar');
    }

    const updated = await this.prisma.student.update({
      where: { id },
      data: dto,
      select: STUDENT_BASE_SELECT,
    });

    // Emit student.statusChanged hanya jika status benar-benar berubah
    if (dto.status && dto.status !== existing.status) {
      const statusPayload: StudentStatusChangedPayload = {
        studentId: updated.id,
        nis:       updated.nis,
        fullName:  updated.user.fullName,
        userId:    updated.userId,
        parentId:  updated.parentId,
        oldStatus: existing.status,
        newStatus: dto.status,
      };
      this.eventEmitter.emit(EVENTS.STUDENT_STATUS_CHANGED, statusPayload);
    }

    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Student tidak ditemukan');

    // Soft delete — set deletedAt, JANGAN hapus record dari DB
    return this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, nis: true, deletedAt: true },
    });
  }

  // ── Sub-resources ─────────────────────────────────────────────────────────

  async findGrades(id: string, requestUser: AuthUser) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, parentId: true, classId: true },
    });
    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await resolveUserId(this.prisma, requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }
    await this.assertGuruCanReadStudent(student, requestUser);

    return this.prisma.grade.findMany({
      where: { studentId: id },
      select: GRADE_SELECT,
      orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
    });
  }

  async findAttendance(id: string, requestUser: AuthUser) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, parentId: true, classId: true },
    });
    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await resolveUserId(this.prisma, requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }
    await this.assertGuruCanReadStudent(student, requestUser);

    return this.prisma.attendance.findMany({
      where: { studentId: id },
      select: ATTENDANCE_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  // ── Provisioning sub-resources ────────────────────────────────────────────

  async findWithoutParent(query: { page: number; limit: number }) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = { parentId: null, deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        select: STUDENT_BASE_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async assignParent(id: string, dto: AssignParentDto, actor: Actor) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, parentId: true, nis: true },
    });
    if (!student) throw new NotFoundException('Student tidak ditemukan');
    if (student.parentId) {
      throw new BadRequestException('Student sudah memiliki orang tua — gunakan update biasa untuk mengganti');
    }

    const ortuPhone = normalizeOrThrow(dto.ortu.phone);

    const ortuResult = await this.provisioning.provisionOrtu(
      {
        name: dto.ortu.name,
        phone: ortuPhone,
        email: dto.ortu.email,
        reuseByPhone: dto.reuseParentByPhone ?? false,
      },
      actor,
    );

    const consentAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: student.userId },
        data: { consentAt },
      });
      await tx.user.update({
        where: { id: ortuResult.userId },
        data: { consentAt },
      });

      return tx.student.update({
        where: { id },
        data: { parentId: ortuResult.userId },
        select: STUDENT_BASE_SELECT,
      });
    });

    return {
      student: updated,
      ortu: { userId: ortuResult.userId, keycloakId: ortuResult.keycloakId, isNew: ortuResult.isNew },
      tempCredentials: ortuResult.tempCredentials,
    };
  }
}
