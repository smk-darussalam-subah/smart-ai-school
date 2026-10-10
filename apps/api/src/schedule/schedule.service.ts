// =============================================================================
// ScheduleService — GET /schedules (ownership) + POST /schedules (konflik check)
//
// GET ownership per role (pola Attendance/Grade):
//   SA/KS/TU → semua; filter classId/teacherId/dayOfWeek/academicYear/semester opsional
//   GURU     → hanya jadwal teachingAssignment.teacherId = me
//   SISWA    → hanya jadwal classId = kelas siswa (via Student.classId)
//   OT       → jadwal classId IN [kelas anak-anak] (via Student.parentId)
//
// POST konflik (cek app-level sebelum insert, di luar constraint DB):
//   Kelas   → unique DB (classId+dayOfWeek+jpStart+academicYear+semester) → P2002 → 409
//   Guru    → guru sama, slot JP overlap → ConflictException 409
//   Ruang   → room sama (non-null), slot JP overlap → ConflictException 409
//
// Overlap JP: [jpStart, jpEnd] overlap ↔ newJpStart < existingJpEnd AND existingJpStart < newJpEnd
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGuruOnly, isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveTeacherId, resolveSiswaClassId } from '../common/helpers/role-helpers';
import {
  assertClassInKaprogScope,
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ListScheduleQuery } from './dto/list-schedule.dto';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { BellScheduleService } from '../bell-schedule/bell-schedule.service';
import { PermissionsService } from '../permissions/permissions.service';
import { acquireIdentityMutationLock, assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';

const SCHEDULE_MUTATION_LOCK_KEY = 'academic:schedule:mutation:v1';

// ── Select shape ──────────────────────────────────────────────────────────────

const SCHEDULE_SELECT = {
  id:                   true,
  classId:              true,
  teachingAssignmentId: true,
  dayOfWeek:            true,
  jpStart:              true,
  jpEnd:                true,
  room:                 true,
  academicYear:         true,
  semester:             true,
  concurrencyGroupId:   true,
  concurrencyGroup: { select: { id: true, mode: true, expiresOn: true } },
  createdAt:            true,
  updatedAt:            true,
  class: {
    select: { id: true, name: true, majorCode: true, grade: true },
  },
  teachingAssignment: {
    select: {
      id:      true,
      subject: true,
      teacher: {
        select: {
          id:   true,
          user: { select: { fullName: true } },
        },
      },
    },
  },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ScheduleService {
  constructor(
    private prisma: PrismaService,
    private readonly academicPeriod: AcademicPeriodService,
    private readonly bellSchedule: BellScheduleService,
    private readonly permissions: PermissionsService = new PermissionsService(prisma),
  ) {}

  private async acquireMutationLock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${SCHEDULE_MUTATION_LOCK_KEY}))`,
    );
  }

  /** keycloakId → teacher.id[] (untuk resolusi jadwal guru: semua assignment-nya) */
  private async resolveGuruAssignmentIds(keycloakId: string): Promise<string[]> {
    const teacherId = await resolveTeacherId(this.prisma, keycloakId);
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { teacherId },
      select: { id: true },
    });
    return assignments.map((a) => a.id);
  }

  /** keycloakId → classId[] semua kelas anak-anak (untuk ORANG_TUA) */
  private async resolveChildClassIds(keycloakId: string): Promise<string[]> {
    const userId = await resolveUserId(this.prisma, keycloakId);
    const children = await this.prisma.student.findMany({
      where: { parentId: userId },
      select: { classId: true },
    });
    if (children.length === 0) {
      throw new ForbiddenException('Tidak ada data anak yang terdaftar untuk akun ini');
    }
    return children.map((c) => c.classId).filter((id): id is string => id !== null);
  }

  // ── findAll ──────────────────────────────────────────────────────────────────

  async findAll(query: ListScheduleQuery, user: AuthUser) {
    const where: Prisma.ScheduleWhereInput = {};

    // Common filters (opsional, semua role bisa pakai kecuali ownership override)
    if (query.dayOfWeek)    where.dayOfWeek    = query.dayOfWeek;
    if (query.academicYear) where.academicYear  = query.academicYear;
    if (query.semester)     where.semester      = query.semester;

    // Ownership filter per role
    // RolesGuard appends active appointment codes to the stable identity role.
    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      if (query.classId) {
        await assertClassInKaprogScope(this.prisma, query.classId, scope);
      }
      if (query.academicYear && query.academicYear !== scope.academicYearCode) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      where.academicYear = scope.academicYearCode;
      where.class = kaprogClassWhere(scope);
      if (query.classId) where.classId = query.classId;
      if (query.teacherId) {
        const assignments = await this.prisma.teachingAssignment.findMany({
          where: {
            teacherId: query.teacherId,
            academicYear: scope.academicYearCode,
            class: kaprogClassWhere(scope),
          },
          select: { id: true },
        });
        const taIds = assignments.map((assignment) => assignment.id);
        if (taIds.length === 0) {
          return { data: [], total: 0, page: query.page, limit: query.limit };
        }
        where.teachingAssignmentId = { in: taIds };
      }
    } else if (isGuruOnly(user) && !user.roles.includes('WAKA_KURIKULUM')) {
      const myAssignmentIds = await this.resolveGuruAssignmentIds(user.keycloakId);
      if (myAssignmentIds.length === 0) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      where.teachingAssignmentId = { in: myAssignmentIds };
      // classId query dari GURU: bisa filter, tapi tidak override ownership
      if (query.classId) where.classId = query.classId;
    } else if (isSiswaOnly(user)) {
      const myClassId = await resolveSiswaClassId(this.prisma, user.keycloakId);
      if (!myClassId) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      where.classId = myClassId;
    } else if (isOrangTuaOnly(user)) {
      const childClassIds = await this.resolveChildClassIds(user.keycloakId);
      if (query.classId && !childClassIds.includes(query.classId)) {
        throw new ForbiddenException('Kelas bukan milik anak yang terdaftar untuk akun ini');
      }
      where.classId = query.classId ?? { in: childClassIds };
    } else {
      // ELEVATED (SA/KS/TU): filter opsional
      if (query.classId)   where.classId = query.classId;
      if (query.teacherId) {
        // filter by teacherId → via TeachingAssignment
        const assignments = await this.prisma.teachingAssignment.findMany({
          where: { teacherId: query.teacherId },
          select: { id: true },
        });
        const taIds = assignments.map((a) => a.id);
        if (taIds.length === 0) {
          return { data: [], total: 0, page: query.page, limit: query.limit };
        }
        where.teachingAssignmentId = { in: taIds };
      }
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        skip,
        take:    query.limit,
        select:  SCHEDULE_SELECT,
        orderBy: [
          { academicYear: 'desc' },
          { semester: 'asc' },
          { dayOfWeek: 'asc' },
          { jpStart: 'asc' },
        ],
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  // ── create ───────────────────────────────────────────────────────────────────

  async create(dto: CreateScheduleDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);

    // 1. Validasi teachingAssignmentId → ambil teacherId, classId, academicYear
    const assignment = await tx.teachingAssignment.findUnique({
      where: { id: dto.teachingAssignmentId },
      select: { id: true, teacherId: true, classId: true, academicYear: true, subject: true },
    });
    if (!assignment) {
      throw new BadRequestException(
        `teachingAssignmentId '${dto.teachingAssignmentId}' tidak ditemukan`,
      );
    }
    if (assignment.classId !== dto.classId) {
      throw new BadRequestException(
        'teachingAssignmentId tidak sesuai dengan classId yang diberikan',
      );
    }
    if (dto.academicYear !== assignment.academicYear) {
      throw new BadRequestException(
        `academicYear '${dto.academicYear}' tidak sesuai dengan TeachingAssignment (${assignment.academicYear})`,
      );
    }
    await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
      academicYear: dto.academicYear,
      semester: dto.semester,
    });
    await this.bellSchedule.assertWeeklyRange(tx, dto.academicYear, dto.semester, dto.dayOfWeek, dto.jpStart, dto.jpEnd);
    await assertFreshMutationAuthority(tx, this.permissions, actor.keycloakId,
      'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);
    const groupId = dto.concurrency ? await this.resolveConcurrency(tx, dto, assignment, actor) : null;

    // 1b. Cek konflik RENTANG kelas (2F-1; unique DB hanya jpStart)
    await this.assertNoClassRangeConflict({
      classId: dto.classId, dayOfWeek: dto.dayOfWeek,
      jpStart: dto.jpStart, jpEnd: dto.jpEnd,
      academicYear: dto.academicYear, semester: dto.semester,
    }, tx);

    // 2. Cek konflik guru (app-level, sebelum insert):
    //    Guru yang sama tidak boleh mengajar di slot JP yang overlap di hari & semester yang sama
    const guruTaIds = await tx.teachingAssignment
      .findMany({
        where: { teacherId: assignment.teacherId },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const guruConflict = await tx.schedule.findFirst({
      where: {
        teachingAssignmentId: { in: guruTaIds },
        ...(groupId ? { OR: [{ concurrencyGroupId: null }, { concurrencyGroupId: { not: groupId } }] } : {}),
        dayOfWeek:            dto.dayOfWeek,
        academicYear:         dto.academicYear,
        semester:             dto.semester,
        // INKLUSIF: jpEnd adalah JP terakhir yang dipakai → overlap bila
        // existing.jpStart <= dto.jpEnd && existing.jpEnd >= dto.jpStart.
        // (lt/gt lama MELOLOSKAN overlap tepi, mis. 1–3 vs 3–4 — bug 2F-1.)
        jpStart:              { lte: dto.jpEnd },
        jpEnd:                { gte: dto.jpStart },
      },
      select: { id: true, classId: true },
    });
    if (guruConflict) {
      throw new ConflictException(
        'Guru sudah memiliki jadwal di slot JP ini (dayOfWeek+jpStart–jpEnd overlap)',
      );
    }

    // 3. Cek konflik ruang (app-level, skip jika room null):
    //    Ruang yang sama tidak boleh dipakai oleh dua kelas di slot JP yang overlap
    if (dto.room) {
      const roomConflict = await tx.schedule.findFirst({
        where: {
          room:         dto.room,
          ...(groupId && dto.concurrency?.mode === 'JOINT_CLASS' ? { OR: [{ concurrencyGroupId: null }, { concurrencyGroupId: { not: groupId } }] } : {}),
          dayOfWeek:    dto.dayOfWeek,
          academicYear: dto.academicYear,
          semester:     dto.semester,
          jpStart:      { lte: dto.jpEnd },
          jpEnd:        { gte: dto.jpStart },
        },
        select: { id: true },
      });
      if (roomConflict) {
        throw new ConflictException(
          `Ruang '${dto.room}' sudah dipakai di slot JP ini (dayOfWeek+jpStart–jpEnd overlap)`,
        );
      }
    }

    // 4. Insert — P2002 (unique classId+dayOfWeek+jpStart+academicYear+semester)
    //    di-catch oleh PrismaExceptionFilter global → 409
    return tx.schedule.create({
      data: {
        classId:              dto.classId,
        teachingAssignmentId: dto.teachingAssignmentId,
        dayOfWeek:            dto.dayOfWeek,
        jpStart:              dto.jpStart,
        jpEnd:                dto.jpEnd,
        room:                 dto.room ?? null,
        academicYear:         dto.academicYear,
        semester:             dto.semester,
        concurrencyGroupId:   groupId,
      },
      select: SCHEDULE_SELECT,
    });
    });
  }

  private async resolveConcurrency(
    tx: Prisma.TransactionClient, dto: CreateScheduleDto,
    assignment: { teacherId: string; subject: string }, actor?: AuthUser,
  ) {
    await acquireIdentityMutationLock(tx);
    const role = actor ? await this.permissions.getAuthoritativePrimaryRole(actor.keycloakId, tx) : null;
    const positions = actor && role ? await this.permissions.getActivePositionCodes(actor.keycloakId, undefined, tx) : new Set<string>();
    if (!actor || !role || (role !== 'SUPER_ADMIN' && !positions.has('WAKA_KURIKULUM')) ||
      !await this.permissions.hasFreshPermission(actor.keycloakId, 'academic.schedule.manage', tx)) {
      throw new ForbiddenException('Persetujuan jadwal bersamaan hanya oleh Super Admin atau Wakasek Kurikulum aktif');
    }
    const request = dto.concurrency!;
    const anchor = await tx.schedule.findUnique({
      where: { id: request.anchorScheduleId },
      include: { teachingAssignment: { select: { teacherId: true, subject: true } }, concurrencyGroup: true },
    });
    if (!anchor || anchor.teachingAssignment.teacherId !== assignment.teacherId ||
      anchor.dayOfWeek !== dto.dayOfWeek || anchor.jpStart !== dto.jpStart || anchor.jpEnd !== dto.jpEnd ||
      anchor.academicYear !== dto.academicYear || anchor.semester !== dto.semester || anchor.classId === dto.classId) {
      throw new ConflictException('Jadwal acuan harus milik guru yang sama, kelas berbeda, dan rentang hari/JP/periode persis sama');
    }
    if (request.mode === 'JOINT_CLASS' && (!dto.room?.trim() || dto.room !== anchor.room || assignment.subject !== anchor.teachingAssignment.subject)) {
      throw new ConflictException('Kelas gabungan wajib memiliki mapel dan lokasi yang sama');
    }
    const expiresOn = request.expiresOn ? new Date(`${request.expiresOn}T00:00:00.000Z`) : null;
    if (expiresOn && (Number.isNaN(expiresOn.getTime()) || expiresOn.toISOString().slice(0, 10) !== request.expiresOn ||
      expiresOn < new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()) + 'T00:00:00Z'))) {
      throw new BadRequestException('Tanggal berakhir pengecualian harus valid dan belum lewat');
    }
    if (anchor.concurrencyGroup) {
      if (anchor.concurrencyGroup.mode !== request.mode || (anchor.concurrencyGroup.expiresOn && anchor.concurrencyGroup.expiresOn < new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()) + 'T00:00:00Z'))) {
        throw new ConflictException('Kelompok acuan berbeda mode atau sudah kedaluwarsa');
      }
      return anchor.concurrencyGroup.id;
    }
    const group = await tx.scheduleConcurrencyGroup.create({
      data: { teacherId: assignment.teacherId, mode: request.mode, reason: request.reason,
        approvedBy: actor.keycloakId, dayOfWeek: dto.dayOfWeek, jpStart: dto.jpStart, jpEnd: dto.jpEnd,
        academicYear: dto.academicYear, semester: dto.semester, expiresOn },
    });
    await tx.schedule.update({ where: { id: anchor.id }, data: { concurrencyGroupId: group.id } });
    return group.id;
  }
  // ── 2F-1: cek konflik rentang KELAS (unique DB hanya menjaga jpStart) ───────
  private async assertNoClassRangeConflict(params: {
    classId: string; dayOfWeek: number; jpStart: number; jpEnd: number;
    academicYear: string; semester: number; excludeId?: string;
  }, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<void> {
    const clash = await db.schedule.findFirst({
      where: {
        classId:      params.classId,
        dayOfWeek:    params.dayOfWeek,
        academicYear: params.academicYear,
        semester:     params.semester,
        jpStart:      { lte: params.jpEnd },
        jpEnd:        { gte: params.jpStart },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { id: true, jpStart: true, jpEnd: true },
    });
    if (clash) {
      throw new ConflictException(
        `Kelas sudah punya jadwal di rentang JP ${clash.jpStart}–${clash.jpEnd} pada hari ini`,
      );
    }
  }

  // ── 2F-1: update slot (hari/JP/ruang/semester) dengan re-cek konflik ────────
  async update(id: string, dto: UpdateScheduleDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);

    const existing = await tx.schedule.findUnique({
      where: { id },
      select: {
        id: true, classId: true, teachingAssignmentId: true, dayOfWeek: true,
        jpStart: true, jpEnd: true, room: true, academicYear: true, semester: true,
        concurrencyGroupId: true,
        teachingAssignment: { select: { teacherId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Jadwal tidak ditemukan');
    if (existing.concurrencyGroupId) throw new ConflictException('Slot kelompok bersamaan tidak dapat diubah sendiri. Hapus dan susun ulang kelompok dengan persetujuan baru.');

    const next = {
      dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
      jpStart:   dto.jpStart   ?? existing.jpStart,
      jpEnd:     dto.jpEnd     ?? existing.jpEnd,
      room:      dto.room !== undefined ? dto.room : existing.room,
      semester:  dto.semester  ?? existing.semester,
    };
    if (next.jpEnd < next.jpStart) {
      throw new BadRequestException('jpEnd harus >= jpStart');
    }
    await this.bellSchedule.assertWeeklyRange(tx, existing.academicYear, next.semester, next.dayOfWeek, next.jpStart, next.jpEnd);
    await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
      academicYear: existing.academicYear,
      semester: existing.semester,
    });
    if (next.semester !== existing.semester) {
      await this.academicPeriod.assertWritablePeriod(tx, {
        academicYear: existing.academicYear,
        semester: next.semester,
      });
    }
    await assertFreshMutationAuthority(tx, this.permissions, actor.keycloakId,
      'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);

    await this.assertNoClassRangeConflict({
      classId: existing.classId, dayOfWeek: next.dayOfWeek,
      jpStart: next.jpStart, jpEnd: next.jpEnd,
      academicYear: existing.academicYear, semester: next.semester,
      excludeId: id,
    }, tx);

    // Konflik guru (exclude diri sendiri) — inklusif
    const guruTaIds = await tx.teachingAssignment
      .findMany({ where: { teacherId: existing.teachingAssignment.teacherId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    const guruConflict = await tx.schedule.findFirst({
      where: {
        id:                   { not: id },
        teachingAssignmentId: { in: guruTaIds },
        dayOfWeek:            next.dayOfWeek,
        academicYear:         existing.academicYear,
        semester:             next.semester,
        jpStart:              { lte: next.jpEnd },
        jpEnd:                { gte: next.jpStart },
      },
      select: { id: true },
    });
    if (guruConflict) {
      throw new ConflictException('Guru sudah memiliki jadwal di slot JP ini');
    }

    if (next.room) {
      const roomConflict = await tx.schedule.findFirst({
        where: {
          id:           { not: id },
          room:         next.room,
          dayOfWeek:    next.dayOfWeek,
          academicYear: existing.academicYear,
          semester:     next.semester,
          jpStart:      { lte: next.jpEnd },
          jpEnd:        { gte: next.jpStart },
        },
        select: { id: true },
      });
      if (roomConflict) {
        throw new ConflictException(`Ruang '${next.room}' sudah dipakai di slot JP ini`);
      }
    }

    return tx.schedule.update({
      where: { id },
      data: next,
      select: SCHEDULE_SELECT,
    });
    });
  }

  // ── 2F-1: hapus slot (hard delete — template mingguan tanpa dependen FK) ────
  async remove(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const existing = await tx.schedule.findUnique({
        where: { id },
        select: { id: true, academicYear: true, semester: true },
      });
      if (!existing) throw new NotFoundException('Jadwal tidak ditemukan');
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, {
        academicYear: existing.academicYear,
        semester: existing.semester,
      });
      await assertFreshMutationAuthority(tx, this.permissions, actor.keycloakId,
        'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);
      await tx.schedule.delete({ where: { id } });
      return { deleted: true, id };
    });
  }

  // ── T3-02 B8: Auto-scheduling (greedy constraint-based) ────────────────────

  /** B8: Auto-generate weekly schedules from teaching assignments.
   *  Greedy constraint-based: fills slots (day×JP) avoiding teacher/class conflicts.
   *  Returns generated slots (preview) without persisting — caller calls create() per slot. */
  async autoGenerate(academicYear: string, semester: number, config: { days?: number; jpPerDay?: number; maxJpGuru?: number }) {
    const DAYS = config.days ?? 6; // Senin–Sabtu
    const MAX_JP_GURU = config.maxJpGuru ?? 24;
    return this.prisma.$transaction(async (tx) => {
      await this.academicPeriod.assertWritablePeriodWithCutoverLock(tx, { academicYear, semester });
      const dayJps = await this.bellSchedule.instructionDaysForPeriod(tx, academicYear, semester);
      const year = await tx.academicYear.findUnique({
        where: { code: academicYear },
        select: { id: true },
      });
      if (!year) throw new BadRequestException('Tahun ajaran tidak terdaftar.');

      // Fetch all active teaching assignments needing schedule in the target semester.
      const assignments = await tx.teachingAssignment.findMany({
        where: {
          academicYear,
          class: { isActive: true },
          teacher: { deletedAt: null, user: { isActive: true, deletedAt: null } },
        },
        select: {
          id: true, subject: true, hoursPerWeek: true,
          teacherId: true,
          class: { select: { id: true, name: true } },
          schedules: { where: { academicYear, semester }, select: { id: true } },
        },
        orderBy: [{ class: { name: 'asc' } }, { subject: 'asc' }, { id: 'asc' }],
      });

      // Only auto-schedule assignments without existing schedules for the target semester.
      const needsSched = assignments.filter((a) => a.schedules.length === 0);
      if (needsSched.length === 0) return { generated: [], skipped: assignments.length, conflicts: [] };

      // Track occupied slots: classId/day/jp and teacherId/day/jp
      const classSlots = new Set<string>(); // `${classId}|${day}|${jp}`
      const teacherSlots = new Set<string>(); // `${teacherId}|${day}|${jp}`
      const teacherJpCount = new Map<string, number>(); // teacherId → total JP
      const conflicts: { assignment: string; reason: string }[] = [];

      // Load existing schedules into occupancy maps while the cutover lock is still held.
      const existing = await tx.schedule.findMany({
        where: { academicYear, semester },
        select: { classId: true, dayOfWeek: true, jpStart: true, jpEnd: true,
          teachingAssignment: { select: { teacherId: true } } },
      });
      for (const s of existing) {
        for (let jp = s.jpStart; jp <= s.jpEnd; jp++) {
          classSlots.add(`${s.classId}|${s.dayOfWeek}|${jp}`);
          const teacherKey = `${s.teachingAssignment.teacherId}|${s.dayOfWeek}|${jp}`;
          if (!teacherSlots.has(teacherKey)) teacherJpCount.set(s.teachingAssignment.teacherId, (teacherJpCount.get(s.teachingAssignment.teacherId) ?? 0) + 1);
          teacherSlots.add(teacherKey);
        }
      }

      // Greedy: for each assignment, try to place hoursPerWeek JP slots
      const generated: {
        assignmentId: string; subject: string; className: string;
        day: number; jpStart: number; jpEnd: number;
      }[] = [];

      for (const a of needsSched) {
        const classId = a.class?.id;
        if (!classId) { conflicts.push({ assignment: a.id, reason: 'Kelas penugasan tidak aktif atau tidak ditemukan.' }); continue; }
        let placed = 0;

        outer: for (let day = 1; day <= DAYS && placed < a.hoursPerWeek; day++) {
          for (const jp of [...(dayJps.get(day) ?? [])].sort((a, b) => a - b)) {
            if (placed >= a.hoursPerWeek) break;
            const classKey = `${classId}|${day}|${jp}`;
            const teacherKey = `${a.teacherId}|${day}|${jp}`;

            if (classSlots.has(classKey)) continue; // class busy
            if (teacherSlots.has(teacherKey)) continue; // teacher busy
            const guruJp = teacherJpCount.get(a.teacherId) ?? 0;
            if (guruJp >= MAX_JP_GURU) { conflicts.push({ assignment: a.id, reason: `Batas maksimal ${MAX_JP_GURU} JP guru tercapai.` }); break outer; }

            // Place 1 JP slot
            classSlots.add(classKey);
            teacherSlots.add(teacherKey);
            teacherJpCount.set(a.teacherId, guruJp + 1);
            placed++;

            generated.push({
              assignmentId: a.id, subject: a.subject, className: a.class?.name ?? '-',
              day, jpStart: jp, jpEnd: jp,
            });
          }
        }

        if (placed < a.hoursPerWeek) {
          conflicts.push({ assignment: a.id, reason: `Hanya dapat menempatkan ${placed}/${a.hoursPerWeek} JP karena slot kosong tidak cukup.` });
        }
      }

      return { generated, skipped: assignments.length - needsSched.length, conflicts };
    });
  }
}
