import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { resolveKktpThreshold } from '../academic/kktp-resolver';
import { acquireIdentityMutationLock, assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { OPERATIONAL_TEACHER_WHERE } from '../common/helpers/operational-teacher';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseSnapshotQuestions, secureMatchingSnapshot } from './assessment-runtime';
import { ExamDecision, ExamIncidentInput, ExamList, ExamPlan, ExamPlanSchema, TransferDeviceInput } from './exam-contract';
import { requireProgramStaff, programAuthority } from './assessment-program-authority';
import type { ScheduleRequest } from './assessment-program-contract';
import { readMakeupGradeSnapshot, type ExamMakeupGradeSnapshot } from './exam-makeup-grade';
import { examDeadline, examDeviceHash } from './scheduled-exam-runtime';
import { examRoomKey, examStaffWhere, lockExamPlanning } from './exam-operations.service';

const managerRoles = ['SUPER_ADMIN', 'WAKA_KURIKULUM'];
type MakeupCandidate = { fullName: string; gradeId?: string; snapshot?: ExamMakeupGradeSnapshot };
const programSelect = {
  ownerId: true, packageId: true, kind: { select: { category: true, allowsGrade: true } },
  classes: { select: { classId: true, assignmentId: true,
    class: { select: { isActive: true, academicYear: true } } } },
} satisfies Prisma.AssessmentProgramSelect;
const scheduleRequestDraftSelect = {
  status: true, type: true, purpose: true, durationMinutes: true, teacherId: true,
  academicYear: true, semester: true, teacher: { select: { userId: true } },
  teachingAssignment: { select: { subject: true } },
  program: { select: { ownerId: true, packageId: true } },
} satisfies Prisma.AssessmentSessionSelect;
type ScheduleRequestDraft = Prisma.AssessmentSessionGetPayload<{ select: typeof scheduleRequestDraftSelect }>;
const requestPackageSelect = { id: true, title: true, version: true } satisfies Prisma.ExamPackageSelect;

function requestPackageScope(session: ScheduleRequestDraft): Prisma.ExamPackageWhereInput {
  return { teacherId: session.teacherId, subject: session.teachingAssignment!.subject };
}

const examWindowSelect = {
  sessionId: true, room: true, opensAt: true, latestEntryAt: true, closesAt: true, agendaId: true, cohortGrade: true,
  publishedAt: true, cancelledAt: true, makeupOfSessionId: true,
  package: { select: { id: true, title: true, version: true, subject: true } },
  session: { select: { title: true, durationMinutes: true, status: true, academicYear: true, semester: true, class: { select: { name: true } },
    gradeTarget: true, program: { select: { kind: { select: { name: true } }, _count: { select: { classes: true } } } },
    teacher: { select: { user: { select: { fullName: true } } } } } },
  _count: { select: { participants: true, incidents: true } },
} satisfies Prisma.ExamScheduleSelect;

@Injectable()
export class ExamScheduleService {
  constructor(private readonly db: PrismaService, private readonly periods: AcademicPeriodService,
    private readonly permissions: PermissionsService) {}

  private scope(user: AuthUser, monitor = false): Prisma.ExamScheduleWhereInput {
    if (user.roles.some((role) => [...managerRoles, 'KEPALA_SEKOLAH'].includes(role))) return {};
    const identity = { keycloakId: user.keycloakId, isActive: true, deletedAt: null };
    if (user.roles.includes('SISWA') && !monitor) return {
      publishedAt: { not: null },
      participants: { some: { student: { user: identity, deletedAt: null, status: 'active' } } },
    };
    if (user.roles.includes('SISWA')) throw new ForbiddenException('Monitor khusus pengawas ujian.');
    return { OR: [
      { session: { teacher: { ...OPERATIONAL_TEACHER_WHERE, user: { ...OPERATIONAL_TEACHER_WHERE.user, ...identity } } } },
      { session: { program: { owner: identity } } },
      { publishedAt: { not: null }, proctors: { some: { user: { ...identity, staff: { is: { deletedAt: null } } } } } },
      ...this.cohortScope(user.keycloakId),
    ] };
  }

  private cohortScope(keycloakId: string, transfer = false): Prisma.ExamScheduleWhereInput[] {
    return [10, 11, 12].map((grade) => ({
      cohortGrade: grade, publishedAt: { not: null }, cancelledAt: null,
      agenda: { proctors: { some: { grade, ...(transfer ? { canTransfer: true } : {}), user: { keycloakId, ...examStaffWhere } } } },
    }));
  }

  private async lock(tx: Prisma.TransactionClient, sessionId: string) {
    await lockExamPlanning(tx);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'assessment-session:' + sessionId}, 0))`);
  }

  private assertManager(tx: Prisma.TransactionClient, user: AuthUser) {
    return assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
      'academic.schedule.edit', ['SUPER_ADMIN'], ['WAKA_KURIKULUM']);
  }

  private async assertScheduler(tx: Prisma.TransactionClient, user: AuthUser,
    program?: { ownerId: string; kind: { category: string } } | null) {
    if (program?.kind.category === 'simulation' &&
        (await requireProgramStaff(tx, user, true)).id === program.ownerId) return;
    await this.assertManager(tx, user);
  }

  private async assertProgramClasses(tx: Prisma.TransactionClient, program: Prisma.AssessmentProgramGetPayload<{ select: typeof programSelect }>,
    session: { teacherId: string; academicYear: string; gradeTarget: string | null }, subject: string) {
    if (!program.classes.length || program.classes.some(({ class: cls }) => !cls.isActive || cls.academicYear !== session.academicYear))
      throw new ConflictException('Rombel program sudah berubah.');
    if (!session.gradeTarget) return;
    if (!program.kind.allowsGrade || program.kind.category !== 'custom')
      throw new ConflictException('Jenis asesmen ini menyimpan hasil terpisah.');
    const rows = await tx.teachingAssignment.findMany({ where: { id: { in: program.classes.flatMap(({ assignmentId }) =>
      assignmentId ? [assignmentId] : []) }, teacherId: session.teacherId, academicYear: session.academicYear, subject },
      select: { id: true, classId: true } });
    const verified = new Map(rows.map((row) => [row.classId, row.id]));
    if (program.classes.some((row) => verified.get(row.classId) !== row.assignmentId || !row.assignmentId))
      throw new ConflictException('Penugasan pengampu berubah. Tinjau seluruh rombel sebelum menerbitkan.');
  }

  private async makeupCandidates(db: Prisma.TransactionClient, originalId: string, studentIds?: string[]) {
    const original = await db.assessmentSession.findFirst({
      where: { id: originalId, status: 'completed', purpose: 'regular', type: 'sumatif',
        gradeTarget: { in: ['uts', 'uas'] },
        OR: [{ examSchedule: null }, { examSchedule: { makeupOfSessionId: null } }] },
      select: { classId: true, academicYear: true, semester: true,
        module: { select: { kktp: true } }, teachingAssignment: { select: { subject: true } },
        examSchedule: { select: { sessionId: true } } },
    });
    if (!original?.classId) throw new NotFoundException('Sesi ujian asal belum selesai atau tidak tersedia.');
    const [students, responses, grades, threshold] = await Promise.all([
      db.student.findMany({
        where: { classId: original.classId, deletedAt: null, status: 'active',
          user: { isActive: true, deletedAt: null }, ...(studentIds ? { id: { in: studentIds } } : {}),
          ...(original.examSchedule ? { examParticipations: { some: { sessionId: originalId } } } : {}) },
        select: { id: true, user: { select: { fullName: true } } }, take: 501, orderBy: { id: 'asc' },
      }),
      db.assessmentResponse.findMany({
        where: { sessionId: originalId, submittedAt: { not: null },
          ...(studentIds ? { studentId: { in: studentIds } } : {}) },
        select: { studentId: true, lateSubmissionStatus: true },
      }),
      db.grade.findMany({
        where: { sourceAssessmentSessionId: originalId, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
        select: { id: true, studentId: true, score: true, updatedAt: true },
      }),
      resolveKktpThreshold(db, { subject: original.teachingAssignment?.subject, moduleKktp: original.module?.kktp,
        academicYear: original.academicYear, semester: original.semester }),
    ]);
    const byStudent = new Map(grades.map((item) => [item.studentId, item]));
    const submitted = new Set(responses.filter((item) => item.lateSubmissionStatus !== 'rejected').map((item) => item.studentId));
    const accepted = new Set(responses.filter((item) =>
      item.lateSubmissionStatus === null || item.lateSubmissionStatus === 'accepted').map((item) => item.studentId));
    const candidates = new Map<string, MakeupCandidate>();
    for (const student of students) {
      const { fullName } = student.user;
      const grade = byStudent.get(student.id);
      if (!grade && !submitted.has(student.id)) {
        candidates.set(student.id, { fullName });
      } else if (grade && accepted.has(student.id) && threshold.value !== null &&
          (threshold.provenance === 'config' || threshold.provenance === 'module') &&
          Number(grade.score) < threshold.value) {
        candidates.set(student.id, { fullName, gradeId: grade.id, snapshot: {
          originalScore: Number(grade.score), originalGradeVersion: grade.updatedAt.toISOString(),
          kktp: threshold.value, provenance: threshold.provenance,
        } });
      }
    }
    return candidates;
  }

  async makeupOptions(originalId: string) {
    const participants = await this.makeupCandidates(this.db, originalId);
    return Array.from(participants, ([studentId, item]) => ({
      studentId, fullName: item.fullName, mode: item.snapshot ? 'improvement' : 'absence',
    })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
  }

  private audit(tx: Prisma.TransactionClient, user: AuthUser, id: string, action: string,
    metadata: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: {
      action, actorId: user.keycloakId, actorRoles: user.roles, resourceId: id,
      resourceType: 'ExamSchedule', method: 'POST', path: '/exam-schedule',
      statusCode: 200, outcome: 'success', metadata,
    } });
  }

  async list(input: ExamList, user: AuthUser) {
    const start = new Date(`${input.day}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await this.db.examSchedule.findMany({
      where: { AND: [this.scope(user), { opensAt: { lt: end }, closesAt: { gt: start } }] },
      select: { ...examWindowSelect, participants: {
        where: { student: { user: { keycloakId: user.keycloakId } } },
        select: { roomSlot: { select: { room: true } } }, take: 1,
      } },
      orderBy: [{ opensAt: 'asc' }, { sessionId: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { sessionId: input.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, input.limit);
    const ids = page.map(({ sessionId }) => sessionId);
    const counts = user.roles.includes('SISWA') || !ids.length ? [] : await this.db.$queryRaw<{
      sessionId: string; working: number; done: number;
    }[]>(Prisma.sql`
      SELECT session_id AS "sessionId",
        count(*) FILTER (WHERE started_at IS NOT NULL AND submitted_at IS NULL)::int AS working,
        count(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS done
      FROM academic.assessment_responses
      WHERE session_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY session_id`);
    const stats = new Map(counts.map((row) => [row.sessionId, { working: row.working, done: row.done }]));
    return { rows: page.map(({ participants, ...row }) => ({ ...row, room: participants[0]?.roomSlot?.room ?? row.room, counts: stats.get(row.sessionId) })),
      asOf: new Date(), nextCursor: rows.length > input.limit ? page.at(-1)?.sessionId : null };
  }

  async monitor(sessionId: string, user: AuthUser) {
    const schedule = await this.db.examSchedule.findFirst({
      where: { AND: [{ sessionId }, this.scope(user, true)] },
      select: { ...examWindowSelect, proctors: { where: { user: { keycloakId: user.keycloakId, ...examStaffWhere } }, select: { userId: true } },
        participants: { select: { studentId: true, extraMinutes: true, roomSlotId: true,
        student: { select: { user: { select: { fullName: true } } } } } },
        incidents: { orderBy: { createdAt: 'desc' }, take: 30, select: {
          id: true, kind: true, reason: true, decision: true, decisionNote: true, createdAt: true, resolvedAt: true,
        } } },
    });
    if (!schedule) throw new NotFoundException('Sesi tidak tersedia untuk kewenangan ini.');
    const responses = await this.db.assessmentResponse.findMany({
      where: { sessionId }, select: {
        studentId: true, startedAt: true, submittedAt: true, lastSavedAt: true, lastHeartbeatAt: true,
        lateSubmissionStatus: true, _count: { select: { integrityEvents: true } },
      },
    });
    const states = new Map(responses.map((row) => [row.studentId, row]));
    const { proctors, ...data } = schedule;
    const cohort = schedule.agendaId && schedule.cohortGrade
      ? await this.db.examCohortProctor.findFirst({ where: { agendaId: schedule.agendaId, grade: schedule.cohortGrade,
          user: { keycloakId: user.keycloakId, ...examStaffWhere } }, select: { canTransfer: true } }) : null;
    const manager = user.roles.some((role) => managerRoles.includes(role));
    const canDecide = !schedule.cancelledAt && manager && await this.hasManagerAuthority(user);
    return { ...data, canDecide, canReport: Boolean(schedule.publishedAt && !schedule.cancelledAt &&
      (canDecide || proctors.length || cohort)), canTransfer: cohort?.canTransfer === true,
      asOf: new Date(), participants: schedule.participants.map((entry) => ({
      ...entry, response: states.get(entry.studentId) ?? null,
    })) };
  }

  private async hasManagerAuthority(user: AuthUser, db: Prisma.TransactionClient = this.db) {
    const role = await this.permissions.getAuthoritativePrimaryRole(user.keycloakId, db);
    if (role === 'SUPER_ADMIN') return true;
    if (!role) return false;
    const positions = await this.permissions.getActivePositionCodes(user.keycloakId, undefined, db);
    return positions.has('WAKA_KURIKULUM') &&
      this.permissions.hasFreshPermission(user.keycloakId, 'academic.schedule.edit', db);
  }

  async ownStatus(sessionId: string, user: AuthUser) {
    const participant = await this.db.examParticipant.findFirst({
      where: { sessionId, student: { status: 'active', deletedAt: null,
        user: { keycloakId: user.keycloakId, role: 'SISWA', isActive: true, deletedAt: null } },
        schedule: { publishedAt: { not: null }, cancelledAt: null } },
      select: { studentId: true, extraMinutes: true, schedule: { select: {
        closesAt: true, session: { select: { durationMinutes: true } },
      } } },
    });
    if (!participant) throw new NotFoundException('Anda belum terdaftar untuk ujian ini.');
    const response = await this.db.assessmentResponse.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: participant.studentId } },
      select: { startedAt: true, submittedAt: true, clientRevision: true, score: true, lateSubmissionStatus: true },
    });
    const { closesAt, session } = participant.schedule;
    const deadline = response?.startedAt && session.durationMinutes
      ? examDeadline(closesAt, response.startedAt, session.durationMinutes, participant.extraMinutes) : closesAt;
    const now = new Date();
    return { state: response?.submittedAt ? 'submitted' : now >= deadline ? 'expired' : 'working',
      serverNow: now, deadlineAt: response?.startedAt ? deadline : null,
      confirmedRevision: response?.clientRevision ?? null, score: response?.submittedAt ? response.score : null,
      lateSubmissionStatus: response?.submittedAt ? response.lateSubmissionStatus : null };
  }

  async authorOptions(user: AuthUser) {
    const manager = user.roles.some((role) => managerRoles.includes(role));
    const owner = { teacher: { ...OPERATIONAL_TEACHER_WHERE, user: {
      ...OPERATIONAL_TEACHER_WHERE.user, keycloakId: user.keycloakId,
    } } };
    const [drafts, packages, proctors] = await Promise.all([
      this.db.assessmentSession.findMany({
        where: { ...(manager ? {} : owner), status: 'draft', purpose: 'regular', type: 'sumatif',
          durationMinutes: { not: null }, OR: [{ examSchedule: { is: null } }, { examSchedule: { is: { publishedAt: null } } }] },
        select: { id: true, title: true, class: { select: { name: true } }, durationMinutes: true, academicYear: true, semester: true },
        take: 100, orderBy: { updatedAt: 'desc' },
      }),
      this.db.examPackage.findMany({ where: manager ? {} : owner, select: {
        id: true, title: true, subject: true, version: true,
      }, take: 100, orderBy: { createdAt: 'desc' } }),
      manager ? this.db.user.findMany({ where: { isActive: true, deletedAt: null, role: { in: ['GURU', 'TATA_USAHA'] },
        staff: { is: { deletedAt: null } } }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' }, take: 150 }) : [],
    ]);
    return { drafts, packages, proctors };
  }

  async freezePackage(sessionId: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      await assertFreshMutationAuthority(tx, this.permissions, user.keycloakId, 'lms.own.manage', ['GURU']);
      const draft = await tx.assessmentSession.findFirst({
        where: { id: sessionId, status: 'draft', purpose: 'regular', type: 'sumatif',
          teacher: { ...OPERATIONAL_TEACHER_WHERE, user: { ...OPERATIONAL_TEACHER_WHERE.user,
            keycloakId: user.keycloakId } } },
        select: { teacherId: true, title: true, questions: true, teachingAssignment: { select: { subject: true } } },
      });
      if (!draft?.teachingAssignment) throw new NotFoundException('Draft sumatif belum tersedia.');
      const snapshots = parseSnapshotQuestions(draft.questions);
      if (!snapshots.length) throw new BadRequestException('Paket memerlukan soal.');
      const key = { teacherId: draft.teacherId, subject: draft.teachingAssignment.subject, title: draft.title };
      const last = await tx.examPackage.findFirst({ where: key, orderBy: { version: 'desc' } });
      const latestQuestions = last ? parseSnapshotQuestions(last.questions) : [];
      // Canonicalize with the runtime parser before comparing persisted jsonb values.
      const withoutChoiceIds = (questions: typeof snapshots) => questions.map((question) => {
        if (question.type !== 'matching') return question;
        const { choiceIds: _choiceIds, ...source } = question;
        return source;
      });
      if (last && JSON.stringify(withoutChoiceIds(latestQuestions)) === JSON.stringify(withoutChoiceIds(snapshots))) {
        return { id: last.id, version: last.version };
      }
      return tx.examPackage.create({ data: { ...key,
        questions: snapshots.map(secureMatchingSnapshot) as Prisma.InputJsonValue, version: (last?.version ?? 0) + 1 },
        select: { id: true, version: true } });
    });
  }

  async listRequests(user: AuthUser) {
    const actor = await requireProgramStaff(this.db, user);
    const authority = await programAuthority(this.db, this.permissions, user, actor);
    const requests = await this.db.examScheduleRequest.findMany({
      where: authority.canReadSchool ? {} : { OR: [{ requesterId: actor.id },
        { session: { program: { ownerId: actor.id } } }, { session: { program: null, teacher: { userId: actor.id } } }] },
      orderBy: [{ updatedAt: 'desc' }, { sessionId: 'asc' }], take: 60,
      include: { session: { select: { title: true, academicYear: true, semester: true, status: true,
        program: { select: { ownerId: true, kind: { select: { category: true } } } },
        teacher: { select: { userId: true } }, examSchedule: { select: { publishedAt: true, cancelledAt: true } } },
      } },
    });
    return requests.map(({ session, ...row }) => ({
      ...row, title: session.title, academicYear: session.academicYear, semester: session.semester,
      status: session.status, publishedAt: session.examSchedule?.publishedAt ?? null,
      missing: this.requestMissing(row),
      canEdit: session.status === 'draft' && (authority.manager ||
        (session.program ? session.program.ownerId : session.teacher.userId) === actor.id),
      canPublish: session.status === 'draft' && (authority.manager ||
        (session.program?.kind.category === 'simulation' && session.program.ownerId === actor.id)),
    }));
  }

  private requestMissing(row: { packageId: string | null; examDate: Date | null; opensAt: Date | null;
    latestEntryAt: Date | null; closesAt: Date | null; room: string | null; proctorIds: string[] }) {
    return [
      !row.packageId && 'Paket soal', !row.examDate && 'Tanggal', !row.opensAt && 'Jam buka',
      !row.latestEntryAt && 'Batas mulai', !row.closesAt && 'Jam tutup', !row.room && 'Ruang',
      !row.proctorIds.length && 'Proktor',
    ].filter(Boolean);
  }

  private async requestDraft(db: Prisma.TransactionClient, sessionId: string) {
    const session = await db.assessmentSession.findUnique({ where: { id: sessionId }, select: scheduleRequestDraftSelect });
    if (!session || session.status !== 'draft' || session.purpose !== 'regular' || !session.durationMinutes ||
        (!session.program && (session.type !== 'sumatif' || !session.teachingAssignment)))
      throw new NotFoundException('Draf ujian belum tersedia.');
    return session;
  }

  private async assertRequestEditor(db: Prisma.TransactionClient, session: ScheduleRequestDraft, user: AuthUser, write = false) {
    const actor = await requireProgramStaff(db, user, write);
    const authority = await programAuthority(db, this.permissions, user, actor);
    const ownerId = session.program?.ownerId ?? session.teacher.userId;
    if (!authority.manager && (ownerId !== actor.id || (!session.program &&
        !await this.permissions.hasFreshPermission(user.keycloakId, 'lms.own.manage', db))))
      throw new ForbiddenException('Pengajuan ini di luar kewenangan Anda.');
    return actor;
  }

  async requestPackages(sessionId: string, user: AuthUser, after?: string) {
    const session = await this.requestDraft(this.db, sessionId);
    await this.assertRequestEditor(this.db, session, user);
    if (session.program) return { packages: [], nextCursor: null };

    const where = requestPackageScope(session);
    const anchor = after ? await this.db.examPackage.findFirst({
      where: { ...where, id: after }, select: { id: true, createdAt: true },
    }) : null;
    if (after && !anchor) throw new BadRequestException('Halaman paket soal tidak valid.');

    const limit = 100;
    const rows = await this.db.examPackage.findMany({
      where: anchor ? { ...where, OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { gt: anchor.id } },
      ] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit + 1, select: requestPackageSelect,
    });
    const options = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? options.at(-1)?.id ?? null : null;
    if (!after && nextCursor) {
      const request = await this.db.examScheduleRequest.findUnique({
        where: { sessionId }, select: { packageId: true },
      });
      if (request?.packageId && !options.some(({ id }) => id === request.packageId)) {
        const selected = await this.db.examPackage.findFirst({
          where: { ...where, id: request.packageId }, select: requestPackageSelect,
        });
        if (selected) options.push(selected);
      }
    }
    return { packages: options, nextCursor };
  }

  async saveRequest(sessionId: string, input: ScheduleRequest, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const session = await this.requestDraft(tx, sessionId);
      await this.periods.assertWritablePeriodWithCutoverLock(tx, session);
      const actor = await this.assertRequestEditor(tx, session, user, true);
      const current = await tx.examScheduleRequest.findUnique({ where: { sessionId }, select: { revision: true } });
      if ((current?.revision ?? 0) !== input.revision) throw new ConflictException('Pengajuan sudah berubah. Muat ulang sebelum menyimpan.');
      const packageId = session.program?.packageId ?? input.packageId ?? null;
      if (!session.program && packageId && !await tx.examPackage.findFirst({
        where: { ...requestPackageScope(session), id: packageId }, select: { id: true },
      })) throw new BadRequestException('Paket soal tidak cocok dengan guru dan mapel sesi.');
      if (input.proctorIds.length && await tx.user.count({ where: { id: { in: input.proctorIds }, ...examStaffWhere } }) !== input.proctorIds.length)
        throw new BadRequestException('Proktor harus staf aktif.');
      const data = { packageId, examDate: input.examDate ? new Date(input.examDate) : null, room: input.room ?? null,
        opensAt: input.opensAt ? new Date(input.opensAt) : null, latestEntryAt: input.latestEntryAt ? new Date(input.latestEntryAt) : null,
        closesAt: input.closesAt ? new Date(input.closesAt) : null, proctorIds: input.proctorIds };
      const saved = await tx.examScheduleRequest.upsert({ where: { sessionId }, create: { sessionId, requesterId: actor.id, ...data },
        update: { ...data, revision: { increment: 1 } } });
      await this.audit(tx, user, sessionId, 'exam.schedule-request', { revision: saved.revision });
      return { ...saved, missing: this.requestMissing(saved) };
    });
  }

  async publishRequest(sessionId: string, revision: number, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const request = await tx.examScheduleRequest.findUnique({ where: { sessionId },
        include: { session: { select: { academicYear: true, semester: true,
          program: { select: programSelect }, examSchedule: { select: { publishedAt: true } } } } } });
      if (!request) throw new NotFoundException('Pengajuan jadwal belum tersedia.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, request.session);
      await this.assertScheduler(tx, user, request.session.program);
      if (request.revision !== revision) throw new ConflictException('Jadwal telah diubah. Periksa ulang rincian pengajuan.');
      if (request.session.examSchedule?.publishedAt) return this.publish(sessionId, user, tx);
      if (this.requestMissing(request).length) throw new ConflictException('Lengkapi semua rincian jadwal sebelum menerbitkan.');
      const parsed = ExamPlanSchema.safeParse({ packageId: request.packageId, room: request.room,
        opensAt: request.opensAt?.toISOString(), latestEntryAt: request.latestEntryAt?.toISOString(),
        closesAt: request.closesAt?.toISOString(), proctorIds: request.proctorIds });
      if (!parsed.success) throw new BadRequestException('Rincian jadwal belum valid.');
      await this.plan(sessionId, parsed.data, user, tx);
      return this.publish(sessionId, user, tx);
    }, { timeout: 15000 });
  }

  async plan(sessionId: string, input: ExamPlan, user: AuthUser, transaction?: Prisma.TransactionClient) {
    const operation = async (tx: Prisma.TransactionClient) => {
      await this.lock(tx, sessionId);
      const session = await tx.assessmentSession.findUnique({
        where: { id: sessionId },
        select: { id: true, classId: true, teacherId: true, status: true, purpose: true, type: true,
          durationMinutes: true, gradeTarget: true, academicYear: true, semester: true, teachingAssignmentId: true,
          class: { select: { grade: true, academicYear: true, isActive: true } },
          teachingAssignment: { select: { subject: true, classId: true, teacherId: true, academicYear: true } },
          examSchedule: { select: { publishedAt: true } }, program: { select: programSelect } },
      });
      const assignment = session?.teachingAssignment;
      if (!session?.durationMinutes || session.status !== 'draft' || session.purpose !== 'regular' || session.examSchedule?.publishedAt)
        throw new ConflictException('Pilih draf ujian yang dapat direncanakan.');
      const program = session.program;
      if (!program && (!session.classId || !assignment || session.type !== 'sumatif' ||
          assignment.classId !== session.classId || assignment.teacherId !== session.teacherId ||
          assignment.academicYear !== session.academicYear))
        throw new ConflictException('Pilih draft sumatif berkelas, berdurasi, dan berpenugasan aktif.');
      if (program && (input.packageId !== program.packageId || input.makeupOfSessionId || input.agendaId))
        throw new BadRequestException('Pilih paket program yang tersimpan serta ruang dan proktor sesi.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, session);
      await this.assertScheduler(tx, user, program);
      const opensAt = new Date(input.opensAt), latestEntryAt = new Date(input.latestEntryAt), closesAt = new Date(input.closesAt);
      if (opensAt <= new Date()) throw new BadRequestException('Pilih waktu buka di masa depan.');
      const pkg = await tx.examPackage.findFirst({ where: {
        id: input.packageId, teacherId: session.teacherId, ...(assignment ? { subject: assignment.subject } : {}),
        ...(program ? { teacher: OPERATIONAL_TEACHER_WHERE, OR: [
          { teacher: { userId: program.ownerId } }, { sharedForPrograms: true },
        ] } : {}),
      }, select: { id: true, subject: true } });
      if (!pkg) throw new BadRequestException('Paket harus masih tersedia untuk pemilik sesi.');
      if (program) await this.assertProgramClasses(tx, program, session, pkg.subject);
      const proctorIds = input.proctorIds ?? [];
      if (proctorIds.length && await tx.user.count({ where: { id: { in: proctorIds }, ...examStaffWhere } }) !== proctorIds.length)
        throw new BadRequestException('Proktor harus staf aktif.');
      const makeup = input.makeupOfSessionId && input.participantIds;
      let candidates: Map<string, MakeupCandidate> | undefined;
      if (makeup && input.makeupOfSessionId) {
        const original = await tx.assessmentSession.findFirst({ where: {
          id: input.makeupOfSessionId, classId: session.classId, status: 'completed', gradeTarget: session.gradeTarget,
          semester: session.semester, academicYear: session.academicYear,
          teachingAssignmentId: session.teachingAssignmentId,
        }, select: { id: true } });
        if (!original) throw new BadRequestException('Sesi asal susulan harus selesai pada penugasan dan target nilai yang sama.');
        const eligible = await this.makeupCandidates(tx, original.id, makeup);
        if (makeup.some((id) => !eligible.has(id))) {
          throw new ConflictException('Pilih peserta absen atau peserta dengan nilai awal di bawah KKTP resmi.');
        }
        candidates = eligible;
      }
      const classFilter = program ? { in: program.classes.map(({ classId }) => classId) } : session.classId;
      const roster = await tx.student.findMany({ where: { classId: classFilter, deletedAt: null, status: 'active',
        user: { isActive: true, deletedAt: null }, ...(input.participantIds ? { id: { in: input.participantIds } } : {}) },
        select: { id: true, classId: true }, take: 501 });
      if (!roster.length || roster.length > 500 || (input.participantIds && roster.length !== input.participantIds.length))
        throw new BadRequestException('Rombel atau peserta susulan tidak valid.');
      const placements = new Map(input.roomAssignments?.flatMap(({ slotId, studentIds }) =>
        studentIds.map((studentId) => [studentId, slotId] as const)) ?? []);
      let room = input.room ?? '';
      let cohortGrade: number | null = null;
      if (input.agendaId) {
        if (!session.class?.isActive || session.class.academicYear !== session.academicYear ||
          placements.size !== roster.length || roster.some(({ id }) => !placements.has(id)))
          throw new BadRequestException('Tempatkan setiap peserta rombel tepat satu kali.');
        cohortGrade = session.class.grade;
        const slots = await this.validatePlacement(tx, sessionId, input.agendaId, cohortGrade, session, opensAt, closesAt, placements, false);
        room = (slots.length === 1 ? slots[0]?.room : null) ?? 'Beberapa ruang';
      }
      const roomKey = examRoomKey(room);
      if (!roomKey || roomKey.length > 80) throw new BadRequestException('Nama ruang tidak valid.');
      const values = { packageId: pkg.id, room, roomKey, agendaId: input.agendaId ?? null, cohortGrade,
        opensAt, latestEntryAt, closesAt, makeupOfSessionId: input.makeupOfSessionId ?? null };
      await tx.examSchedule.upsert({ where: { sessionId }, create: { sessionId, ...values }, update: values });
      await tx.examProctor.deleteMany({ where: { sessionId } });
      if (proctorIds.length) await tx.examProctor.createMany({ data: proctorIds.map((userId) => ({ sessionId, userId })) });
      await tx.examParticipant.deleteMany({ where: { sessionId } });
      await tx.examParticipant.createMany({ data: roster.map(({ id, classId }) => {
        const item = candidates?.get(id);
        return { sessionId, studentId: id, ...(program ? { rosterClassId: classId } : {}),
          roomSlotId: placements.get(id) ?? null, makeupSourceGradeId: item?.gradeId,
          makeupGradeSnapshot: item?.snapshot };
      }) });
      await this.audit(tx, user, sessionId, 'exam.plan', { opensAt: input.opensAt, closesAt: input.closesAt, participantCount: roster.length });
      return tx.examSchedule.findUniqueOrThrow({ where: { sessionId }, select: examWindowSelect });
    };
    return transaction ? operation(transaction) : this.db.$transaction(operation);
  }

  private async validatePlacement(tx: Prisma.TransactionClient, sessionId: string, agendaId: string, cohortGrade: number,
    period: { academicYear: string; semester: number }, opensAt: Date, closesAt: Date,
    placements: ReadonlyMap<string, string>, publishing: boolean) {
    const slotIds = [...new Set(placements.values())];
    const schedule = await tx.examAgenda.findFirst({ where: { id: agendaId,
      academicYear: period.academicYear, semester: period.semester,
      opensAt: { lte: opensAt }, closesAt: { gte: closesAt },
      proctors: { some: { grade: cohortGrade, user: examStaffWhere } },
    }, select: { id: true } });
    if (!schedule) throw new ConflictException('Agenda atau proktor aktif untuk angkatan belum sesuai.');
    const slots = await tx.examRoomSlot.findMany({ where: { id: { in: slotIds }, agendaId,
      opensAt: { lte: opensAt }, closesAt: { gte: closesAt }, supervisor: examStaffWhere },
      select: { id: true, room: true, capacity: true } });
    if (slots.length !== slotIds.length) throw new ConflictException('Slot atau Pengawas Ruang tidak sesuai.');
    const assigned = await tx.examParticipant.findMany({ where: { roomSlotId: { in: slotIds },
      schedule: { sessionId: { not: sessionId }, publishedAt: { not: null }, cancelledAt: null } },
      select: { roomSlotId: true, studentId: true }, take: 15_001 });
    const occupied = new Map(slotIds.map((id) => [id, new Set<string>()]));
    for (const row of assigned) {
      if (row.roomSlotId) occupied.get(row.roomSlotId)?.add(row.studentId);
    }
    for (const [studentId, slotId] of placements) {
      const people = occupied.get(slotId);
      if (!people || people.has(studentId)) throw new ConflictException('Peserta sudah memiliki tempat di slot ini.');
      people.add(studentId);
    }
    if (assigned.length > 15_000 || slots.some(({ id, capacity }) => occupied.get(id)!.size > capacity))
      throw new ConflictException('Jumlah peserta melebihi kapasitas ruang.');
    if (publishing) {
      const prior = await tx.examSchedule.findFirst({ where: { agendaId: null, publishedAt: { not: null }, cancelledAt: null,
        opensAt: { lt: closesAt }, closesAt: { gt: opensAt }, roomKey: { in: slots.map(({ room }) => examRoomKey(room)) },
      }, select: { sessionId: true } });
      if (prior) throw new ConflictException('Slot bertabrakan dengan jadwal lama.');
    }
    return slots;
  }

  async publish(sessionId: string, user: AuthUser, transaction?: Prisma.TransactionClient) {
    const operation = async (tx: Prisma.TransactionClient) => {
      await this.lock(tx, sessionId);
      const draft = await tx.examSchedule.findUnique({
        where: { sessionId }, include: { session: { include: { class: { select: { grade: true, academicYear: true, isActive: true } },
          program: { select: programSelect } } }, package: { include: { teacher: { select: { userId: true } } } }, participants: {
          select: { studentId: true, rosterClassId: true, roomSlotId: true, makeupSourceGradeId: true, makeupGradeSnapshot: true,
            student: { select: { deletedAt: true, classId: true, status: true,
            user: { select: { isActive: true, deletedAt: true } } } } },
        }, proctors: { select: { userId: true, user: { select: { isActive: true, deletedAt: true, staff: { select: { deletedAt: true } } } } } } },
      });
      if (!draft || draft.cancelledAt) throw new NotFoundException('Rencana ujian belum tersedia.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, draft.session);
      const program = draft.session.program;
      await this.assertScheduler(tx, user, program);
      if (draft.publishedAt) return tx.examSchedule.findUniqueOrThrow({ where: { sessionId }, select: examWindowSelect });
      if (draft.opensAt <= new Date() || draft.session.status !== 'draft')
        throw new ConflictException('Status atau waktu ujian berubah. Periksa kembali rencana.');
      const programClasses = new Set(program?.classes.map(({ classId }) => classId));
      const students = draft.participants.filter(({ student, rosterClassId }) => (program
        ? Boolean(rosterClassId && rosterClassId === student.classId && programClasses.has(rosterClassId))
        : student.classId === draft.session.classId) &&
        student.status === 'active' && !student.deletedAt && student.user.isActive && !student.user.deletedAt);
      const currentCount = draft.makeupOfSessionId ? students.length : await tx.student.count({
        where: { classId: program ? { in: [...programClasses] } : draft.session.classId, status: 'active', deletedAt: null,
          user: { isActive: true, deletedAt: null } },
      });
      if (students.length !== draft.participants.length || !students.length ||
          currentCount !== students.length ||
          draft.proctors.some(({ user }) => !user.isActive || user.deletedAt || user.staff?.deletedAt !== null))
        throw new ConflictException('Daftar peserta atau proktor berubah. Simpan ulang rencana.');
      if (draft.makeupOfSessionId) {
        const studentIds = students.map(({ studentId }) => studentId);
        const candidates = await this.makeupCandidates(tx, draft.makeupOfSessionId, studentIds);
        for (const participant of students) {
          const candidate = candidates.get(participant.studentId);
          const stored = participant.makeupSourceGradeId ? readMakeupGradeSnapshot(participant.makeupGradeSnapshot) : null;
          if (!candidate || participant.makeupSourceGradeId !== (candidate.gradeId ?? null) ||
              (stored && (stored.originalGradeVersion !== candidate.snapshot?.originalGradeVersion ||
                stored.kktp !== candidate.snapshot?.kktp || stored.provenance !== candidate.snapshot?.provenance))) {
            throw new ConflictException('Data peserta, nilai awal, atau KKTP berubah. Simpan ulang rencana susulan.');
          }
        }
        const scheduledAgain = await tx.examSchedule.findFirst({
          where: { sessionId: { not: sessionId }, publishedAt: { not: null }, cancelledAt: null,
            makeupOfSessionId: draft.makeupOfSessionId,
            participants: { some: { studentId: { in: studentIds } } } },
          select: { sessionId: true },
        });
        if (scheduledAgain) throw new ConflictException('Sebagian peserta sudah terdaftar pada jadwal susulan ujian ini.');
      }
      if (draft.agendaId) {
        if (!draft.session.class?.isActive || draft.cohortGrade !== draft.session.class.grade ||
          draft.session.class.academicYear !== draft.session.academicYear || students.some(({ roomSlotId }) => !roomSlotId)) {
          throw new ConflictException('Angkatan atau penempatan peserta telah berubah.');
        }
        await this.validatePlacement(tx, sessionId, draft.agendaId, draft.cohortGrade!, draft.session, draft.opensAt, draft.closesAt,
          new Map(students.map(({ studentId, roomSlotId }) => [studentId, roomSlotId!])), true);
      } else {
        const roomReserved = await tx.examRoomSlot.findFirst({ where: {
          opensAt: { lt: draft.closesAt }, closesAt: { gt: draft.opensAt }, OR: [
            { roomKey: draft.roomKey }, { supervisorId: { in: draft.proctors.map(({ userId }) => userId) } },
          ],
        }, select: { id: true } });
        if (roomReserved) throw new ConflictException('Waktu ruang atau Pengawas bertabrakan dengan slot agenda.');
      }
      const conflict = await tx.examSchedule.findFirst({ where: {
        sessionId: { not: sessionId }, publishedAt: { not: null }, cancelledAt: null,
        opensAt: { lt: draft.closesAt }, closesAt: { gt: draft.opensAt },
        OR: [
          ...(!draft.agendaId ? [
            { agendaId: null, roomKey: draft.roomKey },
            { proctors: { some: { userId: { in: draft.proctors.map(({ userId }) => userId) } } } },
          ] : []),
          { participants: { some: { studentId: { in: students.map(({ studentId }) => studentId) } } } },
        ],
      }, select: { sessionId: true } });
      if (conflict) throw new ConflictException('Jadwal bertabrakan dengan ruang, peserta, atau proktor yang sama.');
      const assignmentId = draft.session.teachingAssignmentId;
      const classId = draft.session.classId;
      if (draft.package.teacherId !== draft.session.teacherId || (!program && (!classId || !assignmentId)))
        throw new ConflictException('Penugasan ujian berubah. Periksa kembali rencana.');
      if (program) {
        if (program.packageId !== draft.packageId || (!draft.package.sharedForPrograms && draft.package.teacher.userId !== program.ownerId))
          throw new ConflictException('Paket program tidak lagi tersedia untuk pemiliknya.');
        await this.assertProgramClasses(tx, program, draft.session, draft.package.subject);
      }
      const activated = await tx.assessmentSession.updateMany({ where: {
        id: sessionId,
        status: 'draft',
        classId,
        teachingAssignmentId: assignmentId,
        teacher: OPERATIONAL_TEACHER_WHERE,
        ...(!program ? { teachingAssignment: { is: {
          classId: classId!, teacherId: draft.session.teacherId,
          subject: draft.package.subject, academicYear: draft.session.academicYear,
        } } } : {}),
      }, data: {
        status: 'active', dueAt: draft.closesAt, questions: draft.package.questions as Prisma.InputJsonValue,
      } });
      if (activated.count !== 1) throw new ConflictException('Penugasan atau guru ujian sudah berubah. Periksa kembali rencana.');
      await this.audit(tx, user, sessionId, 'exam.publish', { before: 'draft', after: 'published', packageId: draft.packageId });
      return tx.examSchedule.update({ where: { sessionId }, data: { publishedAt: new Date() }, select: examWindowSelect });
    };
    return transaction ? operation(transaction) : this.db.$transaction(operation);
  }

  async recordIncident(sessionId: string, input: ExamIncidentInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const where: Prisma.ExamScheduleWhereInput = { sessionId, publishedAt: { not: null }, cancelledAt: null };
      await acquireIdentityMutationLock(tx);
      const managerRole = user.roles.some((role) => managerRoles.includes(role));
      const canManage = managerRole && await this.hasManagerAuthority(user, tx);
      if (!canManage) {
        if (input.kind === 'school') throw new ForbiddenException('Insiden sekolah memerlukan panitia.');
        where.OR = [
          { proctors: { some: { user: { keycloakId: user.keycloakId, ...examStaffWhere } } } },
          ...(input.kind === 'device' ? this.cohortScope(user.keycloakId) : []),
        ];
      }
      const schedule = await tx.examSchedule.findFirst({ where, select: { agendaId: true } });
      if (!schedule) {
        if (managerRole && !canManage) throw new ForbiddenException('Kewenangan melaporkan insiden tidak berlaku untuk sesi ini.');
        throw new NotFoundException('Insiden hanya untuk sesi dalam cakupan Anda.');
      }
      if (schedule.agendaId && input.kind === 'room')
        throw new BadRequestException('Catat gangguan pada ruang fisik di Operasional Ujian.');
      return tx.examIncident.create({ data: { sessionId, ...input, createdBy: user.keycloakId },
        select: { id: true, kind: true, reason: true, createdAt: true } });
    });
  }


  async transferDevice(sessionId: string, input: TransferDeviceInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const period = await tx.examSchedule.findUnique({ where: { sessionId },
        select: { session: { select: { academicYear: true, semester: true } } } });
      if (!period) throw new NotFoundException('Sesi di luar mandat Proktor.');
      await this.periods.assertWritablePeriodWithSharedCutoverLock(tx, period.session);
      await acquireIdentityMutationLock(tx);
      const schedule = await tx.examSchedule.findFirst({ where: { sessionId, OR: this.cohortScope(user.keycloakId, true) },
        select: { closesAt: true, opensAt: true, session: { select: { status: true, durationMinutes: true } } } });
      if (!schedule) throw new NotFoundException('Sesi di luar mandat Proktor.');
      const student = await tx.examParticipant.findFirst({ where: { sessionId, studentId: input.studentId,
        roomSlotId: input.slotId, student: { status: 'active', deletedAt: null, user: { isActive: true, deletedAt: null } },
      }, select: { studentId: true } });
      if (!student) throw new NotFoundException('Peserta tidak berada di ruang dan sesi yang dipilih.');
      await tx.$queryRaw`SELECT student_id FROM academic.exam_participants
        WHERE session_id = ${sessionId}::uuid AND student_id = ${input.studentId}::uuid FOR UPDATE`;
      const current = await tx.examParticipant.findUniqueOrThrow({
        where: { sessionId_studentId: { sessionId, studentId: input.studentId } },
        select: { deviceVersion: true, deviceHash: true, extraMinutes: true },
      });
      const previous = await tx.auditLog.findFirst({ where: {
        actorId: user.keycloakId, resourceId: sessionId, action: 'exam.device.transfer',
        metadata: { path: ['intentId'], equals: input.intentId },
      }, select: { metadata: true } });
      const deviceHash = examDeviceHash(input.newDeviceId);
      if (previous) {
        const metadata = previous.metadata;
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
          metadata.studentId === input.studentId && metadata.slotId === input.slotId &&
          metadata.reason === input.reason && metadata.before === input.expectedVersion &&
          current.deviceVersion === input.expectedVersion + 1 && current.deviceHash === deviceHash) {
          return { deviceVersion: current.deviceVersion };
        }
        throw new ConflictException('Permintaan transfer berbeda atau tidak lagi mutakhir.');
      }
      const attempt = await tx.assessmentResponse.findUnique({
        where: { sessionId_studentId: { sessionId, studentId: input.studentId } },
        select: { startedAt: true, submittedAt: true },
      });
      const now = new Date();
      if (schedule.session.status !== 'active' || now < schedule.opensAt || !attempt?.startedAt || attempt.submittedAt ||
        !schedule.session.durationMinutes ||
        now >= examDeadline(schedule.closesAt, attempt.startedAt, schedule.session.durationMinutes, current.extraMinutes))
        throw new ConflictException('Attempt belum mulai, sudah terkirim, atau waktunya habis.');
      if (!current.deviceHash || current.deviceHash === deviceHash || current.deviceVersion !== input.expectedVersion)
        throw new ConflictException('Perangkat atau versi penugasan berubah. Muat ulang rincian.');
      const result = await tx.examParticipant.update({
        where: { sessionId_studentId: { sessionId, studentId: input.studentId } },
        data: { deviceVersion: { increment: 1 }, deviceHash }, select: { deviceVersion: true },
      });
      await this.audit(tx, user, sessionId, 'exam.device.transfer', {
        intentId: input.intentId, studentId: input.studentId, slotId: input.slotId, reason: input.reason,
        before: current.deviceVersion, after: result.deviceVersion,
      });
      return result;
    });
  }

  async cancel(sessionId: string, reason: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      await this.assertManager(tx, user);
      const schedule = await tx.examSchedule.findUnique({ where: { sessionId },
        select: { cancelledAt: true, session: { select: { status: true, academicYear: true, semester: true } } } });
      if (!schedule) throw new NotFoundException('Jadwal ujian tidak tersedia.');
      if (schedule.cancelledAt) return { cancelledAt: schedule.cancelledAt };
      await this.periods.assertWritablePeriodWithCutoverLock(tx, schedule.session);
      const started = await tx.assessmentResponse.count({ where: { sessionId, startedAt: { not: null } } });
      if (started || !['draft', 'active'].includes(schedule.session.status)) {
        throw new ConflictException('Gunakan catatan insiden bila peserta sudah memulai ujian.');
      }
      const cancelledAt = new Date();
      await tx.assessmentSession.update({ where: { id: sessionId }, data: { status: 'cancelled' } });
      await tx.examSchedule.update({ where: { sessionId }, data: { cancelledAt } });
      await this.audit(tx, user, sessionId, 'exam.cancel', { before: schedule.session.status, after: 'cancelled', reason });
      return { cancelledAt };
    });
  }

  async decide(sessionId: string, incidentId: string, input: ExamDecision, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      await this.assertManager(tx, user);
      const incident = await tx.examIncident.findFirst({
        where: { id: incidentId, sessionId, resolvedAt: null, schedule: { cancelledAt: null } },
        select: { id: true, kind: true, createdBy: true, schedule: { select: {
          closesAt: true, session: { select: { status: true } },
        } } },
      });
      if (!incident) throw new ConflictException('Insiden telah diputuskan atau tidak tersedia.');
      if ((incident.kind !== 'device' || input.studentIds.length > 1) && incident.createdBy === user.keycloakId)
        throw new ForbiddenException('Keputusan kelompok memerlukan petugas kedua.');
      const roster = await tx.examParticipant.findMany({ where: { sessionId, studentId: { in: input.studentIds } },
        select: { studentId: true, extraMinutes: true, deviceVersion: true } });
      if (roster.length !== input.studentIds.length) throw new BadRequestException('Peserta berada di luar sesi.');
      if (input.decision === 'extra_time' && roster.some((entry) => entry.extraMinutes + input.extraMinutes! > 120))
        throw new ConflictException('Akumulasi tambahan waktu melebihi 120 menit.');
      if (input.decision === 'extra_time' || input.decision === 'transfer') {
        if (incident.schedule.session.status !== 'active' || incident.schedule.closesAt <= new Date())
          throw new ConflictException('Jendela ujian sudah ditutup. Gunakan tindak lanjut susulan bila diperlukan.');
        const count = await tx.assessmentResponse.count({ where: { sessionId, studentId: { in: input.studentIds },
          submittedAt: { not: null } } });
        if (count) throw new ConflictException('Jawaban yang sudah terkirim tidak dapat dibuka kembali.');
        await tx.examParticipant.updateMany({ where: { sessionId, studentId: { in: input.studentIds } },
          data: input.decision === 'extra_time' ? { extraMinutes: { increment: input.extraMinutes } }
            : { deviceHash: examDeviceHash(input.newDeviceId!), deviceVersion: { increment: 1 } } });
      }
      await this.audit(tx, user, sessionId, 'exam.incident.resolve', {
        incidentId, before: roster, decision: input.decision, reason: input.reason,
        after: roster.map((entry) => ({ ...entry,
          extraMinutes: entry.extraMinutes + (input.extraMinutes ?? 0),
          deviceVersion: entry.deviceVersion + (input.decision === 'transfer' ? 1 : 0),
        })),
      });
      return tx.examIncident.update({ where: { id: incident.id }, data: {
        decision: input.decision, decisionNote: input.reason, resolvedBy: user.keycloakId, resolvedAt: new Date(),
      } });
    });
  }
}
