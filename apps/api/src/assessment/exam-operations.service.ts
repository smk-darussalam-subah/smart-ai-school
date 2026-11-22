import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { acquireIdentityMutationLock, assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import type { CohortProctorInput, ExamAgendaInput, ExamSlotInput } from './exam-contract';

export const examRoomKey = (room: string) => room.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export const examStaffWhere = {
  isActive: true, deletedAt: null, staff: { is: { deletedAt: null } },
  role: { in: ['GURU', 'TATA_USAHA'] },
} satisfies Prisma.UserWhereInput;

export function lockExamPlanning(tx: Prisma.TransactionClient) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('exam-schedule:planning', 0))`;
}

const STAFF_PAGE_SIZE = 30;
const academicsRoles = ['SUPER_ADMIN', 'WAKA_KURIKULUM', 'KEPALA_SEKOLAH'];
const canReadSchool = (user: AuthUser) => user.roles.some((role) => academicsRoles.includes(role));
const incidentSelect = {
  id: true, slotId: true, reason: true, createdAt: true, decision: true, decisionNote: true, resolvedAt: true,
} satisfies Prisma.ExamRoomIncidentSelect;
const agendaSelect = {
  id: true, title: true, academicYear: true, semester: true, opensAt: true, closesAt: true,
} satisfies Prisma.ExamAgendaSelect;
const slotSelect = {
  id: true, room: true, opensAt: true, closesAt: true, capacity: true, supervisorId: true, readyAt: true,
  agendaId: true, supervisor: { select: { fullName: true, isActive: true, deletedAt: true,
    staff: { select: { deletedAt: true } } } },
} satisfies Prisma.ExamRoomSlotSelect;

@Injectable()
export class ExamOperationsService {
  constructor(private readonly db: PrismaService, private readonly permissions: PermissionsService,
    private readonly periods: AcademicPeriodService) {}

  private assertManager(tx: Prisma.TransactionClient, user: AuthUser) {
    return assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
      'academic.schedule.edit', ['SUPER_ADMIN'], ['WAKA_KURIKULUM']);
  }

  private async audit(tx: Prisma.TransactionClient, user: AuthUser, id: string, action: string, metadata: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { action, actorId: user.keycloakId, actorRoles: user.roles,
      resourceId: id, resourceType: 'ExamOperations', method: 'POST', path: '/exam-schedule/operations',
      statusCode: 200, outcome: 'success', metadata } });
  }

  private async getAgenda(tx: Prisma.TransactionClient, id: string) {
    const agenda = await tx.examAgenda.findUnique({ where: { id }, select: agendaSelect });
    if (!agenda) throw new NotFoundException('Agenda ujian tidak ditemukan.');
    return agenda;
  }

  private async assertStaff(tx: Prisma.TransactionClient, userId: string) {
    if (!await tx.user.findFirst({ where: { id: userId, ...examStaffWhere }, select: { id: true } }))
      throw new BadRequestException('Pilih staf aktif yang berwenang.');
  }

  async agendas(day: string, user: AuthUser) {
    const start = new Date(day + 'T00:00:00+07:00');
    const end = new Date(start.getTime() + 86_400_000);
    const identity = { keycloakId: user.keycloakId, ...examStaffWhere };
    return this.db.examAgenda.findMany({ where: {
      opensAt: { lt: end }, closesAt: { gt: start },
      ...(canReadSchool(user) ? {} : { OR: [
        { proctors: { some: { user: identity } } },
        { slots: { some: { opensAt: { lt: end }, closesAt: { gt: start }, supervisor: identity } } },
      ] }),
    }, select: { ...agendaSelect, proctors: { where: canReadSchool(user) ? {} : { user: identity },
      select: { grade: true } } }, orderBy: [{ opensAt: 'asc' }, { id: 'asc' }], take: 60 });
  }

  async createAgenda(input: ExamAgendaInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      await this.periods.assertWritablePeriodWithCutoverLock(tx, input);
      await this.assertManager(tx, user);
      const { opensAt, closesAt, ...values } = input;
      if (Date.parse(closesAt) <= Date.now()) throw new BadRequestException('Agenda sudah lewat.');
      const result = await tx.examAgenda.create({ data: { ...values, opensAt: new Date(opensAt), closesAt: new Date(closesAt) },
        select: agendaSelect });
      await this.audit(tx, user, result.id, 'exam.agenda.create', input);
      return result;
    });
  }

  async assignCohort(agendaId: string, input: CohortProctorInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      const agenda = await this.getAgenda(tx, agendaId);
      await this.periods.assertWritablePeriodWithCutoverLock(tx, agenda);
      await this.assertManager(tx, user);
      if (agenda.closesAt <= new Date()) throw new ConflictException('Agenda sudah selesai.');
      await this.assertStaff(tx, input.userId);
      const overlap = await tx.examCohortProctor.findFirst({ where: { userId: input.userId,
        OR: [{ agendaId, grade: { not: input.grade } }, { agendaId: { not: agendaId },
          agenda: { opensAt: { lt: agenda.closesAt }, closesAt: { gt: agenda.opensAt } } }],
      }, select: { grade: true } });
      if (overlap) throw new ConflictException('Proktor sudah ditugaskan pada angkatan atau agenda yang beririsan.');
      const key = { agendaId, grade: input.grade };
      const before = await tx.examCohortProctor.findUnique({ where: { agendaId_grade: key },
        select: { userId: true, canTransfer: true } });
      const after = await tx.examCohortProctor.upsert({
        where: { agendaId_grade: key }, create: { agendaId, ...input },
        update: { userId: input.userId, canTransfer: input.canTransfer },
        select: { grade: true, userId: true, canTransfer: true },
      });
      await this.audit(tx, user, agendaId, 'exam.cohort.assign', { grade: input.grade, before, after });
      return after;
    });
  }

  private async assertSlotConflictFree(tx: Prisma.TransactionClient, roomKey: string, supervisorId: string,
    opensAt: Date, closesAt: Date, omitId?: string) {
    const [slot, legacy] = await Promise.all([
      tx.examRoomSlot.findFirst({ where: { ...(omitId ? { id: { not: omitId } } : {}),
        opensAt: { lt: closesAt }, closesAt: { gt: opensAt }, OR: [{ roomKey }, { supervisorId }],
      }, select: { id: true } }),
      tx.examSchedule.findFirst({ where: { agendaId: null, publishedAt: { not: null }, cancelledAt: null,
        opensAt: { lt: closesAt }, closesAt: { gt: opensAt },
        OR: [{ roomKey }, { proctors: { some: { userId: supervisorId } } }],
      }, select: { sessionId: true } }),
    ]);
    if (slot || legacy) throw new ConflictException('Ruang fisik atau Pengawas Ruang sudah digunakan pada waktu tersebut.');
  }

  async createSlot(input: ExamSlotInput, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      const agenda = await this.getAgenda(tx, input.agendaId);
      await this.periods.assertWritablePeriodWithCutoverLock(tx, agenda);
      await this.assertManager(tx, user);
      const opensAt = new Date(input.opensAt);
      const closesAt = new Date(input.closesAt);
      if (opensAt <= new Date() || opensAt < agenda.opensAt || closesAt > agenda.closesAt)
        throw new BadRequestException('Waktu ruang harus mendatang dan berada di dalam agenda.');
      const roomKey = examRoomKey(input.room);
      if (!roomKey || roomKey.length > 80) throw new BadRequestException('Nama ruang tidak valid.');
      await this.assertStaff(tx, input.supervisorId);
      await this.assertSlotConflictFree(tx, roomKey, input.supervisorId, opensAt, closesAt);
      const result = await tx.examRoomSlot.create({ data: { ...input, opensAt, closesAt, roomKey }, select: slotSelect });
      await this.audit(tx, user, result.id, 'exam.room.create', { agendaId: agenda.id, roomKey, capacity: input.capacity });
      return result;
    });
  }

  async replaceSupervisor(slotId: string, supervisorId: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      const slot = await tx.examRoomSlot.findUnique({ where: { id: slotId }, include: { agenda: true } });
      if (!slot) throw new NotFoundException('Ruang ujian tidak ditemukan.');
      await this.periods.assertWritablePeriodWithCutoverLock(tx, slot.agenda);
      await this.assertManager(tx, user);
      if (slot.closesAt <= new Date()) throw new ConflictException('Pemakaian ruang sudah selesai.');
      if (slot.supervisorId === supervisorId) return tx.examRoomSlot.findUniqueOrThrow({ where: { id: slotId }, select: slotSelect });
      await this.assertStaff(tx, supervisorId);
      await this.assertSlotConflictFree(tx, slot.roomKey, supervisorId, slot.opensAt, slot.closesAt, slotId);
      const result = await tx.examRoomSlot.update({ where: { id: slotId }, data: { supervisorId, readyAt: null }, select: slotSelect });
      await this.audit(tx, user, slotId, 'exam.room.handover', { before: slot.supervisorId, after: supervisorId });
      return result;
    });
  }

  async searchStaff({ q, cursor }: { q: string; cursor?: string }, user: AuthUser) {
    const admin = user.roles.includes('SUPER_ADMIN');
    if (!admin && !await this.permissions.hasFreshPermission(user.keycloakId, 'academic.schedule.edit', this.db))
      throw new ForbiddenException('Pencarian petugas memerlukan izin pengelolaan jadwal.');
    const rows = await this.db.user.findMany({
      where: { ...examStaffWhere, ...(q ? { fullName: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, fullName: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: STAFF_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, STAFF_PAGE_SIZE);
    return { rows: page, nextCursor: rows.length > STAFF_PAGE_SIZE ? page.at(-1)?.id : null };
  }

  async roster(sessionId: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await this.assertManager(tx, user);
      const session = await tx.assessmentSession.findFirst({ where: {
        id: sessionId, status: 'draft', purpose: 'regular', type: 'sumatif', classId: { not: null },
      }, select: { classId: true } });
      if (!session?.classId) throw new NotFoundException('Draf ujian berkelas tidak tersedia.');
      return tx.student.findMany({ where: { classId: session.classId, status: 'active', deletedAt: null,
        user: { isActive: true, deletedAt: null } }, select: { id: true, user: { select: { fullName: true } } },
        orderBy: [{ user: { fullName: 'asc' } }, { id: 'asc' }], take: 501 });
    });
  }

  async overview(agendaId: string, day: string, user: AuthUser) {
    const start = new Date(day + 'T00:00:00+07:00');
    const end = new Date(start.getTime() + 86_400_000);
    const identity = { keycloakId: user.keycloakId, ...examStaffWhere };
    const agenda = await this.getAgenda(this.db, agendaId);
    const school = canReadSchool(user);
    const mandates = await this.db.examCohortProctor.findMany({ where: { agendaId,
      ...(school ? {} : { user: identity }) },
      select: { grade: true, canTransfer: true, user: { select: { id: true, fullName: true } } } });
    const ownMandate = school ? await this.db.examCohortProctor.findFirst({ where: { agendaId, user: identity },
      select: { grade: true, canTransfer: true } }) : mandates[0];
    const ownGrade = school ? undefined : ownMandate?.grade;
    const transferGrade = ownMandate?.canTransfer ? ownMandate.grade : null;
    const windows = { opensAt: { lt: end }, closesAt: { gt: start } };
    const slots = await this.db.examRoomSlot.findMany({ where: { agendaId, ...windows,
      ...(school ? {} : { OR: [{ supervisor: identity }, ...(ownGrade ? [{ assignments: { some: {
        schedule: { agendaId, cohortGrade: ownGrade, publishedAt: { not: null }, cancelledAt: null },
      } } }] : [])] }),
    }, select: {
      ...slotSelect,
      supervisor: { select: { ...slotSelect.supervisor.select, keycloakId: true, role: true } },
      incidents: { select: incidentSelect, orderBy: { createdAt: 'desc' }, take: 5 },
    },
      orderBy: [{ opensAt: 'asc' }, { room: 'asc' }, { id: 'asc' }], take: 120 });
    if (!school && !mandates.length && !slots.length) throw new NotFoundException('Agenda tidak tersedia untuk penugasan Anda.');
    // Aggregate rows only. Individual names and responses stay behind room detail.
    const counts = slots.length ? await this.db.$queryRaw<{
      slotId: string; grade: number; registered: number; working: number; submitted: number;
    }[]>(Prisma.sql`
      SELECT ep.room_slot_id AS "slotId", es.cohort_grade AS grade, count(*)::int AS registered,
        count(*) FILTER (WHERE ar.started_at IS NOT NULL AND ar.submitted_at IS NULL)::int AS working,
        count(*) FILTER (WHERE ar.submitted_at IS NOT NULL)::int AS submitted
      FROM academic.exam_participants ep
      JOIN academic.exam_schedules es ON es.session_id = ep.session_id
      LEFT JOIN academic.assessment_responses ar ON ar.session_id = ep.session_id AND ar.student_id = ep.student_id
      WHERE es.agenda_id = ${agendaId}::uuid AND es.published_at IS NOT NULL AND es.cancelled_at IS NULL
        AND ep.room_slot_id IN (${Prisma.join(slots.map(({ id }) => Prisma.sql`${id}::uuid`))})
      GROUP BY ep.room_slot_id, es.cohort_grade
    `) : [];
    const bySlot = new Map<string, typeof counts>();
    for (const row of counts) {
      const group = bySlot.get(row.slotId) ?? [];
      group.push(row);
      bySlot.set(row.slotId, group);
    }
    const canManage = user.roles.includes('SUPER_ADMIN') || (user.roles.includes('WAKA_KURIKULUM') &&
      await this.permissions.hasFreshPermission(user.keycloakId, 'academic.schedule.edit', this.db));
    return { agenda, ownGrade, transferGrade, mandates, canManage, asOf: new Date(), slots: slots.map(({ supervisor, ...slot }) => {
      const supervisorActive = supervisor.isActive && !supervisor.deletedAt && supervisor.staff?.deletedAt === null &&
        examStaffWhere.role.in.some((role) => role === supervisor.role);
      const isSupervisor = supervisorActive && supervisor.keycloakId === user.keycloakId;
      const groups = bySlot.get(slot.id) ?? [];
      return { ...slot, supervisorName: supervisor.fullName, supervisorActive,
        readyAllowed: isSupervisor, canReport: isSupervisor, mixed: groups.length > 1,
        canReadParticipants: school || Boolean(ownGrade && groups.some(({ grade }) => grade === ownGrade)),
        groups: school || isSupervisor ? groups : groups.filter(({ grade }) => grade === ownGrade) };
    }) };
  }

  async roomDetail(slotId: string, user: AuthUser) {
    const slot = await this.db.examRoomSlot.findUnique({ where: { id: slotId }, select: { id: true, agendaId: true } });
    if (!slot) throw new NotFoundException('Ruang tidak tersedia.');
    const school = canReadSchool(user);
    const mandate = await this.db.examCohortProctor.findFirst({ where: { agendaId: slot.agendaId,
      user: { keycloakId: user.keycloakId, ...examStaffWhere } }, select: { grade: true, canTransfer: true } });
    if (!school && !mandate) throw new NotFoundException('Rincian peserta hanya tersedia sesuai penugasan angkatan.');
    const rows = await this.db.$queryRaw<{
      sessionId: string; studentId: string; fullName: string; title: string; className: string; grade: number;
      startedAt: Date | null; submittedAt: Date | null; lastSavedAt: Date | null;
      lastHeartbeatAt: Date | null; lateSubmissionStatus: string | null; deviceVersion: number;
    }[]>(Prisma.sql`
      SELECT ep.session_id AS "sessionId", ep.student_id AS "studentId", u.full_name AS "fullName",
        a.title, c.name AS "className", es.cohort_grade AS grade, ep.device_version AS "deviceVersion",
        ar.started_at AS "startedAt", ar.submitted_at AS "submittedAt", ar.last_saved_at AS "lastSavedAt",
        ar.last_heartbeat_at AS "lastHeartbeatAt", ar.late_submission_status AS "lateSubmissionStatus"
      FROM academic.exam_participants ep
      JOIN academic.exam_schedules es ON es.session_id = ep.session_id
      JOIN academic.assessment_sessions a ON a.id = ep.session_id
      JOIN academic.classes c ON c.id = a.class_id
      JOIN student.students st ON st.id = ep.student_id
      JOIN auth.users u ON u.id = st.user_id
      LEFT JOIN academic.assessment_responses ar ON ar.session_id = ep.session_id AND ar.student_id = ep.student_id
      WHERE ep.room_slot_id = ${slotId}::uuid AND es.agenda_id = ${slot.agendaId}::uuid
        AND es.published_at IS NOT NULL AND es.cancelled_at IS NULL
        ${!school && mandate ? Prisma.sql`AND es.cohort_grade = ${mandate.grade}
          AND EXISTS (SELECT 1 FROM academic.exam_cohort_proctors cp JOIN auth.users proctor ON proctor.id = cp.user_id
            JOIN school.staff stf ON stf.user_id = proctor.id
            WHERE cp.agenda_id = es.agenda_id AND cp.grade = es.cohort_grade
              AND proctor.keycloak_id = ${user.keycloakId}::uuid AND proctor.is_active AND proctor.deleted_at IS NULL
              AND stf.deleted_at IS NULL)` : Prisma.empty}
      ORDER BY c.name, u.full_name, ep.student_id
    `);
    if (!school && !rows.length) throw new NotFoundException('Ruang tidak memuat peserta dalam penugasan Anda.');
    const participants = rows.map((row) => ({
      ...row, canTransfer: mandate?.canTransfer === true && row.grade === mandate.grade,
    }));
    return { rows: participants, canTransfer: participants.some((row) => row.canTransfer), asOf: new Date() };
  }

  private async supervisedSlot(tx: Prisma.TransactionClient, slotId: string, user: AuthUser) {
    await acquireIdentityMutationLock(tx);
    const slot = await tx.examRoomSlot.findFirst({ where: { id: slotId,
      supervisor: { keycloakId: user.keycloakId, ...examStaffWhere } }, select: slotSelect });
    if (!slot) throw new NotFoundException('Ruang tidak tersedia untuk Pengawas ini.');
    return slot;
  }

  async roomReady(slotId: string, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      const slot = await this.supervisedSlot(tx, slotId, user);
      if (slot.closesAt <= new Date()) throw new ConflictException('Pemakaian ruang sudah selesai.');
      if (slot.readyAt) return { readyAt: slot.readyAt };
      const readyAt = new Date();
      await tx.examRoomSlot.update({ where: { id: slotId }, data: { readyAt } });
      await this.audit(tx, user, slotId, 'exam.room.ready', { readyAt: readyAt.toISOString() });
      return { readyAt };
    });
  }

  async reportRoom(slotId: string, input: { intentId: string; reason: string }, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      const slot = await this.supervisedSlot(tx, slotId, user);
      const key = { slotId, createdBy: user.keycloakId, intentId: input.intentId };
      const previous = await tx.examRoomIncident.findUnique({ where: { slotId_createdBy_intentId: key }, select: incidentSelect });
      if (previous) {
        if (previous.reason !== input.reason) throw new ConflictException('Isi catatan berbeda dari pengiriman sebelumnya.');
        return previous;
      }
      if (slot.closesAt <= new Date()) throw new ConflictException('Pemakaian ruang sudah selesai.');
      const open = await tx.examRoomIncident.findFirst({ where: { slotId, resolvedAt: null }, select: { id: true } });
      if (open) throw new ConflictException('Satu insiden ruang masih terbuka. Periksa catatan yang sudah ada.');
      if (!await tx.examParticipant.findFirst({ where: { roomSlotId: slotId,
        schedule: { publishedAt: { not: null }, cancelledAt: null } }, select: { studentId: true } }))
        throw new ConflictException('Belum ada jadwal terbit di ruang ini.');
      const incident = await tx.examRoomIncident.create({ data: { ...key, reason: input.reason }, select: incidentSelect });
      await this.audit(tx, user, slotId, 'exam.room.incident', { incidentId: incident.id });
      return incident;
    });
  }

  async resolveRoom(slotId: string, incidentId: string, input: { decision: 'resume' | 'makeup'; reason: string }, user: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await lockExamPlanning(tx);
      await this.assertManager(tx, user);
      const current = await tx.examRoomIncident.findFirst({ where: { id: incidentId, slotId },
        select: { id: true, createdBy: true, resolvedAt: true, resolvedBy: true, decision: true, decisionNote: true } });
      if (!current) throw new NotFoundException('Insiden ruang tidak ditemukan.');
      if (current.createdBy === user.keycloakId) throw new ForbiddenException('Keputusan ruang memerlukan petugas kedua.');
      if (current.resolvedAt) {
        if (current.resolvedBy === user.keycloakId && current.decision === input.decision && current.decisionNote === input.reason)
          return tx.examRoomIncident.findUniqueOrThrow({ where: { id: current.id }, select: incidentSelect });
        throw new ConflictException('Insiden ruang sudah diputuskan.');
      }
      const result = await tx.examRoomIncident.update({ where: { id: incidentId },
        data: { decision: input.decision, decisionNote: input.reason, resolvedAt: new Date(), resolvedBy: user.keycloakId },
        select: incidentSelect });
      await this.audit(tx, user, slotId, 'exam.room.resolve', { incidentId, decision: input.decision, reason: input.reason });
      return result;
    });
  }

}
