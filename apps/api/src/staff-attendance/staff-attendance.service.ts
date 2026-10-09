import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { evaluateLocation, schoolDate, schoolMinute } from './attendance-rules';
import { teacherArrival, workdayArrival, isAttendanceWorkingDay, UNKNOWN_ARRIVAL, EXEMPT_ARRIVAL, type ArrivalExpectation } from './arrival-rules';
import { PermissionsService } from '../permissions/permissions.service';
import { acquireIdentityMutationLock, assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { isScheduleOperational } from '../schedule/schedule-validity';
import {
  AttendanceCorrectionSchema,
  AttendancePolicySchema,
  type AttendanceLocation,
  type AttendanceQuery,
} from './staff-attendance.dto';
import { z } from 'zod';

export const RECEIPT_SELECT = {
  id: true,
  userId: true,
  date: true,
  checkInAt: true,
  checkOutAt: true,
  arrivalBasis: true,
  expectedArrivalAt: true,
  recommendedArrivalAt: true,
  firstTeachingAt: true,
  locationInStatus: true,
  locationOutStatus: true,
  locationInReason: true,
  locationOutReason: true,
  distanceInM: true,
  distanceOutM: true,
  accuracyInM: true,
  accuracyOutM: true,
  updatedAt: true,
} as const; // Coordinates are custody data, never roster/receipt payloads.
const EMPLOYEE_WHERE: Prisma.UserWhereInput = {
  isActive: true,
  deletedAt: null,
  OR: [{ staff: { is: { deletedAt: null } } }, { teacher: { is: { deletedAt: null } } }],
};

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bell: BellScheduleService,
    private readonly permissions: PermissionsService,
  ) {}

  private async identity(user: AuthUser, db: Prisma.TransactionClient = this.prisma) {
    const employee = await db.user.findFirst({
      where: { ...EMPLOYEE_WHERE, keycloakId: user.keycloakId },
      select: { id: true, fullName: true, role: true, teacher: { select: { id: true } } },
    });
    if (!employee) throw new ForbiddenException('Akun tidak memiliki profil pegawai aktif');
    const positions = await this.permissions.getActivePositionCodes(user.keycloakId, undefined, db);
    return { ...employee, isPrincipal: positions.has('KEPALA_SEKOLAH') };
  }

  async policy() {
    const profile = await this.prisma.schoolProfile.findFirst();
    if (!profile)
      throw new ServiceUnavailableException('Profil dan kebijakan sekolah belum dikonfigurasi');
    return profile;
  }

  private policyPayload(profile: Awaited<ReturnType<StaffAttendanceService['policy']>>) {
    return {
      attendanceMode: profile.attendanceMode,
      attendanceAccuracyM: profile.attendanceAccuracyM,
      attendanceStartMinute: profile.attendanceStartMinute,
      attendanceTeacherLeadMin: profile.attendanceTeacherLeadMin,
      attendanceTeacherLeadTarget: profile.attendanceTeacherLeadTarget,
      attendanceEndMinute: profile.attendanceEndMinute,
      attendanceWorkingDays: profile.attendanceWorkingDays,
      attendancePromptCooldown: profile.attendancePromptCooldown,
      geofenceRadiusM: profile.geofenceRadiusM,
      geofenceConfigured: profile.latitude != null && profile.longitude != null,
    };
  }

  async location(dto: AttendanceLocation, user: AuthUser) {
    await this.identity(user);
    const now = new Date();
    const profile = await this.policy();
    return {
      ...evaluateLocation(dto, profile, now),
      serverNow: now.toISOString(),
      policy: this.policyPayload(profile),
    };
  }

  async context(user: AuthUser) {
    const identity = await this.identity(user);
    const now = new Date();
    const date = schoolDate(now);
    const day = new Date(date + 'T00:00:00Z').getUTCDay() || 7;
    const [profile, receipt, holiday] = await Promise.all([
      this.policy(),
      this.prisma.staffAttendance.findUnique({
        where: { userId_date: { userId: identity.id, date: new Date(date) } },
        select: RECEIPT_SELECT,
      }),
      this.prisma.academicCalendar.findFirst({
        where: {
          type: { in: ['holiday', 'break'] },
          startDate: { lte: new Date(date) },
          endDate: { gte: new Date(date) },
          academicYear: { startDate: { lte: new Date(date) }, endDate: { gte: new Date(date) } },
        },
        select: { name: true, startDate: true, endDate: true },
      }),
    ]);
    let scheduleError: string | null = null;
    let schedules: Awaited<ReturnType<StaffAttendanceService['todaySchedules']>> = [];
    const workingDay = isAttendanceWorkingDay(date, profile.attendanceWorkingDays, holiday ? [holiday] : []);
    if (identity.teacher && workingDay) {
      try {
        schedules = await this.todaySchedules(identity.teacher.id, date, day, now);
      } catch (error) {
        scheduleError = error instanceof ServiceUnavailableException ? error.message : 'Jadwal hari ini belum dapat dimuat. Presensi tetap dapat dilakukan.';
      }
    }
    const arrival = identity.isPrincipal ? EXEMPT_ARRIVAL : !workingDay ? teacherArrival(null, 0, 0) : identity.role === 'TATA_USAHA' ? workdayArrival(date, 420) : identity.teacher
      ? scheduleError ? UNKNOWN_ARRIVAL : teacherArrival(schedules[0]?.startAt ?? null, profile.attendanceTeacherLeadMin, profile.attendanceTeacherLeadTarget)
      : workdayArrival(date, profile.attendanceStartMinute);
    return {
      employee: identity,
      serverNow: now.toISOString(),
      date,
      receipt,
      schedules,
      scheduleError,
      policy: this.policyPayload(profile),
      workingDay,
      holiday: holiday?.name ?? null,
      arrival,
      eligible:
        !receipt &&
        !holiday &&
        profile.attendanceWorkingDays.includes(day) &&
        (identity.isPrincipal || arrival.recommendedAt != null && now >= new Date(arrival.recommendedAt) &&
        (identity.teacher && identity.role !== 'TATA_USAHA' ? schedules.some((slot) => now < new Date(slot.endAt)) : schoolMinute(now) < profile.attendanceEndMinute)),
    };
  }

  private async todaySchedules(teacherId: string, date: string, day: number, now: Date, db: Prisma.TransactionClient = this.prisma) {
    const periods = await db.semester.findMany({
      where: {
        academicYear: { isActive: true },
        startDate: { lte: new Date(date) },
        endDate: { gte: new Date(date) },
      },
      include: { academicYear: true },
      take: 2,
    });
    if (periods.length !== 1) throw new ServiceUnavailableException('Semester tidak tunggal');
    const period = periods[0]!;
    const [profile, slots] = await Promise.all([
      this.bell.resolveForDate(date, 'SCHOOL', db),
      db.schedule.findMany({
        where: {
          dayOfWeek: day,
          academicYear: period.academicYear.code,
          semester: period.number,
          teachingAssignment: { teacherId },
        },
        include: {
          class: { select: { name: true } },
          teachingAssignment: { select: { subject: true } },
          concurrencyGroup: true,
        },
        orderBy: { jpStart: 'asc' },
      }),
    ]);
    const groups = new Map<
      string,
      {
        id: string;
        jpStart: number;
        jpEnd: number;
        classes: string[];
        subject: string;
        room: string | null;
        startAt: string;
        endAt: string;
        mode: string | null;
        expired: boolean;
        state: 'CURRENT' | 'UPCOMING' | 'PAST';
        minutesUntil: number;
      }
    >();
    for (const slot of slots) {
      if (!isScheduleOperational(slot.concurrencyGroup, date)) {
        throw new ServiceUnavailableException('Persetujuan jadwal bersamaan kedaluwarsa; admin perlu memverifikasi jadwal sebelum dipakai untuk kegiatan dan batas kehadiran.');
      }
      const window = this.bell.resolveInstructionWindow(date, profile, slot.jpStart, slot.jpEnd);
      const key = slot.concurrencyGroupId ?? slot.id;
      const existing = groups.get(key);
      if (existing) {
        existing.classes.push(slot.class.name);
        if (!existing.subject.split(' • ').includes(slot.teachingAssignment.subject)) existing.subject += ' • ' + slot.teachingAssignment.subject;
        if (slot.room && !existing.room?.split(' / ').includes(slot.room)) existing.room = [existing.room, slot.room].filter(Boolean).join(' / ');
        continue;
      }
      groups.set(key, {
        id: key,
        jpStart: slot.jpStart,
        jpEnd: slot.jpEnd,
        classes: [slot.class.name],
        subject: slot.teachingAssignment.subject,
        room: slot.room,
        startAt: window.startAt.toISOString(),
        endAt: window.endAt.toISOString(),
        mode: slot.concurrencyGroup?.mode ?? null,
        expired: Boolean(
          slot.concurrencyGroup?.expiresOn && slot.concurrencyGroup.expiresOn < new Date(date),
        ),
        state: now < window.startAt ? 'UPCOMING' : now < window.endAt ? 'CURRENT' : 'PAST',
        minutesUntil: Math.max(0, Math.ceil((window.startAt.getTime() - now.getTime()) / 60000)),
      });
    }
    return [...groups.values()];
  }

  async record(dto: AttendanceLocation, user: AuthUser, checkout = false, legacyNotes?: string | null) {
    const identity = await this.identity(user); // ID only; authority is re-read after waiting.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance:' + identity.id}))`,
      );
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`);
      await acquireIdentityMutationLock(tx);
      const employee = await this.identity(user, tx);
      if (!await this.permissions.hasFreshPermission(user.keycloakId, 'staff.attendance.checkin', tx))
        throw new ForbiddenException('Hak presensi pegawai tidak lagi aktif');
      const now = new Date(); // after lock: one authoritative timestamp, including midnight races
      const date = new Date(schoolDate(now));
      const existing = await tx.staffAttendance.findUnique({
        where: { userId_date: { userId: employee.id, date } },
        select: RECEIPT_SELECT,
      });
      if ((!checkout && existing) || (checkout && existing?.checkOutAt))
        return { receipt: existing!, replayed: true, serverNow: now.toISOString() };
      if (checkout && !existing)
        throw new ConflictException('Belum melakukan presensi masuk hari ini');
      const profile = await tx.schoolProfile.findFirst();
      if (!profile) throw new ServiceUnavailableException('Kebijakan sekolah belum tersedia');
      const location = evaluateLocation(dto, profile, now);
      const isPrincipal = (await this.permissions.getActivePositionCodes(user.keycloakId, date, tx)).has('KEPALA_SEKOLAH');
      let arrival: ArrivalExpectation = isPrincipal ? EXEMPT_ARRIVAL : workdayArrival(schoolDate(now), employee.role === 'TATA_USAHA' ? 420 : profile.attendanceStartMinute);
      const holidays = await tx.academicCalendar.findMany({
        where: { type: { in: ['holiday', 'break'] }, startDate: { lte: date }, endDate: { gte: date },
          academicYear: { startDate: { lte: date }, endDate: { gte: date } } },
        select: { startDate: true, endDate: true },
      });
      const workingDay = isAttendanceWorkingDay(schoolDate(now), profile.attendanceWorkingDays, holidays);
      if (!workingDay && !isPrincipal) arrival = teacherArrival(null, 0, 0);
      if (workingDay && employee.teacher && !isPrincipal && employee.role !== 'TATA_USAHA' && !checkout) {
        try {
          const schedules = await this.todaySchedules(employee.teacher.id, schoolDate(now), new Date(schoolDate(now)).getUTCDay() || 7, now, tx);
          arrival = teacherArrival(schedules[0]?.startAt ?? null, profile.attendanceTeacherLeadMin, profile.attendanceTeacherLeadTarget);
        } catch { arrival = UNKNOWN_ARRIVAL; }
      }
      if (profile.attendanceMode === 'STRICT' && location.status !== 'INSIDE') {
        throw new BadRequestException(
          'Kebijakan sekolah mensyaratkan lokasi terverifikasi di dalam area. Coba lokasi lagi atau hubungi admin.',
        );
      }
      const receipt = checkout
        ? await tx.staffAttendance.update({
            where: { id: existing!.id },
            data: {
              checkOutAt: now,
              locationOutStatus: location.status,
              locationOutReason: location.reason,
              distanceOutM: location.distanceM,
              accuracyOutM: location.accuracyM,
              latOut: dto.lat ?? null,
              lngOut: dto.lng ?? null,
            },
            select: RECEIPT_SELECT,
          })
        : await tx.staffAttendance.create({
            data: {
              userId: employee.id,
              notes: legacyNotes?.trim() || null,
              date,
              checkInAt: now,
              arrivalBasis: arrival.basis,
              expectedArrivalAt: arrival.dueAt ? new Date(arrival.dueAt) : null,
              recommendedArrivalAt: arrival.recommendedAt ? new Date(arrival.recommendedAt) : null,
              firstTeachingAt: arrival.firstTeachingAt ? new Date(arrival.firstTeachingAt) : null,
              locationInStatus: location.status,
              locationInReason: location.reason,
              distanceInM: location.distanceM,
              accuracyInM: location.accuracyM,
              latIn: dto.lat ?? null,
              lngIn: dto.lng ?? null,
            },
            select: RECEIPT_SELECT,
          });
      await tx.staffAttendanceEvent.create({
        data: {
          attendanceId: receipt.id,
          actorId: user.keycloakId,
          kind: checkout ? 'CHECK_OUT' : 'CHECK_IN',
          reason: 'Presensi mandiri',
          after: JSON.parse(JSON.stringify(receipt)) as Prisma.InputJsonObject,
        },
      });
      return { receipt, replayed: false, serverNow: now.toISOString() };
    });
  }

  async history(user: AuthUser) {
    const employee = await this.identity(user);
    return this.prisma.staffAttendance.findMany({
      where: { userId: employee.id },
      select: RECEIPT_SELECT,
      orderBy: { date: 'desc' },
      take: 31,
    });
  }

  /** Batched by date, never one query per teacher. Unknown schedules cannot produce lateness. */
  private async arrivalsForDate(date: string, teacherIds: string[], profile: Awaited<ReturnType<StaffAttendanceService['policy']>>) {
    const arrivals = new Map<string, ArrivalExpectation>();
    if (!teacherIds.length) return arrivals;
    try {
      const periods = await this.prisma.semester.findMany({
        where: { startDate: { lte: new Date(date) }, endDate: { gte: new Date(date) } },
        include: { academicYear: true }, take: 2,
      });
      if (periods.length !== 1) throw new ServiceUnavailableException('Semester tidak tunggal');
      const period = periods[0]!;
      const [bell, slots] = await Promise.all([
        this.bell.resolveForDate(date),
        this.prisma.schedule.findMany({
          where: { dayOfWeek: new Date(date).getUTCDay() || 7, academicYear: period.academicYear.code,
            semester: period.number, teachingAssignment: { teacherId: { in: teacherIds } } },
          select: { jpStart: true, jpEnd: true, concurrencyGroup: { select: { mode: true, expiresOn: true } }, teachingAssignment: { select: { teacherId: true } } },
          orderBy: { jpStart: 'asc' },
        }),
      ]);
      for (const id of teacherIds) arrivals.set(id, teacherArrival(null, profile.attendanceTeacherLeadMin, profile.attendanceTeacherLeadTarget));
      for (const slot of slots) {
        const id = slot.teachingAssignment.teacherId;
        try {
          if (!isScheduleOperational(slot.concurrencyGroup, date)) throw new Error('Expired schedule authority');
          const window = this.bell.resolveInstructionWindow(date, bell, slot.jpStart, slot.jpEnd);
          const previous = arrivals.get(id);
          if (previous?.basis !== 'UNAVAILABLE' && (!previous?.firstTeachingAt || window.startAt < new Date(previous.firstTeachingAt)))
            arrivals.set(id, teacherArrival(window.startAt.toISOString(), profile.attendanceTeacherLeadMin, profile.attendanceTeacherLeadTarget));
        } catch { arrivals.set(id, UNKNOWN_ARRIVAL); }
      }
    } catch { for (const id of teacherIds) arrivals.set(id, UNKNOWN_ARRIVAL); }
    return arrivals;
  }

  async report(query: AttendanceQuery) {
    const profile = await this.policy();
    // Bounded 91-day report; all aggregations are computed before pagination/filtering.
    const [employees, records, holidays] = await Promise.all([
      this.prisma.user.findMany({
        where: EMPLOYEE_WHERE,
        select: {
          id: true,
          fullName: true,
          createdAt: true,
          role: true,
          staff: { select: { niy: true, employmentStatus: true } },
          teacher: { select: { id: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.staffAttendance.findMany({
        where: { date: { gte: new Date(query.from), lte: new Date(query.to) } },
        select: RECEIPT_SELECT,
      }),
      this.prisma.academicCalendar.findMany({
        where: {
          type: { in: ['holiday', 'break'] },
          startDate: { lte: new Date(query.to) },
          endDate: { gte: new Date(query.from) },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);
    const employeeIds = new Set(employees.map((employee) => employee.id));
    const lookup = new Map(
      records
        .filter((record) => employeeIds.has(record.userId))
        .map((record) => [record.userId + '|' + record.date.toISOString().slice(0, 10), record]),
    );
    const rows: Array<{
      employee: (typeof employees)[number];
      date: string;
      receipt: (typeof records)[number] | null;
      status: string;
      review: boolean;
      arrival: ArrivalExpectation;
    }> = [];
    const trend: Array<{ date: string; present: number; late: number; absent: number }> = [];
    const today = schoolDate(new Date());
    for (
      let stamp = new Date(query.from).getTime();
      stamp <= new Date(query.to).getTime();
      stamp += 86400000
    ) {
      const date = new Date(stamp);
      const ymd = date.toISOString().slice(0, 10);
      if (ymd > today) continue;
      const workday = isAttendanceWorkingDay(ymd, profile.attendanceWorkingDays, holidays);
      const point = { date: ymd, present: 0, late: 0, absent: 0 };
      const arrivals = workday
        ? await this.arrivalsForDate(ymd, employees.flatMap((person) => person.teacher ? [person.teacher.id] : []), profile)
        : new Map<string, ArrivalExpectation>();
      const principalIds = new Set((await this.prisma.appointment.findMany({
        where: { status: 'ACTIVE', position: { code: 'KEPALA_SEKOLAH', isActive: true, scopeType: 'NONE' }, majorId: null,
          academicYear: { startDate: { lte: date }, endDate: { gte: date } },
          effectiveFrom: { lte: date }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
          staff: { deletedAt: null, user: EMPLOYEE_WHERE } },
        select: { staff: { select: { userId: true } } },
      })).map((appointment) => appointment.staff.userId));
      for (const employee of employees) {
        const receipt = lookup.get(employee.id + '|' + ymd) ?? null;
        if (!receipt && schoolDate(employee.createdAt) > ymd) continue;
        if (!workday && !receipt) continue;
        const currentArrival = principalIds.has(employee.id) ? EXEMPT_ARRIVAL : !workday ? teacherArrival(null, 0, 0) : employee.role === 'TATA_USAHA' ? workdayArrival(ymd, 420) : employee.teacher
          ? arrivals.get(employee.teacher.id) ?? teacherArrival(null, profile.attendanceTeacherLeadMin, profile.attendanceTeacherLeadTarget)
          : workdayArrival(ymd, profile.attendanceStartMinute);
        const arrival: ArrivalExpectation = receipt && workday
          ? { basis: (receipt.arrivalBasis as ArrivalExpectation['basis'] | null) ?? 'UNAVAILABLE',
              dueAt: receipt.expectedArrivalAt?.toISOString() ?? null,
              recommendedAt: receipt.recommendedArrivalAt?.toISOString() ?? null,
              firstTeachingAt: receipt.firstTeachingAt?.toISOString() ?? null }
          : currentArrival;
        const late = Boolean(receipt && arrival.dueAt && receipt.checkInAt > new Date(arrival.dueAt));
        const status = arrival.basis === 'UNAVAILABLE' ? 'UNKNOWN'
          : receipt ? late ? 'LATE' : 'PRESENT'
          : arrival.basis === 'EXEMPT' ? 'NOT_REQUIRED'
          : arrival.basis === 'NONE' ? 'NOT_SCHEDULED'
          : arrival.dueAt && new Date() <= new Date(arrival.dueAt) ? 'NOT_DUE' : 'ABSENT';
        const review = Boolean(
          arrival.basis === 'UNAVAILABLE' ||
          receipt &&
          ([receipt.locationInStatus, receipt.locationOutStatus].some(
            (state) => state === 'UNVERIFIED' || state === 'OUTSIDE',
          ) ||
            (!receipt.checkOutAt &&
              (ymd < today || arrival.basis !== 'EXEMPT' && schoolMinute(new Date()) >= profile.attendanceEndMinute))),
        );
        rows.push({ employee, date: ymd, receipt, status, review, arrival });
        if (status === 'ABSENT') point.absent++;
        else if (receipt) {
          point.present++;
          if (late) point.late++;
        }
      }
      if (workday || point.present) trend.push(point);
    }
    const summary = {
      totalEmployees: employees.length,
      expected: rows.filter((row) => row.arrival.dueAt || row.receipt).length,
      present: rows.filter((row) => row.receipt).length,
      onTime: rows.filter((row) => row.status === 'PRESENT' && row.arrival.dueAt).length,
      late: rows.filter((row) => row.status === 'LATE').length,
      absent: rows.filter((row) => row.status === 'ABSENT').length,
      review: rows.filter((row) => row.review).length,
    };
    const filtered = rows
      .filter(
        (row) =>
          row.employee.fullName
            .toLocaleLowerCase('id')
            .includes(query.search.toLocaleLowerCase('id')) &&
          (query.unit === 'ALL' || Boolean(row.employee.teacher) === (query.unit === 'TEACHER')) &&
          (query.status === 'ALL' ||
            (query.status === 'REVIEW'
              ? row.review
              : query.status === 'NO_CHECKOUT'
                ? row.receipt && !row.receipt.checkOutAt
                : row.status === query.status)) &&
          (query.location === 'ALL' || row.receipt?.locationInStatus === query.location),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.employee.fullName.localeCompare(b.employee.fullName),
      );
    return {
      summary,
      trend,
      attention: rows
        .filter((row) => row.review)
        .slice(-10)
        .reverse(),
      data: filtered.slice((query.page - 1) * query.limit, query.page * query.limit),
      total: filtered.length,
      page: query.page,
      limit: query.limit,
      policy: this.policyPayload(profile),
      serverNow: new Date().toISOString(),
    };
  }

  async detail(id: string) {
    const record = await this.prisma.staffAttendance.findUnique({
      where: { id },
      select: {
        ...RECEIPT_SELECT,
        user: { select: { fullName: true } },
        events: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            kind: true,
            reason: true,
            before: true,
            after: true,
            createdAt: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Presensi tidak ditemukan');
    return record;
  }

  async correct(id: string, dto: z.infer<typeof AttendanceCorrectionSchema>, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.staffAttendance.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!target) throw new NotFoundException('Presensi tidak ditemukan');
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance:' + target.userId}))`,
      );
      await assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
        'staff.attendance.manage', ['SUPER_ADMIN']);
      const before = await tx.staffAttendance.findUniqueOrThrow({
        where: { id },
        select: RECEIPT_SELECT,
      });
      const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : before.checkInAt;
      const checkOutAt =
        dto.checkOutAt === undefined
          ? before.checkOutAt
          : dto.checkOutAt
            ? new Date(dto.checkOutAt)
            : null;
      if (
        checkInAt > new Date() || (checkOutAt && checkOutAt > new Date()) ||
        schoolDate(checkInAt) !== before.date.toISOString().slice(0, 10) ||
        (checkOutAt && (checkOutAt < checkInAt || schoolDate(checkOutAt) !== schoolDate(checkInAt)))
      ) {
        throw new BadRequestException(
          'Waktu koreksi harus pada tanggal presensi yang sama, tidak di masa depan, dan pulang tidak sebelum masuk',
        );
      }
      const after = await tx.staffAttendance.update({
        where: { id },
        data: { checkInAt, checkOutAt },
        select: RECEIPT_SELECT,
      });
      await tx.staffAttendanceEvent.create({
        data: {
          attendanceId: id,
          actorId: user.keycloakId,
          kind: 'CORRECTION',
          reason: dto.reason,
          before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonObject,
          after: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonObject,
        },
      });
      return after;
    });
  }

  async note(id: string, reason: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.staffAttendance.findUnique({ where: { id }, select: { userId: true } });
      if (!target) throw new NotFoundException('Presensi tidak ditemukan');
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance:' + target.userId}))`);
      await assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
        'staff.attendance.manage', ['SUPER_ADMIN']);
      return tx.staffAttendanceEvent.create({
        data: { attendanceId: id, actorId: user.keycloakId, kind: 'NOTE', reason },
        select: { id: true, kind: true, reason: true, createdAt: true },
      });
    });
  }

  async updatePolicy(dto: z.infer<typeof AttendancePolicySchema>, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('operational:attendance-policy:mutation:v1'))`);
      await assertFreshMutationAuthority(tx, this.permissions, user.keycloakId,
        'staff.attendance.manage', ['SUPER_ADMIN']);
      const profile = await tx.schoolProfile.findFirst();
      if (!profile) throw new ServiceUnavailableException('Profil dan kebijakan sekolah belum dikonfigurasi');
      if (dto.attendanceMode === 'STRICT' && (profile.latitude == null || profile.longitude == null)) {
        throw new BadRequestException('Atur koordinat sekolah sebelum mengaktifkan lokasi wajib');
      }
      return this.policyPayload(await tx.schoolProfile.update({ where: { id: profile.id }, data: dto }));
    });
  }
}
