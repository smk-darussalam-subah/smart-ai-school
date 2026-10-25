import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { isScheduleOperational } from '../schedule/schedule-validity';
import { resolveClassSessionReadScope } from './class-session-read-scope';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  acquireIdentityMutationLock,
  assertFreshMutationAuthority,
} from '../common/helpers/identity-mutation-lock';
import {
  isOperationalTeacher,
  lockOperationalTeachers,
  OPERATIONAL_TEACHER_SELECT,
  OPERATIONAL_TEACHER_WHERE,
} from '../common/helpers/operational-teacher';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import {
  lockSessionActivation,
  readSessionActivation,
  writeSessionActivation,
  sessionActivationBindingKey,
  sessionSchoolDate,
  sessionAlertSuppression,
  lockSessionInputs,
} from '../common/helpers/class-session-activation';
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

export function classSessionAlertDueAt(
  startAt: Date,
  stage: keyof typeof CLASS_SESSION_ALERT_OFFSETS,
) {
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
  academicYear: { select: { code: true } },
  semester: { select: { number: true } },
  schedule: { select: { jpStart: true, jpEnd: true } },
} as const;

@Injectable()
export class ClassSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bells: BellScheduleService,
    @Optional() private readonly permissions?: PermissionsService,
    @Optional() private readonly academicPeriod?: AcademicPeriodService,
  ) {}

  async list(query: ListClassSessionQuery, user: AuthUser) {
    const where: Prisma.ClassSessionWhereInput = {};
    if (query.id) where.id = query.id;
    if (query.academicYear) where.academicYear = { code: query.academicYear };
    if (query.semester) where.semester = { number: query.semester };
    if (query.date) where.serviceDate = this.asDate(query.date);
    if (query.from || query.until) {
      where.serviceDate = {
        ...(query.from ? { gte: this.asDate(query.from) } : {}),
        ...(query.until ? { lte: this.asDate(query.until) } : {}),
      };
    }
    if (query.status) where.status = query.status;

    if (!this.permissions)
      throw new ServiceUnavailableException('Kewenangan pembacaan sesi belum tersedia');
    const skip = (query.page - 1) * query.limit;
    const { data, total, currentUser } = await this.prisma.$transaction(
      async (tx) => {
        const access = await resolveClassSessionReadScope(tx, this.permissions!, user, query);
        const filtered: Prisma.ClassSessionWhereInput = { AND: [where, access.where] };
        const [data, total] = await Promise.all([
          tx.classSession.findMany({
            where: filtered,
            select: { ...SESSION_SELECT, assignedTeacher: { select: OPERATIONAL_TEACHER_SELECT } },
            orderBy: [{ serviceDate: 'desc' }, { scheduledStartAt: 'asc' }, { id: 'asc' }],
            skip,
            take: query.limit,
          }),
          tx.classSession.count({ where: filtered }),
        ]);
        return { data, total, currentUser: access.user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const configurations = new Map(
      await Promise.all(
        [...new Set(data.map((session) => session.semesterId))].map(
          async (semesterId) =>
            [semesterId, await readSessionActivation(this.prisma, semesterId)] as const,
        ),
      ),
    );
    const today = sessionSchoolDate(new Date());
    // Unavailable/closed current period must not hide an already-started session
    // that its still-authorized owner is allowed to finish.
    let activeSemesterId: string | null = null;
    if (data.length && this.academicPeriod) {
      try {
        activeSemesterId = await this.prisma.$transaction(async (tx) => {
          const period = await this.resolvePeriod(tx, this.asDate(today));
          await this.academicPeriod!.assertWritableSemesterId(tx, period.semester.id);
          return period.semester.id;
        });
      } catch {
        activeSemesterId = null;
      }
    }
    const keys = data.flatMap((session) => {
      const config = configurations.get(session.semesterId);
      return config?.enabled ? [sessionActivationBindingKey(session.id, config.revision)] : [];
    });
    const bindings = new Set(
      (keys.length
        ? await this.prisma.classSessionEvent.findMany({
            where: { eventKey: { in: keys } },
            select: { eventKey: true },
          })
        : []
      ).map((event) => event.eventKey),
    );
    return {
      data: data.map(({ assignedTeacher, ...session }) => {
        const config = configurations.get(session.semesterId);
        const ready =
          session.status === 'STARTED' ||
          (!!config?.enabled &&
            session.serviceDate.toISOString().slice(0, 10) === today &&
            session.semesterId === activeSemesterId &&
            bindings.has(sessionActivationBindingKey(session.id, config.revision)));
        return {
          ...session,
          operationBlockedReason:
            !ready && ['SCHEDULED', 'REASSIGNED'].includes(session.status)
              ? 'Sesi belum diaktifkan oleh pengelola jadwal.'
              : null,
          canOperate:
            ready &&
            currentUser.roles.includes('GURU') &&
            isOperationalTeacher(assignedTeacher) &&
            assignedTeacher.user.keycloakId === currentUser.keycloakId,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async materialize(
    date: string,
    actorId = 'system',
    preparation?: {
      preview?: boolean;
      expectedPlanHash?: string;
      activate?: boolean;
      daily?: boolean;
    },
    at?: Date,
  ) {
    const dateValue = this.asDate(date);
    const dayOfWeek = this.dayOfWeek(date);
    if (dayOfWeek === 0) {
      if (preparation && !preparation.daily)
        throw new ConflictException('Tidak ada pembelajaran pada hari Minggu. Pilih tanggal lain.');
      return { date, createdCount: 0, totalCount: 0, suppressed: 'SUNDAY', skippedExpiredCount: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${MATERIALIZE_LOCK}), hashtext(${date}))`,
      );
      // Bell and schedule writers use this lock. Acquire it before *all* inputs:
      // reading bell/period first can persist a stale snapshot after a writer commits.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
      );
      if (!this.academicPeriod)
        throw new ServiceUnavailableException('Periode penyiapan sesi belum dapat diverifikasi');
      await this.academicPeriod.acquireCutoverLock(tx);
      await lockSessionActivation(tx);
      if (preparation && !preparation.preview && !preparation.daily) {
        if (!this.permissions || actorId === 'system')
          throw new ForbiddenException('Kewenangan penyiapan sesi belum dapat diverifikasi');
        await this.assertTransitionAuthority(tx, { keycloakId: actorId });
      } else {
        // Preview and background preparation read the same lifecycle snapshot as
        // commit. Always acquire identity last, after schedule/cutover locks.
        await acquireIdentityMutationLock(tx);
      }
      const period = await this.resolvePeriod(tx, dateValue);
      await this.academicPeriod.assertWritableSemesterId(tx, period.semester.id);
      let activation = await readSessionActivation(tx, period.semester.id);
      if (!preparation?.preview && !preparation?.activate && !activation?.enabled) {
        if (preparation && !preparation.daily)
          throw new ConflictException('Otomasi sesi belum diaktifkan untuk semester ini.');
        return {
          date,
          createdCount: 0,
          totalCount: 0,
          suppressed: 'ACTIVATION_DISABLED',
          skippedExpiredCount: 0,
        };
      }
      const holiday = await tx.academicCalendar.findFirst({
        where: {
          academicYearId: period.academicYear.id,
          type: { in: ['holiday', 'break'] },
          startDate: { lte: dateValue },
          endDate: { gte: dateValue },
        },
        select: { id: true },
      });
      if (holiday) {
        if (preparation && !preparation.daily)
          throw new ConflictException(
            'Tanggal ini merupakan hari libur. Pilih tanggal pembelajaran.',
          );
        return {
          date,
          createdCount: 0,
          totalCount: 0,
          suppressed: 'HOLIDAY',
          skippedExpiredCount: 0,
        };
      }

      const bell = await this.bells.resolveForDate(dateValue, 'SCHOOL', tx);
      const candidates = await tx.schedule.findMany({
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
          concurrencyGroup: { select: { mode: true, expiresOn: true } },
          class: { select: { name: true } },
          teachingAssignment: {
            select: {
              teacherId: true,
              subject: true,
              academicYear: true,
              classId: true,
              teacher: { select: OPERATIONAL_TEACHER_SELECT },
            },
          },
        },
        orderBy: [{ jpStart: 'asc' }, { classId: 'asc' }, { id: 'asc' }],
      });

      const schedules = candidates.filter((schedule) =>
        isScheduleOperational(schedule.concurrencyGroup, date),
      );
      const eligibleTeachers = await lockOperationalTeachers(
        tx,
        schedules.map((schedule) => schedule.teachingAssignment.teacherId),
      );
      const skippedExpiredCount = candidates.length - schedules.length;
      // A later account/assignment revocation must suppress that teacher's
      // daily preparation, not stop reminders for unrelated valid classes.
      const operationalSchedules = preparation?.daily
        ? schedules.filter(
            (schedule) =>
              eligibleTeachers.has(schedule.teachingAssignment.teacherId) &&
              isOperationalTeacher(schedule.teachingAssignment.teacher) &&
              schedule.teachingAssignment.classId === schedule.classId &&
              schedule.teachingAssignment.academicYear === period.academicYear.code,
          )
        : schedules;
      const allRows = operationalSchedules.map((schedule) => {
        if (
          !eligibleTeachers.has(schedule.teachingAssignment.teacherId) ||
          !isOperationalTeacher(schedule.teachingAssignment.teacher)
        ) {
          throw new ConflictException(
            'Penugasan guru pada jadwal tidak lagi aktif. Perbarui penugasan, lalu periksa kesiapan kembali.',
          );
        }
        if (
          schedule.teachingAssignment.classId !== schedule.classId ||
          schedule.teachingAssignment.academicYear !== period.academicYear.code
        ) {
          throw new ServiceUnavailableException(
            'Jadwal memiliki TeachingAssignment yang tidak authoritative',
          );
        }
        const window = this.bells.resolveInstructionWindow(
          date,
          bell,
          schedule.jpStart,
          schedule.jpEnd,
        );
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

      const now = at ?? new Date();
      if (preparation?.daily && date !== sessionSchoolDate(now))
        return {
          date,
          createdCount: 0,
          totalCount: 0,
          suppressed: 'DATE_CHANGED',
          skippedExpiredCount: 0,
        };
      if (preparation && !preparation.daily) {
        const today = new Date(now.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 10);
        const lastDate = new Date(new Date(today).getTime() + 14 * 86400_000)
          .toISOString()
          .slice(0, 10);
        if (date < today || date > lastDate)
          throw new BadRequestException('Pilih hari ini sampai 14 hari ke depan.');
        if (preparation.activate && date !== today)
          throw new BadRequestException('Aktivasi memakai tanggal hari ini di WIB.');
      }
      const rows: Prisma.ClassSessionCreateManyInput[] = allRows.filter(
        (row) => row.scheduledStartAt >= now,
      );
      if (preparation && !preparation.daily) {
        const existing = rows.length
          ? await tx.classSession.findMany({
              where: {
                scheduleId: { in: rows.map((row) => row.scheduleId!) },
                serviceDate: dateValue,
              },
              select: { scheduleId: true, status: true, version: true },
              orderBy: { scheduleId: 'asc' },
            })
          : [];
        const planHash = createHash('sha256')
          .update(
            JSON.stringify({
              date,
              rows,
              existing,
              activationRevision: activation?.revision ?? 0,
              activate: preparation.activate === true,
            }),
          )
          .digest('hex');
        if (preparation.preview)
          return {
            date,
            academicYear: period.academicYear.code,
            semester: period.semester.number,
            scheduledCount: allRows.length,
            eligibleCount: rows.length,
            existingCount: existing.length,
            newCount: rows.length - existing.length,
            skippedStartedCount: allRows.length - rows.length,
            skippedExpiredCount,
            firstStartAt: rows[0]?.scheduledStartAt ?? null,
            activation: {
              semesterId: period.semester.id,
              enabled: activation?.enabled ?? false,
              revision: activation?.revision ?? 0,
            },
            planHash,
          };
        if (preparation.expectedPlanHash !== planHash)
          throw new ConflictException(
            'Jadwal atau waktu telah berubah. Periksa kesiapan sekali lagi.',
          );
      }
      if (preparation?.activate)
        activation = await writeSessionActivation(
          tx,
          period.semester.id,
          true,
          activation?.revision ?? 0,
          actorId,
          now,
        );
      const created =
        rows.length > 0
          ? await tx.classSession.createMany({ data: rows, skipDuplicates: true })
          : { count: 0 };
      const preparedSessions =
        rows.length > 0
          ? await tx.classSession.findMany({
              where: {
                scheduleId: { in: rows.map((row) => row.scheduleId!) },
                serviceDate: dateValue,
              },
              select: {
                id: true,
                scheduleId: true,
                scheduledStartAt: true,
                scheduledEndAt: true,
                academicYearId: true,
                semesterId: true,
                bellScheduleProfileId: true,
                classId: true,
                teachingAssignmentId: true,
                assignedTeacherId: true,
                status: true,
              },
            })
          : [];
      const sessions: typeof preparedSessions = [];
      if (preparedSessions.length > 0) {
        const eligibleOwners = await lockOperationalTeachers(
          tx,
          preparedSessions.map((session) => session.assignedTeacherId),
        );
        for (const session of preparedSessions) {
          if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) {
            sessions.push(session);
            continue;
          }
          const row = rows.find((value) => value.scheduleId === session.scheduleId);
          if (
            !row ||
            !eligibleOwners.has(session.assignedTeacherId) ||
            row.classId !== session.classId ||
            row.teachingAssignmentId !== session.teachingAssignmentId ||
            row.semesterId !== session.semesterId ||
            row.academicYearId !== session.academicYearId ||
            row.bellScheduleProfileId !== session.bellScheduleProfileId ||
            new Date(row.scheduledStartAt).getTime() !== session.scheduledStartAt.getTime() ||
            new Date(row.scheduledEndAt).getTime() !== session.scheduledEndAt.getTime()
          ) {
            if (preparation?.daily) continue;
            throw new ConflictException(
              'Sesi yang sudah disiapkan tidak lagi sesuai jadwal atau guru aktif. Perbarui sesi sebelum mengaktifkan otomasi.',
            );
          }
          sessions.push(session);
        }
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
          data: sessions
            .filter((session) => ['SCHEDULED', 'REASSIGNED'].includes(session.status))
            .flatMap((session) => [
              {
                sessionId: session.id,
                stage: 'PRIVATE_T5' as const,
                dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'PRIVATE_T5'),
              },
              {
                sessionId: session.id,
                stage: 'ROOM_T10' as const,
                dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'ROOM_T10'),
              },
              {
                sessionId: session.id,
                stage: 'ESCALATION_T15' as const,
                dueAt: classSessionAlertDueAt(session.scheduledStartAt, 'ESCALATION_T15'),
              },
            ]),
          skipDuplicates: true,
        });
        const pending = sessions.filter((session) =>
          ['SCHEDULED', 'REASSIGNED'].includes(session.status),
        );
        if (activation && pending.length) {
          const unbound = [];
          for (const session of pending) {
            const binding = await tx.classSessionEvent.findUnique({
              where: { eventKey: sessionActivationBindingKey(session.id, activation.revision) },
              select: { id: true },
            });
            if (!binding) unbound.push(session.id);
          }
          if (unbound.length) {
            // Only future sessions reach this branch. Preserve historical alert
            // rows; rearm only alerts explicitly stopped by an earlier opt-out.
            await tx.classSessionAlert.updateMany({
              where: {
                sessionId: { in: unbound },
                status: 'CANCELLED',
                cancellationReason: 'ACTIVATION_DISABLED',
              },
              data: {
                status: 'PENDING',
                cancelledAt: null,
                cancellationReason: null,
                claimToken: null,
                claimedAt: null,
                leaseUntil: null,
              },
            });
            await tx.classSessionEvent.createMany({
              data: unbound.map((sessionId) => ({
                sessionId,
                eventType: 'ALERT_CREATED' as const,
                eventKey: sessionActivationBindingKey(sessionId, activation!.revision),
                actorType: actorId === 'system' ? ('SYSTEM' as const) : ('USER' as const),
                actorId: actorId === 'system' ? null : actorId,
                occurredAt: now,
                metadata: {
                  activationRevision: activation!.revision,
                  source: 'daily-session-activation',
                },
              })),
              skipDuplicates: true,
            });
          }
        }
      }
      return {
        date,
        createdCount: created.count,
        totalCount: sessions.length,
        suppressed: skippedExpiredCount ? 'EXPIRED_CONCURRENCY' : null,
        skippedExpiredCount,
        activation: {
          semesterId: period.semester.id,
          enabled: activation?.enabled ?? false,
          revision: activation?.revision ?? 0,
        },
      };
    });
  }

  /** Current period status; absence is an explicit non-active state, never auto-opt-in. */
  async activationStatus() {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.resolvePeriod(tx, this.asDate(sessionSchoolDate(new Date())));
      const config = await readSessionActivation(tx, period.semester.id);
      return {
        semesterId: period.semester.id,
        academicYear: period.academicYear.code,
        semester: period.semester.number,
        date: sessionSchoolDate(new Date()),
        enabled: config?.enabled ?? false,
        revision: config?.revision ?? 0,
        activatedAt: config?.activatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Existing API timer is the sole daily caller; no external scheduler or dependency. */
  prepareToday(at?: Date) {
    return this.materialize(sessionSchoolDate(at ?? new Date()), 'system', { daily: true }, at);
  }

  /** CAS opt-out, including pending queue/display intents, without touching started sessions. */
  async disableActivation(semesterId: string, expectedRevision: number, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
      );
      if (!this.academicPeriod)
        throw new ServiceUnavailableException('Periode belum dapat diverifikasi');
      await this.academicPeriod.acquireCutoverLock(tx);
      await lockSessionActivation(tx);
      await this.assertTransitionAuthority(tx, user);
      const period = await this.resolvePeriod(tx, this.asDate(sessionSchoolDate(new Date())));
      if (period.semester.id !== semesterId)
        throw new ConflictException('Semester berubah. Muat ulang status otomasi.');
      const now = new Date();
      const config = await writeSessionActivation(
        tx,
        semesterId,
        false,
        expectedRevision,
        user.keycloakId,
        now,
      );
      const alerts = await tx.classSessionAlert.findMany({
        where: { session: { semesterId }, status: { in: ['PENDING', 'CLAIMED', 'DISPATCHED'] } },
        select: { id: true },
      });
      const ids = alerts.map((alert) => alert.id);
      await tx.notificationLog.updateMany({
        where: { refType: 'class_session_alert', refId: { in: ids }, status: 'pending' },
        data: { status: 'failed', error: 'ACTIVATION_DISABLED' },
      });
      await tx.classSessionAlertDelivery.updateMany({
        where: { alertId: { in: ids }, status: { in: ['PENDING', 'DELIVERED', 'PLAYED'] } },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      await tx.classSessionAlert.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: 'ACTIVATION_DISABLED',
          claimToken: null,
          claimedAt: null,
          leaseUntil: null,
        },
      });
      return {
        semesterId,
        enabled: false,
        revision: config.revision,
        activatedAt: config.activatedAt?.toISOString() ?? null,
      };
    });
  }

  async start(id: string, dto: ClassSessionTransitionDto, user: AuthUser, at?: Date) {
    return this.prisma.$transaction(async (tx) => {
      if (!this.academicPeriod)
        throw new ServiceUnavailableException('Periode sesi belum dapat diverifikasi');
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
      );
      await this.academicPeriod.acquireCutoverLock(tx);
      await this.lockSession(tx, id);
      await lockSessionActivation(tx);
      const identity = this.transitionIdentity('start', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      await this.assertTransitionAuthority(tx, user, true);
      const session = await this.findTransitionSession(tx, id);
      await this.assertEligibleSessionTeacher(tx, session.assignedTeacherId);
      this.assertOwnSession(session, user);
      if (
        !isScheduleOperational(
          session.schedule?.concurrencyGroup,
          session.serviceDate.toISOString().slice(0, 10),
        )
      )
        throw new ConflictException(
          'Persetujuan jadwal bersamaan kedaluwarsa; sesi belum dapat dimulai.',
        );
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      // A queued HTTP request must use the clock at its serialization point,
      // not the time at which it first entered the service.
      const now = at ?? new Date();
      const activation = await readSessionActivation(tx, session.semesterId);
      if (!activation?.enabled)
        throw new ConflictException('Otomasi sesi sedang nonaktif. Hubungi pengelola jadwal.');
      if (
        !(await tx.classSessionEvent.findUnique({
          where: { eventKey: sessionActivationBindingKey(id, activation.revision) },
          select: { id: true },
        }))
      )
        throw new ConflictException(
          'Sesi ini belum disiapkan untuk aktivasi terbaru. Muat ulang daftar sesi.',
        );
      const period = await this.resolvePeriod(tx, this.asDate(sessionSchoolDate(now)));
      if (
        session.semesterId !== period.semester.id ||
        session.serviceDate.toISOString().slice(0, 10) !== sessionSchoolDate(now)
      )
        throw new ConflictException('Sesi bukan bagian dari jadwal hari ini pada semester aktif.');
      await this.academicPeriod.assertWritableSemesterId(tx, session.semesterId);
      if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) {
        throw new ConflictException('Sesi tidak dapat dimulai dari status saat ini');
      }
      const earliest = this.addMinutes(session.scheduledStartAt, -10);
      if (now < earliest)
        throw new ConflictException('Sesi baru dapat dimulai 10 menit sebelum jadwal');
      if (now >= session.scheduledEndAt)
        throw new ConflictException('Jendela mulai sesi sudah berakhir');
      if (await sessionAlertSuppression(tx, this.bells, session, now, 'start'))
        throw new ConflictException(
          'Sesi belum dapat dimulai. Periksa semester, hari pembelajaran, jadwal, dan guru aktif.',
        );
      const lateByMinutes = Math.max(
        0,
        Math.floor((now.getTime() - session.scheduledStartAt.getTime()) / 60_000),
      );
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['SCHEDULED', 'REASSIGNED'] } },
        data: {
          status: 'STARTED',
          startedAt: now,
          startedBy: user.keycloakId,
          lateByMinutes,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'STARTED',
          eventKey: identity.eventKey,
          actorType: 'USER',
          actorId: user.keycloakId,
          metadata: { requestFingerprint: identity.requestFingerprint, lateByMinutes },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_STARTED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async complete(id: string, dto: ClassSessionTransitionDto, user: AuthUser, at?: Date) {
    return this.prisma.$transaction(async (tx) => {
      await lockSessionInputs(tx);
      await this.lockSession(tx, id);
      const identity = this.transitionIdentity('complete', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      await this.assertTransitionAuthority(tx, user, true);
      const session = await this.findTransitionSession(tx, id);
      await this.assertEligibleSessionTeacher(tx, session.assignedTeacherId);
      this.assertOwnSession(session, user);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (session.status !== 'STARTED')
        throw new ConflictException('Hanya sesi yang sudah dimulai dapat diselesaikan');
      // Sample after all waiting locks and fresh ownership checks, just like start.
      const now = at ?? new Date();
      if (!session.startedAt || !Number.isFinite(now.getTime()) || now < session.startedAt)
        throw new ConflictException(
          'Waktu sesi tidak konsisten. Muat ulang atau hubungi pengelola jadwal.',
        );
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: 'STARTED' },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          completedBy: user.keycloakId,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'COMPLETED',
          eventKey: identity.eventKey,
          actorType: 'USER',
          actorId: user.keycloakId,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_COMPLETED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async cancel(id: string, dto: ClassSessionReasonActionDto, user: AuthUser, at?: Date) {
    return this.prisma.$transaction(async (tx) => {
      await lockSessionInputs(tx);
      await this.lockSession(tx, id);
      const identity = this.transitionIdentity('cancel', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      await this.assertTransitionAuthority(tx, user);
      const session = await this.findTransitionSession(tx, id);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(session.status)) {
        throw new ConflictException('Sesi terminal tidak dapat dibatalkan');
      }
      const now = at ?? new Date();
      const changed = await tx.classSession.updateMany({
        where: {
          id,
          version: session.version,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: user.keycloakId,
          cancellationReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'CANCELLED',
          eventKey: identity.eventKey,
          actorType: 'USER',
          actorId: user.keycloakId,
          reason: dto.reason,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await this.cancelAlerts(tx, id, 'SESSION_CANCELLED', now);
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  async reassign(id: string, dto: ReassignClassSessionDto, user: AuthUser, at?: Date) {
    return this.prisma.$transaction(async (tx) => {
      await lockSessionInputs(tx);
      await this.lockSession(tx, id);
      const identity = this.transitionIdentity('reassign', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      await this.assertTransitionAuthority(tx, user);
      const session = await this.findTransitionSession(tx, id);
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (!['SCHEDULED', 'REASSIGNED'].includes(session.status)) {
        throw new ConflictException('Hanya sesi yang belum dimulai dapat dialihkan');
      }
      await this.assertEligibleSessionTeacher(tx, dto.teacherId);
      const replacement = await tx.teacher.findFirst({
        where: {
          ...OPERATIONAL_TEACHER_WHERE,
          id: dto.teacherId,
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
      if (!replacement)
        throw new BadRequestException(
          'Guru pengganti harus aktif dan memiliki penugasan mengajar yang sesuai',
        );
      if (replacement.id === session.assignedTeacherId) {
        throw new BadRequestException(
          'Guru pengganti harus berbeda dari guru yang sedang ditugaskan',
        );
      }
      const now = at ?? new Date();
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['SCHEDULED', 'REASSIGNED'] } },
        data: {
          status: 'REASSIGNED',
          assignedTeacherId: replacement.id,
          assignedTeacherName: replacement.user.fullName,
          reassignedAt: now,
          reassignedBy: user.keycloakId,
          reassignmentReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'REASSIGNED',
          eventKey: identity.eventKey,
          actorType: 'USER',
          actorId: user.keycloakId,
          reason: dto.reason,
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
      await lockSessionInputs(tx);
      await this.lockSession(tx, id);
      const identity = this.transitionIdentity('recover', id, user.keycloakId, dto);
      await this.lockTransitionIdentity(tx, identity.eventKey);
      await this.assertTransitionAuthority(tx, user, false, true);
      const session = await this.findTransitionSession(tx, id);
      await this.assertEligibleSessionTeacher(tx, session.assignedTeacherId);
      if (!isOperationalTeacher(session.assignedTeacher)) {
        throw new ConflictException(
          'Guru yang ditugaskan tidak lagi aktif. Perbarui penugasan sebelum memulihkan sesi.',
        );
      }
      const replay = await this.findReplay(tx, identity);
      if (replay) return replay;
      if (!['MISSED', 'CANCELLED'].includes(session.status)) {
        throw new ConflictException('Recovery hanya tersedia untuk sesi MISSED atau CANCELLED');
      }
      const changed = await tx.classSession.updateMany({
        where: { id, version: session.version, status: { in: ['MISSED', 'CANCELLED'] } },
        data: {
          status: dto.targetStatus,
          missedAt: null,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Sesi telah berubah; muat ulang data');
      await tx.classSessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'RECOVERED',
          eventKey: identity.eventKey,
          actorType: 'USER',
          actorId: user.keycloakId,
          reason: dto.reason,
          metadata: { requestFingerprint: identity.requestFingerprint },
        },
      });
      await tx.classSessionAlert.updateMany({
        where: { sessionId: id },
        data: {
          status: 'PENDING',
          claimToken: null,
          claimedAt: null,
          leaseUntil: null,
          dispatchedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        },
      });
      return tx.classSession.findUniqueOrThrow({ where: { id }, select: SESSION_SELECT });
    });
  }

  private async resolvePeriod(tx: Prisma.TransactionClient, date: Date) {
    const years = await tx.academicYear.findMany({ where: { isActive: true }, take: 2 });
    const semesters = await tx.semester.findMany({ where: { isActive: true }, take: 2 });
    if (
      years.length !== 1 ||
      semesters.length !== 1 ||
      semesters[0]!.academicYearId !== years[0]!.id
    ) {
      throw new ServiceUnavailableException(
        'Periode akademik aktif tidak tunggal atau tidak konsisten',
      );
    }
    const academicYear = years[0]!;
    const semester = semesters[0]!;
    if (
      date < academicYear.startDate ||
      date > academicYear.endDate ||
      date < semester.startDate ||
      date > semester.endDate
    ) {
      throw new ServiceUnavailableException('Tanggal berada di luar periode akademik aktif');
    }
    return { academicYear, semester };
  }

  private async findTransitionSession(tx: Prisma.TransactionClient, id: string) {
    const session = await tx.classSession.findUnique({
      where: { id },
      include: {
        assignedTeacher: { select: OPERATIONAL_TEACHER_SELECT },
        academicYear: { select: { code: true } },
        schedule: { select: { concurrencyGroup: { select: { mode: true, expiresOn: true } } } },
      },
    });
    if (!session) throw new NotFoundException('Sesi pembelajaran tidak ditemukan');
    return session;
  }

  private assertOwnSession(
    session: {
      assignedTeacher: Prisma.TeacherGetPayload<{ select: typeof OPERATIONAL_TEACHER_SELECT }>;
    },
    user: AuthUser,
  ) {
    if (
      !isOperationalTeacher(session.assignedTeacher) ||
      session.assignedTeacher.user.keycloakId !== user.keycloakId
    ) {
      throw new ForbiddenException('Hanya guru aktif yang ditugaskan dapat mengelola sesi ini');
    }
  }

  private async assertTransitionAuthority(
    tx: Prisma.TransactionClient,
    user: Pick<AuthUser, 'keycloakId'>,
    teacher = false,
    recovery = false,
  ) {
    if (!this.permissions) throw new ForbiddenException('Kewenangan sesi belum dapat diverifikasi');
    // Domain row and idempotency locks precede lifecycle locking. A queued
    // request must not keep a concurrent account revocation from committing.
    await acquireIdentityMutationLock(tx);
    // Archival uses per-user coordination rather than the global role/status
    // lock. A shared row lock also serializes it without changing UsersService.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM auth.users WHERE keycloak_id = ${user.keycloakId}::uuid FOR SHARE`,
    );
    await assertFreshMutationAuthority(
      tx,
      this.permissions,
      user.keycloakId,
      teacher ? 'academic.class-session.manage' : 'academic.schedule.manage',
      teacher ? ['GURU'] : recovery ? ['SUPER_ADMIN'] : ['SUPER_ADMIN', 'TATA_USAHA'],
      teacher || recovery ? [] : ['WAKA_KURIKULUM'],
    );
  }

  private async assertEligibleSessionTeacher(tx: Prisma.TransactionClient, teacherId: string) {
    const eligible = await lockOperationalTeachers(tx, [teacherId]);
    if (!eligible.has(teacherId))
      throw new ForbiddenException('Guru yang ditugaskan tidak lagi aktif');
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
    const metadata =
      event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
        ? (event.metadata as Prisma.JsonObject)
        : {};
    if (
      event.sessionId !== identity.sessionId ||
      event.actorId !== identity.actorId ||
      metadata.requestFingerprint !== identity.requestFingerprint
    ) {
      throw new ConflictException('Idempotency key sudah digunakan untuk permintaan lain');
    }
    return event
      ? tx.classSession.findUniqueOrThrow({
          where: { id: identity.sessionId },
          select: SESSION_SELECT,
        })
      : null;
  }

  private transitionIdentity(
    action: 'start' | 'complete' | 'cancel' | 'reassign' | 'recover',
    sessionId: string,
    actorId: string,
    dto:
      | ClassSessionTransitionDto
      | ClassSessionReasonActionDto
      | ReassignClassSessionDto
      | RecoverClassSessionDto,
  ) {
    const eventScope = JSON.stringify({ action, actorId, idempotencyKey: dto.idempotencyKey });
    const payload =
      'teacherId' in dto
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
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM academic.class_sessions WHERE id = ${id}::uuid FOR UPDATE`,
    );
  }

  private async lockTransitionIdentity(tx: Prisma.TransactionClient, eventKey: string) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`);
  }

  private async cancelAlerts(
    tx: Prisma.TransactionClient,
    sessionId: string,
    reason: string,
    now: Date,
  ) {
    await tx.classSessionAlert.updateMany({
      where: { sessionId, status: { in: ['PENDING', 'CLAIMED'] } },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: reason,
        claimToken: null,
        leaseUntil: null,
      },
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
    const reset = alerts.filter(
      (alert) =>
        alert.stage === 'PRIVATE_T5' ||
        alert.status === 'PENDING' ||
        alert.status === 'CLAIMED' ||
        alert.status === 'CANCELLED',
    );
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
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Tanggal tidak valid');
    return parsed;
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
