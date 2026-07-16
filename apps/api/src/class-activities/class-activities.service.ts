// =============================================================================
// ClassActivitiesService — Kegiatan Kelas (referensi KamilEdu Modul 9)
// GURU mencatat kegiatan (teacherId di-resolve dari token, BUKAN dari body);
// edit/hapus: GURU pemilik atau SUPER_ADMIN. Baca: semua role akademik.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  isElevated,
  isGuruOnly,
  isOrangTuaOnly,
  isSiswaOnly,
  resolveGuruClassIds,
  resolveSiswaClassId,
  resolveUserId,
} from '../common/helpers/role-helpers';
import {
  CreateActivityDto,
  ListActivitiesQueryDto,
  UpdateActivityDto,
} from './dto/class-activity.dto';

const ACTIVITY_SELECT = {
  id: true, classId: true, date: true, title: true, description: true,
  category: true, photoUrl: true, createdAt: true,
  class: { select: { id: true, name: true } },
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
} as const;

@Injectable()
export class ClassActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTeacherId(keycloakId: string): Promise<string> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan untuk akun ini');
    return teacher.id;
  }

  private async resolveReadableClassIds(user: AuthUser): Promise<string[] | null> {
    if (isElevated(user)) return null;
    if (isGuruOnly(user)) {
      return resolveGuruClassIds(this.prisma, user.keycloakId);
    }
    if (isSiswaOnly(user)) {
      const classId = await resolveSiswaClassId(this.prisma, user.keycloakId);
      return classId ? [classId] : [];
    }
    if (isOrangTuaOnly(user)) {
      const userId = await resolveUserId(this.prisma, user.keycloakId);
      const children = await this.prisma.student.findMany({
        where: { parentId: userId, deletedAt: null, classId: { not: null } },
        select: { classId: true },
        distinct: ['classId'],
      });
      return [...new Set(children.flatMap((child) => child.classId ? [child.classId] : []))];
    }
    return [];
  }

  private async assertGuruCanManageClass(classId: string, user: AuthUser): Promise<void> {
    if (user.roles.includes('SUPER_ADMIN')) return;
    const classIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
    if (!classIds.includes(classId)) {
      throw new ForbiddenException('Guru hanya bisa mencatat kegiatan untuk kelas yang diampu');
    }
  }

  async findAll(query: ListActivitiesQueryDto, user: AuthUser) {
    const readableClassIds = await this.resolveReadableClassIds(user);
    const where: Prisma.ClassActivityWhereInput = {
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    if (readableClassIds !== null) {
      if (query.classId && !readableClassIds.includes(query.classId)) {
        throw new ForbiddenException('Pengguna hanya bisa melihat kegiatan kelas dalam scope yang diizinkan');
      }
      where.classId = query.classId ?? { in: readableClassIds };
    }
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.classActivity.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: ACTIVITY_SELECT,
      }),
      this.prisma.classActivity.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async create(dto: CreateActivityDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    await this.assertGuruCanManageClass(dto.classId, user);
    const kelas = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');

    return this.prisma.classActivity.create({
      data: {
        classId: dto.classId,
        teacherId,
        date: new Date(`${dto.date}T00:00:00Z`),
        title: dto.title,
        description: dto.description ?? null,
        category: dto.category,
        photoUrl: dto.photoUrl ?? null,
      },
      select: ACTIVITY_SELECT,
    });
  }

  /** Pemilik (guru pencatat) atau SUPER_ADMIN. */
  private async assertOwnership(id: string, user: AuthUser): Promise<void> {
    const activity = await this.prisma.classActivity.findUnique({
      where: { id },
      select: { teacherId: true },
    });
    if (!activity) throw new NotFoundException('Kegiatan tidak ditemukan');
    if (user.roles.includes('SUPER_ADMIN')) return;

    const myTeacherId = await this.resolveTeacherId(user.keycloakId);
    if (activity.teacherId !== myTeacherId) {
      throw new ForbiddenException('Hanya guru pencatat yang boleh mengubah kegiatan ini');
    }
  }

  async update(id: string, dto: UpdateActivityDto, user: AuthUser) {
    await this.assertOwnership(id, user);
    if (dto.classId) {
      await this.assertGuruCanManageClass(dto.classId, user);
    }
    return this.prisma.classActivity.update({
      where: { id },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.date !== undefined ? { date: new Date(`${dto.date}T00:00:00Z`) } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      },
      select: ACTIVITY_SELECT,
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.assertOwnership(id, user);
    await this.prisma.classActivity.delete({ where: { id } });
    return { deleted: true, id };
  }
}
