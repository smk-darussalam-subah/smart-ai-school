import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import {
  isGuruOnly,
  resolveTeacherId,
} from '../common/helpers/role-helpers';
import {
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClassSessionReasonActionDto,
  ClassSessionTransitionDto,
  ListClassSessionQuery,
  ReassignClassSessionDto,
  RecoverClassSessionDto,
} from './class-session.dto';

const MATERIALIZE_LOCK = 'operational:class-session:materialize:v1';
export const CLASS_SESSION_ALERT_OFFSETS = {
  PRIVATE_T5: 5,
  ROOM_T10: 10,
  ESCALATION_T15: 15,
} as const;

export function classSessionAlertDueAt(startAt: Date, stage: keyof typeof CLASS_SESSION_ALERT_OFFSETS) {
  return new Date(startAt.getTime() + CLASS_SESSION_ALERT_OFFSETS[stage] * 60_000);
}
const SESSION_SELECT = {
  id: true,
  scheduleId: true,
  serviceDate: true,
  academicYearId: true,
  semesterId: true,
  classId: true,
  teachingAssignmentId: true,
  scheduledTeacherId: true,
  assignedTeacherId: true,
  classNameSnapshot: true,
  subjectSnapshot: true,
  scheduledTeacherName: true,
  assignedTeacherName: true,
  roomSnapshot: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  status: true,
  version: true,
  startedAt: true,
  completedAt: true,
  missedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  reassignedAt: true,
  reassignmentReason: true,
  lateByMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ClassSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bells: BellScheduleService,
  ) {}

  async list(query: ListClassSessionQuery, user: AuthUser) {
    const where: Prisma.ClassSessionWhereInput = {};
    if (query.date) where.serviceDate = this.asDate(query.date);
    if (query.from || query.until) {
      where.serviceDate = {
        ...(query.from ? { gte: this.asDate(query.from) } : {}),
        ...(query.until ? { lte: this.asDate(query.until) } : {}),
      };
    }
    if (query.status) where.status = query.status;

    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      where.academicYearId = scope.academicYearId;
      where.class = kaprogClassWhere(scope);
      if (query.classId) {
        const allowed = await this.prisma.class.count({ where: { id: query.classId, ...kaprogClassWhere(scope) } });
        if (!allowed) return { data: [], total: 0, page: query.page, limit: query.limit };
        where.classId = query.classId;
      }
    } else if (isGuruOnly(user)) {
      const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      where.assignedTeacherId = teacherId;
      if (query.teacherId && query.teacherId !== teacherId) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      if (query.classId) where.classId = query.classId;
    } else {
      if (query.classId) where.classId = query.classId;
      if (query.teacherId) where.assignedTeacherId = query.teacherId;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.classSession.findMany({
        where,
        select: SESSION_SELECT,
        orderBy: [{ serviceDate: 'desc' }, { scheduledStartAt: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.classSession.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async materialize(date: string, actorId = 'system') {
    const dateValue = this.asDate(date);
    const dayOfWeek = this.dayOfWeek(date);
    if (dayOfWeek === 0) return { date, createdCount: 0, totalCount: 0, suppressed: 'SUNDAY' };

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${MATERIALIZE_LOCK}), hashtext(${date}))`);
      const period = await this.resolvePeriod(tx, dateValue);
      const holiday = await tx.academicCalendar.findFirst({
        where: {
          academicYearId: period.academicYear.id,
          type: 'holiday',
          startDate: { lte: dateValue },
          endDate: { gte: dateValue },
        },
        select: { id: true },
      });
      if (holiday) return { date, createdCount: 0, totalCount: 0, suppressed: 'HOLIDAY' };

      const bell = await this.bells.resolveForDate(dateValue, 'SCHOOL', tx);
      const schedules = await tx.schedule.findMany({
        where: {
          academicYear: period.academicYear.code,
          semester: period.semester.number,
          dayOfWeek,
        },
        select: {
          id: true,
          classId: true,
          teachingAssignmentId: true,
          jpStart: true,
          jpEnd: true,
          room: true,
          class: { select: { name: true } },
          teachingAssignment: {
            select: {
              teacherId: true,
              subject: true,
              academicYear: true,
              classId: true,
              teacher: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: [{ jpStart: 'asc' }, { classId: 'asc' }],
      });

      const rows: Prisma.ClassSessionCreateManyInput[] = schedules.map((schedule) => {
        if (
          schedule.teachingAssignment.classId !== schedule.classId
          || schedule.teachingAssignment.academicYear !== period.academicYear.code
        ) {
          throw new ServiceUnavailableException('Jadwal memiliki TeachingAssignment yang tidak authoritative');
        }
        const window = this.bells.resolveInstructionWindow(date, bell, schedule.jpStart, schedule.jpEnd);
        return {
          scheduleId: schedule.id,
          serviceDate: dateValue,
          academicYearId: period.academicYear.id,
          semesterId: period.semester.id,
          bellScheduleProfileId: bell.id,
          classId: schedule.classId,
          teachingAssignmentId: schedule.teachingAssignmentId,
          scheduledTeacherId: schedule.teachingAssignment.teacherId,
          assignedTeacherId: schedule.teachingAssignment.teacherId,
          classNameSnapshot: schedule.class.name,
          subjectSnapshot: schedule.teachingAssignment.subject,
          scheduledTeacherName: schedule.teachingAssignment.teacher.user.fullName,
          assignedTeacherName: schedule.teachingAssignment.teacher.user.fullName,
          roomSnapshot: schedule.room,
          scheduledStartAt: window.startAt,
          scheduledEndAt: window.endAt,
        };
      });

      const created = rows.length > 0
        ? await tx.classSession.createMany({ data: rows, skipDuplicates: true })
        : { count: 0 };
      const sessions = schedules.length > 0
        ? await tx.classSession.findMany({
            where: { scheduleId: { in: schedules.map((schedule) => schedule.id) }, serviceDate: dateValue },
            select: { id: true, scheduledStartAt: true },
          })
        : [];
      if (sessions.length > 0) {
        await tx.classSessionEvent.createMany({
          data: sessions.map((session) => ({
            sessionId: session.id,
            eventType: 'MATERIALIZED',
            eventKey: `class-session:materialized:${session.id}`,
            actorType: actorId === 'system' ? 'SYSTEM' : 'USER',
            actorId: actorId === 'system' ? null : actorId,
            metadata: { source: 'schedule+active-period+bell-profile' },
          })),
          skipDuplicates: true,
        });
        await tx.classSessionAlert.createMany({
          data: sessions.flatMap((session) => ([
            { sessionId: session.id, stage: 'PRIVATE_T5' as const, dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'PRIVATE_T5') },
            { sessionId: session.id, stage: 'ROOM_T10' as const, dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'ROOM_T10') },
            { sessionId: session.id, stage: 'ESCALATION_T15' as const, dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'ESCALATION_T15') },
          ])),
          skipDuplicates: true,
        });
      }
      return { date, createdCount: created.count, totalCount: sessions.length, suppressed: null };
    });
  }

  async start(id: string, dto: ClassSessionTransitionDto, user: AuthUser, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, id);
      const session = await this.findTransitionSession(tx, id);
      this.assertOwnSession(session, user);
      const identity = this.transitionIdentity('start', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) {
        throw new ConflictException('Sesi tidak dapat dimulai dari status saat ini');
      }
      const earliest = this.addMinutes(session.scheduledStartAt, -10);
      if (now < earliest) throw new ConflictException('Sesi baru dapat dimulai 10 menit sebelum jadwal');
      if (now > session.scheduledEndAt) throw new ConflictException('Jendela mulai sesi sudah berakhir');
      const lateByMinutes = Math.max(0, Math.floor((now.getTime() - session.scheduledStartAt.getTime()) / 60_000));
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['SCHEDULED', 'REASSIGNED'] } },
        data: { status: 'STARTED', startedAt: now, startedBy: user.keycloakId, lateByMinutes, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id, eventType: 'STARTED', eventKey: identity.eventKey,
          actorType: 'USER', actorId: user.keycloakId,
          metadata: { requestFingerprint: identity.requestFingerprint, lateByMinutes },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_STARTED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async complete(id: string, dto: ClassSessionTransitionDto, user: AuthUser, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, id);
      const session = await this.findTransitionSession(tx, id);
      this.assertOwnSession(session, user);
      const identity = this.transitionIdentity('complete', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (session.status !== 'STARTED') throw new ConflictException('Hanya sesi yang sudah dimulai dapat diselesaikan');
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: 'STARTED' },
        data: { status: 'COMPLETED', completedAt: now, completedBy: user.keycloakId, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id, eventType: 'COMPLETED', eventKey: identity.eventKey,
          actorType: 'USER', actorId: user.keycloakId,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_COMPLETED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async cancel(id: string, dto: ClassSessionReasonActionDto, user: AuthUser, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, id);
      const session = await this.findTransitionSession(tx, id);
      const identity = this.transitionIdentity('cancel', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(session.status)) {
        throw new ConflictException('Sesi terminal tidak dapat dibatalkan');
      }
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] } },
        data: {
          status: 'CANCELLED', cancelledAt: now, cancelledBy: user.keycloakId,
          cancellationReason: dto.reason, version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id, eventType: 'CANCELLED', eventKey: identity.eventKey,
          actorType: 'USER', actorId: user.keycloakId, reason: dto.reason,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_CANCELLED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async reassign(id: string, dto: ReassignClassSessionDto, user: AuthUser, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, id);
      const session = await this.findTransitionSession(tx, id);
      const identity = this.transitionIdentity('reassign', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) {
        throw new ConflictException('Hanya sesi yang belum dimulai dapat dialihkan');
      }
      const replacement = await tx.teacher.findFirst({
        where: {
          id: dto.teacherId,
          deletedAt: null,
          assignments: {
            some: {
              classId: session.classId,
              subject: session.subjectSnapshot,
              academicYear: session.academicYear.code,
            },
          },
        },
        select: { id: true, user: { select: { fullName: true } } },
      });
      if (!replacement) throw new BadRequestException('Guru pengganti tidak memiliki TeachingAssignment authoritative yang sesuai');
      if (replacement.id === session.assignedTeacherId) {
        throw new BadRequestException('Guru pengganti harus berbeda dari guru yang sedang ditugaskan');
      }
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['SCHEDULED', 'REASSIGNED'] } },
        data: {
          status: 'REASSIGNED', assignedTeacherId: replacement.id,
          assignedTeacherName: replacement.user.fullName,
          reassignedAt: now, reassignedBy: user.keycloakId,
          reassignmentReason: dto.reason, version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id, eventType: 'REASSIGNED', eventKey: identity.eventKey,
          actorType: 'USER', actorId: user.keycloakId, reason: dto.reason,
          metadata: {
            requestFingerprint: identity.requestFingerprint,
            assignedTeacherChanged: true,
          },
        },
      });
      await this.rebaseAlertsForReassignment(tx, id, now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async recover(id: string, dto: RecoverClassSessionDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSession(tx, id);
      const session = await this.findTransitionSession(tx, id);
      const identity = this.transitionIdentity('recover', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (!['MISSED', 'CANCELLED'].includes(session.status)) {
        throw new ConflictException('Recovery hanya tersedia untuk sesi MISSED atau CANCELLED');
      }
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['MISSED', 'CANCELLED'] } },
        data: {
          status: dto.targetStatus,
          missedAt: null, cancelledAt: null, cancelledBy: null, cancellationReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id, eventType: 'RECOVERED', eventKey: identity.eventKey,
          actorType: 'USER', actorId: user.keycloakId, reason: dto.reason,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await tx.classSessionAlert.updateMany({
        where: { sessionId: id },
        data: {
          status: 'PENDING', claimToken: null, claimedAt: null, leaseUntil: null,
          dispatchedAt: null, cancelledAt: null, cancellationReason: null,
        },
      });
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  private async resolvePeriod(tx: Prisma.TransactionClient, date: Date) {
    const years = await tx.academicYear.findMany({ where: { isActive: true }, take: 2 });
    const semesters = await tx.semester.findMany({ where: { isActive: true }, take: 2 });
    if (years.length !== 1 || semesters.length !== 1 || semesters[0]!.academicYearId !== years[0]!.id) {
      throw new ServiceUnavailableException('Periode akademik aktif tidak tunggal atau tidak konsisten');
    }
    const academicYear = years[0]!;
    const semester = semesters[0]!;
    if (date < academicYear.startDate || date > academicYear.endDate || date < semester.startDate || date > semester.endDate) {
      throw new ServiceUnavailableException('Tanggal berada di luar periode akademik aktif');
    }
    return { academicYear, semester };
  }

  private async findTransitionSession(tx: Prisma.TransactionClient, id: string) {
    const session = await tx.classSession.findUnique({
      where: { id },
      include: {
        assignedTeacher: { select: { user: { select: { keycloakId: true } } } },
        academicYear: { select: { code: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesi pembelajaran tidak ditemukan');
    return session;
  }

  private assertOwnSession(
    session: { assignedTeacher: { user: { keycloakId: string } } },
    user: AuthUser,
  ) {
    if (session.assignedTeacher.user.keycloakId !== user.keycloakId) {
      throw new ForbiddenException('Guru hanya dapat mengelola sesi authoritative miliknya');
    }
  }

  private async findReplay(
    tx: Prisma.TransactionClient,
    identity: { eventKey: string; sessionId: string; actorId: string; requestFingerprint: string },
  ) {
    const event = await tx.classSessionEvent.findUnique({
      where: { eventKey: identity.eventKey },
      select: { sessionId: true, actorId: true, metadata: true },
    });
    if (!event) return null;
    const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
      ? event.metadata as Prisma.JsonObject
      : {};
    if (
      event.sessionId !== identity.sessionId
      || event.actorId !== identity.actorId
      || metadata.requestFingerprint !== identity.requestFingerprint
    ) {
      throw new ConflictException('Idempotency key sudah digunakan untuk permintaan lain');
    }
    return event
      ? tx.classSession.findUniqueOrThrow({ where: { id: identity.sessionId }, select: SESSION_SELECT })
      : null;
  }

  private transitionIdentity(
    action: 'start' | 'complete' | 'cancel' | 'reassign' | 'recover',
    sessionId: string,
    actorId: string,
    dto: ClassSessionTransitionDto | ClassSessionReasonActionDto | ReassignClassSessionDto | RecoverClassSessionDto,
  ) {
    const eventScope = JSON.stringify({ action, actorId, idempotencyKey: dto.idempotencyKey });
    const payload = 'teacherId' in dto
      ? { reason: dto.reason, teacherId: dto.teacherId }
      : 'targetStatus' in dto
        ? { reason: dto.reason, targetStatus: dto.targetStatus }
        : 'reason' in dto
          ? { reason: dto.reason }
          : {};
    const request = JSON.stringify({ action, sessionId, actorId, payload });
    return {
      eventKey: `class-session:${action}:${this.sha256(eventScope)}`,
      sessionId,
      actorId,
      requestFingerprint: this.sha256(request),
    };
  }

  private async lockSession(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM academic.class_sessions WHERE id = ${id}::uuid FOR UPDATE`);
  }

  private async lockTransitionIdentity(tx: Prisma.TransactionClient, eventKey: string) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`);
  }

  private async cancelAlerts(tx: Prisma.TransactionClient, sessionId: string, reason: string, now: Date) {
    await tx.classSessionAlert.updateMany({
      where: { sessionId, status: { in: ['PENDING', 'CLAIMED'] } },
      data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, claimToken: null, leaseUntil: null },
    });
    await tx.classSessionAlertDelivery.updateMany({
      where: { alert: { sessionId }, status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
  }

  private async rebaseAlertsForReassignment(
    tx: Prisma.TransactionClient,
    sessionId: string,
    now: Date,
  ) {
    const alerts = await tx.classSessionAlert.findMany({
      where: { sessionId },
      select: { id: true, stage: true, status: true, dueAt: true },
    });
    const reset = alerts.filter((alert) => (
      alert.stage === 'PRIVATE_T5'
      || alert.status === 'PENDING'
      || alert.status === 'CLAIMED'
      || alert.status === 'CANCELLED'
    ));
    const resetIds = reset.map((alert) => alert.id);
    if (resetIds.length === 0) return;

    await tx.notificationLog.updateMany({
      where: {
        refType: 'class_session_alert',
        refId: { in: resetIds },
        status: 'pending',
      },
      data: { status: 'failed', error: 'SESSION_REASSIGNED' },
    });
    await tx.classSessionAlertDelivery.updateMany({
      where: {
        alertId: { in: resetIds },
        status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] },
      },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await tx.classSessionAlertDelivery.deleteMany({
      where: { alertId: { in: resetIds }, status: 'CANCELLED' },
    });
    for (const alert of reset) {
      await tx.classSessionAlert.update({
        where: { id: alert.id },
        data: {
          status: 'PENDING',
          dueAt: alert.dueAt < now ? now : alert.dueAt,
          claimToken: null,
          claimedAt: null,
          leaseUntil: null,
          dispatchedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        },
      });
    }
  }

  private asDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dayOfWeek(value: string) {
    return new Date(`${value}T12:00:00.000+07:00`).getUTCDay();
  }

  private addMinutes(value: Date, minutes: number) {
    return new Date(value.getTime() + minutes * 60_000);
  }

  private sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
