// =============================================================================
// LmsService — modul belajar + progres siswa (2P-1).
// GURU: CRUD + publish modul MILIK SENDIRI (ownership ditegakkan di query).
// SISWA: baca modul published kelasnya + lapor progres sendiri.
// KS/SA/WAKA active appointment: baca semua (audit). Pola ownership/role mengikuti RppService.
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
import { resolveOwnTeachingRead } from '../common/helpers/own-teaching-read';
import {
  CreateLmsModuleDto,
  ListLmsModuleQueryDto,
  UpdateLmsModuleDto,
  UpdateProgressDto,
} from './dto/lms.dto';
import { AcademicPeriodService } from '../academic-period/academic-period.service';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'] as const;

const LMS_SELECT = {
  id: true,
  teacherId: true,
  rppId: true,
  classId: true,
  subject: true,
  title: true,
  tp: true,
  jpAllocation: true,
  kktp: true,
  content: true,
  orderIndex: true,
  status: true,
  academicYear: true,
  semester: true,
  createdAt: true,
  updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
} as const;

@Injectable()
export class LmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicPeriod: AcademicPeriodService,
  ) {}

  private isReviewer(user: AuthUser): boolean {
    return user.roles.some((r) => (REVIEWER_ROLES as readonly string[]).includes(r));
  }

  private async resolveTeacherId(
    keycloakId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const teacher = await db.teacher.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan untuk akun ini');
    return teacher.id;
  }

  private async resolveStudent(
    keycloakId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; classId: string | null }> {
    const student = await db.student.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true, classId: true },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan untuk akun ini');
    return student;
  }

  private async writeTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => callback(tx));
  }

  /** Cutover first, then module row: all LMS writers share this lock order. */
  private async lockModule(tx: Prisma.TransactionClient, id: string) {
    await this.academicPeriod.acquireCutoverLock(tx);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM academic.lms_modules WHERE id = ${id}::uuid FOR UPDATE`,
    );
    const module = await tx.lmsModule.findUnique({ where: { id }, select: LMS_SELECT });
    if (!module) throw new NotFoundException('Modul LMS tidak ditemukan');
    return module;
  }

  private async assertContext(
    tx: Prisma.TransactionClient,
    context: {
      teacherId: string;
      classId: string | null;
      subject: string;
      academicYear: string;
      semester: number;
      rppId: string | null;
    },
    user: AuthUser,
    preservePublic = false,
  ): Promise<void> {
    if (context.rppId) {
      // Keep the validated source stable until the module mutation commits.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM academic.rpp WHERE id = ${context.rppId}::uuid FOR SHARE`,
      );
      const rpp = await tx.rpp.findUnique({ where: { id: context.rppId } });
      if (!rpp) throw new NotFoundException('Modul Ajar sumber tidak ditemukan');
      if (rpp.teacherId !== context.teacherId) {
        throw new ForbiddenException('Modul Ajar sumber harus milik guru pembuat LMS.');
      }
      if (
        rpp.archivedAt ||
        rpp.classId !== context.classId ||
        rpp.subject.toLowerCase() !== context.subject.toLowerCase() ||
        rpp.academicYear !== context.academicYear ||
        rpp.semester !== context.semester
      ) {
        throw new ForbiddenException(
          'Kelas, mapel, dan periode LMS harus sesuai Modul Ajar sumber.',
        );
      }
    }
    if (context.classId === null) {
      if (!preservePublic && !this.isReviewer(user)) {
        throw new ForbiddenException('Pilih kelas sesuai penugasan mengajar Anda.');
      }
      return;
    }
    await this.assertTeachingAssignment(
      context.teacherId,
      context.classId,
      context.subject,
      context.academicYear,
      tx,
    );
  }

  /** Modul yang TERLIHAT oleh seorang siswa: published + kelasnya (atau umum/null). */
  private studentVisibilityWhere(classId: string | null): Prisma.LmsModuleWhereInput {
    return {
      status: 'published',
      OR: [{ classId: classId ?? undefined }, { classId: null }],
    };
  }

  async findAll(query: ListLmsModuleQueryDto, user: AuthUser) {
    const ownTeacherId = await resolveOwnTeachingRead(this.prisma, user, query.scope);
    const filters: Prisma.LmsModuleWhereInput = {
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };

    const skip = (query.page - 1) * query.limit;

    if (ownTeacherId) return this.page({ ...filters, teacherId: ownTeacherId }, skip, query);
    if (user.roles.includes('GURU') && !this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      return this.page({ ...filters, teacherId }, skip, query);
    }

    if (user.roles.includes('SISWA') && !this.isReviewer(user) && !user.roles.includes('GURU')) {
      const student = await this.resolveStudent(user.keycloakId);
      const where: Prisma.LmsModuleWhereInput = {
        ...filters,
        ...this.studentVisibilityWhere(student.classId),
      };
      const [data, total] = await Promise.all([
        this.prisma.lmsModule.findMany({
          where,
          orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

  private async page(
    where: Prisma.LmsModuleWhereInput,
    skip: number,
    query: ListLmsModuleQueryDto,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.lmsModule.findMany({
        where,
        orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
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
      const visible =
        module.status === 'published' &&
        (module.class === null || module.class.id === student.classId);
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
    const avgProgress: number =
      total > 0
        ? Math.round(shaped.reduce((sum, m) => sum + (m.myProgress?.progress ?? 0), 0) / total)
        : 0;

    return {
      data: shaped,
      stats: { total, completed, inProgress, notStarted, avgProgress },
    };
  }

  async create(dto: CreateLmsModuleDto, user: AuthUser) {
    return this.writeTransaction(async (tx) => {
      await this.academicPeriod.acquireCutoverLock(tx);
      const teacherId = await this.resolveTeacherId(user.keycloakId, tx);
      let context = {
        teacherId,
        classId: dto.classId ?? null,
        subject: dto.subject,
        academicYear: dto.academicYear,
        semester: dto.semester,
        rppId: dto.rppId ?? null,
      };
      if (dto.rppId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM academic.rpp WHERE id = ${dto.rppId}::uuid FOR SHARE`,
        );
        const rpp = await tx.rpp.findUnique({ where: { id: dto.rppId } });
        if (!rpp) throw new NotFoundException('RPP tidak ditemukan');
        context = {
          ...context,
          classId: rpp.classId,
          subject: rpp.subject,
          academicYear: rpp.academicYear,
        };
      }
      // Historical classless RPP sources already have an explicit general audience.
      await this.assertContext(tx, context, user, !!dto.rppId && context.classId === null);
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: context.academicYear,
        semester: context.semester,
      });
      return tx.lmsModule.create({
        data: {
          teacherId,
          rppId: dto.rppId ?? null,
          classId: context.classId,
          subject: context.subject,
          title: dto.title,
          tp: dto.tp ?? null,
          jpAllocation: dto.jpAllocation ?? null,
          kktp: dto.kktp,
          content: dto.content ?? null,
          orderIndex: dto.orderIndex,
          status: dto.publish ? 'published' : 'draft',
          academicYear: context.academicYear,
          semester: context.semester,
        },
        select: LMS_SELECT,
      });
    });
  }

  // ── W3-6: TeachingAssignment validation (mirror RppService.assertTeachingAssignment) ──
  private async assertTeachingAssignment(
    teacherId: string,
    classId: string | null | undefined,
    subject: string,
    academicYear: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (!classId) {
      throw new ForbiddenException('Class wajib dipilih sesuai assignment mengajar Anda');
    }
    const assignment = await db.teachingAssignment.findFirst({
      where: { teacherId, classId, subject, academicYear },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'Anda tidak memiliki assignment mengajar untuk kombinasi class/subject/tahun ajaran ini',
      );
    }
  }

  /** Edit modul milik sendiri yang belum diarsipkan, pada periode yang masih terbuka. */
  async update(id: string, dto: UpdateLmsModuleDto, user: AuthUser) {
    return this.writeTransaction(async (tx) => {
      const existing = await this.lockModule(tx, id);
      const teacherId = await this.resolveTeacherId(user.keycloakId, tx);
      if (existing.teacherId !== teacherId)
        throw new NotFoundException('Modul LMS tidak ditemukan');
      if (existing.status === 'archived')
        throw new ConflictException('Modul LMS yang sudah diarsipkan tidak bisa diedit.');
      const context = {
        teacherId,
        classId: dto.classId !== undefined ? dto.classId : existing.classId,
        rppId: dto.rppId !== undefined ? dto.rppId : existing.rppId,
        subject: dto.subject ?? existing.subject,
        academicYear: dto.academicYear ?? existing.academicYear,
        semester: dto.semester ?? existing.semester,
      };
      const preservePublic =
        existing.classId === null &&
        context.classId === null &&
        context.subject === existing.subject &&
        context.academicYear === existing.academicYear &&
        context.semester === existing.semester;
      await this.assertContext(tx, context, user, preservePublic);
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      const nextAcademicYear = dto.academicYear ?? existing.academicYear;
      const nextSemester = dto.semester ?? existing.semester;
      if (nextAcademicYear !== existing.academicYear || nextSemester !== existing.semester) {
        await this.academicPeriod.assertWritablePeriod(tx, {
          academicYear: nextAcademicYear,
          semester: nextSemester,
        });
      }
      const changed = await tx.lmsModule.updateMany({
        where: { id, teacherId, status: existing.status },
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
      });
      if (changed.count !== 1) {
        throw new ConflictException('Status modul berubah. Muat ulang sebelum menyimpan.');
      }
      return tx.lmsModule.findUniqueOrThrow({ where: { id }, select: LMS_SELECT });
    });
  }

  /** Ubah status publikasi (publish/unpublish/archive) — milik sendiri. */
  async setStatus(id: string, status: 'draft' | 'published' | 'archived', user: AuthUser) {
    return this.writeTransaction(async (tx) => {
      const existing = await this.lockModule(tx, id);
      const teacherId = await this.resolveTeacherId(user.keycloakId, tx);
      if (existing.teacherId !== teacherId)
        throw new NotFoundException('Modul LMS tidak ditemukan');
      if (existing.status === 'archived') {
        if (status === 'archived') return existing;
        throw new ConflictException(
          'Modul LMS archived bersifat terminal dan tidak bisa dibuka kembali.',
        );
      }
      if (status === 'published')
        await this.assertContext(tx, existing, user, existing.classId === null);
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      const changed = await tx.lmsModule.updateMany({
        where: { id, teacherId, status: existing.status },
        data: { status },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Status modul berubah. Muat ulang sebelum mengubah publikasi.');
      }
      return tx.lmsModule.findUniqueOrThrow({ where: { id }, select: LMS_SELECT });
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.writeTransaction(async (tx) => {
      const existing = await this.lockModule(tx, id);
      if (!user.roles.includes('SUPER_ADMIN')) {
        const teacherId = await this.resolveTeacherId(user.keycloakId, tx);
        if (existing.teacherId !== teacherId)
          throw new NotFoundException('Modul LMS tidak ditemukan');
      }
      if (existing.status === 'archived')
        throw new ConflictException(
          'Modul LMS archived bersifat terminal dan tidak boleh dihapus.',
        );
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      const deleted = await tx.lmsModule.deleteMany({ where: { id, status: existing.status } });
      if (deleted.count !== 1)
        throw new ConflictException('Modul berubah. Muat ulang sebelum menghapus.');
    });
    return { deleted: true, id };
  }

  /** SISWA melapor progres modul published yang terlihat untuknya (upsert). */
  async updateProgress(moduleId: string, dto: UpdateProgressDto, user: AuthUser) {
    return this.writeTransaction(async (tx) => {
      const module = await this.lockModule(tx, moduleId);
      const student = await this.resolveStudent(user.keycloakId, tx);
      if (
        module.status !== 'published' ||
        (module.classId !== null && module.classId !== student.classId)
      ) {
        throw new ForbiddenException('Modul tidak tersedia untuk Anda');
      }
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: module.academicYear,
        semester: module.semester,
      });
      const existingProgress = await tx.lmsModuleProgress.findUnique({
        where: { moduleId_studentId: { moduleId, studentId: student.id } },
        select: { progress: true, status: true, completedAt: true },
      });
      const nextProgress = Math.max(existingProgress?.progress ?? 0, dto.progress);
      const nextStatus =
        existingProgress?.status === 'completed' ||
        dto.status === 'completed' ||
        nextProgress >= 100
          ? 'completed'
          : 'active';
      const now = new Date();
      return tx.lmsModuleProgress.upsert({
        where: { moduleId_studentId: { moduleId, studentId: student.id } },
        create: {
          moduleId,
          studentId: student.id,
          progress: nextProgress,
          status: nextStatus,
          startedAt: now,
          completedAt: nextStatus === 'completed' ? now : null,
        },
        update: {
          progress: nextProgress,
          status: nextStatus,
          completedAt: nextStatus === 'completed' ? (existingProgress?.completedAt ?? now) : null,
        },
        select: {
          id: true,
          moduleId: true,
          progress: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      });
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
          progress: true,
          status: true,
          startedAt: true,
          completedAt: true,
          student: { select: { nis: true, user: { select: { fullName: true } } } },
        },
      }),
      module.classId
        ? this.prisma.student.count({
            where: { classId: module.classId, deletedAt: null, status: 'active' },
          })
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
}
