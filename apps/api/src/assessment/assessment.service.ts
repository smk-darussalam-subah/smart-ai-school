// =============================================================================
// AssessmentService — sesi asesmen + respons siswa (P12 — W2-9 + F5).
// GURU: CRUD sesi milik sendiri + start/complete · SISWA: submit respons
// untuk sesi active di kelasnya · KS/SA: baca semua (audit).
// Pola ownership/role mengikuti RppService & LmsService.
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
  CreateAssessmentSessionDto,
  ListAssessmentSessionDto,
  SubmitResponseDto,
  UpdateAssessmentSessionDto,
} from './dto/assessment.dto';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;

const SESSION_SELECT = {
  id: true, moduleId: true, teacherId: true, classId: true, title: true,
  type: true, status: true, questions: true, startedAt: true, completedAt: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  module: { select: { id: true, title: true, subject: true } },
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
  _count: { select: { responses: true } },
} as const;

@Injectable()
export class AssessmentService {
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

  async create(dto: CreateAssessmentSessionDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    // Verify module exists and is owned by this teacher (or reviewer)
    const mod = await this.prisma.lmsModule.findUnique({
      where: { id: dto.moduleId },
      select: { id: true, teacherId: true, subject: true, title: true, academicYear: true, semester: true, kktp: true },
    });
    if (!mod) throw new NotFoundException('Modul LMS tidak ditemukan');
    if (!this.isReviewer(user) && mod.teacherId !== teacherId) {
      throw new ForbiddenException('Anda bukan pemilik modul LMS ini');
    }

    return this.prisma.assessmentSession.create({
      data: {
        moduleId: dto.moduleId,
        teacherId,
        classId: dto.classId ?? null,
        title: dto.title,
        type: dto.type,
        status: 'draft',
        questions: dto.questions as Prisma.InputJsonValue,
        academicYear: dto.academicYear,
        semester: dto.semester,
      },
      select: SESSION_SELECT,
    });
  }

  async findAll(query: ListAssessmentSessionDto, user: AuthUser) {
    const filters: Prisma.AssessmentSessionWhereInput = {
      ...(query.moduleId ? { moduleId: query.moduleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };

    const skip = (query.page - 1) * query.limit;

    if (this.isReviewer(user)) {
      return this.page(filters, skip, query);
    }

    if (user.roles.includes('GURU')) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      return this.page({ ...filters, teacherId }, skip, query);
    }

    if (user.roles.includes('SISWA')) {
      const student = await this.resolveStudent(user.keycloakId);
      // Siswa hanya melihat sesi active/completed di kelasnya
      return this.page(
        {
          ...filters,
          status: { in: ['active', 'completed'] },
          OR: [{ classId: student.classId ?? undefined }, { classId: null }],
        },
        skip,
        query,
      );
    }

    throw new ForbiddenException('Akses ditolak');
  }

  private async page(where: Prisma.AssessmentSessionWhereInput, skip: number, query: ListAssessmentSessionDto) {
    const [data, total] = await Promise.all([
      this.prisma.assessmentSession.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: SESSION_SELECT,
      }),
      this.prisma.assessmentSession.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (this.isReviewer(user)) return session;

    if (user.roles.includes('GURU')) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId === teacherId) return session;
    }

    if (user.roles.includes('SISWA')) {
      const student = await this.resolveStudent(user.keycloakId);
      const visible = (session.status === 'active' || session.status === 'completed')
        && (session.classId === null || session.classId === student.classId);
      if (visible) return session;
    }

    throw new ForbiddenException('Akses ditolak');
  }

  async update(id: string, dto: UpdateAssessmentSessionDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.assessmentSession.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Sesi berstatus '${existing.status}' tidak bisa diedit`);
    }
    return this.prisma.assessmentSession.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.questions !== undefined ? { questions: dto.questions as Prisma.InputJsonValue } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
      },
      select: SESSION_SELECT,
    });
  }

  /** draft → active (GURU pemilik). Sesi aktif terlihat oleh siswa. */
  async startSession(id: string, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.assessmentSession.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Hanya sesi 'draft' yang bisa dimulai (sekarang '${existing.status}')`);
    }
    return this.prisma.assessmentSession.update({
      where: { id },
      data: { status: 'active', startedAt: new Date() },
      select: SESSION_SELECT,
    });
  }

  /** active → completed (GURU pemilik). Sesi selesai, tidak menerima respons lagi. */
  async completeSession(id: string, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.assessmentSession.findFirst({
      where: { id, teacherId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.status !== 'active') {
      throw new ConflictException(`Hanya sesi 'active' yang bisa diselesaikan (sekarang '${existing.status}')`);
    }
    return this.prisma.assessmentSession.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
      select: SESSION_SELECT,
    });
  }

  /** SISWA submit jawaban untuk sesi active di kelasnya. */
  async submitResponse(sessionId: string, dto: SubmitResponseDto, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, classId: true, questions: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') {
      throw new ConflictException('Sesi tidak aktif — tidak menerima respons');
    }
    const visible = session.classId === null || session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    // Cek apakah sudah submit
    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Anda sudah mengirimkan jawaban untuk sesi ini');
    }

    return this.prisma.assessmentResponse.create({
      data: {
        sessionId,
        studentId: student.id,
        answers: dto.answers as Prisma.InputJsonValue,
        submittedAt: new Date(),
      },
      select: {
        id: true, sessionId: true, score: true, submittedAt: true,
      },
    });
  }

  /** GURU pemilik / KS / SA: lihat semua respons untuk sesi (realtime monitor). */
  async getResults(sessionId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, classId: true, title: true, type: true, status: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
    }

    const [responses, classStudentCount] = await Promise.all([
      this.prisma.assessmentResponse.findMany({
        where: { sessionId },
        orderBy: [{ submittedAt: 'desc' }],
        select: {
          id: true, score: true, submittedAt: true,
          student: { select: { nis: true, user: { select: { fullName: true } } } },
        },
      }),
      session.classId
        ? this.prisma.student.count({ where: { classId: session.classId, deletedAt: null, status: 'active' } })
        : Promise.resolve(null),
    ]);

    const submitted = responses.length;
    const avgScore = submitted > 0
      ? Math.round(responses.reduce((sum, r) => sum + (r.score ?? 0), 0) / submitted)
      : null;

    return {
      session: { id: session.id, title: session.title, type: session.type, status: session.status },
      classStudentCount,
      submitted,
      avgScore,
      responses: responses.map((r) => ({
        name: r.student.user.fullName,
        nis: r.student.nis,
        score: r.score,
        submittedAt: r.submittedAt,
      })),
    };
  }
}
