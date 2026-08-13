// =============================================================================
// AssessmentService — sesi asesmen + respons siswa (P12 — W2-9 + F5).
// GURU: CRUD sesi milik sendiri + start/complete · SISWA: submit respons
// untuk sesi active di kelasnya · KS/SA: baca semua (audit).
// Pola ownership/role mengikuti RppService & LmsService.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutosaveResponseDto,
  CreateAssessmentSessionDto,
  GradeEssayDto,
  ListAssessmentSessionDto,
  SubmitResponseDto,
  UpdateAssessmentSessionDto,
} from './dto/assessment.dto';
import { EVENTS, GradeSubmittedPayload, AssessmentCompletedPayload } from '../events/events.types';
import { ListSubmissionsQuery } from './dto/submission.dto';
import {
  AssessmentAnswerMap,
  AssessmentItemScore,
  StoredQuestionSnapshot,
} from './assessment-contract';
import {
  dbQuestionToSnapshot,
  orderSnapshotForAttempt,
  parseSnapshotQuestions,
  sanitizeQuestionForStudent,
  scoreAnswers,
  shuffleQuestionIds,
  validateAnswersForSnapshot,
} from './assessment-runtime';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;
const OUTBOX_RETRY_LIMIT = 5;
const OUTBOX_STALE_EMITTING_MS = 5 * 60_000;
const OUTBOX_WORKER_INTERVAL_MS = 30_000;

interface GradeSyncSummary {
  gradedCount: number;
  pendingManualCount: number;
  skippedCount: number;
  gradeTarget: string | null;
  gradeEvents: GradeSubmittedPayload[];
  assessmentEvent: AssessmentCompletedPayload;
}

const SESSION_SELECT = {
  id: true, moduleId: true, teacherId: true, classId: true, title: true,
  type: true, status: true, questions: true,
  gradeTarget: true,
  durationMinutes: true, randomizeOrder: true, // U2 Wave 1
  startedAt: true, completedAt: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  module: { select: { id: true, title: true, subject: true } },
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
  _count: { select: { responses: true } },
} as const;

@Injectable()
export class AssessmentService implements OnModuleInit, OnModuleDestroy {
  private outboxWorkerTimer: NodeJS.Timeout | null = null;
  private outboxWorkerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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

  private async resolveStudent(keycloakId: string): Promise<{ id: string; classId: string | null }> {
    const student = await this.prisma.student.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true, classId: true },
    });
    if (!student) throw new NotFoundException('Profil siswa tidak ditemukan untuk akun ini');
    return student;
  }

  onModuleInit(): void {
    this.runAssessmentOutboxWorker('startup');
    this.outboxWorkerTimer = setInterval(() => this.runAssessmentOutboxWorker('interval'), OUTBOX_WORKER_INTERVAL_MS);
    this.outboxWorkerTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.outboxWorkerTimer) {
      clearInterval(this.outboxWorkerTimer);
      this.outboxWorkerTimer = null;
    }
  }

  private runAssessmentOutboxWorker(source: 'startup' | 'interval' | 'completion'): void {
    if (this.outboxWorkerRunning) return;
    this.outboxWorkerRunning = true;
    this.dispatchAssessmentEventOutbox().catch((error: unknown) => {
      logger.warn('[AssessmentService] assessment outbox dispatch skipped', { source, error: this.errorMessage(error) });
    }).finally(() => {
      this.outboxWorkerRunning = false;
    });
  }

  private gradeTargetFor(type: string, requested?: 'uh' | 'uts' | 'uas' | null): 'uh' | 'uts' | 'uas' | null {
    if (type === 'diagnostik') return null;
    if (type === 'formatif') return 'uh';
    if (type === 'sumatif' && (requested === 'uts' || requested === 'uas')) return requested;
    throw new BadRequestException('Target nilai asesmen tidak valid');
  }

  private async assertTeachingScope(teacherId: string, subject: string, classId: string, academicYear: string, _semester: number) {
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: {
        teacherId,
        subject,
        academicYear,
        classId,
      },
      select: { id: true, classId: true, subject: true, academicYear: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Guru tidak memiliki penugasan mengajar untuk konteks asesmen ini');
    }
    return assignment;
  }

  private async buildQuestionSnapshot(
    teacherId: string,
    subject: string,
    selections: CreateAssessmentSessionDto['questionSelections'],
  ): Promise<StoredQuestionSnapshot[]> {
    const ids = selections.map((selection) => selection.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids }, teacherId, subject },
      select: {
        id: true,
        subject: true,
        type: true,
        body: true,
        options: true,
        answer: true,
        difficulty: true,
        tags: true,
        rubric: true,
      },
    });
    if (questions.length !== ids.length) {
      throw new ForbiddenException('Semua soal sesi harus berasal dari Bank Soal guru dan mapel yang sama');
    }
    const byId = new Map(questions.map((question) => [question.id, question]));
    return [...selections]
      .sort((left, right) => left.order - right.order)
      .map((selection) => dbQuestionToSnapshot(byId.get(selection.questionId)!, selection.points));
  }

  private sanitizeSessionForStudent<T extends { questions: Prisma.JsonValue; [key: string]: unknown }>(session: T) {
    const questions = parseSnapshotQuestions(session.questions);
    const { questions: _questions, ...rest } = session;
    return {
      ...rest,
      questionCount: questions.length,
      questions: questions.map(sanitizeQuestionForStudent),
    };
  }

  async create(dto: CreateAssessmentSessionDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    // Verify module exists and is owned by this teacher (or reviewer)
    const mod = await this.prisma.lmsModule.findUnique({
      where: { id: dto.moduleId },
      select: { id: true, teacherId: true, subject: true, title: true, academicYear: true, semester: true, kktp: true, classId: true },
    });
    if (!mod) throw new NotFoundException('Modul LMS tidak ditemukan');
    if (!this.isReviewer(user) && mod.teacherId !== teacherId) {
      throw new ForbiddenException('Anda bukan pemilik modul LMS ini');
    }
    if (!mod.classId) {
      throw new BadRequestException('Modul LMS harus memiliki kelas sebelum dibuat menjadi asesmen siswa');
    }
    if (dto.classId !== undefined && dto.classId !== null && dto.classId !== mod.classId) {
      throw new BadRequestException('Kelas asesmen harus sama dengan kelas Modul LMS');
    }
    if (dto.academicYear !== mod.academicYear || dto.semester !== mod.semester) {
      throw new BadRequestException('Tahun ajaran dan semester asesmen harus mengikuti Modul LMS');
    }
    await this.assertTeachingScope(teacherId, mod.subject, mod.classId, mod.academicYear, mod.semester);
    const snapshot = await this.buildQuestionSnapshot(teacherId, mod.subject, dto.questionSelections);
    const gradeTarget = this.gradeTargetFor(dto.type, dto.gradeTarget ?? (dto.type === 'formatif' ? 'uh' : null));

    return this.prisma.assessmentSession.create({
      data: {
        moduleId: dto.moduleId,
        teacherId,
        classId: mod.classId,
        title: dto.title,
        type: dto.type,
        status: 'draft',
        questions: snapshot as Prisma.InputJsonValue,
        gradeTarget,
        academicYear: mod.academicYear,
        semester: mod.semester,
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
      ...(query.subject ? { module: { is: { subject: query.subject } } } : {}),
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
      const result = await this.page(
        {
          ...filters,
          status: { in: ['active', 'completed'] },
          classId: student.classId ?? undefined,
        },
        skip,
        query,
      );
      return { ...result, data: result.data.map((session) => this.sanitizeSessionForStudent(session)) };
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

  async getOutboxHealth(user: AuthUser) {
    if (!this.isReviewer(user)) throw new ForbiddenException('Akses ditolak');
    const [groups, oldestPending, recentDeadLetters] = await Promise.all([
      this.prisma.assessmentEventOutbox.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.assessmentEventOutbox.findFirst({
        where: { status: { in: ['pending', 'failed'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.assessmentEventOutbox.findMany({
        where: { status: 'dead_letter' },
        orderBy: { deadLetterAt: 'desc' },
        take: 10,
        select: {
          id: true,
          eventType: true,
          attempts: true,
          lastError: true,
          deadLetterAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const counts = {
      pending: 0,
      emitting: 0,
      failed: 0,
      emitted: 0,
      deadLetter: 0,
    };
    for (const group of groups) {
      if (group.status === 'pending') counts.pending = group._count._all;
      if (group.status === 'emitting') counts.emitting = group._count._all;
      if (group.status === 'failed') counts.failed = group._count._all;
      if (group.status === 'emitted') counts.emitted = group._count._all;
      if (group.status === 'dead_letter') counts.deadLetter = group._count._all;
    }
    return {
      counts,
      oldestRetryableAt: oldestPending?.createdAt ?? null,
      recentDeadLetters,
    };
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
        && session.classId === student.classId;
      if (visible) return this.sanitizeSessionForStudent(session);
    }

    throw new ForbiddenException('Akses ditolak');
  }

  async update(id: string, dto: UpdateAssessmentSessionDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const existing = await this.prisma.assessmentSession.findFirst({
      where: { id, teacherId },
      select: {
        id: true,
        status: true,
        type: true,
        moduleId: true,
        classId: true,
        academicYear: true,
        semester: true,
        module: { select: { subject: true, classId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Sesi berstatus '${existing.status}' tidak bisa diedit`);
    }
    if (!existing.module.classId) {
      throw new BadRequestException('Modul LMS harus memiliki kelas sebelum dibuat menjadi asesmen siswa');
    }
    if (dto.classId !== undefined && dto.classId !== null && dto.classId !== existing.module.classId) {
      throw new BadRequestException('Kelas asesmen harus sama dengan kelas Modul LMS');
    }
    await this.assertTeachingScope(teacherId, existing.module.subject, existing.module.classId, existing.academicYear, existing.semester);
    const snapshot = dto.questionSelections
      ? await this.buildQuestionSnapshot(teacherId, existing.module.subject, dto.questionSelections)
      : undefined;
    const gradeTarget = dto.gradeTarget !== undefined
      ? this.gradeTargetFor(existing.type, dto.gradeTarget)
      : undefined;
    return this.prisma.assessmentSession.update({
      where: { id, status: 'draft' },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(snapshot !== undefined ? { questions: snapshot as Prisma.InputJsonValue } : {}),
        ...(gradeTarget !== undefined ? { gradeTarget } : {}),
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
      select: {
        id: true,
        status: true,
        classId: true,
        academicYear: true,
        semester: true,
        module: { select: { subject: true, classId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Hanya sesi 'draft' yang bisa dimulai (sekarang '${existing.status}')`);
    }
    const classId = existing.classId ?? existing.module.classId;
    if (!classId) throw new BadRequestException('Sesi asesmen wajib memiliki kelas');
    await this.assertTeachingScope(teacherId, existing.module.subject, classId, existing.academicYear, existing.semester);
    const updated = await this.prisma.assessmentSession.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'active', startedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Sesi sudah diproses oleh permintaan lain');
    }
    return this.prisma.assessmentSession.findUniqueOrThrow({
      where: { id },
      select: SESSION_SELECT,
    });
  }

  /**
   * active → completed (GURU pemilik). Sesi selesai, tidak menerima respons lagi.
   *
   * R-11 / GAP-G: Auto-grading pipeline triggered on session completion.
   * Flow: completeSession → auto-grade MCQ → create Grade records →
   *       emit grade.submitted (triggers XP + badge + notif) →
   *       emit assessment.completed (audit / analytics hook).
   */
  async completeSession(id: string, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const { session, gradingSummary } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.assessmentSession.findFirst({
        where: { id, teacherId },
        select: {
          id: true, status: true, title: true, type: true,
          moduleId: true, classId: true, academicYear: true, semester: true,
          questions: true, gradeTarget: true,
          module: { select: { subject: true, teacherId: true } },
        },
      });
      if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
      if (existing.status !== 'active') {
        throw new ConflictException(`Hanya sesi 'active' yang bisa diselesaikan (sekarang '${existing.status}')`);
      }

      const grading = await this.syncGradesForCompletedSession(existing, tx);
      const updated = await tx.assessmentSession.updateMany({
        where: { id, status: 'active' },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Sesi sudah diproses oleh permintaan lain');
      }
      const completed = await tx.assessmentSession.findUniqueOrThrow({
        where: { id },
        select: SESSION_SELECT,
      });
      return { session: completed, gradingSummary: grading };
    });

    this.runAssessmentOutboxWorker('completion');
    const { gradeEvents: _gradeEvents, assessmentEvent: _assessmentEvent, ...publicSummary } = gradingSummary;
    return { ...session, gradingSummary: publicSummary };
  }

  private async syncGradesForCompletedSession(session: {
    id: string;
    title: string;
    type: string;
    moduleId: string;
    classId: string | null;
    academicYear: string;
    semester: number;
    questions: Prisma.JsonValue;
    gradeTarget: string | null;
    module: { subject: string; teacherId: string };
  }, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<GradeSyncSummary> {
    const responses = await db.assessmentResponse.findMany({
      where: { sessionId: session.id, submittedAt: { not: null } },
      select: { id: true, studentId: true, score: true, itemScores: true },
    });

    if (session.type === 'diagnostik' || !session.gradeTarget) {
      const summary: GradeSyncSummary = {
        gradedCount: 0,
        pendingManualCount: 0,
        skippedCount: 0,
        gradeTarget: null,
        gradeEvents: [],
        assessmentEvent: {
        sessionId: session.id,
        title: session.title,
        type: session.type,
        teacherId: session.module.teacherId,
        classId: session.classId,
        moduleId: session.moduleId,
        subject: session.module.subject,
        academicYear: session.academicYear,
        semester: session.semester,
        gradedCount: responses.filter((response) => response.score != null).length,
        skippedCount: 0,
        },
      };
      await this.enqueueAssessmentEvents(summary, db);
      return summary;
    }
    if (session.gradeTarget !== 'uh' && session.gradeTarget !== 'uts' && session.gradeTarget !== 'uas') {
      throw new ConflictException('Target nilai asesmen tidak valid');
    }

    if (!session.classId) throw new ConflictException('Sesi bernilai wajib memiliki kelas');

    const assignment = await db.teachingAssignment.findFirst({
      where: {
        teacherId: session.module.teacherId,
        subject: session.module.subject,
        academicYear: session.academicYear,
        classId: session.classId,
      },
      select: { id: true, academicYear: true },
    });
    if (!assignment) throw new ConflictException('TeachingAssignment tidak ditemukan untuk sinkronisasi Grade');

    const teacherUser = await db.teacher.findUnique({
      where: { id: session.module.teacherId },
      select: { userId: true },
    });
    const submittedBy = teacherUser?.userId ?? '00000000-0000-0000-0000-000000000000';
    let gradedCount = 0;
    let pendingManualCount = 0;
    let skippedCount = 0;
    const gradeEvents: GradeSubmittedPayload[] = [];

    for (const response of responses) {
      const itemScores = Array.isArray(response.itemScores)
        ? response.itemScores as unknown as AssessmentItemScore[]
        : [];
      if (itemScores.some((item) => item.status === 'manual_pending')) {
        pendingManualCount++;
        continue;
      }
      if (response.score == null) {
        skippedCount++;
        continue;
      }

      const uniqueWhere = {
        sourceAssessmentSessionId_studentId: {
          sourceAssessmentSessionId: session.id,
          studentId: response.studentId,
        },
      };
      const previousGrade = await db.grade.findUnique({
        where: uniqueWhere,
        select: { id: true },
      });
      const grade = await db.grade.upsert({
        where: uniqueWhere,
        create: {
          studentId: response.studentId,
          assignmentId: assignment.id,
          semester: session.semester,
          academicYear: assignment.academicYear,
          score: response.score,
          type: session.gradeTarget,
          notes: `Sinkron otomatis dari asesmen: ${session.title}`,
          submittedBy,
          sourceAssessmentSessionId: session.id,
        },
        update: {
          score: response.score,
          notes: `Sinkron otomatis dari asesmen: ${session.title}`,
          submittedBy,
        },
        select: { id: true, studentId: true, type: true },
      });
      const created = !previousGrade;
      if (created) {
        gradeEvents.push({
          gradeId: grade.id,
          studentId: response.studentId,
          subject: session.module.subject,
          score: String(response.score),
          type: grade.type,
          semester: session.semester,
          academicYear: session.academicYear,
        });
      }
      gradedCount++;
    }

    const summary: GradeSyncSummary = {
      gradedCount,
      pendingManualCount,
      skippedCount,
      gradeTarget: session.gradeTarget,
      gradeEvents,
      assessmentEvent: {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      teacherId: session.module.teacherId,
      classId: session.classId,
      moduleId: session.moduleId,
      subject: session.module.subject,
      academicYear: session.academicYear,
      semester: session.semester,
      gradedCount,
      skippedCount: skippedCount + pendingManualCount,
      },
    };
    await this.enqueueAssessmentEvents(summary, db);
    return summary;
  }

  private async enqueueAssessmentEvents(
    summary: GradeSyncSummary,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const outbox = (db as unknown as {
      assessmentEventOutbox?: {
        createMany(args: { data: Prisma.AssessmentEventOutboxCreateManyInput[]; skipDuplicates: boolean }): Promise<unknown>;
      };
    }).assessmentEventOutbox;
    if (!outbox) return;
    const events: Prisma.AssessmentEventOutboxCreateManyInput[] = [
      ...summary.gradeEvents.map((payload) => ({
        eventType: EVENTS.GRADE_SUBMITTED,
        dedupeKey: `${EVENTS.GRADE_SUBMITTED}:${payload.gradeId}`,
        payload: { ...payload, deliveryMode: 'outbox' } as unknown as Prisma.InputJsonValue,
      })),
      {
        eventType: EVENTS.ASSESSMENT_COMPLETED,
        dedupeKey: `${EVENTS.ASSESSMENT_COMPLETED}:${summary.assessmentEvent.sessionId}`,
        payload: { ...summary.assessmentEvent, deliveryMode: 'outbox' } as unknown as Prisma.InputJsonValue,
      },
    ];
    if (events.length === 0) return;
    await outbox.createMany({ data: events, skipDuplicates: true });
  }

  private async dispatchAssessmentEventOutbox(limit = 100): Promise<void> {
    const outbox = this.prisma.assessmentEventOutbox;
    const now = new Date();
    const retryBefore = new Date(Date.now() - OUTBOX_STALE_EMITTING_MS);
    const events = await outbox.findMany({
      where: {
        OR: [
          { status: 'pending', nextAttemptAt: { lte: now } },
          { status: 'emitting', updatedAt: { lt: retryBefore } },
          { status: 'failed', attempts: { lt: OUTBOX_RETRY_LIMIT }, nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, eventType: true, payload: true, attempts: true },
    });

    for (const event of events) {
      const claimed = await outbox.updateMany({
        where: {
          id: event.id,
          OR: [
            { status: 'pending', nextAttemptAt: { lte: now } },
            { status: 'emitting', updatedAt: { lt: retryBefore } },
            { status: 'failed', attempts: { lt: OUTBOX_RETRY_LIMIT }, nextAttemptAt: { lte: now } },
          ],
        },
        data: { status: 'emitting', attempts: { increment: 1 }, lastError: null },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.eventEmitter.emitAsync(event.eventType, event.payload);
        await outbox.update({
          where: { id: event.id },
          data: { status: 'emitted', emittedAt: new Date(), lastError: null },
        });
      } catch (error) {
        const attemptNumber = event.attempts + 1;
        const terminal = attemptNumber >= OUTBOX_RETRY_LIMIT;
        await outbox.update({
          where: { id: event.id },
          data: terminal
            ? {
                status: 'dead_letter',
                deadLetterAt: new Date(),
                lastError: this.errorMessage(error),
              }
            : {
                status: 'failed',
                nextAttemptAt: this.nextOutboxAttemptAt(attemptNumber),
                lastError: this.errorMessage(error),
              },
        });
      }
    }
  }

  private nextOutboxAttemptAt(attemptNumber: number): Date {
    const delayMs = Math.min(60 * 60_000, 60_000 * (2 ** Math.max(0, attemptNumber - 1)));
    return new Date(Date.now() + delayMs);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
    const visible = session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    const questions = parseSnapshotQuestions(session.questions);
    // Cek apakah sudah submit (submittedAt != null berarti sudah selesai)
    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true, answers: true, questionOrder: true },
    });
    if (existing?.submittedAt) {
      throw new ConflictException('Anda sudah mengirimkan jawaban untuk sesi ini');
    }
    const now = new Date();

    // Jika sudah ada record in-progress (startedAt != null, submittedAt null), kembalikan
    if (existing && existing.startedAt && !existing.submittedAt) {
      const ordered = orderSnapshotForAttempt(questions, existing.questionOrder);
      return {
        responseId: existing.id,
        startedAt: existing.startedAt,
        durationMinutes: session.durationMinutes,
        answers: existing.answers ?? {},
        questions: ordered.map(sanitizeQuestionForStudent),
      };
    }

    // Buat record in-progress baru
    const questionOrder = session.randomizeOrder
      ? shuffleQuestionIds(questions)
      : questions.map((question) => question.id);
    let response: { id: string; startedAt: Date | null; questionOrder: string[] };
    try {
      response = await this.prisma.assessmentResponse.create({
        data: {
          sessionId,
          studentId: student.id,
          startedAt: now,
          submittedAt: null,
          questionOrder,
          answers: {},
        },
        select: { id: true, startedAt: true, questionOrder: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.assessmentResponse.findUnique({
          where: { sessionId_studentId: { sessionId, studentId: student.id } },
          select: { id: true, startedAt: true, submittedAt: true, answers: true, questionOrder: true },
        });
        if (raced && !raced.submittedAt) {
          const ordered = orderSnapshotForAttempt(questions, raced.questionOrder);
          return {
            responseId: raced.id,
            startedAt: raced.startedAt,
            durationMinutes: session.durationMinutes,
            answers: raced.answers ?? {},
            questions: ordered.map(sanitizeQuestionForStudent),
          };
        }
      }
      throw error;
    }

    const questionsForStudent = orderSnapshotForAttempt(questions, response.questionOrder)
      .map(sanitizeQuestionForStudent);

    return {
      responseId: response.id,
      startedAt: response.startedAt ?? now,
      durationMinutes: session.durationMinutes,
      answers: {},
      questions: questionsForStudent,
    };
  }

  async autosaveResponse(sessionId: string, dto: AutosaveResponseDto, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, classId: true, questions: true, durationMinutes: true },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') throw new ConflictException('Sesi tidak aktif');
    const visible = session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    const questions = parseSnapshotQuestions(session.questions);
    validateAnswersForSnapshot(dto.answers as AssessmentAnswerMap, questions);

    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true, itemScores: true },
    });
    if (!existing?.startedAt) throw new ConflictException('Mulai asesmen terlebih dahulu');
    if (existing.submittedAt) throw new ConflictException('Jawaban sudah dikirim');

    const updated = await this.prisma.assessmentResponse.updateMany({
      where: { id: existing.id, submittedAt: null },
      data: { answers: dto.answers as Prisma.InputJsonValue },
    });
    if (updated.count !== 1) throw new ConflictException('Jawaban sudah dikirim dari tab lain');
    return { saved: true, savedAt: new Date() };
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
    const visible = session.classId === student.classId;
    if (!visible) throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');

    // Cek apakah sudah submit atau punya record in-progress
    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true, itemScores: true },
    });
    if (existing?.submittedAt) {
      throw new ConflictException('Anda sudah mengirimkan jawaban untuk sesi ini');
    }

    // Timer memakai startedAt server-side dari record in-progress.
    if (!existing?.startedAt) {
      throw new ConflictException('Mulai asesmen terlebih dahulu');
    }
    const startedAt = existing.startedAt;
    const now = new Date();

    // U2 Wave 1: Timer enforcement — reject if elapsed > durationMinutes + 1min grace
    if (session.durationMinutes) {
      const elapsedMin = (now.getTime() - startedAt.getTime()) / 60_000;
      if (elapsedMin > session.durationMinutes + 1) {
        throw new ConflictException('Waktu pengerjaan telah habis');
      }
    }

    const timeSpentSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);
    const questions = parseSnapshotQuestions(session.questions);
    validateAnswersForSnapshot(dto.answers as AssessmentAnswerMap, questions);
    const previousItemScores = Array.isArray(existing.itemScores)
      ? existing.itemScores as unknown as AssessmentItemScore[]
      : [];
    const scored = scoreAnswers(dto.answers as AssessmentAnswerMap, questions, previousItemScores);

    // Jika ada record in-progress, update; jika tidak, create baru
    if (existing) {
      const updated = await this.prisma.assessmentResponse.updateMany({
        where: { id: existing.id, submittedAt: null },
        data: {
          answers: dto.answers as Prisma.InputJsonValue,
          submittedAt: now,
          timeSpentSec,
          score: scored.score,
          itemScores: scored.itemScores as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Jawaban sudah dikirim dari tab lain');
      return this.prisma.assessmentResponse.findUniqueOrThrow({
        where: { id: existing.id },
        select: {
          id: true, sessionId: true, score: true, itemScores: true, submittedAt: true, startedAt: true, timeSpentSec: true,
        },
      });
    }

    throw new ConflictException('Mulai asesmen terlebih dahulu');
  }

  /** GURU pemilik / KS / SA: lihat semua respons untuk sesi (realtime monitor). */
  async getResults(sessionId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, classId: true, title: true, type: true, status: true, questions: true },
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
          answers: true,
          itemScores: true,
          student: { select: { nis: true, user: { select: { fullName: true } } } },
        },
      }),
      session.classId
        ? this.prisma.student.count({ where: { classId: session.classId, deletedAt: null, status: 'active' } })
        : Promise.resolve(null),
    ]);

    const questions = parseSnapshotQuestions(session.questions);
    const submittedResponses = responses.filter((response) => response.submittedAt);
    const finalResponses = submittedResponses.filter((response) => {
      const itemScores = Array.isArray(response.itemScores)
        ? response.itemScores as unknown as AssessmentItemScore[]
        : [];
      return response.score != null && !itemScores.some((item) => item.status === 'manual_pending');
    });
    const submitted = submittedResponses.length;
    const avgScore = finalResponses.length > 0
      ? Math.round(finalResponses.reduce((sum, r) => sum + (r.score ?? 0), 0) / finalResponses.length)
      : null;
    const essayQuestions = questions.filter((question): question is Extract<StoredQuestionSnapshot, { type: 'essay' }> => question.type === 'essay');

    return {
      session: { id: session.id, title: session.title, type: session.type, status: session.status },
      classStudentCount,
      submitted,
      finalCount: finalResponses.length,
      pendingManualCount: submittedResponses.length - finalResponses.length,
      avgScore,
      responses: responses.map((r) => ({
        id: r.id,
        name: r.student.user.fullName,
        nis: r.student.nis,
        score: r.score,
        submittedAt: r.submittedAt,
        startedAt: r.startedAt, // U2 Wave 1
        timeSpentSec: r.timeSpentSec, // U2 Wave 1
        itemScores: r.itemScores,
      })),
      essayCorrections: submittedResponses.flatMap((response) => {
        const answers = (response.answers ?? {}) as unknown as AssessmentAnswerMap;
        const itemScores = Array.isArray(response.itemScores)
          ? response.itemScores as unknown as AssessmentItemScore[]
          : [];
        return essayQuestions.map((question) => {
          const itemScore = itemScores.find((item) => item.questionId === question.id);
          const answer = answers[question.id];
          return {
            responseId: response.id,
            questionId: question.id,
            studentName: response.student.user.fullName,
            nis: response.student.nis,
            body: question.body,
            rubric: question.rubric,
            answer: answer?.type === 'essay' ? answer.text : '',
            status: itemScore?.status ?? 'manual_pending',
            scorePct: itemScore?.scorePct ?? null,
          };
        });
      }),
    };
  }

  /** U2 Wave 2: GURU menilai essay dengan rubrik (per-criteria weighted scoring). */
  async gradeEssayResponse(sessionId: string, responseId: string, dto: GradeEssayDto, user: AuthUser) {
    // Verify session ownership
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        teacherId: true,
        title: true,
        type: true,
        status: true,
        moduleId: true,
        classId: true,
        academicYear: true,
        semester: true,
        questions: true,
        gradeTarget: true,
        module: { select: { subject: true, teacherId: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
      const classId = session.classId;
      if (!classId) throw new BadRequestException('Sesi asesmen wajib memiliki kelas');
      await this.assertTeachingScope(teacherId, session.module.subject, classId, session.academicYear, session.semester);
    }

    const questions = parseSnapshotQuestions(session.questions);
    const question = questions.find((item) => item.id === dto.questionId);
    if (!question || question.type !== 'essay') throw new NotFoundException('Soal esai tidak ditemukan dalam snapshot sesi');
    const rubric = question.rubric;
    if (rubric.length === 0) {
      throw new ConflictException('Soal ini tidak memiliki rubrik penilaian');
    }

    // Compute weighted total: sum(score * weight) / sum(maxScore * weight) * 100
    let weightedSum = 0;
    let maxWeightedSum = 0;
    const criteriaResults: Record<string, { score: number; weight: number; maxScore: number }> = {};

    for (const criteria of rubric) {
      const score = dto.criteriaScores[criteria.id] ?? 0;
      const weight = criteria.weight ?? 0;
      const maxScore = criteria.maxScore ?? 100;
      if (score > maxScore) {
        throw new BadRequestException(`Skor kriteria ${criteria.id} melebihi skor maksimal`);
      }
      weightedSum += score * weight;
      maxWeightedSum += maxScore * weight;
      criteriaResults[criteria.id] = { score, weight, maxScore };
    }

    const totalScore = maxWeightedSum > 0
      ? Math.round((weightedSum / maxWeightedSum) * 100)
      : 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "academic"."assessment_responses"
        WHERE "id" = ${responseId}::uuid
          AND "session_id" = ${sessionId}::uuid
        FOR UPDATE
      `);
      if (lockedRows.length === 0) throw new NotFoundException('Respons tidak ditemukan');

      // Re-read after locking so concurrent essay graders merge the latest scores.
      const response = await tx.assessmentResponse.findUnique({
        where: { id: responseId },
        select: { id: true, sessionId: true, answers: true, itemScores: true, submittedAt: true },
      });
      if (!response || response.sessionId !== sessionId) {
        throw new NotFoundException('Respons tidak ditemukan');
      }
      if (!response.submittedAt) throw new ConflictException('Respons belum dikirim');

      const existingAnswers = (response.answers ?? {}) as unknown as AssessmentAnswerMap;
      const previousItemScores = Array.isArray(response.itemScores)
        ? response.itemScores as unknown as AssessmentItemScore[]
        : [];
      const manualItem: AssessmentItemScore = {
        questionId: question.id,
        type: 'essay',
        status: 'manual_scored',
        points: Math.round((totalScore / 100) * question.points * 100) / 100,
        maxPoints: question.points,
        scorePct: totalScore,
        rubricScores: Object.fromEntries(Object.entries(criteriaResults).map(([id, value]) => [id, value.score])),
      };
      const nextItemScores = [
        ...previousItemScores.filter((item) => item.questionId !== dto.questionId),
        manualItem,
      ];
      const scored = scoreAnswers(existingAnswers, questions, nextItemScores);

      const updatedResponse = await tx.assessmentResponse.update({
        where: { id: responseId },
        data: {
          score: scored.score,
          itemScores: scored.itemScores as Prisma.InputJsonValue,
        },
        select: {
          id: true, sessionId: true, score: true, itemScores: true, submittedAt: true,
        },
      });
      if (session.status === 'completed') {
        await this.syncGradesForCompletedSession(session, tx);
      }
      return updatedResponse;
    });
    if (session.status === 'completed') this.runAssessmentOutboxWorker('completion');
    return updated;
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
      select: { id: true, score: true, answers: true, itemScores: true },
    });
    const finalResponses = responses.filter((response) => {
      const itemScores = Array.isArray(response.itemScores)
        ? response.itemScores as unknown as AssessmentItemScore[]
        : [];
      return response.score != null && !itemScores.some((item) => item.status === 'manual_pending');
    });

    // KKTP_DEFAULT = 75 (ref: apps/web/src/lib/academic.ts — backend can't import from Next.js)
    const KKTP_DEFAULT = 75;

    const scores = finalResponses.map((r) => r.score ?? 0);
    const totalStudents = finalResponses.length;

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

    const questions = parseSnapshotQuestions(session.questions);
    const itemAnalysis = questions.map((question, idx) => {
      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;

      // For discrimination: arrays for point-biserial calculation
      const perQuestionCorrect: number[] = [];
      const totalScores: number[] = [];

      for (const r of finalResponses) {
        const answers = (r.answers ?? {}) as unknown as AssessmentAnswerMap;
        const studentAnswer = answers[question.id];
        const totalScore = r.score ?? 0;
        totalScores.push(totalScore);

        if (!studentAnswer) {
          blankCount++;
          perQuestionCorrect.push(0);
          continue;
        }

        const previousItemScores = Array.isArray(r.itemScores)
          ? r.itemScores as unknown as AssessmentItemScore[]
          : [];
        const scored = scoreAnswers({ [question.id]: studentAnswer } as AssessmentAnswerMap, [question], previousItemScores);
        const itemScore = scored.itemScores[0];
        if (!itemScore || itemScore.status === 'manual_pending' || itemScore.scorePct == null) {
          blankCount++;
          perQuestionCorrect.push(0);
        } else if (itemScore.points >= itemScore.maxPoints) {
          correctCount++;
          perQuestionCorrect.push(1);
        } else {
          wrongCount++;
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
        questionId: question.id,
        type: question.type,
        body: question.body.slice(0, 120),
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

  // ═══════════════════════════════════════════════════════════════════════════
  // W2-A-2: Submissions (tugas siswa) — agregasi dari AssessmentSession + Response.
  // Dipakai PenugasanGuru untuk menggantikan TUGAS_DATA + PENGUMPULAN hardcoded.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * List tugas (= AssessmentSession) milik guru dengan statistik pengumpulan.
   * RBAC: GURU (own), SUPER_ADMIN, KEPALA_SEKOLAH.
   */
  async listSubmissions(query: ListSubmissionsQuery, user: AuthUser) {
    const where: Prisma.AssessmentSessionWhereInput = {};

    // Ownership: GURU hanya sesi sendiri; reviewer semua.
    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      where.teacherId = teacherId;
    }

    if (query.classId) where.classId = query.classId;
    if (query.subject) where.module = { subject: query.subject };

    if (query.status === 'aktif') {
      where.status = { in: ['draft', 'active'] };
    } else if (query.status === 'selesai') {
      where.status = 'completed';
    }

    const sessions = await this.prisma.assessmentSession.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        classId: true,
        completedAt: true,
        createdAt: true,
        module: { select: { subject: true } },
        class: { select: { id: true, name: true } },
        _count: { select: { responses: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    // Ambil jumlah siswa aktif per kelas untuk menghitung total target
    const classIds = [...new Set(sessions.map((s) => s.classId).filter((c): c is string => !!c))];
    const classStudentCountMap = new Map<string, number>();
    if (classIds.length > 0) {
      const grouped = await this.prisma.student.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds }, deletedAt: null, status: 'active' },
        _count: { _all: true },
      });
      for (const g of grouped) {
        if (g.classId) classStudentCountMap.set(g.classId, g._count._all);
      }
    }

    // Hitung jumlah yang sudah dinilai (score !== null)
    const sessionIds = sessions.map((s) => s.id);
    const gradedCounts = sessionIds.length > 0
      ? await this.prisma.assessmentResponse.groupBy({
          by: ['sessionId'],
          where: { sessionId: { in: sessionIds }, score: { not: null } },
          _count: { _all: true },
        })
      : [];
    const gradedMap = new Map<string, number>();
    for (const g of gradedCounts) gradedMap.set(g.sessionId, g._count._all);

    const data = sessions.map((s) => {
      const total = s.classId ? (classStudentCountMap.get(s.classId) ?? 0) : s._count.responses;
      const submitted = s._count.responses;
      const graded = gradedMap.get(s.id) ?? 0;
      const isActive = s.status === 'draft' || s.status === 'active';
      return {
        id: s.id,
        title: s.title,
        subject: s.module?.subject ?? '—',
        className: s.class?.name ?? '—',
        deadline: s.completedAt ?? s.createdAt,
        submitted,
        graded,
        total: Math.max(total, submitted),
        status: (isActive ? 'aktif' : 'selesai') as 'aktif' | 'selesai',
      };
    });

    return { data, total: data.length };
  }

  /**
   * Detail pengumpulan per-siswa untuk satu tugas (AssessmentSession).
   * RBAC: GURU (own), SUPER_ADMIN, KEPALA_SEKOLAH.
   */
  async submissionDetails(sessionId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, title: true, type: true, status: true,
        teacherId: true, classId: true, completedAt: true,
        module: { select: { subject: true } },
        class: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesi tugas tidak ditemukan');

    // Ownership check
    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan tugas Anda');
    }

    // Ambil roster kelas + respons yang sudah ada
    const [classStudents, responses] = await Promise.all([
      session.classId
        ? this.prisma.student.findMany({
            where: { classId: session.classId, deletedAt: null, status: 'active' },
            select: { id: true, nis: true, user: { select: { fullName: true } } },
            orderBy: { user: { fullName: 'asc' } },
          })
        : [],
      this.prisma.assessmentResponse.findMany({
          where: { sessionId },
          select: {
            id: true, studentId: true, score: true, submittedAt: true, startedAt: true,
            student: { select: { id: true, nis: true, user: { select: { fullName: true } } } },
          },
        }),
    ]);

    const responseMap = new Map(responses.map((r) => [r.studentId, r]));
    // Bila tak ada roster kelas, pakai siswa yang ada respons
    const rosterSource = classStudents.length > 0
      ? classStudents.map((s) => ({ id: s.id, nis: s.nis, user: { fullName: s.user.fullName } }))
      : responses.map((r) => ({ id: r.student.id, nis: r.student.nis, user: { fullName: r.student.user.fullName } }));

    const students = rosterSource.map((stu) => {
      const resp = responseMap.get(stu.id);
      let status: 'Terkumpul' | 'Terlambat' | 'Belum' = 'Belum';
      if (resp?.submittedAt) {
        // Terlambat bila ada deadline (completedAt) dan submit setelahnya
        const deadline = session.completedAt ?? null;
        status = deadline && new Date(resp.submittedAt) > new Date(deadline) ? 'Terlambat' : 'Terkumpul';
      }
      return {
        name: stu.user.fullName,
        status,
        fileName: resp?.submittedAt ? `jawaban-${stu.nis}.json` : null,
        score: resp?.score ?? null,
      };
    });

    return {
      id: session.id,
      title: session.title,
      subject: session.module?.subject ?? '—',
      className: session.class?.name ?? '—',
      students,
    };
  }
}
