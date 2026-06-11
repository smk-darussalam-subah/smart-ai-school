// =============================================================================
// ClassesService — Manajemen Kelas/Rombel (referensi KamilEdu Modul 4)
// Minimal-viable: list (dengan jumlah siswa & wali kelas), create, update.
// Delete = nonaktifkan (soft) — Class dirujuk banyak FK (students, attendance,
// schedules, teaching_assignments) sehingga hard delete ditolak 409 bila berelasi.
// =============================================================================

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateClassDto,
  ListClassesQueryDto,
  UpdateClassDto,
} from './dto/class.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

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
          teacher: { select: { id: true, user: { select: { fullName: true } } } },
          _count: { select: { students: true } },
        },
      }),
      this.prisma.class.count({ where }),
    ]);

    const data = rows.map(({ _count, teacher, ...c }) => ({
      ...c,
      waliKelas: teacher ? { id: teacher.id, fullName: teacher.user.fullName } : null,
      studentCount: _count.students,
    }));

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const kelas = await this.prisma.class.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, user: { select: { fullName: true } } } },
        _count: { select: { students: true } },
      },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    const { _count, teacher, ...rest } = kelas;
    return {
      ...rest,
      waliKelas: teacher ? { id: teacher.id, fullName: teacher.user.fullName } : null,
      studentCount: _count.students,
    };
  }

  async create(dto: CreateClassDto) {
    return this.prisma.class.create({
      data: {
        name: dto.name,
        majorCode: dto.majorCode,
        grade: dto.grade,
        academicYear: dto.academicYear,
        capacity: dto.capacity,
        teacherId: dto.teacherId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.findOne(id);
    return this.prisma.class.update({
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
