// =============================================================================
// AttendanceService — Bulk insert + ownership absensi
//
// POST (bulk):
//   Hanya GURU yang mengajar di classId tersebut (via TeachingAssignment).
//   Bulk insert atomik via prisma.$transaction — sebagian gagal → seluruh
//   transaksi di-rollback. P2002 (unique [studentId,classId,date]) propagate ke
//   PrismaExceptionFilter global → 409. Jangan try/catch manual di sini.
//   recordedBy = auth.users.id (bukan teacherId, konsisten dengan audit field policy).
//
// GET:
//   SA/KS/TU: semua; GURU: hanya kelas yang ia ajar; SISWA: diri sendiri;
//   ORANG_TUA: nilai anak.
//   Filter classId + date range opsional.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { isGuruOnly, isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveTeacherId, resolveGuruClassIds, resolveSiswaId } from '../common/helpers/role-helpers';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { ListAttendanceQuery } from './dto/list-attendance.dto';
import { EVENTS, AttendanceRecordedPayload } from '../events/events.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse 'YYYY-MM-DD' → UTC midnight Date tanpa ambiguitas timezone */
function parseDateStr(s: string): Date {
  const parts = s.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(Date.UTC(y, m - 1, d));
}

// ── Select shape ─────────────────────────────────────────────────────────────

const ATTENDANCE_SELECT = {
  id:         true,
  studentId:  true,
  classId:    true,
  date:       true,
  status:     true,
  notes:      true,
  recordedBy: true,
  createdAt:  true,
  student: {
    select: {
      id:  true,
      nis: true,
      user: { select: { fullName: true } },
    },
  },
  class: { select: { id: true, name: true, majorCode: true } },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** keycloakId → student.id[] (satu atau lebih anak untuk ORANG_TUA) */
  private async resolveChildStudentIds(keycloakId: string): Promise<string[]> {
    const userId = await resolveUserId(this.prisma, keycloakId);
    const children = await this.prisma.student.findMany({
      where: { parentId: userId },
      select: { id: true },
    });
    if (children.length === 0) {
      throw new ForbiddenException('Tidak ada data anak yang terdaftar untuk akun ini');
    }
    return children.map((c) => c.id);
  }

  // ── bulkCreate ──────────────────────────────────────────────────────────────

  async bulkCreate(dto: CreateAttendanceDto, user: AuthUser) {
    // 1. Resolve userId untuk recordedBy
    const userId = await resolveUserId(this.prisma, user.keycloakId);

    // 2. Pastikan guru mengajar di classId ini (ownership POST)
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, classId: dto.classId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Guru tidak mengajar di kelas ini');
    }

    // 3. Pastikan kelas ada
    const kelas = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');

    // 4. Parse date string → Date (UTC tengah malam)
    const date = parseDateStr(dto.date);

    // 5. Bulk insert atomik via $transaction
    // Jika ada P2002 (unique [studentId,classId,date]) → seluruh transaksi di-rollback
    // → error propagate ke PrismaExceptionFilter global → 409
    const results = await this.prisma.$transaction(
      dto.records.map((r) =>
        this.prisma.attendance.create({
          data: {
            studentId:  r.studentId,
            classId:    dto.classId,
            date,
            status:     r.status as AttendanceStatus,
            notes:      r.notes,
            recordedBy: userId,
          },
          select: ATTENDANCE_SELECT,
        }),
      ),
    );

    // Emit attendance.recorded hanya untuk alpha/sakit (guardrail SMA-43)
    for (const record of results) {
      if (record.status === 'alpha' || record.status === 'sakit') {
        const absPayload: AttendanceRecordedPayload = {
          attendanceId: record.id,
          studentId:    record.studentId,
          classId:      record.classId,
          date:         dto.date,
          status:       record.status as 'alpha' | 'sakit',
        };
        this.eventEmitter.emit(EVENTS.ATTENDANCE_RECORDED, absPayload);
      }
    }

    return {
      count:   results.length,
      date:    dto.date,
      classId: dto.classId,
      data:    results,
    };
  }

  // ── findAll ─────────────────────────────────────────────────────────────────

  async findAll(query: ListAttendanceQuery, user: AuthUser) {
    const where: Prisma.AttendanceWhereInput = {};

    // Date range filter
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = parseDateStr(query.dateFrom);
      if (query.dateTo)   dateFilter.lte = parseDateStr(query.dateTo);
      where.date = dateFilter;
    }

    // Ownership filter per role
    if (isGuruOnly(user)) {
      const myClassIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      if (myClassIds.length === 0) {
        return { data: [], total: 0, page: query.page, limit: query.limit };
      }
      if (query.classId) {
        if (!myClassIds.includes(query.classId)) {
          throw new ForbiddenException('Guru tidak mengajar di kelas ini');
        }
        where.classId = query.classId;
      } else {
        where.classId = { in: myClassIds };
      }
    } else if (isSiswaOnly(user)) {
      where.studentId = await resolveSiswaId(this.prisma, user.keycloakId);
      // query.studentId diabaikan — paksa ke diri sendiri
      if (query.classId) where.classId = query.classId;
    } else if (isOrangTuaOnly(user)) {
      const childIds = await this.resolveChildStudentIds(user.keycloakId);
      where.studentId = { in: childIds };
      if (query.classId) where.classId = query.classId;
    } else {
      // ELEVATED (SA/KS/TU): filter opsional
      if (query.classId)   where.classId   = query.classId;
      if (query.studentId) where.studentId = query.studentId;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take:    query.limit,
        select:  ATTENDANCE_SELECT,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }
}
