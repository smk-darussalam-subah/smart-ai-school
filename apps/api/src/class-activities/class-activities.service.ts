// =============================================================================
// ClassActivitiesService — Kegiatan Kelas (referensi KamilEdu Modul 9)
// GURU mencatat kegiatan (teacherId di-resolve dari token, BUKAN dari body);
// edit/hapus: GURU pemilik atau SUPER_ADMIN. Baca: semua role akademik.
// =============================================================================

import {
  ConflictException,
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
import {
  createClassActivityMediaKey,
  parseClassActivityMediaKey,
  validateClassActivityMedia,
} from './class-activity-media';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';
import {
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';

const ACTIVITY_SELECT = {
  id: true, classId: true, date: true, title: true, description: true,
  category: true, photoUrl: true, createdAt: true,
  class: { select: { id: true, name: true } },
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
} as const;

@Injectable()
export class ClassActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private isKesiswaanOperator(user: AuthUser): boolean {
    return user.roles.includes('WAKA_KESISWAAN');
  }

  private async resolveTeacherId(keycloakId: string): Promise<string> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan untuk akun ini');
    return teacher.id;
  }

  private async resolveReadableClassIds(user: AuthUser): Promise<string[] | null> {
    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      const classes = await this.prisma.class.findMany({
        where: kaprogClassWhere(scope),
        select: { id: true },
      });
      return classes.map((item) => item.id);
    }
    if (isElevated(user) || this.isKesiswaanOperator(user)) return null;
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

  private async assertCanReadClass(classId: string, user: AuthUser): Promise<void> {
    const readableClassIds = await this.resolveReadableClassIds(user);
    if (readableClassIds !== null && !readableClassIds.includes(classId)) {
      throw new ForbiddenException('Pengguna hanya bisa melihat media kegiatan dalam scope kelasnya');
    }
  }

  private presentActivity<T extends { id: string; photoUrl: string | null }>(activity: T) {
    const hasPrivateMedia = parseClassActivityMediaKey(activity.photoUrl) !== null;
    return {
      ...activity,
      photoUrl: hasPrivateMedia ? null : activity.photoUrl,
      mediaUrl: hasPrivateMedia ? `/api/v1/class-activities/${activity.id}/media` : null,
    };
  }

  private async assertGuruCanManageClass(classId: string, user: AuthUser): Promise<void> {
    if (user.roles.includes('SUPER_ADMIN') || this.isKesiswaanOperator(user)) return;
    const classIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
    if (!classIds.includes(classId)) {
      throw new ForbiddenException('Guru hanya bisa mencatat kegiatan untuk kelas yang diampu');
    }
  }

  private async assertActiveClass(classId: string): Promise<void> {
    const [kelas, activeYear] = await Promise.all([
      this.prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, isActive: true, academicYear: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { code: true },
      }),
    ]);
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    if (!activeYear || !kelas.isActive || kelas.academicYear !== activeYear.code) {
      throw new ForbiddenException('Kegiatan hanya dapat dicatat untuk kelas pada tahun ajaran aktif');
    }
  }

  async findAll(query: ListActivitiesQueryDto, user: AuthUser) {
    const readableClassIds = await this.resolveReadableClassIds(user);
    const where: Prisma.ClassActivityWhereInput = {
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { teacher: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        ],
      } : {}),
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
    const canManageAll = user.roles.includes('SUPER_ADMIN') || this.isKesiswaanOperator(user);
    const teacherId = !canManageAll && isGuruOnly(user)
      ? await this.resolveTeacherId(user.keycloakId)
      : null;
    return {
      data: data.map((activity) => ({
        ...this.presentActivity(activity),
        canManage: canManageAll || activity.teacher.id === teacherId,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listManageableClasses(user: AuthUser) {
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { code: true },
    });
    if (!activeYear) return [];
    const classIds = user.roles.includes('SUPER_ADMIN') || this.isKesiswaanOperator(user)
      ? null
      : await resolveGuruClassIds(this.prisma, user.keycloakId);
    return this.prisma.class.findMany({
      where: {
        isActive: true,
        academicYear: activeYear.code,
        ...(classIds === null ? {} : { id: { in: classIds } }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async listReadableClasses(user: AuthUser) {
    const readableClassIds = await this.resolveReadableClassIds(user);
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { code: true },
    });
    if (!activeYear) return [];
    return this.prisma.class.findMany({
      where: {
        isActive: true,
        academicYear: activeYear.code,
        ...(readableClassIds === null ? {} : { id: { in: readableClassIds } }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateActivityDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    await this.assertGuruCanManageClass(dto.classId, user);
    await this.assertActiveClass(dto.classId);

    const activity = await this.prisma.classActivity.create({
      data: {
        classId: dto.classId,
        teacherId,
        date: new Date(`${dto.date}T00:00:00Z`),
        title: dto.title,
        description: dto.description ?? null,
        category: dto.category,
        photoUrl: null,
      },
      select: ACTIVITY_SELECT,
    });
    return this.presentActivity(activity);
  }

  /** Pemilik (guru pencatat) atau SUPER_ADMIN. */
  private async assertOwnership(id: string, user: AuthUser) {
    const activity = await this.prisma.classActivity.findUnique({
      where: { id },
      select: { id: true, classId: true, teacherId: true, photoUrl: true },
    });
    if (!activity) throw new NotFoundException('Kegiatan tidak ditemukan');
    if (user.roles.includes('SUPER_ADMIN') || this.isKesiswaanOperator(user)) return activity;

    const myTeacherId = await this.resolveTeacherId(user.keycloakId);
    if (activity.teacherId !== myTeacherId) {
      throw new ForbiddenException('Hanya guru pencatat yang boleh mengubah kegiatan ini');
    }
    return activity;
  }

  async update(id: string, dto: UpdateActivityDto, user: AuthUser) {
    await this.assertOwnership(id, user);
    if (dto.classId) {
      await this.assertGuruCanManageClass(dto.classId, user);
      await this.assertActiveClass(dto.classId);
    }
    const activity = await this.prisma.classActivity.update({
      where: { id },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.date !== undefined ? { date: new Date(`${dto.date}T00:00:00Z`) } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
      },
      select: ACTIVITY_SELECT,
    });
    return this.presentActivity(activity);
  }

  async uploadMedia(
    id: string,
    body: unknown,
    contentType: string | undefined,
    user: AuthUser,
  ) {
    const activity = await this.assertOwnership(id, user);
    const previousKey = parseClassActivityMediaKey(activity.photoUrl);
    const media = validateClassActivityMedia(body, contentType);
    const key = createClassActivityMediaKey(media.contentType);
    await this.storage.putObject(key, media.bytes, media.contentType);

    try {
      const updated = await this.prisma.classActivity.updateMany({
        where: { id, photoUrl: activity.photoUrl },
        data: { photoUrl: key },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Data kegiatan berubah; muat ulang sebelum mengunggah media');
      }
    } catch (error) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }
    if (previousKey) await this.storage.deleteObject(previousKey).catch(() => undefined);

    return {
      mediaUrl: `/api/v1/class-activities/${id}/media`,
      contentType: media.contentType,
      size: media.bytes.length,
    };
  }

  async getMedia(id: string, user: AuthUser) {
    const activity = await this.prisma.classActivity.findUnique({
      where: { id },
      select: { classId: true, photoUrl: true },
    });
    if (!activity) throw new NotFoundException('Kegiatan tidak ditemukan');
    await this.assertCanReadClass(activity.classId, user);

    const key = parseClassActivityMediaKey(activity.photoUrl);
    if (!key) {
      throw new NotFoundException('Kegiatan tidak memiliki media privat');
    }
    return this.storage.getObject(key);
  }

  async removeMedia(id: string, user: AuthUser) {
    const activity = await this.assertOwnership(id, user);
    const key = parseClassActivityMediaKey(activity.photoUrl);

    const changed = await this.prisma.classActivity.updateMany({
      where: { id, photoUrl: activity.photoUrl },
      data: { photoUrl: null },
    });
    if (changed.count !== 1) throw new ConflictException('Data kegiatan berubah; muat ulang sebelum menghapus media');
    if (key) await this.storage.deleteObject(key).catch(() => undefined);
    return { deleted: true, id };
  }

  async remove(id: string, user: AuthUser) {
    const activity = await this.assertOwnership(id, user);
    await this.prisma.classActivity.delete({ where: { id } });
    const key = parseClassActivityMediaKey(activity.photoUrl);
    if (key) await this.storage.deleteObject(key).catch(() => undefined);
    return { deleted: true, id };
  }
}
