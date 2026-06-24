// =============================================================================
// LmsService — modul belajar + progres siswa (2P-1).
// GURU: CRUD + publish modul MILIK SENDIRI (ownership ditegakkan di query).
// SISWA: baca modul published kelasnya + lapor progres sendiri.
// KS/SA: baca semua (audit). Pola ownership/role mengikuti RppService.
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
  CreateLmsModuleDto,
  ListLmsModuleQueryDto,
  UpdateLmsModuleDto,
  UpdateProgressDto,
} from './dto/lms.dto';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;

const LMS_SELECT = {
  id: true, teacherId: true, rppId: true, classId: true, subject: true, title: true,
  tp: true, jpAllocation: true, kktp: true, content: true, orderIndex: true, status: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
} as const;

@Injectable()
export class LmsService {
  constructor(private readonly prisma: PrismaService) {}

  private isReviewer(user: AuthUser): boolean {
    return user.roles.some((r) => (REVIEWER_ROLES as readonly string[]).includes(r));
  }

  private async resolveTeacherId(keycloakId: string): Promise<string> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan untuk akun ini');
    return teacher.id;
  }

  private async resolveStudent(keycloakId: string): Promise<{ id: string; classId: string | null }> {
    const student = await this.prisma.student.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true, classId: true },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan untuk akun ini');
    return student;
  }

  /** Modul yang TERLIHAT oleh seorang siswa: published + kelasnya (atau umum/null). */
  private studentVisibilityWhere(classId: string | null): Prisma.LmsModuleWhereInput {
    return {
      status: 'published',
      OR: [{ classId: classId ?? undefined }, { classId: null }],
    };
  }

  async findAll(query: ListLmsModuleQueryDto, user: AuthUser) {
    const filters: Prisma.LmsModuleWhereInput = {
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };

    const skip = (query.page - 1) * query.limit;

    if (user.roles.includes('GURU') && !this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      return this.page({ ...filters, teacherId }, skip, query);
    }

    if (user.roles.includes('SISWA') && !this.isReviewer(user) && !user.roles.includes('GURU')) {
      const student = await this.resolveStudent(user.keycloakId);
      const where: Prisma.LmsModuleWhereInput = { ...filters, ...this.studentVisibilityWhere(student.classId) };
      const [data, total] = await Promise.all([
        this.prisma.lmsModule.findMany({
          where,
          orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
          skip,
          take: query.limit,
          select: {
            ...LMS_SELECT,
            progress: {
              where: { studentId: student.id },
              select: { progress: true, status: true, startedAt: true, completedAt: true },
            },
          },
        }),
        this.prisma.lmsModule.count({ where }),
      ]);
      // Ratakan progres siswa (0..1 baris) → myProgress.
      const shaped = data.map(({ progress, ...m }) => ({ ...m, myProgress: progress[0] ?? null }));
      return { data: shaped, total, page: query.page, limit: query.limit };
    }

    if (this.isReviewer(user)) {
      return this.page(filters, skip, query);
    }

    throw new ForbiddenException('Akses ditolak');
  }

  private async page(where: Prisma.LmsModuleWhereInput, skip: number, query: ListLmsModuleQueryDto) {
    const [data, total] = await Promise.all([
      this.prisma.lmsModule.findMany({
        where,
        orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take: query.limit,
        select: { ...LMS_SELECT, _count: { select: { progress: true } } },
      }),
      this.prisma.lmsModule.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, user: AuthUser) {
    const module = await this.prisma.lmsModule.findUnique({ where: { id }, select: LMS_SELECT });
    if (!module) throw new NotFoundException('Modul LMS tidak ditemukan');

    if (this.isReviewer(user)) return module;

    if (user.roles.includes('GURU')) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (module.teacherId === teacherId) return module;
    }
    if (user.roles.includes('SISWA')) {
      const student = await this.resolveStudent(user.keycloakId);
      const visible = module.status === 'published'
        && (module.class === null || module.class.id === student.classId);
      if (visible) {
        // SISWA: sertakan progres sendiri (myProgress) — gap W1-2.
        // Sebelumnya findOne hanya mengembalikan data modul tanpa progres siswa.
        const myProgress = await this.prisma.lmsModuleProgress.findUnique({
          where: { moduleId_studentId: { moduleId: id, studentId: student.id } },
          select: { id: true, progress: true, status: true, startedAt: true, completedAt: true },
        });
        return { ...module, myProgress };
      }
    }
    throw new ForbiddenException('Akses ditolak');
  }

  /**
   * GET /lms/modules/my-learning — modul published untuk siswa + progres + ringkasan.
   * Endpoint khusus SISWA (lebih bersih dari findAll yang bercabang per role).
   * Mengembalikan modul kelas siswa (atau umum) + progres pribadi + statistik ringkas
   * untuk konsumsi dashboard siswa.
   */
  async findMyLearning(user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const where: Prisma.LmsModuleWhereInput = this.studentVisibilityWhere(student.classId);

    const modules = await this.prisma.lmsModule.findMany({
      where,
      orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }],
      select: {
        ...LMS_SELECT,
        progress: {
          where: { studentId: student.id },
          select: { progress: true, status: true, startedAt: true, completedAt: true },
        },
      },
    });

    // Ratakan progres siswa (0..1 baris) → myProgress (pola sama dengan findAll SISWA branch)
    const shaped = modules.map(({ progress, ...m }) => ({
      ...m,
      myProgress: progress[0] ?? null,
    }));

    // Ringkasan progres untuk dashboard siswa
    const total: number = shaped.length;
    const completed: number = shaped.filter((m) => m.myProgress?.status === 'completed').length;
    const inProgress: number = shaped.filter((m) => m.myProgress?.status === 'active').length;
    const notStarted: number = total - completed - inProgress;
    const avgProgress: number = total > 0
      ? Math.round(shaped.reduce((sum, m) => sum + (m.myProgress?.progress ?? 0), 0) / total)
      : 0;

    return {
      data: shaped,
      stats: { total, completed, inProgress, notStarted, avgProgress },
    };
  }

  async create(dto: CreateLmsModuleDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    return this.prisma.lmsModule.create({
      data: {
        teacherId,
        rppId: dto.rppId ?? null,
        classId: dto.classId ?? null,
        subject: dto.subject,
        title: dto.title,
        tp: dto.tp ?? null,
        jpAllocation: dto.jpAllocation ?? null,
        kktp: dto.kktp,
        content: dto.content ?? null,
        orderIndex: dto.orderIndex,
        status: dto.publish ? 'published' : 'draft',
        academicYear: dto.academicYear,
        semester: dto.semester,
      },
      select: LMS_SELECT,
    });
  }

  /** Edit modul milik sendiri (status apa pun — konten LMS bisa diperbarui kapan saja). */
  async update(id: string, dto: UpdateLmsModuleDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    await this.ensureOwned(id, teacherId);
    return this.prisma.lmsModule.update({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.tp !== undefined ? { tp: dto.tp } : {}),
        ...(dto.jpAllocation !== undefined ? { jpAllocation: dto.jpAllocation } : {}),
        ...(dto.kktp !== undefined ? { kktp: dto.kktp } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.rppId !== undefined ? { rppId: dto.rppId } : {}),
        ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
        ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
        ...(dto.semester !== undefined ? { semester: dto.semester } : {}),
      },
      select: LMS_SELECT,
    });
  }

  /** Ubah status publikasi (publish/unpublish/archive) — milik sendiri. */
  async setStatus(id: string, status: 'draft' | 'published' | 'archived', user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    await this.ensureOwned(id, teacherId);
    return this.prisma.lmsModule.update({ where: { id }, data: { status }, select: LMS_SELECT });
  }

  async remove(id: string, user: AuthUser) {
    if (user.roles.includes('SUPER_ADMIN')) {
      const existing = await this.prisma.lmsModule.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('Modul LMS tidak ditemukan');
      await this.prisma.lmsModule.delete({ where: { id } }); // progress cascade
      return { deleted: true, id };
    }
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    await this.ensureOwned(id, teacherId);
    await this.prisma.lmsModule.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** SISWA melapor progres modul published yang terlihat untuknya (upsert). */
  async updateProgress(moduleId: string, dto: UpdateProgressDto, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const module = await this.prisma.lmsModule.findUnique({
      where: { id: moduleId },
      select: { id: true, status: true, classId: true },
    });
    if (!module) throw new NotFoundException('Modul LMS tidak ditemukan');
    const visible = module.status === 'published'
      && (module.classId === null || module.classId === student.classId);
    if (!visible) throw new ForbiddenException('Modul tidak tersedia untuk Anda');

    const computedStatus = dto.status ?? (dto.progress >= 100 ? 'completed' : 'active');
    const now = new Date();
    return this.prisma.lmsModuleProgress.upsert({
      where: { moduleId_studentId: { moduleId, studentId: student.id } },
      create: {
        moduleId,
        studentId: student.id,
        progress: dto.progress,
        status: computedStatus,
        startedAt: now,
        completedAt: computedStatus === 'completed' ? now : null,
      },
      update: {
        progress: dto.progress,
        status: computedStatus,
        completedAt: computedStatus === 'completed' ? now : null,
      },
      select: { id: true, moduleId: true, progress: true, status: true, startedAt: true, completedAt: true },
    });
  }

  /** Progres siswa untuk satu modul (monitor guru). Guru PEMILIK / KS / SA. */
  async getProgress(moduleId: string, user: AuthUser) {
    const module = await this.prisma.lmsModule.findUnique({
      where: { id: moduleId },
      select: { id: true, title: true, subject: true, classId: true, teacherId: true },
    });
    if (!module) throw new NotFoundException('Modul LMS tidak ditemukan');
    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (module.teacherId !== teacherId) throw new ForbiddenException('Bukan modul Anda');
    }

    const [rows, classStudentCount] = await Promise.all([
      this.prisma.lmsModuleProgress.findMany({
        where: { moduleId },
        orderBy: [{ status: 'asc' }, { progress: 'desc' }],
        select: {
          progress: true, status: true, startedAt: true, completedAt: true,
          student: { select: { nis: true, user: { select: { fullName: true } } } },
        },
      }),
      module.classId
        ? this.prisma.student.count({ where: { classId: module.classId, deletedAt: null, status: 'active' } })
        : Promise.resolve(null),
    ]);

    const progress = rows.map((r) => ({
      name: r.student.user.fullName,
      nis: r.student.nis,
      progress: r.progress,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    }));
    return { progress, classStudentCount };
  }

  private async ensureOwned(id: string, teacherId: string): Promise<void> {
    const existing = await this.prisma.lmsModule.findFirst({ where: { id, teacherId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Modul LMS tidak ditemukan');
  }
}
