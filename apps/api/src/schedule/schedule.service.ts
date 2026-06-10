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
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGuruOnly, isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveTeacherId, resolveSiswaClassId } from '../common/helpers/role-helpers';
import { CreateScheduleDto } from './dto/create-schedule.dto';
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
        jpStart:              { lt: dto.jpEnd },
        jpEnd:                { gt: dto.jpStart },
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
          jpStart:      { lt: dto.jpEnd },
          jpEnd:        { gt: dto.jpStart },
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
}
