// Compatibility adapter: all teacher clients share the unified, idempotent staff ledger.
// Legacy rows remain in custody, but no second attendance write path is allowed.
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  RECEIPT_SELECT,
  StaffAttendanceService,
} from '../staff-attendance/staff-attendance.service';
import { schoolDate } from '../staff-attendance/attendance-rules';
import { AttendanceQuerySchema } from '../staff-attendance/staff-attendance.dto';
import {
  CheckInDto,
  CheckOutDto,
  ListTeacherAttendanceQueryDto,
} from './dto/teacher-attendance.dto';

const ELEVATED = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'];
const SELECT = {
  ...RECEIPT_SELECT,
  notes: true,
  createdAt: true,
  legacyTeacherAttendanceId: true,
  user: {
    select: { fullName: true, staff: { select: { niy: true } }, teacher: { select: { id: true } } },
  },
} as const;
type RecordRow = Prisma.StaffAttendanceGetPayload<{ select: typeof SELECT }>;

@Injectable()
export class TeacherAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffAttendanceService,
  ) {}

  private async teacher(keycloakId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { deletedAt: null, user: { keycloakId, isActive: true, deletedAt: null } },
      select: { id: true, userId: true },
    });
    if (!teacher) throw new NotFoundException('Profil guru aktif tidak ditemukan untuk akun ini');
    return teacher;
  }

  private legacy(row: RecordRow, photoUrl: string | null = null) {
    return {
      ...row,
      user: undefined,
      legacyTeacherAttendanceId: undefined,
      teacherId: row.user.teacher?.id,
      outsideGeofence: row.locationInStatus === 'OUTSIDE',
      photoUrl, // Only an exact, ownership-checked migrated association may provide this.
      teacher: {
        id: row.user.teacher?.id,
        user: { fullName: row.user.fullName, staff: row.user.staff },
      },
    };
  }

  private async legacyById(id: string) {
    const row = await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id }, select: SELECT });
    return (await this.legacyRows([row]))[0]!;
  }

  private async legacyRows(rows: RecordRow[]) {
    const ids = rows.flatMap((row) => row.legacyTeacherAttendanceId ? [row.legacyTeacherAttendanceId] : []);
    const originals = ids.length ? await this.prisma.teacherAttendance.findMany({
      where: { id: { in: ids } }, select: { id: true, teacherId: true, date: true, photoUrl: true },
    }) : [];
    const lookup = new Map(originals.map((row) => [row.id, row]));
    return rows.map((row) => {
      const original = row.legacyTeacherAttendanceId ? lookup.get(row.legacyTeacherAttendanceId) : null;
      const photo = original && original.teacherId === row.user.teacher?.id &&
        original.date.getTime() === row.date.getTime() ? original.photoUrl : null;
      return this.legacy(row, photo);
    });
  }

  async checkIn(dto: CheckInDto, user: AuthUser) {
    await this.teacher(user.keycloakId);
    const { notes, photoUrl: _photo, ...location } = dto;
    const result = await this.staff.record(location, user, false, notes);
    return this.legacyById(result.receipt.id);
  }

  async checkOut(dto: CheckOutDto, user: AuthUser) {
    await this.teacher(user.keycloakId);
    const result = await this.staff.record(dto, user, true);
    return this.legacyById(result.receipt.id);
  }

  async myToday(user: AuthUser) {
    await this.teacher(user.keycloakId);
    const context = await this.staff.context(user);
    return {
      date: context.date,
      record: context.receipt ? await this.legacyById(context.receipt.id) : null,
      arrival: context.arrival,
    };
  }

  async findAll(query: ListTeacherAttendanceQueryDto, user: AuthUser) {
    const elevated = user.roles.some((role) => ELEVATED.includes(role));
    const where: Prisma.StaffAttendanceWhereInput = {
      user: { teacher: { is: { deletedAt: null } } },
    };
    if (elevated) {
      if (query.teacherId)
        where.user = { teacher: { is: { id: query.teacherId, deletedAt: null } } };
    } else if (user.roles.includes('GURU')) {
      where.userId = (await this.teacher(user.keycloakId)).userId;
    } else throw new ForbiddenException('Akses ditolak');
    if (query.from || query.to)
      where.date = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    if (query.outsideOnly) where.locationInStatus = 'OUTSIDE'; // Unknown GPS is not proof of outside.
    const [data, total] = await Promise.all([
      this.prisma.staffAttendance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SELECT,
      }),
      this.prisma.staffAttendance.count({ where }),
    ]);
    return {
      data: await this.legacyRows(data),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async todaySummary() {
    const date = schoolDate(new Date());
    const query = AttendanceQuerySchema.parse({
      from: date,
      to: date,
      unit: 'TEACHER',
      limit: 100,
    });
    const first = await this.staff.report(query);
    const rows = [...first.data];
    for (let page = 2; rows.length < first.total; page++) {
      const next = await this.staff.report({ ...query, page });
      if (!next.data.length) break;
      rows.push(...next.data);
    }
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: {
        teacherId: { in: rows.map((row) => row.employee.teacher!.id) },
        academicYear: {
          in: (
            await this.prisma.academicYear.findMany({
              where: { isActive: true },
              select: { code: true },
            })
          ).map((year) => year.code),
        },
      },
      select: { teacherId: true, subject: true },
    });
    const subjects = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const current = subjects.get(assignment.teacherId) ?? new Set<string>();
      current.add(assignment.subject);
      subjects.set(assignment.teacherId, current);
    }
    const roster = rows.map((row) => ({
      teacherId: row.employee.teacher!.id,
      nama: row.employee.fullName,
      inisial: row.employee.fullName
        .split(' ')
        .slice(0, 2)
        .map((word) => word[0])
        .join(''),
      mapel: [...(subjects.get(row.employee.teacher!.id) ?? [])].sort().join(', ') || '—',
      status: row.receipt
        ? row.receipt.checkOutAt
          ? 'Selesai'
          : 'Hadir'
        : row.status === 'NOT_DUE'
          ? 'Belum waktunya'
          : row.status === 'NOT_SCHEDULED'
            ? 'Tidak ada jadwal'
            : row.status === 'NOT_REQUIRED'
              ? 'Tidak terikat jam'
              : row.status === 'UNKNOWN'
                ? 'Perlu verifikasi'
                : 'Belum',
      checkInAt: row.receipt?.checkInAt ?? null,
      checkOutAt: row.receipt?.checkOutAt ?? null,
      outsideGeofence: row.receipt?.locationInStatus === 'OUTSIDE',
      locationStatus: row.receipt?.locationInStatus ?? null,
      arrival: row.arrival,
    }));
    return {
      date,
      total: roster.length,
      hadir: roster.filter((row) => row.status === 'Hadir' || row.status === 'Selesai').length,
      selesai: roster.filter((row) => row.status === 'Selesai').length,
      belum: roster.filter((row) => row.status === 'Belum').length,
      outsideGeofence: roster.filter((row) => row.outsideGeofence).length,
      roster,
    };
  }
}
