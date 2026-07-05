// =============================================================================
// TeacherAttendanceService — Presensi Guru GPS (referensi KamilEdu Modul 8)
//
// Geofence: koordinat sekolah di SchoolProfile (latitude/longitude nullable =
// geofence NONAKTIF). outsideGeofence = true bila:
//   (a) jarak haversine > geofenceRadiusM, ATAU
//   (b) sekolah ber-geofence tapi koordinat check-in tidak dikirim.
// Presensi TIDAK ditolak saat luar area — dicatat + diflag (kebijakan KamilEdu:
// flag_luar_area), keputusan tindak lanjut di tangan kepala sekolah.
// =============================================================================

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { haversineMeters } from './haversine';
import {
  CheckInDto,
  CheckOutDto,
  ListTeacherAttendanceQueryDto,
} from './dto/teacher-attendance.dto';

const ELEVATED = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] as const;

const ATTENDANCE_SELECT = {
  id: true, teacherId: true, date: true,
  checkInAt: true, checkOutAt: true,
  latIn: true, lngIn: true, latOut: true, lngOut: true,
  distanceInM: true, outsideGeofence: true,
  photoUrl: true, notes: true, createdAt: true,
  teacher: {
    select: { id: true, user: { select: { fullName: true, staff: { select: { niy: true } } } } },
  },
} as const;

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class TeacherAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private isElevated(user: AuthUser): boolean {
    return user.roles.some((r) => (ELEVATED as readonly string[]).includes(r));
  }

  /** keycloakId → Teacher.id (404 bila user bukan guru terdaftar). */
  private async resolveTeacherId(keycloakId: string): Promise<string> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user: { keycloakId }, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException('Profil guru tidak ditemukan untuk akun ini');
    }
    return teacher.id;
  }

  /** Hitung jarak + flag geofence terhadap SchoolProfile. */
  private async evaluateGeofence(
    lat?: number | null,
    lng?: number | null,
  ): Promise<{ distanceInM: number | null; outsideGeofence: boolean }> {
    const profile = await this.prisma.schoolProfile.findFirst({
      select: { latitude: true, longitude: true, geofenceRadiusM: true },
    });

    const schoolLat = profile?.latitude ? Number(profile.latitude) : null;
    const schoolLng = profile?.longitude ? Number(profile.longitude) : null;

    // Geofence nonaktif (sekolah belum set koordinat) → tidak ada flag
    if (schoolLat === null || schoolLng === null) {
      return { distanceInM: null, outsideGeofence: false };
    }
    // Geofence aktif tapi koordinat tidak dikirim → tak terverifikasi = flag
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return { distanceInM: null, outsideGeofence: true };
    }

    const distance = haversineMeters(lat, lng, schoolLat, schoolLng);
    return {
      distanceInM: distance,
      outsideGeofence: distance > (profile?.geofenceRadiusM ?? 300),
    };
  }

  async checkIn(dto: CheckInDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const date = todayUtcDate();

    const existing = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId, date } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Sudah check-in hari ini');
    }

    const { distanceInM, outsideGeofence } = await this.evaluateGeofence(dto.lat, dto.lng);

    return this.prisma.teacherAttendance.create({
      data: {
        teacherId,
        date,
        checkInAt: new Date(),
        latIn: dto.lat ?? null,
        lngIn: dto.lng ?? null,
        distanceInM,
        outsideGeofence,
        photoUrl: dto.photoUrl ?? null,
        notes: dto.notes ?? null,
      },
      select: ATTENDANCE_SELECT,
    });
  }

  async checkOut(dto: CheckOutDto, user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const date = todayUtcDate();

    const existing = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId, date } },
      select: { id: true, checkOutAt: true },
    });
    if (!existing) throw new NotFoundException('Belum check-in hari ini');
    if (existing.checkOutAt) throw new ConflictException('Sudah check-out hari ini');

    return this.prisma.teacherAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: new Date(),
        latOut: dto.lat ?? null,
        lngOut: dto.lng ?? null,
      },
      select: ATTENDANCE_SELECT,
    });
  }

  /** Status hari ini milik guru ybs (untuk state tombol UI). */
  async myToday(user: AuthUser) {
    const teacherId = await this.resolveTeacherId(user.keycloakId);
    const record = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId, date: todayUtcDate() } },
      select: ATTENDANCE_SELECT,
    });
    return { date: todayUtcDate().toISOString().slice(0, 10), record };
  }

  /** Rekap: staf bebas filter; GURU dipaksa miliknya sendiri DI QUERY. */
  async findAll(query: ListTeacherAttendanceQueryDto, user: AuthUser) {
    const where: Prisma.TeacherAttendanceWhereInput = {};

    if (this.isElevated(user)) {
      if (query.teacherId) where.teacherId = query.teacherId;
    } else if (user.roles.includes('GURU')) {
      where.teacherId = await this.resolveTeacherId(user.keycloakId);
    } else {
      throw new ForbiddenException('Akses ditolak');
    }

    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
      };
    }
    if (query.outsideOnly) where.outsideGeofence = true;

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.teacherAttendance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
        skip,
        take: query.limit,
        select: ATTENDANCE_SELECT,
      }),
      this.prisma.teacherAttendance.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  /**
   * P1 (S-05): Today's teacher attendance summary for KS/SA dashboard.
   * Returns counts + roster of all teachers with their check-in status for today.
   * Reuses existing TeacherAttendance records (from 2F GPS presensi).
   */
  async todaySummary() {
    const date = todayUtcDate();

    // All active teachers
    const teachers = await this.prisma.teacher.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        user: {
          select: {
            fullName: true,
          },
        },
        assignments: {
          where: {},
          select: { subject: true },
          take: 1,
        },
      },
    });

    // Today's attendance records
    const records = await this.prisma.teacherAttendance.findMany({
      where: { date },
      select: {
        teacherId: true,
        checkInAt: true,
        checkOutAt: true,
        outsideGeofence: true,
      },
    });

    const recordMap = new Map(records.map((r) => [r.teacherId, r]));

    const roster = teachers.map((t) => {
      const rec = recordMap.get(t.id);
      const nama = t.user?.fullName ?? '—';
      const inisial = nama.split(' ').map((w) => w[0]).slice(0, 2).join('');
      const mapel = t.assignments[0]?.subject ?? '—';
      return {
        teacherId: t.id,
        nama,
        inisial,
        mapel,
        status: rec ? (rec.checkOutAt ? 'Selesai' : 'Hadir') : 'Belum',
        checkInAt: rec?.checkInAt ?? null,
        checkOutAt: rec?.checkOutAt ?? null,
        outsideGeofence: rec?.outsideGeofence ?? false,
      };
    });

    const hadir = roster.filter((r) => r.status === 'Hadir' || r.status === 'Selesai').length;
    const selesai = roster.filter((r) => r.status === 'Selesai').length;
    const belum = roster.filter((r) => r.status === 'Belum').length;
    const outside = roster.filter((r) => r.outsideGeofence).length;

    return {
      date: date.toISOString().slice(0, 10),
      total: teachers.length,
      hadir,
      selesai,
      belum,
      outsideGeofence: outside,
      roster,
    };
  }
}
