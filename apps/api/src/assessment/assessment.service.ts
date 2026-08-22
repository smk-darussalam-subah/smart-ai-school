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
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotifChannel, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutosaveResponseDto,
  CancelRemedialSessionDto,
  CreateRemedialSessionDto,
  CreateAssessmentSessionDto,
  FinalizeRemedialParticipantDto,
  FamilyRemedialQueryDto,
  GradeEssayDto,
  ListAssessmentSessionDto,
  RemedialCandidatesQueryDto,
  RetryRemedialParticipantDto,
  SubmitResponseDto,
  UpdateAssessmentSessionDto,
  UpdateRemedialSessionDto,
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
import { normalizePhoneE164 } from '../common/helpers/phone';
import { NotificationService } from '../notification/notification.service';
import { resolveKktpThreshold, PersistedKktpProvenance } from '../academic/kktp-resolver';
import { APPOINTMENT_ACTIVATION_LOCK_KEY } from '../appointments/appointments.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';

const REVIEWER_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'] as const;
const OUTBOX_RETRY_LIMIT = 5;
const OUTBOX_STALE_EMITTING_MS = 5 * 60_000;
const OUTBOX_WORKER_INTERVAL_MS = 30_000;
const REMEDIAL_REMINDER_INTERVAL_MS = 60_000;
const REMEDIAL_REMINDER_WINDOW_MS = 24 * 60 * 60_000;

type RemedialAssignmentContext = {
  id: string;
  teacherId: string;
  classId: string;
  subject: string;
  academicYear: string;
};

type NotificationHandoffStatus = 'none' | 'queued' | 'pending_recovery';

type NotificationHandoffResult = {
  status: NotificationHandoffStatus;
  requestedCount: number;
  queuedCount: number;
};

type NotificationLogRef = {
  refType: string;
  refId: string;
  recipient: string;
  channel: NotifChannel;
};

interface GradeSyncSummary {
  gradedCount: number;
  pendingManualCount: number;
  skippedCount: number;
  gradeTarget: string | null;
  gradeEvents: GradeSubmittedPayload[];
  assessmentEvent: AssessmentCompletedPayload;
}

const SESSION_SELECT = {
  id: true, moduleId: true, teachingAssignmentId: true, teacherId: true, classId: true, title: true,
  type: true, status: true, questions: true,
  purpose: true, dueAt: true, instructions: true, cancelledAt: true, cancelReason: true,
  gradeTarget: true,
  durationMinutes: true, randomizeOrder: true, // U2 Wave 1
  startedAt: true, completedAt: true,
  academicYear: true, semester: true, createdAt: true, updatedAt: true,
  module: { select: { id: true, title: true, subject: true } },
  teachingAssignment: { select: { id: true, subject: true } },
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
  _count: { select: { responses: true, remedialParticipants: true } },
} as const;

const REMEDIAL_SESSION_SELECT = {
  ...SESSION_SELECT,
  remedialParticipants: {
    select: {
      id: true,
      status: true,
      sourceScore: true,
      rawScore: true,
      effectiveScore: true,
      kktpValue: true,
      kktpProvenance: true,
      finalizedAt: true,
      sourceGradeUpdatedAt: true,
      sourceGrade: { select: { id: true, type: true, updatedAt: true, score: true } },
      student: { select: { id: true, nis: true, user: { select: { fullName: true } } } },
    },
    orderBy: { assignedAt: 'asc' as const },
  },
} as const;

@Injectable()
export class AssessmentService implements OnModuleInit, OnModuleDestroy {
  private outboxWorkerTimer: NodeJS.Timeout | null = null;
  private outboxWorkerRunning = false;
  private remedialReminderTimer: NodeJS.Timeout | null = null;
  private remedialReminderRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly academicPeriod: AcademicPeriodService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  private isReviewer(user: AuthUser): boolean {
    return user.roles.some((r) => (REVIEWER_ROLES as readonly string[]).includes(r));
  }

  private async resolveTeacherId(
    keycloakId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const teacher = await db.teacher.findFirst({
      where: { user: { keycloakId, isActive: true, deletedAt: null }, deletedAt: null },
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
    this.runRemedialReminderScanner('startup');
    this.remedialReminderTimer = setInterval(
      () => this.runRemedialReminderScanner('interval'),
      REMEDIAL_REMINDER_INTERVAL_MS,
    );
    this.remedialReminderTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.outboxWorkerTimer) {
      clearInterval(this.outboxWorkerTimer);
      this.outboxWorkerTimer = null;
    }
    if (this.remedialReminderTimer) {
      clearInterval(this.remedialReminderTimer);
      this.remedialReminderTimer = null;
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

  private runRemedialReminderScanner(source: 'startup' | 'interval' | 'manual'): void {
    if (this.remedialReminderRunning) return;
    this.remedialReminderRunning = true;
    this.scanRemedialDueReminders().catch((error: unknown) => {
      logger.warn('[AssessmentService] remedial reminder scan skipped', { source, error: this.errorMessage(error) });
    }).finally(() => {
      this.remedialReminderRunning = false;
    });
  }

  async scanRemedialDueReminders(limit = 50): Promise<{
    sessionCount: number;
    notificationCount: number;
    notificationHandoff: NotificationHandoffResult & { pendingRecoveryCount: number };
  }> {
    const now = new Date();
    const until = new Date(now.getTime() + REMEDIAL_REMINDER_WINDOW_MS);
    const sessions = await this.prisma.assessmentSession.findMany({
      where: {
        purpose: 'remedial',
        status: 'active',
        dueAt: { gt: now, lte: until },
        remedialParticipants: { some: { status: { in: ['assigned', 'in_progress'] } } },
      },
      orderBy: [{ dueAt: 'asc' }],
      take: limit,
      select: { id: true, title: true, dueAt: true },
    });

    let notificationCount = 0;
    let queuedCount = 0;
    let pendingRecoveryCount = 0;
    for (const session of sessions) {
      const result = await this.prisma.$transaction(async (tx) => {
        const logs = await this.buildRemedialNotificationLogs(tx, {
          sessionId: session.id,
          refType: 'remedial_due_reminder',
          refSuffix: 'due',
          subject: 'Pengingat remedial',
          body: `Pengingat: remedial ${session.title} memiliki tenggat ${session.dueAt?.toISOString() ?? 'terdekat'}. Buka DIIS untuk mengerjakan.`,
          participantStatus: ['assigned', 'in_progress'],
        });
        if (logs.length === 0) return { count: 0, logIds: [] as string[] };
        await tx.notificationLog.createMany({ data: logs, skipDuplicates: true });
        const logIds = await this.committedPendingNotificationLogIds(tx, logs);
        return { count: logIds.length, logIds };
      });
      notificationCount += result.count;
      const handoff = await this.enqueueCommittedNotificationLogs(result.logIds, 'remedial_due_reminder');
      queuedCount += handoff.queuedCount;
      pendingRecoveryCount += Math.max(0, handoff.requestedCount - handoff.queuedCount);
    }

    return {
      sessionCount: sessions.length,
      notificationCount,
      notificationHandoff: {
        status: pendingRecoveryCount > 0 ? 'pending_recovery' as const : notificationCount > 0 ? 'queued' as const : 'none' as const,
        requestedCount: notificationCount,
        queuedCount,
        pendingRecoveryCount,
      },
    };
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
        class: { isActive: true },
        teacher: { deletedAt: null, user: { isActive: true, deletedAt: null } },
      },
      select: { id: true, classId: true, subject: true, academicYear: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Guru tidak memiliki penugasan mengajar untuk konteks asesmen ini');
    }
    return assignment;
  }

  private async resolveActiveAcademicYearCode(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<string> {
    const activeYears = await db.academicYear.findMany({
      where: { isActive: true },
      select: { code: true },
      take: 2,
      orderBy: { code: 'desc' },
    });
    if (activeYears.length !== 1) {
      throw new ConflictException('Tepat satu tahun ajaran aktif diperlukan untuk remedial');
    }
    return activeYears[0]!.code;
  }

  private async acquireAcademicYearCutoverLock(db: Prisma.TransactionClient | PrismaService): Promise<void> {
    const raw = db as { $executeRaw?: unknown };
    if (typeof raw.$executeRaw !== 'function') {
      throw new ConflictException('Academic period lock tidak tersedia untuk transaksi ini');
    }
    await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`);
  }

  private async assertWritablePeriodInTransaction(
    db: Prisma.TransactionClient,
    input: { academicYear: string; semester: number },
  ): Promise<void> {
    await this.academicPeriod.assertWritablePeriodWithCutoverLock(db, input);
  }

  private async assertCurrentRemedialAssignment(
    assignment: RemedialAssignmentContext,
    user: AuthUser,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const teacherId = await this.resolveTeacherId(user.keycloakId, db);
    if (assignment.teacherId !== teacherId) {
      throw new ForbiddenException('Guru hanya dapat mengelola remedial untuk penugasan mengajarnya sendiri');
    }

    const activeAcademicYear = await this.resolveActiveAcademicYearCode(db);
    if (assignment.academicYear !== activeAcademicYear) {
      throw new ConflictException('Remedial hanya dapat dibuat dari penugasan tahun ajaran aktif');
    }

    const currentAssignment = await db.teachingAssignment.findFirst({
      where: {
        id: assignment.id,
        teacherId: assignment.teacherId,
        classId: assignment.classId,
        subject: assignment.subject,
        academicYear: activeAcademicYear,
        class: { isActive: true },
        teacher: { deletedAt: null, user: { isActive: true, deletedAt: null } },
      },
      select: { id: true },
    });
    if (!currentAssignment) {
      throw new ConflictException('TeachingAssignment remedial tidak aktif atau tidak lagi valid');
    }
  }

  private async lockGradeSnapshot(
    db: Prisma.TransactionClient | PrismaService,
    grade: { studentId: string; academicYear: string; semester: number; assignment: { classId: string } },
  ): Promise<void> {
    const raw = db as { $executeRaw?: unknown };
    if (typeof raw.$executeRaw !== 'function') return;
    await db.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`report-grade:${grade.studentId}:${grade.assignment.classId}:${grade.academicYear}:${grade.semester}`}, 0))
    `);
  }

  private gradeSnapshotLockKey(grade: {
    studentId: string;
    academicYear: string;
    semester: number;
    assignment: { classId: string };
  }): string {
    return `report-grade:${grade.studentId}:${grade.assignment.classId}:${grade.academicYear}:${grade.semester}`;
  }

  private async lockGradeSnapshots(
    db: Prisma.TransactionClient | PrismaService,
    grades: Array<{ studentId: string; academicYear: string; semester: number; assignment: { classId: string } }>,
  ): Promise<void> {
    const ordered = [...grades].sort((left, right) =>
      this.gradeSnapshotLockKey(left).localeCompare(this.gradeSnapshotLockKey(right)),
    );
    for (const grade of ordered) {
      await this.lockGradeSnapshot(db, grade);
    }
  }

  private normalizeRecipients(phones: Array<string | null | undefined>, scope: string): string[] {
    const recipients = new Set<string>();
    for (const phone of phones) {
      if (!phone || phone.trim().length === 0) continue;
      try {
        recipients.add(normalizePhoneE164(phone));
      } catch {
        logger.warn('[AssessmentService] skipped invalid notification recipient', { scope });
      }
    }
    return [...recipients];
  }

  private async buildRemedialNotificationLogs(
    tx: Prisma.TransactionClient,
    input: {
      sessionId: string;
      refType: string;
      refSuffix: string;
      subject: string;
      body: string;
      participantStatus: Array<'assigned' | 'in_progress' | 'submitted' | 'passed' | 'needs_retry' | 'cancelled'>;
      participantId?: string;
    },
  ): Promise<Prisma.NotificationLogCreateManyInput[]> {
    const participants = await tx.remedialParticipant.findMany({
      where: {
        sessionId: input.sessionId,
        ...(input.participantId ? { id: input.participantId } : {}),
        status: { in: input.participantStatus },
      },
      select: {
        id: true,
        student: {
          select: {
            user: { select: { phone: true } },
            parent: { select: { phone: true } },
          },
        },
      },
    });
    const logs: Prisma.NotificationLogCreateManyInput[] = [];
    for (const participant of participants) {
      for (const recipient of this.normalizeRecipients(
        [participant.student.user.phone, participant.student.parent?.phone],
        `remedial:${input.refType}`,
      )) {
        logs.push({
          id: randomUUID(),
          recipient,
          channel: 'whatsapp',
          subject: input.subject,
          body: input.body,
          status: 'pending',
          refType: input.refType,
          refId: `${input.sessionId}:${participant.id}:${input.refSuffix}:${recipient}`,
        });
      }
    }
    return logs;
  }

  private async suppressPendingRemedialNotifications(
    tx: Prisma.TransactionClient,
    sessionId: string,
    refTypes: string[],
    reason: string,
  ): Promise<void> {
    await tx.notificationLog.updateMany({
      where: {
        refType: { in: refTypes },
        refId: { contains: sessionId },
        status: 'pending',
      },
      data: { status: 'failed', error: reason },
    });
  }

  private async enqueueCommittedNotificationLogs(ids: string[], source: string): Promise<NotificationHandoffResult> {
    if (ids.length === 0) return { status: 'none', requestedCount: 0, queuedCount: 0 };
    if (!this.notificationService) {
      logger.warn('[AssessmentService] notification service unavailable; committed logs deferred to recovery', {
        source,
        count: ids.length,
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
    try {
      const result = await this.notificationService.enqueueCommittedPendingLogs(ids);
      return {
        status: result.queuedCount === ids.length ? 'queued' : 'pending_recovery',
        requestedCount: ids.length,
        queuedCount: result.queuedCount,
      };
    } catch (error: unknown) {
      logger.warn('[AssessmentService] committed notification enqueue deferred to recovery', {
        source,
        count: ids.length,
        error: this.errorMessage(error),
      });
      return { status: 'pending_recovery', requestedCount: ids.length, queuedCount: 0 };
    }
  }

  private notificationLogRefs(logs: Prisma.NotificationLogCreateManyInput[]): NotificationLogRef[] {
    const unique = new Map<string, NotificationLogRef>();
    for (const log of logs) {
      if (!log.refType || !log.refId || !log.recipient || !log.channel) continue;
      const ref = {
        refType: String(log.refType),
        refId: String(log.refId),
        recipient: String(log.recipient),
        channel: log.channel as NotifChannel,
      };
      unique.set(`${ref.refType}:${ref.refId}:${ref.recipient}:${ref.channel}`, ref);
    }
    return [...unique.values()];
  }

  private async committedPendingNotificationLogIds(
    tx: Prisma.TransactionClient,
    logs: Prisma.NotificationLogCreateManyInput[],
  ): Promise<string[]> {
    const refs = this.notificationLogRefs(logs);
    if (refs.length === 0) return [];
    const rows = await tx.notificationLog.findMany({
      where: {
        status: 'pending',
        OR: refs.map((ref) => ({
          refType: ref.refType,
          refId: ref.refId,
          recipient: ref.recipient,
          channel: ref.channel,
        })),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async resolveChildStudentIds(keycloakId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Akses ditolak');
    const children = await this.prisma.student.findMany({
      where: { parentId: user.id, deletedAt: null },
      select: { id: true },
    });
    return children.map((child) => child.id);
  }

  private async resolveAuthUserId(keycloakId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { keycloakId }, select: { id: true } });
    if (!user) throw new ForbiddenException('Akun DIIS tidak ditemukan');
    return user.id;
  }

  private async resolveKktpForGrade(grade: {
    sourceAssessmentSessionId: string | null;
    assignment: { subject: string };
    academicYear: string;
    semester: number;
  }, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<{ value: number; source: PersistedKktpProvenance }> {
    let moduleKktp: number | null = null;
    if (grade.sourceAssessmentSessionId) {
      const session = await db.assessmentSession.findUnique({
        where: { id: grade.sourceAssessmentSessionId },
        select: { module: { select: { kktp: true } } },
      });
      moduleKktp = session?.module?.kktp ?? null;
    }

    const kktp = await resolveKktpThreshold(db, {
      moduleKktp,
      subject: grade.assignment.subject,
      academicYear: grade.academicYear,
      semester: grade.semester,
    });
    if (kktp.value === null || kktp.provenance === 'unconfigured') {
      throw new ConflictException('Konteks KKTP belum lengkap untuk nilai sumber remedial');
    }
    return { value: kktp.value, source: kktp.provenance };
  }

  private async assertNoLockedReportForGrade(grade: {
    studentId: string;
    academicYear: string;
    semester: number;
    assignment: { classId: string };
  }, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const locked = await db.reportCard.findFirst({
      where: {
        studentId: grade.studentId,
        classId: grade.assignment.classId,
        academicYear: grade.academicYear,
        semester: grade.semester,
        status: { in: ['checked', 'published', 'distributed'] },
      },
      select: { id: true, status: true },
    });
    if (locked) {
      throw new ConflictException(`Rapor sudah ${locked.status}; finalisasi remedial ditolak agar snapshot resmi tidak berubah diam-diam`);
    }
  }

  private async assertStudentCanAccessSession(session: {
    id: string;
    purpose: string;
    classId: string | null;
  }, student: { id: string; classId: string | null }): Promise<{ remedialParticipantId: string | null }> {
    if ((session.purpose ?? 'regular') === 'regular') {
      if (session.classId === student.classId) return { remedialParticipantId: null };
      throw new ForbiddenException('Sesi tidak tersedia untuk kelas Anda');
    }

    const participant = await this.prisma.remedialParticipant.findFirst({
      where: { sessionId: session.id, studentId: student.id, status: { not: 'cancelled' } },
      select: { id: true },
    });
    if (!participant) throw new ForbiddenException('Sesi remedial tidak ditugaskan kepada Anda');
    return { remedialParticipantId: participant.id };
  }

  private isRemedialReviewer(user: AuthUser): boolean {
    return user.roles.some((role) => ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'].includes(role));
  }

  private decimalToNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
      return (value as { toNumber(): number }).toNumber();
    }
    return Number(value);
  }

  private gradeTypeToAssessmentType(type: string): 'formatif' | 'sumatif' {
    if (type === 'uh' || type === 'praktik' || type === 'sikap') return 'formatif';
    if (type === 'uts' || type === 'uas') return 'sumatif';
    throw new BadRequestException('Tipe nilai sumber tidak valid untuk remedial');
  }

  private async assertRemedialManageAssignment(
    assignment: RemedialAssignmentContext,
    user: AuthUser,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await this.assertCurrentRemedialAssignment(assignment, user, db);
  }

  private async buildQuestionSnapshot(
    teacherId: string,
    subject: string,
    selections: CreateAssessmentSessionDto['questionSelections'],
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<StoredQuestionSnapshot[]> {
    const ids = selections.map((selection) => selection.questionId);
    const questions = await db.question.findMany({
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
    const assignment = await this.assertTeachingScope(teacherId, mod.subject, mod.classId, mod.academicYear, mod.semester);
    const snapshot = await this.buildQuestionSnapshot(teacherId, mod.subject, dto.questionSelections);
    const gradeTarget = this.gradeTargetFor(dto.type, dto.gradeTarget ?? (dto.type === 'formatif' ? 'uh' : null));

    return this.prisma.$transaction(async (tx) => {
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: mod.academicYear,
        semester: mod.semester,
      });
      return tx.assessmentSession.create({
        data: {
          moduleId: dto.moduleId,
          teachingAssignmentId: assignment.id,
          teacherId,
          classId: mod.classId,
          title: dto.title,
          type: dto.type,
          status: 'draft',
          purpose: 'regular',
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
    });
  }

  async findAll(query: ListAssessmentSessionDto, user: AuthUser) {
    const filters: Prisma.AssessmentSessionWhereInput = {
      ...(query.moduleId ? { moduleId: query.moduleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.subject ? {
        OR: [
          { module: { is: { subject: query.subject } } },
          { teachingAssignment: { is: { subject: query.subject } } },
        ],
      } : {}),
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
      const statusFilter: Prisma.AssessmentSessionWhereInput = query.status
        ? { status: query.status }
        : { status: { in: ['active', 'completed'] } };
      const purpose = query.purpose;
      const visibility: Prisma.AssessmentSessionWhereInput[] = [];
      if ((!purpose || purpose === 'regular') && student.classId) {
        visibility.push({ ...filters, ...statusFilter, purpose: 'regular', classId: student.classId });
      }
      if (!purpose || purpose === 'remedial') {
        visibility.push({
          ...filters,
          ...statusFilter,
          purpose: 'remedial',
          remedialParticipants: { some: { studentId: student.id, status: { not: 'cancelled' } } },
        });
      }
      const result = visibility.length === 0
        ? { data: [], total: 0, page: query.page, limit: query.limit }
        : await this.page({ OR: visibility }, skip, query);
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

  private async pageRemedials(where: Prisma.AssessmentSessionWhereInput, skip: number, query: ListAssessmentSessionDto) {
    const [data, total] = await Promise.all([
      this.prisma.assessmentSession.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: REMEDIAL_SESSION_SELECT,
      }),
      this.prisma.assessmentSession.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  private remedialOutcome(status: string): 'pending' | 'submitted' | 'passed' | 'needs_retry' {
    if (status === 'passed') return 'passed';
    if (status === 'needs_retry') return 'needs_retry';
    if (status === 'submitted') return 'submitted';
    return 'pending';
  }

  async listFamilyRemedials(query: FamilyRemedialQueryDto, user: AuthUser) {
    const childIds = await this.resolveChildStudentIds(user.keycloakId);
    if (childIds.length === 0) return { data: [], total: 0, page: query.page, limit: query.limit };
    if (!childIds.includes(query.studentId)) {
      throw new ForbiddenException('Data remedial hanya tersedia untuk anak yang dipilih');
    }

    const where: Prisma.AssessmentSessionWhereInput = {
      purpose: 'remedial',
      status: query.status ?? { in: ['active', 'completed'] as const },
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
      remedialParticipants: { some: { studentId: query.studentId, status: { not: 'cancelled' } } },
    };
    const skip = (query.page - 1) * query.limit;
    const [sessions, total] = await Promise.all([
      this.prisma.assessmentSession.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: {
          title: true,
          type: true,
          status: true,
          dueAt: true,
          academicYear: true,
          semester: true,
          teachingAssignment: { select: { subject: true } },
          remedialParticipants: {
            where: { studentId: query.studentId },
            take: 1,
            select: {
              id: true,
              status: true,
              assignedAt: true,
              startedAt: true,
              submittedAt: true,
              finalizedAt: true,
              retryOfParticipantId: true,
              retryRootParticipantId: true,
              sourceGradeId: true,
            },
          },
        },
      }),
      this.prisma.assessmentSession.count({ where }),
    ]);

    const sourceGradeIds = sessions
      .map((session) => session.remedialParticipants[0]?.sourceGradeId)
      .filter((id): id is string => Boolean(id));
    const attempts = sourceGradeIds.length === 0
      ? []
      : await this.prisma.remedialParticipant.findMany({
          where: { studentId: query.studentId, sourceGradeId: { in: sourceGradeIds } },
          orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, sourceGradeId: true },
        });
    const attemptNumberById = new Map<string, number>();
    const attemptCountByGrade = new Map<string, number>();
    for (const attempt of attempts) {
      const next = (attemptCountByGrade.get(attempt.sourceGradeId) ?? 0) + 1;
      attemptCountByGrade.set(attempt.sourceGradeId, next);
      attemptNumberById.set(attempt.id, next);
    }

    return {
      data: sessions.map((session) => {
        const participant = session.remedialParticipants[0] ?? null;
        return {
          title: session.title,
          type: session.type,
          status: session.status,
          subject: session.teachingAssignment?.subject ?? null,
          dueAt: session.dueAt,
          academicYear: session.academicYear,
          semester: session.semester,
          participant: participant
            ? {
                status: participant.status,
                attemptNumber: attemptNumberById.get(participant.id) ?? 1,
                outcome: this.remedialOutcome(participant.status),
              }
            : null,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
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
      const activeOrCompleted = session.status === 'active' || session.status === 'completed';
      let visible = activeOrCompleted && session.purpose === 'regular' && session.classId === student.classId;
      if (activeOrCompleted && session.purpose === 'remedial') {
        const participant = await this.prisma.remedialParticipant.findFirst({
          where: { sessionId: session.id, studentId: student.id, status: { not: 'cancelled' } },
          select: { id: true },
        });
        visible = Boolean(participant);
      }
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
        purpose: true,
        type: true,
        moduleId: true,
        teachingAssignmentId: true,
        classId: true,
        academicYear: true,
        semester: true,
        module: { select: { subject: true, classId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (existing.purpose !== 'regular') throw new ConflictException('Gunakan endpoint remedial untuk mengubah sesi remedial');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Sesi berstatus '${existing.status}' tidak bisa diedit`);
    }
    if (!existing.module) throw new ConflictException('Sesi reguler tidak memiliki Modul LMS');
    if (!existing.module.classId) {
      throw new BadRequestException('Modul LMS harus memiliki kelas sebelum dibuat menjadi asesmen siswa');
    }
    if (dto.classId !== undefined && dto.classId !== null && dto.classId !== existing.module.classId) {
      throw new BadRequestException('Kelas asesmen harus sama dengan kelas Modul LMS');
    }
    const assignment = await this.assertTeachingScope(teacherId, existing.module.subject, existing.module.classId, existing.academicYear, existing.semester);
    const snapshot = dto.questionSelections
      ? await this.buildQuestionSnapshot(teacherId, existing.module.subject, dto.questionSelections)
      : undefined;
    const gradeTarget = dto.gradeTarget !== undefined
      ? this.gradeTargetFor(existing.type, dto.gradeTarget)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      const changed = await tx.assessmentSession.updateMany({
        where: { id, status: 'draft' },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          teachingAssignmentId: assignment.id,
          ...(snapshot !== undefined ? { questions: snapshot as Prisma.InputJsonValue } : {}),
          ...(gradeTarget !== undefined ? { gradeTarget } : {}),
          // U2 Wave 1: timer + randomization
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Sesi sudah berubah. Muat ulang sebelum menyimpan.');
      }
      return tx.assessmentSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
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
        purpose: true,
        classId: true,
        academicYear: true,
        semester: true,
        teachingAssignmentId: true,
        module: { select: { subject: true, classId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if ((existing.purpose ?? 'regular') !== 'regular') throw new ConflictException('Gunakan endpoint remedial untuk mengaktifkan sesi remedial');
    if (existing.status !== 'draft') {
      throw new ConflictException(`Hanya sesi 'draft' yang bisa dimulai (sekarang '${existing.status}')`);
    }
    if (!existing.module) throw new ConflictException('Sesi reguler tidak memiliki Modul LMS');
    const classId = existing.classId ?? existing.module.classId;
    if (!classId) throw new BadRequestException('Sesi asesmen wajib memiliki kelas');
    const assignment = await this.assertTeachingScope(teacherId, existing.module.subject, classId, existing.academicYear, existing.semester);
    return this.prisma.$transaction(async (tx) => {
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      const updated = await tx.assessmentSession.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'active', startedAt: new Date(), teachingAssignmentId: assignment.id },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Sesi sudah diproses oleh permintaan lain');
      }
      return tx.assessmentSession.findUniqueOrThrow({
        where: { id },
        select: SESSION_SELECT,
      });
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
          id: true, status: true, title: true, type: true, teacherId: true,
          moduleId: true, classId: true, academicYear: true, semester: true,
          purpose: true, teachingAssignmentId: true,
          questions: true, gradeTarget: true,
          module: { select: { subject: true, teacherId: true } },
          teachingAssignment: { select: { subject: true } },
        },
      });
      if (!existing) throw new NotFoundException('Sesi asesmen tidak ditemukan');
      if (existing.status !== 'active') {
        throw new ConflictException(`Hanya sesi 'active' yang bisa diselesaikan (sekarang '${existing.status}')`);
      }
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });

      const grading = (existing.purpose ?? 'regular') === 'regular'
        ? await this.syncGradesForCompletedSession(existing, tx)
        : {
            gradedCount: 0,
            pendingManualCount: 0,
            skippedCount: 0,
            gradeTarget: null,
            gradeEvents: [],
            assessmentEvent: {
              sessionId: existing.id,
              title: existing.title,
              type: existing.type,
              teacherId: existing.teacherId,
              classId: existing.classId,
              moduleId: existing.moduleId,
              subject: existing.teachingAssignment?.subject ?? 'Remedial',
              academicYear: existing.academicYear,
              semester: existing.semester,
              gradedCount: 0,
              skippedCount: 0,
            },
          } satisfies GradeSyncSummary;
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
    moduleId: string | null;
    classId: string | null;
    academicYear: string;
    semester: number;
    questions: Prisma.JsonValue;
    gradeTarget: string | null;
    module: { subject: string; teacherId: string } | null;
  }, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<GradeSyncSummary> {
    if (!session.module || !session.moduleId) {
      throw new ConflictException('Sesi reguler tidak memiliki Modul LMS untuk sinkronisasi Grade');
    }
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
      select: {
        id: true,
        status: true,
        purpose: true,
        classId: true,
        questions: true,
        durationMinutes: true,
        randomizeOrder: true,
        academicYear: true,
        semester: true,
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') {
      throw new ConflictException('Sesi tidak aktif — tidak bisa dimulai');
    }
    const { remedialParticipantId } = await this.assertStudentCanAccessSession(session, student);

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
      response = await this.prisma.$transaction(async (tx) => {
        await this.assertWritablePeriodInTransaction(tx, {
          academicYear: session.academicYear,
          semester: session.semester,
        });
        const created = await tx.assessmentResponse.create({
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
        if (remedialParticipantId) {
          await tx.remedialParticipant.updateMany({
            where: { id: remedialParticipantId, status: 'assigned' },
            data: { status: 'in_progress', startedAt: now },
          });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.assessmentResponse.findUnique({
          where: { sessionId_studentId: { sessionId, studentId: student.id } },
          select: { id: true, startedAt: true, submittedAt: true, answers: true, questionOrder: true },
        });
        if (raced && !raced.submittedAt) {
          if (remedialParticipantId) {
            await this.prisma.remedialParticipant.updateMany({
              where: { id: remedialParticipantId, status: 'assigned' },
              data: { status: 'in_progress', startedAt: raced.startedAt ?? now },
            });
          }
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
      select: {
        id: true,
        status: true,
        purpose: true,
        classId: true,
        questions: true,
        durationMinutes: true,
        academicYear: true,
        semester: true,
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') throw new ConflictException('Sesi tidak aktif');
    await this.assertStudentCanAccessSession(session, student);

    const questions = parseSnapshotQuestions(session.questions);
    validateAnswersForSnapshot(dto.answers as AssessmentAnswerMap, questions);

    const existing = await this.prisma.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: student.id } },
      select: { id: true, startedAt: true, submittedAt: true, itemScores: true },
    });
    if (!existing?.startedAt) throw new ConflictException('Mulai asesmen terlebih dahulu');
    if (existing.submittedAt) throw new ConflictException('Jawaban sudah dikirim');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: session.academicYear,
        semester: session.semester,
      });
      return tx.assessmentResponse.updateMany({
        where: { id: existing.id, submittedAt: null },
        data: { answers: dto.answers as Prisma.InputJsonValue },
      });
    });
    if (updated.count !== 1) throw new ConflictException('Jawaban sudah dikirim dari tab lain');
    return { saved: true, savedAt: new Date() };
  }

  /** SISWA submit jawaban untuk sesi active di kelasnya. U2 Wave 1: timer enforcement. */
  async submitResponse(sessionId: string, dto: SubmitResponseDto, user: AuthUser) {
    const student = await this.resolveStudent(user.keycloakId);
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        purpose: true,
        classId: true,
        questions: true,
        durationMinutes: true,
        academicYear: true,
        semester: true,
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');
    if (session.status !== 'active') {
      throw new ConflictException('Sesi tidak aktif — tidak menerima respons');
    }
    const { remedialParticipantId } = await this.assertStudentCanAccessSession(session, student);

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
      return this.prisma.$transaction(async (tx) => {
        await this.assertWritablePeriodInTransaction(tx, {
          academicYear: session.academicYear,
          semester: session.semester,
        });
        const updated = await tx.assessmentResponse.updateMany({
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
        if (remedialParticipantId) {
          const participantUpdated = await tx.remedialParticipant.updateMany({
            where: { id: remedialParticipantId, status: { in: ['assigned', 'in_progress'] } },
            data: { status: 'submitted', submittedAt: now, rawScore: scored.score },
          });
          if (participantUpdated.count !== 1) throw new ConflictException('Peserta remedial sudah diproses');
        }
        return tx.assessmentResponse.findUniqueOrThrow({
          where: { id: existing.id },
          select: {
            id: true, sessionId: true, score: true, itemScores: true, submittedAt: true, startedAt: true, timeSpentSec: true,
          },
        });
      });
    }

    throw new ConflictException('Mulai asesmen terlebih dahulu');
  }

  /** GURU pemilik / KS / SA: lihat semua respons untuk sesi (realtime monitor). */
  async getResults(sessionId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teacherId: true, classId: true, title: true, type: true, status: true, purpose: true, questions: true },
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
      session.purpose === 'remedial'
        ? this.prisma.remedialParticipant.count({ where: { sessionId, status: { not: 'cancelled' } } })
        : session.classId
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
        purpose: true,
        moduleId: true,
        classId: true,
        academicYear: true,
        semester: true,
        questions: true,
        gradeTarget: true,
        module: { select: { subject: true, teacherId: true } },
        teachingAssignment: { select: { subject: true, teacherId: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesi asesmen tidak ditemukan');

    if (!this.isReviewer(user)) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      if (session.teacherId !== teacherId) throw new ForbiddenException('Bukan sesi Anda');
      const classId = session.classId;
      if (!classId) throw new BadRequestException('Sesi asesmen wajib memiliki kelas');
      const subject = session.module?.subject ?? session.teachingAssignment?.subject;
      if (!subject) throw new ConflictException('Konteks mapel sesi tidak valid');
      await this.assertTeachingScope(teacherId, subject, classId, session.academicYear, session.semester);
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
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: session.academicYear,
        semester: session.semester,
      });
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
      if (session.status === 'completed' && session.purpose === 'regular') {
        await this.syncGradesForCompletedSession(session, tx);
      }
      return updatedResponse;
    });
    if (session.status === 'completed' && session.purpose === 'regular') this.runAssessmentOutboxWorker('completion');
    return updated;
  }

  /** U2 Wave 3: Analisis Hasil — item analysis + score distribution + ketuntasan. */
  async getSessionAnalysis(sessionId: string, user: AuthUser) {
    // Verify ownership
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true, title: true, type: true, status: true, teacherId: true,
        purpose: true, questions: true, classId: true, academicYear: true, semester: true,
        module: { select: { subject: true, kktp: true } },
        teachingAssignment: { select: { subject: true } },
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

    const subject = session.module?.subject ?? session.teachingAssignment?.subject ?? null;
    const kktp = await resolveKktpThreshold(this.prisma, {
      moduleKktp: session.module?.kktp ?? null,
      subject,
      academicYear: session.academicYear,
      semester: session.semester,
    });

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
    const tuntas = kktp.value === null ? 0 : scores.filter((s) => s >= kktp.value!).length;
    const ketuntasanPct = totalStudents > 0 && kktp.value !== null
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
        kktpValue: kktp.value,
        kktpProvenance: kktp.provenance,
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
  async listRemedials(query: ListAssessmentSessionDto, user: AuthUser) {
    const filters: Prisma.AssessmentSessionWhereInput = {
      purpose: 'remedial',
      ...(query.status ? { status: query.status } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
      ...(query.subject ? { teachingAssignment: { is: { subject: query.subject } } } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    if (this.isRemedialReviewer(user)) return this.pageRemedials(filters, skip, query);

    if (user.roles.includes('GURU')) {
      const teacherId = await this.resolveTeacherId(user.keycloakId);
      return this.pageRemedials({ ...filters, teacherId }, skip, query);
    }

    if (user.roles.includes('SISWA')) {
      const student = await this.resolveStudent(user.keycloakId);
      const result = await this.page({
        ...filters,
        status: query.status ?? { in: ['active', 'completed'] as const },
        remedialParticipants: { some: { studentId: student.id, status: { not: 'cancelled' } } },
      }, skip, query);
      return { ...result, data: result.data.map((session) => this.sanitizeSessionForStudent(session)) };
    }

    throw new ForbiddenException('Akses ditolak');
  }

  async listRemedialCandidates(query: RemedialCandidatesQueryDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const activeAcademicYear = await this.resolveActiveAcademicYearCode();
    if (query.academicYear !== activeAcademicYear) {
      throw new ConflictException('Kandidat remedial hanya tersedia untuk tahun ajaran aktif');
    }
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: {
        classId: query.classId,
        subject: query.subject,
        academicYear: activeAcademicYear,
        class: { isActive: true },
        teacher: { deletedAt: null, user: { isActive: true, deletedAt: null } },
        teacherId,
      },
      select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true },
    });
    if (!assignment) throw new ForbiddenException('TeachingAssignment tidak ditemukan untuk konteks remedial ini');
    await this.assertRemedialManageAssignment(assignment, user);

    const grades = await this.prisma.grade.findMany({
      where: {
        assignmentId: assignment.id,
        semester: query.semester,
        ...(query.type ? { type: query.type } : {}),
        remedialParticipants: {
          none: { status: { in: ['assigned', 'in_progress', 'submitted', 'passed'] } },
        },
        student: {
          deletedAt: null,
          ...(query.search
            ? {
                OR: [
                  { nis: { contains: query.search, mode: 'insensitive' } },
                  { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        studentId: true,
        score: true,
        type: true,
        academicYear: true,
        semester: true,
        updatedAt: true,
        sourceAssessmentSessionId: true,
        assignment: { select: { subject: true } },
        student: { select: { nis: true, user: { select: { fullName: true } } } },
      },
    });

    const candidates: Array<{
      gradeId: string;
      studentId: string;
      studentName: string;
      nis: string;
      score: number;
      type: string;
      kktpValue: number;
      kktpProvenance: string;
      gradeUpdatedAt: Date;
    }> = [];
    for (const grade of grades) {
      const kktp = await this.resolveKktpForGrade(grade);
      const score = this.decimalToNumber(grade.score);
      if (score >= kktp.value) continue;
      candidates.push({
        gradeId: grade.id,
        studentId: grade.studentId,
        studentName: grade.student.user.fullName,
        nis: grade.student.nis,
        score,
        type: grade.type,
        kktpValue: kktp.value,
        kktpProvenance: kktp.source,
        gradeUpdatedAt: grade.updatedAt,
      });
    }

    const start = (query.page - 1) * query.limit;
    return { data: candidates.slice(start, start + query.limit), total: candidates.length, page: query.page, limit: query.limit };
  }

  async createRemedialSession(dto: CreateRemedialSessionDto, user: AuthUser) {
    const uniqueGradeIds = [...new Set(dto.sourceGradeIds)];
    if (uniqueGradeIds.length !== dto.sourceGradeIds.length) {
      throw new BadRequestException('Daftar nilai sumber remedial tidak boleh berulang');
    }
    const grades = await this.prisma.grade.findMany({
      where: { id: { in: uniqueGradeIds } },
      select: {
        id: true,
        studentId: true,
        score: true,
        type: true,
        semester: true,
        academicYear: true,
        updatedAt: true,
        sourceAssessmentSessionId: true,
        assignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
      },
    });
    if (grades.length !== uniqueGradeIds.length) throw new NotFoundException('Sebagian nilai sumber tidak ditemukan');

    const first = grades[0]!;
    for (const grade of grades) {
      if (
        grade.assignment.id !== first.assignment.id ||
        grade.semester !== first.semester ||
        grade.academicYear !== first.academicYear ||
        grade.type !== first.type
      ) {
        throw new BadRequestException('Satu sesi remedial hanya boleh berasal dari satu konteks nilai yang sama');
      }
    }
    await this.assertRemedialManageAssignment(first.assignment, user);
    const existingLineage = await this.prisma.remedialParticipant.findFirst({
      where: {
        sourceGradeId: { in: uniqueGradeIds },
        status: { in: ['assigned', 'in_progress', 'submitted', 'needs_retry'] },
      },
      select: { id: true, status: true },
    });
    if (existingLineage) {
      throw new ConflictException(
        existingLineage.status === 'needs_retry'
          ? 'Nilai sumber memiliki remedial belum lulus; gunakan aksi retry agar lineage tetap terlacak'
          : 'Nilai sumber masih memiliki sesi remedial terbuka',
      );
    }

    for (const grade of grades) {
      const kktp = await this.resolveKktpForGrade(grade);
      const sourceScore = this.decimalToNumber(grade.score);
      if (sourceScore >= kktp.value) {
        throw new ConflictException('Nilai sumber sudah memenuhi KKTP sehingga tidak dapat dibuat remedial');
      }
      await this.assertNoLockedReportForGrade({
        studentId: grade.studentId,
        academicYear: grade.academicYear,
        semester: grade.semester,
        assignment: { classId: grade.assignment.classId },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireAcademicYearCutoverLock(tx);
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: first.academicYear,
        semester: first.semester,
      });
      await this.assertRemedialManageAssignment(first.assignment, user, tx);
      await this.lockGradeSnapshots(tx, grades);
      const freshGrades = await tx.grade.findMany({
        where: { id: { in: uniqueGradeIds } },
        select: {
          id: true,
          studentId: true,
          score: true,
          type: true,
          semester: true,
          academicYear: true,
          updatedAt: true,
          sourceAssessmentSessionId: true,
          assignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
        },
      });
      if (freshGrades.length !== uniqueGradeIds.length) {
        throw new ConflictException('Nilai sumber remedial berubah saat sesi dibuat');
      }
      const freshById = new Map(freshGrades.map((grade) => [grade.id, grade]));
      const firstFresh = freshById.get(first.id);
      if (!firstFresh) throw new ConflictException('Nilai sumber remedial berubah saat sesi dibuat');
      const transactionalParticipants: Prisma.RemedialParticipantCreateManyInput[] = [];
      for (const grade of grades) {
        const fresh = freshById.get(grade.id);
        if (
          !fresh ||
          fresh.updatedAt.getTime() !== grade.updatedAt.getTime() ||
          fresh.assignment.id !== first.assignment.id ||
          fresh.semester !== first.semester ||
          fresh.academicYear !== first.academicYear ||
          fresh.type !== first.type
        ) {
          throw new ConflictException('Nilai sumber berubah saat sesi remedial dibuat; muat ulang kandidat');
        }
        await this.assertNoLockedReportForGrade({
          studentId: fresh.studentId,
          academicYear: fresh.academicYear,
          semester: fresh.semester,
          assignment: { classId: fresh.assignment.classId },
        }, tx);
        const kktp = await this.resolveKktpForGrade(fresh, tx);
        const sourceScore = this.decimalToNumber(fresh.score);
        if (sourceScore >= kktp.value) {
          throw new ConflictException('Nilai sumber sudah memenuhi KKTP sehingga tidak dapat dibuat remedial');
        }
        transactionalParticipants.push({
          sessionId: '00000000-0000-0000-0000-000000000000',
          studentId: fresh.studentId,
          sourceGradeId: fresh.id,
          sourceScore,
          sourceGradeUpdatedAt: fresh.updatedAt,
          kktpValue: kktp.value,
          kktpProvenance: kktp.source,
        });
      }
      const txExistingLineage = await tx.remedialParticipant.findFirst({
        where: {
          sourceGradeId: { in: uniqueGradeIds },
          status: { in: ['assigned', 'in_progress', 'submitted', 'needs_retry'] },
        },
        select: { id: true, status: true },
      });
      if (txExistingLineage) {
        throw new ConflictException(
          txExistingLineage.status === 'needs_retry'
            ? 'Nilai sumber memiliki remedial belum lulus; gunakan aksi retry agar lineage tetap terlacak'
            : 'Nilai sumber masih memiliki sesi remedial terbuka',
        );
      }
      const snapshot = await this.buildQuestionSnapshot(
        firstFresh.assignment.teacherId,
        firstFresh.assignment.subject,
        dto.questionSelections,
        tx,
      );
      const created = await tx.assessmentSession.create({
        data: {
          moduleId: null,
          teachingAssignmentId: first.assignment.id,
          teacherId: first.assignment.teacherId,
          classId: first.assignment.classId,
          title: dto.title,
          type: this.gradeTypeToAssessmentType(first.type),
          status: 'draft',
          purpose: 'remedial',
          questions: snapshot as Prisma.InputJsonValue,
          gradeTarget: null,
          academicYear: first.academicYear,
          semester: first.semester,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          instructions: dto.instructions ?? null,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
        select: { id: true },
      });
      await tx.remedialParticipant.createMany({
        data: transactionalParticipants.map((participant) => ({ ...participant, sessionId: created.id })),
      });
      return tx.assessmentSession.findUniqueOrThrow({ where: { id: created.id }, select: REMEDIAL_SESSION_SELECT });
    });
  }

  async updateRemedialSession(id: string, dto: UpdateRemedialSessionDto, user: AuthUser) {
    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        purpose: true,
        updatedAt: true,
        teacherId: true,
        academicYear: true,
        semester: true,
        teachingAssignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
      },
    });
    if (!existing || existing.purpose !== 'remedial' || !existing.teachingAssignment) {
      throw new NotFoundException('Sesi remedial tidak ditemukan');
    }
    if (existing.status !== 'draft') throw new ConflictException(`Sesi remedial '${existing.status}' tidak dapat diedit`);
    await this.assertRemedialManageAssignment(existing.teachingAssignment, user);
    return this.prisma.$transaction(async (tx) => {
      await this.acquireAcademicYearCutoverLock(tx);
      const current = await tx.assessmentSession.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          purpose: true,
          updatedAt: true,
          teacherId: true,
          academicYear: true,
          semester: true,
          teachingAssignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
        },
      });
      if (!current || current.purpose !== 'remedial' || !current.teachingAssignment) {
        throw new NotFoundException('Sesi remedial tidak ditemukan');
      }
      if (current.status !== 'draft') {
        throw new ConflictException(`Sesi remedial '${current.status}' tidak dapat diedit`);
      }
      if (current.updatedAt.getTime() !== existing.updatedAt.getTime()) {
        throw new ConflictException('Sesi remedial sudah diubah oleh permintaan lain; muat ulang sebelum menyimpan');
      }
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: current.academicYear,
        semester: current.semester,
      });
      await this.assertRemedialManageAssignment(current.teachingAssignment, user, tx);
      const snapshot = dto.questionSelections
        ? await this.buildQuestionSnapshot(current.teachingAssignment.teacherId, current.teachingAssignment.subject, dto.questionSelections, tx)
        : undefined;
      if (dto.dueAt !== undefined) {
        await this.suppressPendingRemedialNotifications(
          tx,
          id,
          ['remedial_due_reminder'],
          'Tenggat remedial diubah; reminder lama dibatalkan',
        );
      }
      const updated = await tx.assessmentSession.updateMany({
        where: {
          id,
          status: 'draft',
          purpose: 'remedial',
          teacherId: current.teacherId,
          updatedAt: existing.updatedAt,
        },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(snapshot !== undefined ? { questions: snapshot as Prisma.InputJsonValue } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          ...(dto.instructions !== undefined ? { instructions: dto.instructions ?? null } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
      });
      if (updated.count !== 1) throw new ConflictException('Sesi remedial sudah diproses oleh permintaan lain');
      return tx.assessmentSession.findUniqueOrThrow({
        where: { id },
        select: REMEDIAL_SESSION_SELECT,
      });
    });
  }

  async activateRemedialSession(id: string, user: AuthUser) {
    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        purpose: true,
        academicYear: true,
        semester: true,
        teachingAssignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
        _count: { select: { remedialParticipants: true } },
      },
    });
    if (!existing || existing.purpose !== 'remedial' || !existing.teachingAssignment) {
      throw new NotFoundException('Sesi remedial tidak ditemukan');
    }
    if (existing.status !== 'draft') throw new ConflictException(`Hanya sesi remedial draft yang dapat diaktifkan (sekarang '${existing.status}')`);
    if (existing._count.remedialParticipants < 1) throw new ConflictException('Sesi remedial wajib memiliki peserta');
    await this.assertRemedialManageAssignment(existing.teachingAssignment, user);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.acquireAcademicYearCutoverLock(tx);
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      await this.assertRemedialManageAssignment(existing.teachingAssignment!, user, tx);
      const updated = await tx.assessmentSession.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'active', startedAt: new Date() },
      });
      if (updated.count !== 1) throw new ConflictException('Sesi remedial sudah diproses oleh permintaan lain');
      const session = await tx.assessmentSession.findUniqueOrThrow({ where: { id }, select: REMEDIAL_SESSION_SELECT });
      const logs = await this.buildRemedialNotificationLogs(tx, {
        sessionId: id,
        refType: 'remedial_assignment',
        refSuffix: 'assigned',
        subject: 'Remedial baru',
        body: `Remedial ${session.title} sudah aktif. Buka DIIS untuk melihat tugas remedial.`,
        participantStatus: ['assigned', 'in_progress'],
      });
      if (logs.length > 0) await tx.notificationLog.createMany({ data: logs, skipDuplicates: true });
      const logIds = await this.committedPendingNotificationLogIds(tx, logs);
      return {
        session,
        logIds,
      };
    });
    const notificationHandoff = await this.enqueueCommittedNotificationLogs(result.logIds, 'remedial_assignment');
    return { ...result.session, notificationHandoff };
  }

  async cancelRemedialSession(id: string, dto: CancelRemedialSessionDto, user: AuthUser) {
    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        purpose: true,
        academicYear: true,
        semester: true,
        teachingAssignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
      },
    });
    if (!existing || existing.purpose !== 'remedial' || !existing.teachingAssignment) {
      throw new NotFoundException('Sesi remedial tidak ditemukan');
    }
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new ConflictException('Sesi remedial selesai/batal tidak dapat dibatalkan ulang');
    }
    await this.assertRemedialManageAssignment(existing.teachingAssignment, user);
    const userId = await this.resolveAuthUserId(user.keycloakId);
    await this.prisma.$transaction(async (tx) => {
      await this.acquireAcademicYearCutoverLock(tx);
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      await this.assertRemedialManageAssignment(existing.teachingAssignment!, user, tx);
      const updated = await tx.assessmentSession.updateMany({
        where: { id, status: { in: ['draft', 'active'] } },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancelReason: dto.reason ?? null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Sesi remedial sudah diproses oleh permintaan lain');
      await tx.remedialParticipant.updateMany({
        where: { sessionId: id, status: { notIn: ['passed', 'cancelled'] } },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: userId, cancelReason: dto.reason ?? null },
      });
      await this.suppressPendingRemedialNotifications(
        tx,
        id,
        ['remedial_assignment', 'remedial_due_reminder'],
        'Sesi remedial dibatalkan',
      );
    });
    return this.prisma.assessmentSession.findUniqueOrThrow({ where: { id }, select: REMEDIAL_SESSION_SELECT });
  }

  async finalizeRemedialParticipant(sessionId: string, dto: FinalizeRemedialParticipantDto, user: AuthUser) {
    const userId = await this.resolveAuthUserId(user.keycloakId);
    const result = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.remedialParticipant.findFirst({
        where: { id: dto.participantId, sessionId },
        select: {
          id: true,
          status: true,
          sourceGradeUpdatedAt: true,
          kktpValue: true,
          session: {
            select: {
              id: true,
              title: true,
              status: true,
              teacherId: true,
              type: true,
              academicYear: true,
              semester: true,
              teachingAssignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
            },
          },
          sourceGrade: {
            select: {
              id: true,
              studentId: true,
              score: true,
              type: true,
              updatedAt: true,
              academicYear: true,
              semester: true,
              assignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
            },
          },
        },
      });
      if (!participant || !participant.session.teachingAssignment) throw new NotFoundException('Peserta remedial tidak ditemukan');
      if (participant.session.status !== 'active' && participant.session.status !== 'completed') {
        throw new ConflictException('Remedial hanya dapat difinalisasi dari sesi aktif atau selesai');
      }
      await this.acquireAcademicYearCutoverLock(tx);
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: participant.session.academicYear,
        semester: participant.session.semester,
      });
      await this.assertRemedialManageAssignment(participant.session.teachingAssignment, user, tx);
      await this.lockGradeSnapshots(tx, [participant.sourceGrade]);
      if (participant.status !== 'submitted') throw new ConflictException('Peserta remedial belum mengirim jawaban');
      if (participant.sourceGrade.updatedAt.getTime() !== participant.sourceGradeUpdatedAt.getTime()) {
        throw new ConflictException('Nilai sumber berubah sejak remedial ditugaskan; buat retry/remedial baru dari snapshot terbaru');
      }
      await this.assertNoLockedReportForGrade(participant.sourceGrade, tx);

      const response = await tx.assessmentResponse.findUnique({
        where: { sessionId_studentId: { sessionId, studentId: participant.sourceGrade.studentId } },
        select: { id: true, score: true, submittedAt: true, itemScores: true },
      });
      if (!response?.submittedAt || response.score == null) throw new ConflictException('Respons remedial belum siap difinalisasi');
      const itemScores = Array.isArray(response.itemScores)
        ? response.itemScores as unknown as AssessmentItemScore[]
        : [];
      if (itemScores.some((item) => item.status === 'manual_pending')) throw new ConflictException('Koreksi esai remedial belum lengkap');

      const rawScore = response.score;
      const kktpValue = this.decimalToNumber(participant.kktpValue);
      const passed = rawScore >= kktpValue;
      const finalStatus = passed ? 'passed' : 'needs_retry';
      const updatedParticipant = await tx.remedialParticipant.updateMany({
        where: { id: participant.id, status: 'submitted' },
        data: {
          status: finalStatus,
          rawScore,
          effectiveScore: passed ? kktpValue : rawScore,
          finalizedAt: new Date(),
          finalizedBy: userId,
        },
      });
      if (updatedParticipant.count !== 1) throw new ConflictException('Peserta remedial sudah difinalisasi oleh permintaan lain');

      if (passed && this.decimalToNumber(participant.sourceGrade.score) < kktpValue) {
        const updatedGrade = await tx.grade.updateMany({
          where: { id: participant.sourceGrade.id, updatedAt: participant.sourceGradeUpdatedAt },
          data: {
            score: kktpValue,
            notes: `Nilai dinaikkan ke KKTP melalui remedial: ${participant.session.title}`,
            submittedBy: userId,
          },
        });
        if (updatedGrade.count !== 1) throw new ConflictException('Nilai sumber berubah saat finalisasi remedial berlangsung');
        await this.enqueueAssessmentEvents({
          gradedCount: 1,
          pendingManualCount: 0,
          skippedCount: 0,
          gradeTarget: participant.sourceGrade.type,
          gradeEvents: [{
            gradeId: participant.sourceGrade.id,
            studentId: participant.sourceGrade.studentId,
            subject: participant.sourceGrade.assignment.subject,
            score: String(kktpValue),
            type: participant.sourceGrade.type,
            semester: participant.sourceGrade.semester,
            academicYear: participant.sourceGrade.academicYear,
          }],
          assessmentEvent: {
            sessionId: participant.session.id,
            title: participant.session.title,
            type: participant.session.type,
            teacherId: participant.session.teacherId,
            classId: participant.session.teachingAssignment.classId,
            moduleId: null,
            subject: participant.session.teachingAssignment.subject,
            academicYear: participant.session.academicYear,
            semester: participant.session.semester,
            gradedCount: 1,
            skippedCount: 0,
          },
        }, tx);
      }

      const outcomeLogs = await this.buildRemedialNotificationLogs(tx, {
        sessionId,
        participantId: participant.id,
        refType: 'remedial_result',
        refSuffix: finalStatus,
        subject: 'Hasil remedial',
        body: passed
          ? `Remedial ${participant.session.title} sudah difinalisasi dan dinyatakan tuntas. Buka DIIS untuk melihat status akademik.`
          : `Remedial ${participant.session.title} sudah difinalisasi dan belum tuntas. Guru akan menyiapkan tindak lanjut melalui DIIS.`,
        participantStatus: [finalStatus],
      });
      if (outcomeLogs.length > 0) await tx.notificationLog.createMany({ data: outcomeLogs, skipDuplicates: true });
      const logIds = await this.committedPendingNotificationLogIds(tx, outcomeLogs);

      const participantResult = await tx.remedialParticipant.findUniqueOrThrow({
        where: { id: participant.id },
        include: { sourceGrade: true, student: { select: { nis: true, user: { select: { fullName: true } } } } },
      });
      return {
        participant: participantResult,
        logIds,
      };
    });
    this.runAssessmentOutboxWorker('completion');
    const notificationHandoff = await this.enqueueCommittedNotificationLogs(result.logIds, 'remedial_result');
    return { ...result.participant, notificationHandoff };
  }

  async retryRemedialParticipant(sessionId: string, dto: RetryRemedialParticipantDto, user: AuthUser) {
    const previous = await this.prisma.remedialParticipant.findFirst({
      where: { id: dto.participantId, sessionId },
      select: {
        id: true,
        retryRootParticipantId: true,
        sourceGradeUpdatedAt: true,
        status: true,
        sourceGrade: {
          select: {
            id: true,
            studentId: true,
            score: true,
            type: true,
            academicYear: true,
            semester: true,
            updatedAt: true,
            sourceAssessmentSessionId: true,
            assignment: { select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true } },
          },
        },
      },
    });
    if (!previous) throw new NotFoundException('Peserta remedial tidak ditemukan');
    if (previous.status !== 'needs_retry') throw new ConflictException('Retry hanya dapat dibuat untuk remedial yang belum lulus');
    if (previous.sourceGrade.updatedAt.getTime() !== previous.sourceGradeUpdatedAt.getTime()) {
      throw new ConflictException('Nilai sumber berubah sejak remedial terakhir; buat remedial baru dari kandidat terbaru');
    }
    await this.assertRemedialManageAssignment(previous.sourceGrade.assignment, user);
    const kktp = await this.resolveKktpForGrade(previous.sourceGrade);
    const sourceScore = this.decimalToNumber(previous.sourceGrade.score);
    if (sourceScore >= kktp.value) throw new ConflictException('Nilai sumber sudah memenuhi KKTP');
    const retryRootParticipantId = previous.retryRootParticipantId ?? previous.id;
    return this.prisma.$transaction(async (tx) => {
      await this.acquireAcademicYearCutoverLock(tx);
      await this.assertWritablePeriodInTransaction(tx, {
        academicYear: previous.sourceGrade.academicYear,
        semester: previous.sourceGrade.semester,
      });
      await this.assertRemedialManageAssignment(previous.sourceGrade.assignment, user, tx);
      await this.lockGradeSnapshots(tx, [previous.sourceGrade]);
      const snapshot = await this.buildQuestionSnapshot(
        previous.sourceGrade.assignment.teacherId,
        previous.sourceGrade.assignment.subject,
        dto.questionSelections,
        tx,
      );
      const session = await tx.assessmentSession.create({
        data: {
          moduleId: null,
          teachingAssignmentId: previous.sourceGrade.assignment.id,
          teacherId: previous.sourceGrade.assignment.teacherId,
          classId: previous.sourceGrade.assignment.classId,
          title: dto.title ?? `Retry remedial - ${previous.sourceGrade.assignment.subject}`,
          type: this.gradeTypeToAssessmentType(previous.sourceGrade.type),
          status: 'draft',
          purpose: 'remedial',
          questions: snapshot as Prisma.InputJsonValue,
          gradeTarget: null,
          academicYear: previous.sourceGrade.academicYear,
          semester: previous.sourceGrade.semester,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          instructions: dto.instructions ?? null,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
        select: { id: true },
      });
      await tx.remedialParticipant.create({
        data: {
          sessionId: session.id,
          studentId: previous.sourceGrade.studentId,
          sourceGradeId: previous.sourceGrade.id,
          retryOfParticipantId: previous.id,
          retryRootParticipantId,
          sourceScore,
          sourceGradeUpdatedAt: previous.sourceGrade.updatedAt,
          kktpValue: kktp.value,
          kktpProvenance: kktp.source,
        },
      });
      return tx.assessmentSession.findUniqueOrThrow({ where: { id: session.id }, select: REMEDIAL_SESSION_SELECT });
    });
  }

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
