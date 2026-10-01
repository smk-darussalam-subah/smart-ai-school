// =============================================================================
// ClassesService — Manajemen Kelas/Rombel (referensi KamilEdu Modul 4)
// Minimal-viable: list (dengan jumlah siswa & wali kelas), create, update.
// Delete = nonaktifkan (soft) — Class dirujuk banyak FK (students, attendance,
// schedules, teaching_assignments) sehingga hard delete ditolak 409 bila berelasi.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { acquireUserMutationLocks } from '../users/user-mutation-coordination';
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from './dto/class.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly operationalStudentWhere: Prisma.StudentWhereInput = {
    deletedAt: null,
    status: 'active',
    user: { is: { isActive: true, deletedAt: null } },
  };

  private readonly eligibleHomeroomWhere: Prisma.TeacherWhereInput = {
    deletedAt: null,
    user: {
      is: {
        role: 'GURU',
        isActive: true,
        deletedAt: null,
      },
    },
  };

  private projectClass<
    T extends {
      teacherId: string | null;
      teacher: {
        id: string;
        deletedAt: Date | null;
        user: {
          fullName: string;
          role: string;
          isActive: boolean;
          deletedAt: Date | null;
        };
      } | null;
      _count: { students: number };
    },
  >(row: T) {
    const { _count, teacher, ...kelas } = row;
    const eligible =
      teacher !== null &&
      teacher.deletedAt === null &&
      teacher.user.role === 'GURU' &&
      teacher.user.isActive &&
      teacher.user.deletedAt === null;

    return {
      ...kelas,
      waliKelas: eligible ? { id: teacher.id, fullName: teacher.user.fullName } : null,
      homeroomStatus: eligible
        ? ('assigned' as const)
        : teacher
          ? ('needs_replacement' as const)
          : ('unassigned' as const),
      studentCount: _count.students,
    };
  }

  private async findEligibleHomeroomTeacher(
    db: Prisma.TransactionClient | PrismaService,
    teacherId: string,
  ) {
    return db.teacher.findFirst({
      where: { id: teacherId, ...this.eligibleHomeroomWhere },
      select: { id: true, userId: true },
    });
  }

  private async assertEligibleHomeroomTeacher(
    tx: Prisma.TransactionClient,
    teacherId: string | null | undefined,
  ): Promise<void> {
    if (!teacherId) return;

    const candidate = await this.findEligibleHomeroomTeacher(tx, teacherId);
    if (!candidate) {
      throw new ConflictException(
        'Guru wali kelas tidak valid, tidak aktif, atau sudah diarsipkan. Pilih guru aktif lain.',
      );
    }
  }

  private async lockClass(tx: Prisma.TransactionClient, classId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM academic.classes WHERE id = ${classId}::uuid FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Kelas tidak ditemukan');
  }

  /**
   * Serializes class occupancy changes and rejects inactive/full classes.
   * Historical, inactive, archived, and soft-deleted students do not consume a seat.
   */
  async assertOperationalSeatAvailable(
    tx: Prisma.TransactionClient,
    classId: string,
    excludeStudentId?: string,
  ): Promise<void> {
    await this.lockClass(tx, classId);
    const kelas = await tx.class.findUnique({
      where: { id: classId },
      select: { name: true, capacity: true, isActive: true },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    if (!kelas.isActive) {
      throw new ConflictException(`Kelas ${kelas.name} sedang nonaktif dan tidak menerima siswa.`);
    }

    const studentCount = await tx.student.count({
      where: {
        classId,
        ...this.operationalStudentWhere,
        ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
      },
    });
    if (studentCount >= kelas.capacity) {
      throw new ConflictException(
        `Kelas ${kelas.name} sudah penuh (${studentCount}/${kelas.capacity}).`,
      );
    }
  }

  /**
   * Rejects an obviously invalid/full destination before provisioning creates
   * external identities. The locked transaction check remains authoritative.
   */
  async assertOperationalSeatAvailablePreflight(classId: string): Promise<void> {
    const kelas = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { name: true, capacity: true, isActive: true },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    if (!kelas.isActive) {
      throw new ConflictException(`Kelas ${kelas.name} sedang nonaktif dan tidak menerima siswa.`);
    }

    const studentCount = await this.prisma.student.count({
      where: { classId, ...this.operationalStudentWhere },
    });
    if (studentCount >= kelas.capacity) {
      throw new ConflictException(
        `Kelas ${kelas.name} sudah penuh (${studentCount}/${kelas.capacity}).`,
      );
    }
  }

  /**
   * Restoring or activating an account can make an existing student relation
   * operational again. Reuse the same class lock used by create/move flows so
   * that lifecycle changes cannot overbook a class concurrently.
   */
  async assertOperationalSeatForUserActivation(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const student = await tx.student.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: 'active',
        classId: { not: null },
      },
      select: { id: true, classId: true },
    });
    if (!student?.classId) return;

    await this.assertOperationalSeatAvailable(tx, student.classId, student.id);
  }

  async findHomeroomCandidates() {
    const rows = await this.prisma.teacher.findMany({
      where: this.eligibleHomeroomWhere,
      orderBy: { user: { fullName: 'asc' } },
      select: {
        id: true,
        user: { select: { fullName: true } },
      },
    });

    return rows.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.user.fullName,
    }));
  }

  async findAll(query: ListClassesQueryDto) {
    const { grade, majorCode, academicYear, includeInactive, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClassWhereInput = {
      ...(grade ? { grade } : {}),
      ...(majorCode ? { majorCode: majorCode.toUpperCase() } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        orderBy: [{ grade: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
        include: {
          teacher: {
            select: {
              id: true,
              deletedAt: true,
              user: {
                select: { fullName: true, role: true, isActive: true, deletedAt: true },
              },
            },
          },
          _count: {
            select: { students: { where: this.operationalStudentWhere } },
          },
        },
      }),
      this.prisma.class.count({ where }),
    ]);

    const data = rows.map((row) => this.projectClass(row));

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            id: true,
            deletedAt: true,
            user: {
              select: { fullName: true, role: true, isActive: true, deletedAt: true },
            },
          },
        },
        _count: {
          select: { students: { where: this.operationalStudentWhere } },
        },
      },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    return this.projectClass(kelas);
  }

  async create(dto: CreateClassDto) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = dto.teacherId
        ? await this.findEligibleHomeroomTeacher(tx, dto.teacherId)
        : null;
      if (dto.teacherId && !candidate) {
        throw new ConflictException(
          'Guru wali kelas tidak valid, tidak aktif, atau sudah diarsipkan. Pilih guru aktif lain.',
        );
      }
      if (candidate) {
        await acquireUserMutationLocks(tx, [candidate.userId]);
        await this.assertEligibleHomeroomTeacher(tx, dto.teacherId);
      }

      return tx.class.create({
        data: {
          name: dto.name,
          majorCode: dto.majorCode,
          grade: dto.grade,
          academicYear: dto.academicYear,
          capacity: dto.capacity,
          teacherId: dto.teacherId ?? null,
        },
      });
    });
  }

  async update(id: string, dto: UpdateClassDto) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = dto.teacherId
        ? await this.findEligibleHomeroomTeacher(tx, dto.teacherId)
        : null;
      if (dto.teacherId && !candidate) {
        throw new ConflictException(
          'Guru wali kelas tidak valid, tidak aktif, atau sudah diarsipkan. Pilih guru aktif lain.',
        );
      }
      if (candidate) {
        await acquireUserMutationLocks(tx, [candidate.userId]);
      }
      await this.lockClass(tx, id);
      await this.assertEligibleHomeroomTeacher(tx, dto.teacherId);

      if (dto.capacity !== undefined) {
        const studentCount = await tx.student.count({
          where: { classId: id, ...this.operationalStudentWhere },
        });
        if (dto.capacity < studentCount) {
          throw new BadRequestException(
            `Kapasitas tidak boleh lebih kecil dari ${studentCount} siswa operasional saat ini.`,
          );
        }
      }

      return tx.class.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.majorCode !== undefined ? { majorCode: dto.majorCode } : {}),
          ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
          ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    });
  }

  /** Hard delete hanya bila tak berelasi; selain itu 409 (gunakan isActive=false). */
  async remove(id: string) {
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: true,
            attendanceRecords: true,
            schedules: true,
            teachingAssignments: true,
          },
        },
      },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');

    const c = kelas._count;
    const related = c.students + c.attendanceRecords + c.schedules + c.teachingAssignments;
    if (related > 0) {
      throw new ConflictException(
        `Kelas masih memiliki ${c.students} siswa, ${c.attendanceRecords} absensi, ` +
          `${c.schedules} jadwal, ${c.teachingAssignments} penugasan. ` +
          'Nonaktifkan kelas (isActive=false) alih-alih menghapus.',
      );
    }

    await this.prisma.class.delete({ where: { id } });
    return { deleted: true, id };
  }
}
