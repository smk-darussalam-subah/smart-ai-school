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
import { PrismaService } from '../prisma/prisma.service';
import { ProvisioningService, Actor } from '../provisioning/provisioning.service';
import { normalizeOrThrow } from '../common/helpers/phone';
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
   * Resolve keycloakId → DB user id.
   * Diperlukan untuk ownership check (Student.userId/parentId menyimpan auth.users.id).
   */
  private async resolveAuthUserId(keycloakId: string): Promise<string> {
    const authUser = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    if (!authUser) throw new ForbiddenException('User tidak ditemukan');
    return authUser.id;
  }

  /**
   * Cek kepemilikan data: SISWA harus diri sendiri, ORANG_TUA harus anak sendiri.
   * Dipanggil setelah student record sudah di-fetch (avoid double query).
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

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(query: ListStudentsQuery) {
    const { classId, status, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
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

  async findById(id: string, requestUser: AuthUser) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: STUDENT_BASE_SELECT,
    });

    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await this.resolveAuthUserId(requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }

    return student;
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
      select: { id: true, userId: true, parentId: true },
    });
    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await this.resolveAuthUserId(requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }

    // TODO SMA-36: tambah filter "GURU hanya bisa akses kelas sendiri" via TeachingAssignment
    return this.prisma.grade.findMany({
      where: { studentId: id },
      select: GRADE_SELECT,
      orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }],
    });
  }

  async findAttendance(id: string, requestUser: AuthUser) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, parentId: true },
    });
    if (!student) throw new NotFoundException('Student tidak ditemukan');

    if (needsOwnershipCheck(requestUser)) {
      const authUserId = await this.resolveAuthUserId(requestUser.keycloakId);
      this.assertOwnership(student, authUserId, requestUser);
    }

    // TODO SMA-36: tambah filter "GURU hanya bisa akses kelas sendiri" via TeachingAssignment
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
