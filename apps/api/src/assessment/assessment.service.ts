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
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssessmentSessionDto,
  GradeEssayDto,
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

  /** U2 Wave 2: GURU menilai essay dengan rubrik (per-criteria weighted scoring). */
  async gradeEssayResponse(sessionId: string, responseId: string, dto: GradeEssayDto, user: AuthUser) {
    // Verify session ownership
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
    }

    // Fetch the response
    const response = await this.prisma.assessmentResponse.findFirst({
      where: { id: responseId, sessionId },
      select: { id: true, answers: true, score: true },
    });
    if (!response) throw new NotFoundException('Respons tidak ditemukan');

    // Fetch the question with rubric
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
      select: { id: true, rubric: true },
    });
    if (!question) throw new NotFoundException('Soal tidak ditemukan');

    const rubric = question.rubric;
    if (!rubric || !Array.isArray(rubric) || rubric.length === 0) {
      throw new ConflictException('Soal ini tidak memiliki rubrik penilaian');
    }

    // Compute weighted total: sum(score * weight) / sum(maxScore * weight) * 100
    let weightedSum = 0;
    let maxWeightedSum = 0;
    const criteriaResults: Record<string, { score: number; weight: number; maxScore: number }> = {};

    for (const criteria of rubric as Array<{ id: string; weight: number; maxScore: number }>) {
      const score = dto.criteriaScores[criteria.id] ?? 0;
      const weight = criteria.weight ?? 0;
      const maxScore = criteria.maxScore ?? 100;
      weightedSum += score * weight;
      maxWeightedSum += maxScore * weight;
      criteriaResults[criteria.id] = { score, weight, maxScore };
    }

    const totalScore = maxWeightedSum > 0
      ? Math.round((weightedSum / maxWeightedSum) * 100)
      : 0;

    // Merge essayScores into answers JSON
    const existingAnswers = (response.answers as Prisma.JsonObject) ?? {};
    const essayScores = (existingAnswers.essayScores as Prisma.JsonObject) ?? {};
    essayScores[dto.questionId] = {
      criteria: criteriaResults,
      total: totalScore,
    } as unknown as Prisma.JsonValue;

    // Update response: set score (max of existing score and new essay score),
    // or if this is the only essay, set score directly
    const newScore = response.score != null
      ? Math.max(response.score, totalScore)
      : totalScore;

    return this.prisma.assessmentResponse.update({
      where: { id: responseId },
      data: {
        score: newScore,
        answers: { ...existingAnswers, essayScores } as Prisma.InputJsonValue,
      },
      select: {
        id: true, sessionId: true, score: true, submittedAt: true,
      },
    });
  }

  /** U2 Wave 3: Analisis Hasil — item analysis + score distribution + ketuntasan. */
  async getSessionAnalysis(sessionId: string, user: AuthUser) {
    // Verify ownership
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, title: true, type: true, status: true, teacherId: true,
        questions: true, classId: true,
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
    }

    // Fetch all submitted responses
    const responses = await this.prisma.assessmentResponse.findMany({
      where: { sessionId, submittedAt: { not: null } },
      select: { id: true, score: true, answers: true },
    });

    // KKTP_DEFAULT = 75 (ref: apps/web/src/lib/academic.ts — backend can't import from Next.js)
    const KKTP_DEFAULT = 75;

    const scores = responses.map((r) => r.score ?? 0);
    const totalStudents = responses.length;

    // Summary stats
    const avgScore = totalStudents > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / totalStudents)
      : 0;
    const minScore = totalStudents > 0 ? Math.min(...scores) : 0;
    const maxScore = totalStudents > 0 ? Math.max(...scores) : 0;
    const sortedScores = [...scores].sort((a, b) => a - b);
    const medianScore = totalStudents > 0
      ? (totalStudents % 2 === 0
        ? Math.round((sortedScores[totalStudents / 2 - 1]! + sortedScores[totalStudents / 2]!) / 2)
        : sortedScores[Math.floor(totalStudents / 2)]!)
      : 0;

    // Ketuntasan
    const tuntas = scores.filter((s) => s >= KKTP_DEFAULT).length;
    const ketuntasanPct = totalStudents > 0
      ? Math.round((tuntas / totalStudents) * 100)
      : 0;

    // Score distribution buckets
    const buckets = [
      { label: '0-50', min: 0, max: 50, count: 0 },
      { label: '51-60', min: 51, max: 60, count: 0 },
      { label: '61-70', min: 61, max: 70, count: 0 },
      { label: '71-80', min: 71, max: 80, count: 0 },
      { label: '81-90', min: 81, max: 90, count: 0 },
      { label: '91-100', min: 91, max: 100, count: 0 },
    ];
    for (const s of scores) {
      const bucket = buckets.find((b) => s >= b.min && s <= b.max);
      if (bucket) bucket.count++;
    }

    // Per-question item analysis
    const questions = (session.questions as Prisma.JsonArray) ?? [];
    const itemAnalysis = questions.map((qRaw, idx) => {
      const q = qRaw as Prisma.JsonObject;
      const questionId = (q.id as string) ?? `q${idx}`;
      const qType = (q.type as string) ?? 'multiple_choice';
      const correctAnswer = (q.answer as string) ?? null;

      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;

      // For discrimination: arrays for point-biserial calculation
      const perQuestionCorrect: number[] = [];
      const totalScores: number[] = [];

      for (const r of responses) {
        const answers = (r.answers as Prisma.JsonObject) ?? {};
        const studentAnswer = answers[questionId];
        const totalScore = r.score ?? 0;
        totalScores.push(totalScore);

        if (studentAnswer == null || studentAnswer === '') {
          blankCount++;
          perQuestionCorrect.push(0);
        } else if (
          qType === 'multiple_choice' || qType === 'true_false'
        ) {
          // Auto-gradeable: compare answer
          if (String(studentAnswer) === String(correctAnswer)) {
            correctCount++;
            perQuestionCorrect.push(1);
          } else {
            wrongCount++;
            perQuestionCorrect.push(0);
          }
        } else {
          // Essay: not auto-gradeable, skip
          blankCount++;
          perQuestionCorrect.push(0);
        }
      }

      // Difficulty index = correctCount / totalResponses (0-1)
      const difficultyIndex = totalStudents > 0
        ? Math.round((correctCount / totalStudents) * 100) / 100
        : 0;

      // Discrimination index: point-biserial correlation
      // r_pb = (M1 - M0) / Sy * sqrt(p * q)
      const p = totalStudents > 0 ? correctCount / totalStudents : 0;
      const qProp = 1 - p;
      let discriminationIndex = 0;

      if (p > 0 && p < 1 && totalStudents > 1) {
        const correctScores = totalScores.filter((_, i) => perQuestionCorrect[i] === 1);
        const wrongScores = totalScores.filter((_, i) => perQuestionCorrect[i] === 0);
        const m1 = correctScores.length > 0
          ? correctScores.reduce((a, b) => a + b, 0) / correctScores.length
          : 0;
        const m0 = wrongScores.length > 0
          ? wrongScores.reduce((a, b) => a + b, 0) / wrongScores.length
          : 0;

        // Standard deviation of total scores
        const meanY = totalScores.reduce((a, b) => a + b, 0) / totalStudents;
        const variance = totalScores.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / totalStudents;
        const sy = Math.sqrt(variance);

        if (sy > 0) {
          discriminationIndex = Math.round(
            ((m1 - m0) / sy) * Math.sqrt(p * qProp) * 100,
          ) / 100;
        }
      }

      return {
        questionIndex: idx,
        questionId,
        type: qType,
        body: ((q.body as string) ?? '').slice(0, 120),
        difficultyIndex,
        discriminationIndex,
        correctCount,
        wrongCount,
        blankCount,
      };
    });

    return {
      session: { id: session.id, title: session.title, type: session.type, status: session.status },
      summary: {
        totalStudents,
        avgScore,
        minScore,
        maxScore,
        medianScore,
        ketuntasanPct,
        tuntasCount: tuntas,
        belumTuntasCount: totalStudents - tuntas,
      },
      scoreDistribution: buckets.map((b) => ({ label: b.label, count: b.count })),
      itemAnalysis,
    };
  }

  /**
   * P2 (S-02): SSE realtime monitor — emits student-progress events every 3s.
   * Polls AssessmentResponse table and returns live KPIs + roster.
   * Same data shape as getResults but formatted for SSE event stream.
   */
  streamResults(sessionId: string, user: AuthUser): Observable<MessageEvent> {
    // Verify access once at connection time
    const verifyAndStream = async () => {
      const session = await this.prisma.assessmentSession.findUnique({
        where: { id: sessionId },
        select: { id: true, teacherId: true, classId: true, title: true, type: true, status: true },
      });
      if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

      if (!this.isReviewer(user)) {
        const teacherId = await this.resolveTeacherId(user.keycloakId);
        if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
      }

      return session;
    };

    // Pre-verify, then poll every 3s. Stop after 2 hours (240 polls).
    let verified = false;
    return new Observable<MessageEvent>((subscriber) => {
      let pollCount = 0;
      const maxPolls = 240; // 2 hours at 3s interval

      const poll = async () => {
        if (!verified) {
          await verifyAndStream();
          verified = true;
        }

        const session = await this.prisma.assessmentSession.findUnique({
          where: { id: sessionId },
          select: { id: true, classId: true, title: true, type: true, status: true },
        });
        if (!session) return;

        const [responses, classStudentCount] = await Promise.all([
          this.prisma.assessmentResponse.findMany({
            where: { sessionId },
            orderBy: [{ submittedAt: 'desc' }],
            select: {
              id: true, score: true, submittedAt: true, startedAt: true, timeSpentSec: true,
              student: { select: { nis: true, user: { select: { fullName: true } } } },
            },
          }),
          session.classId
            ? this.prisma.student.count({ where: { classId: session.classId, deletedAt: null, status: 'active' } })
            : Promise.resolve(0),
        ]);

        const submitted = responses.filter((r) => r.submittedAt !== null);
        const inProgress = responses.filter((r) => r.submittedAt === null);
        const notStarted = Math.max(0, classStudentCount - responses.length);

        const avgScore = submitted.length > 0
          ? Math.round(submitted.reduce((sum, r) => sum + (r.score ?? 0), 0) / submitted.length)
          : 0;

        const data = {
          sessionStatus: session.status,
          classStudentCount,
          selesai: submitted.length,
          sedang: inProgress.length,
          belum: notStarted,
          rata: avgScore,
          roster: responses.map((r) => ({
            name: r.student.user.fullName,
            status: r.submittedAt ? 'Selesai' : 'Sedang mengerjakan',
            nilai: r.score ?? 0,
            waktu: r.timeSpentSec ? `${Math.floor(r.timeSpentSec / 60)}m ${r.timeSpentSec % 60}s` : '—',
          })),
          // Also include students who haven't started
          notStartedNames: [] as string[], // would need class roster join
        };

        subscriber.next({ data } as MessageEvent);
      };

      // Initial poll
      poll().catch((err) => {
        subscriber.error(err);
      });

      // Poll every 3 seconds
      const timer = setInterval(() => {
        pollCount++;
        if (pollCount > maxPolls) {
          clearInterval(timer);
          subscriber.complete();
          return;
        }
        poll().catch(() => {
          // Silently skip errors during polling
        });
      }, 3000);

      // Cleanup on unsubscribe
      return () => clearInterval(timer);
    });
  }
}
