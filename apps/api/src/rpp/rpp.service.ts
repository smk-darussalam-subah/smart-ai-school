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
import { EVENTS, RppReviewedPayload } from '../events/events.types';
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
// - SUPER_ADMIN: setara KS untuk tujuan admin/audit.
// Two-step workflow (WAKA check → KS approve) tetap ditangguhkan karena butuh
// enum `RppStatus` baru (`reviewed`) — perubahan schema Prisma = ASK FIRST.
// Lihat docs/audits/WAVE3-PHASE2-ACADEMIC-PREPARATION-REMEDIATION-2026-07-20.md.
const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'] as const;
const EDITABLE_STATUSES = ['draft', 'revision'] as const;

// Prioritas role untuk audit trail. Role yang lebih spesifik dicatat lebih dulu.
const REVIEWER_ROLE_PRIORITY = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'] as const;

const RPP_SELECT = {
  id: true, teacherId: true, classId: true, subject: true, title: true,
  content: true, body: true, fileUrl: true, status: true,
  reviewerId: true, reviewerName: true, reviewNote: true,
  submittedAt: true, reviewedAt: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true, staff: { select: { niy: true } } } } } },
  class: { select: { id: true, name: true } },
} as const;

@Injectable()
export class RppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private isReviewer(user: AuthUser): boolean {
    return user.roles.some((r) => (REVIEWER_ROLES as readonly string[]).includes(r));
  }

  /**
   * W3-4 P2: Ekstrak role reviewer utama dari user.roles.
   * Prioritas: SUPER_ADMIN > KEPALA_SEKOLAH > WAKA_KURIKULUM.
   * Dipakai untuk audit trail — reviewerName disimpan sebagai `username [ROLE]`
   * agar supervisor/auditor dapat melihat siapa yang mengambil keputusan
   * dan dalam kapasitas apa.
   */
  private extractReviewerRole(user: AuthUser): string | null {
    for (const role of REVIEWER_ROLE_PRIORITY) {
      if (user.roles.includes(role)) return role;
    }
    return null;
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
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };

    if (this.isReviewer(user)) {
      if (query.teacherId) where.teacherId = query.teacherId;
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
    const where: Prisma.RppWhereInput = { id };
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
    // KS/SA (reviewer) dapat bypass untuk tujuan audit/admin.
    if (!this.isReviewer(user)) {
      await this.assertTeachingAssignment(teacherId, dto.classId, dto.subject, dto.academicYear);
    }
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
    if (!this.isReviewer(user)) {
      const newClassId = dto.classId !== undefined ? dto.classId : existing.classId;
      const newSubject = dto.subject !== undefined ? dto.subject : existing.subject;
      const newYear = dto.academicYear !== undefined ? dto.academicYear : existing.academicYear;
      await this.assertTeachingAssignment(teacherId, newClassId, newSubject, newYear);
    }
    return this.prisma.rpp.update({
      where: { id },
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
      select: RPP_SELECT,
    });
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
    return this.prisma.rpp.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
      select: RPP_SELECT,
    });
  }

  /** submitted → approved|revision (KS/SA/WAKA). Revisi wajib bercatatan (DTO). */
  async review(id: string, dto: ReviewRppDto, user: AuthUser) {
    const existing = await this.prisma.rpp.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (existing.status !== 'submitted') {
      throw new ConflictException(
        `Hanya RPP berstatus 'submitted' yang bisa direview (sekarang '${existing.status}')`,
      );
    }
    // W3-4 P2: Audit trail dengan role tag — reviewerName disimpan sebagai
    // `username [ROLE]` agar jelas dalam kapasitas apa keputusan diambil.
    const reviewerRole = this.extractReviewerRole(user);
    const formattedReviewerName = reviewerRole
      ? `${user.username} [${reviewerRole}]`
      : user.username;
    const reviewed = await this.prisma.rpp.update({
      where: { id },
      data: {
        status: dto.decision,
        reviewNote: dto.note ?? null,
        reviewerId: user.keycloakId,
        reviewerName: formattedReviewerName,
        reviewedAt: new Date(),
      },
      select: RPP_SELECT,
    });

    // Notifikasi WA ke guru (konsumer: NotificationListener — fail-soft)
    this.eventEmitter.emit(EVENTS.RPP_REVIEWED, {
      rppId: reviewed.id,
      teacherId: reviewed.teacherId,
      title: reviewed.title,
      decision: dto.decision,
      note: dto.note ?? null,
      reviewedAtIso: reviewed.reviewedAt?.toISOString() ?? new Date().toISOString(),
    } satisfies RppReviewedPayload);

    return reviewed;
  }

  /** Hapus: GURU milik sendiri status draft; SA bebas (CRUD penuh dummy). */
  async remove(id: string, user: AuthUser) {
    if (user.roles.includes('SUPER_ADMIN')) {
      const existing = await this.prisma.rpp.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException('RPP tidak ditemukan');
      await this.prisma.rpp.delete({ where: { id } });
      return { deleted: true, id };
    }
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.rpp.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('RPP tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException('Hanya RPP draft yang bisa dihapus guru');
    }
    await this.prisma.rpp.delete({ where: { id } });
    return { deleted: true, id };
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
