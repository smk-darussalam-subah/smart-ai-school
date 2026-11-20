import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { resolveKktpThreshold } from '../academic/kktp-resolver';
import { assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { OPERATIONAL_TEACHER_WHERE } from '../common/helpers/operational-teacher';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseSnapshotQuestions, secureMatchingSnapshot } from './assessment-runtime';
import { ExamDecision, ExamIncidentInput, ExamList, ExamPlan } from './exam-contract';
import { readMakeupGradeSnapshot, type ExamMakeupGradeSnapshot } from './exam-makeup-grade';
import { examDeadline, examDeviceHash } from './scheduled-exam-runtime';

const managerRoles = ['SUPER_ADMIN', 'WAKA_KURIKULUM'];
type MakeupCandidate = { fullName: string; gradeId?: string; snapshot?: ExamMakeupGradeSnapshot };
const examWindowSelect = {
  sessionId: true, room: true, opensAt: true, latestEntryAt: true, closesAt: true,
  publishedAt: true, cancelledAt: true, makeupOfSessionId: true,
  package: { select: { id: true, title: true, version: true, subject: true } },
  session: { select: { title: true, durationMinutes: true, status: true, academicYear: true, semester: true, class: { select: { name: true } },
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
      { publishedAt: { not: null }, proctors: { some: { user: { ...identity, staff: { is: { deletedAt: null } } } } } },
    ] };
  }

  private async lock(tx: Prisma.TransactionClient, sessionId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('exam-schedule:planning', 0))`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'assessment-session:' + sessionId}, 0))`);
  }

  private assertManager(tx: Prisma.TransactionClient, user: AuthUser) {
    return assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
      'academic.schedule.edit', ['SUPER_ADMIN'], ['WAKA_KURIKULUM']);
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
      select: examWindowSelect,
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
    return { rows: page.map((row) => ({ ...row, counts: stats.get(row.sessionId) })),
      asOf: new Date(), nextCursor: rows.length > input.limit ? page.at(-1)?.sessionId : null };
  }

  async monitor(sessionId: string, user: AuthUser) {
    const schedule = await this.db.examSchedule.findFirst({
      where: { AND: [{ sessionId }, this.scope(user, true)] },
      select: { ...examWindowSelect, proctors: { where: { user: { keycloakId: user.keycloakId,
        isActive: true, deletedAt: null, staff: { is: { deletedAt: null } } } }, select: { userId: true } },
        participants: { select: { studentId: true, extraMinutes: true,
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
    return { ...data, canReport: Boolean(schedule.publishedAt && !schedule.cancelledAt &&
      (proctors.length || user.roles.some((role) => managerRoles.includes(role)))),
      asOf: new Date(), participants: schedule.participants.map((entry) => ({
      ...entry, response: states.get(entry.studentId) ?? null,
    })) };
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
      select: { startedAt: true, submittedAt: true, clientRevision: true, score: true },
    });
    const { closesAt, session } = participant.schedule;
    const deadline = response?.startedAt && session.durationMinutes
      ? examDeadline(closesAt, response.startedAt, session.durationMinutes, participant.extraMinutes) : closesAt;
    const now = new Date();
    return { state: response?.submittedAt ? 'submitted' : now >= deadline ? 'expired' : 'working',
      confirmedRevision: response?.clientRevision ?? null, score: response?.submittedAt ? response.score : null };
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

  async plan(sessionId: string, input: ExamPlan, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const session = await tx.assessmentSession.findUnique({
        where: { id: sessionId },
        select: { id: true, classId: true, teacherId: true, status: true, purpose: true, type: true,
          durationMinutes: true, gradeTarget: true, academicYear: true, semester: true, teachingAssignmentId: true,
          teachingAssignment: { select: { subject: true, classId: true, teacherId: true, academicYear: true } },
          examSchedule: { select: { publishedAt: true } } },
      });
      const assignment = session?.teachingAssignment;
      if (!session?.classId || !session.durationMinutes || !assignment || session.status !== 'draft' ||
          session.purpose !== 'regular' || session.type !== 'sumatif' || session.examSchedule?.publishedAt ||
          assignment.classId !== session.classId || assignment.teacherId !== session.teacherId ||
          assignment.academicYear !== session.academicYear)
        throw new ConflictException('Pilih draft sumatif berkelas, berdurasi, dan berpenugasan aktif.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, session);
      await this.assertManager(tx, user);
      const opensAt = new Date(input.opensAt), latestEntryAt = new Date(input.latestEntryAt), closesAt = new Date(input.closesAt);
      if (opensAt <= new Date()) throw new BadRequestException('Pilih waktu buka di masa depan.');
      const pkg = await tx.examPackage.findFirst({ where: {
        id: input.packageId, teacherId: session.teacherId, subject: assignment.subject,
      }, select: { id: true } });
      if (!pkg) throw new BadRequestException('Paket harus dari guru dan mapel yang sama.');
      const proctorCount = await tx.user.count({ where: { id: { in: input.proctorIds }, isActive: true, deletedAt: null,
        staff: { is: { deletedAt: null } }, role: { in: ['GURU', 'TATA_USAHA'] } } });
      if (proctorCount !== input.proctorIds.length) throw new BadRequestException('Proktor harus staf aktif.');
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
      const roster = await tx.student.findMany({ where: { classId: session.classId, deletedAt: null, status: 'active',
        user: { isActive: true, deletedAt: null }, ...(input.participantIds ? { id: { in: input.participantIds } } : {}) },
        select: { id: true }, take: 501 });
      if (!roster.length || roster.length > 500 || (input.participantIds && roster.length !== input.participantIds.length))
        throw new BadRequestException('Rombel atau peserta susulan tidak valid.');
      const values = { packageId: pkg.id, room: input.room, roomKey: input.room.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '),
        opensAt, latestEntryAt, closesAt, makeupOfSessionId: input.makeupOfSessionId ?? null };
      await tx.examSchedule.upsert({ where: { sessionId }, create: { sessionId, ...values }, update: values });
      await tx.examProctor.deleteMany({ where: { sessionId } });
      await tx.examProctor.createMany({ data: input.proctorIds.map((userId) => ({ sessionId, userId })) });
      await tx.examParticipant.deleteMany({ where: { sessionId } });
      await tx.examParticipant.createMany({ data: roster.map(({ id }) => {
        const item = candidates?.get(id);
        return { sessionId, studentId: id, makeupSourceGradeId: item?.gradeId,
          makeupGradeSnapshot: item?.snapshot };
      }) });
      await this.audit(tx, user, sessionId, 'exam.plan', { opensAt: input.opensAt, closesAt: input.closesAt, participantCount: roster.length });
      return tx.examSchedule.findUniqueOrThrow({ where: { sessionId }, select: examWindowSelect });
    });
  }

  async publish(sessionId: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const draft = await tx.examSchedule.findUnique({
        where: { sessionId }, include: { session: true, package: true, participants: {
          select: { studentId: true, makeupSourceGradeId: true, makeupGradeSnapshot: true,
            student: { select: { deletedAt: true, classId: true, status: true,
            user: { select: { isActive: true, deletedAt: true } } } } },
        }, proctors: { select: { userId: true, user: { select: { isActive: true, deletedAt: true, staff: { select: { deletedAt: true } } } } } } },
      });
      if (!draft || draft.cancelledAt) throw new NotFoundException('Rencana ujian belum tersedia.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, draft.session);
      await this.assertManager(tx, user);
      if (draft.publishedAt) return tx.examSchedule.findUniqueOrThrow({ where: { sessionId }, select: examWindowSelect });
      if (draft.opensAt <= new Date() || draft.session.status !== 'draft')
        throw new ConflictException('Status atau waktu ujian berubah. Periksa kembali rencana.');
      const students = draft.participants.filter(({ student }) => student.classId === draft.session.classId &&
        student.status === 'active' && !student.deletedAt && student.user.isActive && !student.user.deletedAt);
      const currentCount = draft.makeupOfSessionId ? students.length : await tx.student.count({
        where: { classId: draft.session.classId, status: 'active', deletedAt: null,
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
      const conflict = await tx.examSchedule.findFirst({ where: {
        sessionId: { not: sessionId }, publishedAt: { not: null }, cancelledAt: null,
        opensAt: { lt: draft.closesAt }, closesAt: { gt: draft.opensAt },
        OR: [
          { roomKey: draft.roomKey },
          { proctors: { some: { userId: { in: draft.proctors.map(({ userId }) => userId) } } } },
          { participants: { some: { studentId: { in: students.map(({ studentId }) => studentId) } } } },
        ],
      }, select: { sessionId: true } });
      if (conflict) throw new ConflictException('Jadwal bertabrakan dengan ruang, peserta, atau proktor yang sama.');
      const assignmentId = draft.session.teachingAssignmentId;
      const classId = draft.session.classId;
      if (!classId || !assignmentId || draft.package.teacherId !== draft.session.teacherId)
        throw new ConflictException('Penugasan ujian berubah. Periksa kembali rencana.');
      const activated = await tx.assessmentSession.updateMany({ where: {
        id: sessionId,
        status: 'draft',
        classId,
        teachingAssignmentId: assignmentId,
        teacher: OPERATIONAL_TEACHER_WHERE,
        teachingAssignment: { is: {
          classId, teacherId: draft.session.teacherId,
          subject: draft.package.subject, academicYear: draft.session.academicYear,
        } },
      }, data: {
        status: 'active', dueAt: draft.closesAt, questions: draft.package.questions as Prisma.InputJsonValue,
      } });
      if (activated.count !== 1) throw new ConflictException('Penugasan atau guru ujian sudah berubah. Periksa kembali rencana.');
      await this.audit(tx, user, sessionId, 'exam.publish', { before: 'draft', after: 'published', packageId: draft.packageId });
      return tx.examSchedule.update({ where: { sessionId }, data: { publishedAt: new Date() }, select: examWindowSelect });
    });
  }

  async recordIncident(sessionId: string, input: ExamIncidentInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, sessionId);
      const where: Prisma.ExamScheduleWhereInput = { sessionId, publishedAt: { not: null }, cancelledAt: null };
      if (user.roles.some((role) => managerRoles.includes(role))) await this.assertManager(tx, user);
      else {
        if (input.kind === 'school') throw new ForbiddenException('Insiden sekolah memerlukan panitia.');
        where.proctors = { some: { user: { keycloakId: user.keycloakId, isActive: true, deletedAt: null,
          staff: { is: { deletedAt: null } } } } };
      }
      if (!await tx.examSchedule.findFirst({ where, select: { sessionId: true } }))
        throw new NotFoundException('Insiden hanya untuk sesi dalam cakupan Anda.');
      return tx.examIncident.create({ data: { sessionId, ...input, createdBy: user.keycloakId },
        select: { id: true, kind: true, reason: true, createdAt: true } });
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
