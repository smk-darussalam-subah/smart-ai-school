// =============================================================================
// RppService — pipeline review RPP (referensi KamilEdu Modul 11)
// State machine: draft → submitted → approved | revision; revision → (edit) →
// submitted. Edit hanya pada draft/revision. Ownership GURU ditegakkan DI QUERY.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EVENTS, RppReviewedPayload } from '../events/events.types';
import {
  assertClassInKaprogScope,
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import {
  CreateRppDto,
  ListRppQueryDto,
  ReviewRppDto,
  UpdateRppDto,
} from './dto/rpp.dto';

// W3-4: One-step consistent policy dengan role-aware audit trail.
// - WAKA_KURIKULUM: dapat melakukan Review (catatan + minta revisi) dan Approval
//   (bila KS mendisposisikan). Audit trail mencatat role reviewer.
// - KEPALA_SEKOLAH: Final Approval + supervisi/audit penuh atas semua RPP.
// SUPER_ADMIN remains a read/archive recovery role, not a pedagogical reviewer.
const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'] as const;
const EDITABLE_STATUSES = ['draft', 'revision'] as const;

const RPP_SELECT = {
  id: true, teacherId: true, classId: true, subject: true, title: true,
  content: true, body: true, fileUrl: true, status: true,
  reviewerId: true, reviewerName: true, reviewNote: true,
  curriculumReviewerId: true, curriculumReviewerName: true,
  curriculumReviewNote: true, curriculumReviewedAt: true,
  finalReviewerId: true, finalReviewerName: true,
  finalReviewNote: true, finalApprovedAt: true,
  submittedAt: true, reviewedAt: true, archivedAt: true, archivedBy: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true, staff: { select: { niy: true } } } } } },
  class: { select: { id: true, name: true } },
} as const;

@Injectable()
export class RppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissions: PermissionsService,
  ) {}

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

  async findAll(query: ListRppQueryDto, user: AuthUser) {
    const where: Prisma.RppWhereInput = {
      archivedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.search ? {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { subject: { contains: query.search, mode: 'insensitive' } },
          { teacher: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } },
        ],
      } : {}),
    };

    if (this.isReviewer(user)) {
      if (query.teacherId) where.teacherId = query.teacherId;
      if (isKaprogScopedReader(user)) {
        const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
        if (query.classId) await assertClassInKaprogScope(this.prisma, query.classId, scope);
        where.class = kaprogClassWhere(scope);
      }
    } else if (user.roles.includes('GURU')) {
      where.teacherId = await this.resolveTeacherId(user.keycloakId); // ownership DI QUERY
    } else {
      throw new ForbiddenException('Akses ditolak');
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.rpp.findMany({
        where,
        orderBy: [{ status: 'asc' }, { submittedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        skip,
        take: query.limit,
        select: RPP_SELECT,
      }),
      this.prisma.rpp.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, user: AuthUser) {
    const where: Prisma.RppWhereInput = { id, archivedAt: null };
    if (isKaprogScopedReader(user)) {
      where.class = kaprogClassWhere(await resolveActiveKaprogMajorScope(this.prisma, user));
    }
    if (!this.isReviewer(user)) {
      if (!user.roles.includes('GURU')) throw new ForbiddenException('Akses ditolak');
      where.teacherId = await this.resolveTeacherId(user.keycloakId);
    }
    const rpp = await this.prisma.rpp.findFirst({ where, select: RPP_SELECT });
    if (!rpp) throw new NotFoundException('RPP tidak ditemukan');
    return rpp;
  }

  async create(dto: CreateRppDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    if (!dto.content && !dto.fileUrl && !dto.body) {
      throw new BadRequestException('Isi Modul Ajar (struktur/teks) atau lampiran wajib salah satu');
    }
    // W3-6: GURU harus memiliki TeachingAssignment yang cocok dengan
    // classId + subject + academicYear. Mencegah guru membuat Modul Ajar
    // untuk kelas/mapel yang bukan assignmennya dengan menebak UUID kelas.
    await this.assertTeachingAssignment(teacherId, dto.classId, dto.subject, dto.academicYear);
    return this.prisma.rpp.create({
      data: {
        teacherId,
        classId: dto.classId ?? null,
        subject: dto.subject,
        title: dto.title,
        content: dto.content ?? null,
        body: dto.body ? (dto.body as Prisma.InputJsonValue) : Prisma.DbNull,
        fileUrl: dto.fileUrl ?? null,
        academicYear: dto.academicYear,
        semester: dto.semester,
        status: dto.submit ? 'submitted' : 'draft',
        submittedAt: dto.submit ? new Date() : null,
      },
      select: RPP_SELECT,
    });
  }

  /** Edit hanya milik sendiri + status draft/revision. */
  async update(id: string, dto: UpdateRppDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.rpp.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true, classId: true, subject: true, academicYear: true },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (!(EDITABLE_STATUSES as readonly string[]).includes(existing.status)) {
      throw new ConflictException(`RPP berstatus '${existing.status}' tidak bisa diedit`);
    }
    // W3-6: jika update mengubah classId/subject/academicYear, validasi assignment baru.
    const newClassId = dto.classId !== undefined ? dto.classId : existing.classId;
    const newSubject = dto.subject !== undefined ? dto.subject : existing.subject;
    const newYear = dto.academicYear !== undefined ? dto.academicYear : existing.academicYear;
    await this.assertTeachingAssignment(teacherId, newClassId, newSubject, newYear);
    const changed = await this.prisma.rpp.updateMany({
      where: { id, teacherId, status: existing.status, archivedAt: null },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.body !== undefined ? { body: dto.body ? (dto.body as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
        ...(dto.fileUrl !== undefined ? { fileUrl: dto.fileUrl } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
        ...(dto.semester !== undefined ? { semester: dto.semester } : {}),
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Status Modul Ajar berubah. Muat ulang sebelum menyimpan edit.');
    }
    const updated = await this.prisma.rpp.findUnique({ where: { id }, select: RPP_SELECT });
    if (!updated) throw new NotFoundException('RPP tidak ditemukan setelah diperbarui');
    return updated;
  }

  /** draft|revision → submitted (milik sendiri). */
  async submit(id: string, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.rpp.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true, content: true, body: true, fileUrl: true },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (!(EDITABLE_STATUSES as readonly string[]).includes(existing.status)) {
      throw new ConflictException(`RPP berstatus '${existing.status}' tidak bisa di-submit`);
    }
    if (!existing.content && !existing.fileUrl && !existing.body) {
      throw new BadRequestException('Modul Ajar kosong — isi struktur/teks atau lampiran dulu');
    }
    const changed = await this.prisma.rpp.updateMany({
      where: { id, teacherId, status: existing.status, archivedAt: null },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        curriculumReviewerId: null,
        curriculumReviewerName: null,
        curriculumReviewNote: null,
        curriculumReviewedAt: null,
        finalReviewerId: null,
        finalReviewerName: null,
        finalReviewNote: null,
        finalApprovedAt: null,
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Status Modul Ajar berubah. Muat ulang sebelum mengajukan.');
    }
    const submitted = await this.prisma.rpp.findUnique({ where: { id }, select: RPP_SELECT });
    if (!submitted) throw new NotFoundException('RPP tidak ditemukan setelah diajukan');
    return submitted;
  }

  /** submitted -> curriculum_reviewed -> approved; revision wajib bercatatan. */
  async review(id: string, dto: ReviewRppDto, user: AuthUser) {
    const existing = await this.prisma.rpp.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        classId: true,
        archivedAt: true,
        curriculumReviewerId: true,
      },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (existing.archivedAt) throw new ConflictException('Modul Ajar yang diarsipkan tidak dapat direview');

    const isFinalReviewer = user.roles.includes('KEPALA_SEKOLAH');
    const isCurriculumReviewer = user.roles.includes('WAKA_KURIKULUM') || user.roles.includes('KAPROG');
    if (!isFinalReviewer && !isCurriculumReviewer) {
      throw new ForbiddenException('Akses review ditolak');
    }
    if (isKaprogScopedReader(user)) {
      if (!existing.classId) {
        throw new ForbiddenException('Kaprog hanya dapat mereview Modul Ajar dalam lingkup jurusannya');
      }
      await assertClassInKaprogScope(
        this.prisma,
        existing.classId,
        await resolveActiveKaprogMajorScope(this.prisma, user),
      );
    }
    const isCurriculumStage = existing.status === 'submitted';
    const isFinalStage = existing.status === 'curriculum_reviewed';
    if (!isCurriculumStage && !isFinalStage) {
      throw new ConflictException(
        `Modul Ajar tidak berada pada antrean review (status '${existing.status}')`,
      );
    }
    const requiredPermission = isCurriculumStage
      ? 'rpp.curriculum.review'
      : 'rpp.final.approve';
    if (!await this.permissions.hasPermission(user.keycloakId, user.roles, requiredPermission)) {
      throw new ForbiddenException(`Permission '${requiredPermission}' diperlukan untuk tahap review ini`);
    }
    if (isCurriculumStage) {
      if (!isCurriculumReviewer) {
        throw new ForbiddenException('Review kurikulum hanya untuk Waka Kurikulum atau Kaprog');
      }
      if (!['recommended', 'revision'].includes(dto.decision)) {
        throw new ForbiddenException('Waka Kurikulum/Kaprog hanya dapat merekomendasikan atau meminta revisi');
      }
    } else {
      if (!isFinalReviewer) {
        throw new ForbiddenException('Persetujuan final hanya untuk Kepala Sekolah');
      }
      if (existing.curriculumReviewerId === user.keycloakId) {
        throw new ForbiddenException('Persetujuan final harus dilakukan oleh aktor yang berbeda dari reviewer kurikulum');
      }
      if (!['approved', 'revision'].includes(dto.decision)) {
        throw new ForbiddenException('Kepala Sekolah hanya dapat menyetujui final atau meminta revisi');
      }
    }
    // W3-4 P2: Audit trail dengan role tag — reviewerName disimpan sebagai
    // `username [ROLE]` agar jelas dalam kapasitas apa keputusan diambil.
    const reviewerRole = isCurriculumStage
      ? (user.roles.includes('WAKA_KURIKULUM') ? 'WAKA_KURIKULUM' : 'KAPROG')
      : 'KEPALA_SEKOLAH';
    const formattedReviewerName = reviewerRole
      ? `${user.username} [${reviewerRole}]`
      : user.username;
    const now = new Date();
    const nextStatus: 'curriculum_reviewed' | 'approved' | 'revision' =
      dto.decision === 'recommended' ? 'curriculum_reviewed' : dto.decision;
    const updateData: Prisma.RppUpdateManyMutationInput = {
      status: nextStatus,
      reviewNote: dto.note ?? null,
      reviewerId: user.keycloakId,
      reviewerName: formattedReviewerName,
      reviewedAt: now,
      ...(isCurriculumStage ? {
        curriculumReviewerId: user.keycloakId,
        curriculumReviewerName: formattedReviewerName,
        curriculumReviewNote: dto.note ?? null,
        curriculumReviewedAt: now,
        finalReviewerId: null,
        finalReviewerName: null,
        finalReviewNote: null,
        finalApprovedAt: null,
      } : {
        finalReviewerId: user.keycloakId,
        finalReviewerName: formattedReviewerName,
        finalReviewNote: dto.note ?? null,
        finalApprovedAt: dto.decision === 'approved' ? now : null,
      }),
    };
    const changed = await this.prisma.rpp.updateMany({
      where: { id, status: existing.status, archivedAt: null },
      data: updateData,
    });
    if (changed.count !== 1) {
      throw new ConflictException('Status Modul Ajar berubah. Muat ulang antrean sebelum mengambil keputusan.');
    }
    const reviewed = await this.prisma.rpp.findUnique({
      where: { id },
      select: RPP_SELECT,
    });
    if (!reviewed) throw new NotFoundException('RPP tidak ditemukan setelah review');

    // Notifikasi WA ke guru (konsumer: NotificationListener — fail-soft)
    if (dto.decision !== 'recommended') {
      this.eventEmitter.emit(EVENTS.RPP_REVIEWED, {
        rppId: reviewed.id,
        teacherId: reviewed.teacherId,
        title: reviewed.title,
        decision: dto.decision,
        note: dto.note ?? null,
        reviewedAtIso: reviewed.reviewedAt?.toISOString() ?? now.toISOString(),
      } satisfies RppReviewedPayload);
    }

    return reviewed;
  }

  /** Hapus: GURU milik sendiri status draft; SA bebas (CRUD penuh dummy). */
  async archive(id: string, user: AuthUser) {
    if (user.roles.includes('SUPER_ADMIN')) {
      const existing = await this.prisma.rpp.findUnique({
        where: { id },
        select: { id: true, archivedAt: true },
      });
      if (!existing) throw new NotFoundException('RPP tidak ditemukan');
      if (existing.archivedAt) throw new ConflictException('Modul Ajar sudah diarsipkan');
      const changed = await this.prisma.rpp.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt: new Date(), archivedBy: user.keycloakId },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Status Modul Ajar berubah. Muat ulang sebelum mengarsipkan.');
      }
      return { archived: true, id };
    }
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.rpp.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException('Hanya RPP draft yang bisa dihapus guru');
    }
    if (existing.archivedAt) throw new ConflictException('Modul Ajar sudah diarsipkan');
    const changed = await this.prisma.rpp.updateMany({
      where: { id, teacherId, status: 'draft', archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: user.keycloakId },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Status Modul Ajar berubah. Muat ulang sebelum mengarsipkan.');
    }
    return { archived: true, id };
  }

  // ── W3-6: TeachingAssignment validation ─────────────────────────────────
  /**
   * Pastikan GURU memiliki TeachingAssignment yang cocok dengan triple
   * (classId, subject, academicYear). Tidak cocok → ForbiddenException.
   * Dipanggil di create/update RPP untuk mencegah guru membuat Modul Ajar
   * untuk kelas/mapel di luar assignment-nya.
   */
  private async assertTeachingAssignment(
    teacherId: string,
    classId: string | null | undefined,
    subject: string,
    academicYear: string,
  ): Promise<void> {
    if (!classId) {
      // Classless/general RPP tidak diizinkan untuk GURU saat ini. Bilamana
      // produk mendefinisikan RPP umum secara eksplisit, kebijakan ini dapat
      // diubah dengan parameter `allowClassless`.
      throw new BadRequestException('Class wajib dipilih sesuai assignment mengajar Anda');
    }
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classId, subject, academicYear },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'Anda tidak memiliki assignment mengajar untuk kombinasi class/subject/tahun ajaran ini',
      );
    }
  }
}
