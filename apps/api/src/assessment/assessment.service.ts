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
  type: true, status: true, questions: true,
  durationMinutes: true, randomizeOrder: true, // U2 Wave 1
  startedAt: true, completedAt: true,
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
        // U2 Wave 1: timer + randomization
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
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
        // U2 Wave 1: timer + randomization
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
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

  /** U2 Wave 1: SISWA memulai pengerjaan — mencatat startedAt, return shuffled questions jika randomizeOrder. */
  async startResponse(sessionId: string, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, classId: true, questions: true, durationMinutes: true, randomizeOrder: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') {
      throw new ConflictException('Sesi tidak aktif — tidak bisa dimulai');
    }
    const visible = session.classId === null || session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    // Cek apakah sudah submit (submittedAt != null berarti sudah selesai)
    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true },
    });
    if (existing?.submittedAt) {
      throw new ConflictException('Anda sudah mengirimkan jawaban untuk sesi ini');
    }

    const now = new Date();

    // Jika sudah ada record in-progress (startedAt != null, submittedAt null), kembalikan
    if (existing && existing.startedAt && !existing.submittedAt) {
      return {
        responseId: existing.id,
        startedAt: existing.startedAt,
        durationMinutes: session.durationMinutes,
        questions: session.questions, // urutan sama untuk siswa yang sudah mulai
      };
    }

    // Buat record in-progress baru
    const response = await this.prisma.assessmentResponse.create({
      data: {
        sessionId,
        studentId: student.id,
        startedAt: now,
        submittedAt: null,
      },
      select: { id: true, startedAt: true },
    });

    // Jika randomizeOrder, acak urutan soal untuk siswa ini
    let questionsForStudent = session.questions;
    if (session.randomizeOrder) {
      const arr: unknown[] = Array.isArray(session.questions) ? [...session.questions] : [];
      // Fisher-Yates shuffle — urutan acak disimpan di answers JSON saat submit
      // (dengan originalIndex untuk grading)
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      questionsForStudent = arr as Prisma.JsonValue;
    }

    return {
      responseId: response.id,
      startedAt: response.startedAt,
      durationMinutes: session.durationMinutes,
      questions: questionsForStudent,
    };
  }

  /** SISWA submit jawaban untuk sesi active di kelasnya. U2 Wave 1: timer enforcement. */
  async submitResponse(sessionId: string, dto: SubmitResponseDto, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, classId: true, questions: true, durationMinutes: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') {
      throw new ConflictException('Sesi tidak aktif — tidak menerima respons');
    }
    const visible = session.classId === null || session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    // Cek apakah sudah submit atau punya record in-progress
    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true },
    });
    if (existing?.submittedAt) {
      throw new ConflictException('Anda sudah mengirimkan jawaban untuk sesi ini');
    }

    // U2 Wave 1: Tentukan startedAt — dari dto, atau dari record in-progress, atau now
    const startedAt = dto.startedAt
      ? new Date(dto.startedAt)
      : existing?.startedAt ?? new Date();
    const now = new Date();

    // U2 Wave 1: Timer enforcement — reject if elapsed > durationMinutes + 1min grace
    if (session.durationMinutes) {
      const elapsedMin = (now.getTime() - startedAt.getTime()) / 60_000;
      if (elapsedMin > session.durationMinutes + 1) {
        throw new ConflictException('Waktu pengerjaan telah habis');
      }
    }

    const timeSpentSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    // Jika ada record in-progress, update; jika tidak, create baru
    if (existing) {
      return this.prisma.assessmentResponse.update({
        where: { id: existing.id },
        data: {
          answers: dto.answers as Prisma.InputJsonValue,
          submittedAt: now,
          startedAt,
          timeSpentSec,
        },
        select: {
          id: true, sessionId: true, score: true, submittedAt: true, startedAt: true, timeSpentSec: true,
        },
      });
    }

    return this.prisma.assessmentResponse.create({
      data: {
        sessionId,
        studentId: student.id,
        answers: dto.answers as Prisma.InputJsonValue,
        startedAt,
        timeSpentSec,
        submittedAt: now,
      },
      select: {
        id: true, sessionId: true, score: true, submittedAt: true, startedAt: true, timeSpentSec: true,
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
          startedAt: true, timeSpentSec: true, // U2 Wave 1
          answers: true, // U2 Wave 3: needed for item analysis
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
        startedAt: r.startedAt, // U2 Wave 1
        timeSpentSec: r.timeSpentSec, // U2 Wave 1
      })),
    };
  }
}
