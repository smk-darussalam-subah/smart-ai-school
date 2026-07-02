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
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { ListScheduleQuery } from './dto/list-schedule.dto';

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
  constructor(private prisma: PrismaService) {}

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
    if (isGuruOnly(user)) {
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
      where.classId = { in: childClassIds };
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

  async create(dto: CreateScheduleDto) {
    // 1. Validasi teachingAssignmentId → ambil teacherId, classId, academicYear
    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { id: dto.teachingAssignmentId },
      select: { id: true, teacherId: true, classId: true, academicYear: true },
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

    // 1b. Cek konflik RENTANG kelas (2F-1; unique DB hanya jpStart)
    await this.assertNoClassRangeConflict({
      classId: dto.classId, dayOfWeek: dto.dayOfWeek,
      jpStart: dto.jpStart, jpEnd: dto.jpEnd,
      academicYear: dto.academicYear, semester: dto.semester,
    });

    // 2. Cek konflik guru (app-level, sebelum insert):
    //    Guru yang sama tidak boleh mengajar di slot JP yang overlap di hari & semester yang sama
    const guruTaIds = await this.prisma.teachingAssignment
      .findMany({
        where: { teacherId: assignment.teacherId },
        select: { id: true },
      })
      .then((rows) => rows.map((r) => r.id));

    const guruConflict = await this.prisma.schedule.findFirst({
      where: {
        teachingAssignmentId: { in: guruTaIds },
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
      const roomConflict = await this.prisma.schedule.findFirst({
        where: {
          room:         dto.room,
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
    return this.prisma.schedule.create({
      data: {
        classId:              dto.classId,
        teachingAssignmentId: dto.teachingAssignmentId,
        dayOfWeek:            dto.dayOfWeek,
        jpStart:              dto.jpStart,
        jpEnd:                dto.jpEnd,
        room:                 dto.room ?? null,
        academicYear:         dto.academicYear,
        semester:             dto.semester,
      },
      select: SCHEDULE_SELECT,
    });
  }
  // ── 2F-1: cek konflik rentang KELAS (unique DB hanya menjaga jpStart) ───────
  private async assertNoClassRangeConflict(params: {
    classId: string; dayOfWeek: number; jpStart: number; jpEnd: number;
    academicYear: string; semester: number; excludeId?: string;
  }): Promise<void> {
    const clash = await this.prisma.schedule.findFirst({
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
  async update(id: string, dto: UpdateScheduleDto) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
      select: {
        id: true, classId: true, teachingAssignmentId: true, dayOfWeek: true,
        jpStart: true, jpEnd: true, room: true, academicYear: true, semester: true,
        teachingAssignment: { select: { teacherId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Jadwal tidak ditemukan');

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

    await this.assertNoClassRangeConflict({
      classId: existing.classId, dayOfWeek: next.dayOfWeek,
      jpStart: next.jpStart, jpEnd: next.jpEnd,
      academicYear: existing.academicYear, semester: next.semester,
      excludeId: id,
    });

    // Konflik guru (exclude diri sendiri) — inklusif
    const guruTaIds = await this.prisma.teachingAssignment
      .findMany({ where: { teacherId: existing.teachingAssignment.teacherId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    const guruConflict = await this.prisma.schedule.findFirst({
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
      const roomConflict = await this.prisma.schedule.findFirst({
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

    return this.prisma.schedule.update({
      where: { id },
      data: next,
      select: SCHEDULE_SELECT,
    });
  }

  // ── 2F-1: hapus slot (hard delete — template mingguan tanpa dependen FK) ────
  async remove(id: string) {
    const existing = await this.prisma.schedule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Jadwal tidak ditemukan');
    await this.prisma.schedule.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── T3-02 B8: Auto-scheduling (greedy constraint-based) ────────────────────

  /** B8: Auto-generate weekly schedules from teaching assignments.
   *  Greedy constraint-based: fills slots (day×JP) avoiding teacher/class conflicts.
   *  Returns generated slots (preview) without persisting — caller calls create() per slot. */
  async autoGenerate(academicYear: string, semester: number, config: { days?: number; jpPerDay?: number; maxJpGuru?: number }) {
    const DAYS = config.days ?? 6; // Senin–Sabtu
    const JP_PER_DAY = config.jpPerDay ?? 8;
    const MAX_JP_GURU = config.maxJpGuru ?? 24;

    // Fetch all teaching assignments needing schedule
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { academicYear },
      select: {
        id: true, subject: true, hoursPerWeek: true,
        teacherId: true,
        class: { select: { id: true, name: true } },
        schedules: { select: { id: true } }, // count existing
      },
    });

    // Only auto-schedule assignments without existing schedules
    const needsSched = assignments.filter((a) => a.schedules.length === 0);
    if (needsSched.length === 0) return { generated: [], skipped: assignments.length, conflicts: [] };

    // Track occupied slots: classId/day/jp and teacherId/day/jp
    const classSlots = new Set<string>(); // `${classId}|${day}|${jp}`
    const teacherSlots = new Set<string>(); // `${teacherId}|${day}|${jp}`
    const teacherJpCount = new Map<string, number>(); // teacherId → total JP
    const conflicts: { assignment: string; reason: string }[] = [];

    // Load existing schedules into occupancy maps
    const existing = await this.prisma.schedule.findMany({
      where: { academicYear, semester },
      select: { classId: true, dayOfWeek: true, jpStart: true, jpEnd: true,
        teachingAssignment: { select: { teacherId: true } } },
    });
    for (const s of existing) {
      for (let jp = s.jpStart; jp <= s.jpEnd; jp++) {
        classSlots.add(`${s.classId}|${s.dayOfWeek}|${jp}`);
        teacherSlots.add(`${s.teachingAssignment.teacherId}|${s.dayOfWeek}|${jp}`);
      }
      const cur = teacherJpCount.get(s.teachingAssignment.teacherId) ?? 0;
      teacherJpCount.set(s.teachingAssignment.teacherId, cur + (s.jpEnd - s.jpStart + 1));
    }

    // Greedy: for each assignment, try to place hoursPerWeek JP slots
    const generated: {
      assignmentId: string; subject: string; className: string;
      day: number; jpStart: number; jpEnd: number;
    }[] = [];

    for (const a of needsSched) {
      const classId = a.class?.id;
      if (!classId) { conflicts.push({ assignment: a.id, reason: 'No class assigned' }); continue; }
      let placed = 0;

      outer: for (let day = 1; day <= DAYS && placed < a.hoursPerWeek; day++) {
        for (let jp = 1; jp <= JP_PER_DAY && placed < a.hoursPerWeek; jp++) {
          const classKey = `${classId}|${day}|${jp}`;
          const teacherKey = `${a.teacherId}|${day}|${jp}`;

          if (classSlots.has(classKey)) continue; // class busy
          if (teacherSlots.has(teacherKey)) continue; // teacher busy
          const guruJp = teacherJpCount.get(a.teacherId) ?? 0;
          if (guruJp >= MAX_JP_GURU) { conflicts.push({ assignment: a.id, reason: `Teacher max JP (${MAX_JP_GURU}) reached` }); break outer; }

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
        conflicts.push({ assignment: a.id, reason: `Only placed ${placed}/${a.hoursPerWeek} JP — no free slots` });
      }
    }

    return { generated, skipped: assignments.length - needsSched.length, conflicts };
  }
}
