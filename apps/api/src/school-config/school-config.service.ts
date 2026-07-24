import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CalendarType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { logger } from '@smk/logger';

@Injectable()
export class SchoolConfigService {
  private profileCache: { data: unknown; expiresAt: number } | null = null;
  private readonly PROFILE_TTL = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ═══ Profile (singleton) ═══════════════════════════════════════════════════

  async getProfile() {
    if (this.profileCache && Date.now() < this.profileCache.expiresAt) {
      return this.profileCache.data;
    }
    const profile = await this.prisma.schoolProfile.findFirst();
    if (!profile) throw new NotFoundException('School profile belum dikonfigurasi');

    // JANGAN ekspos kioskToken via endpoint profil (publik). Strip sebelum cache/return.
    const { kioskToken: _kioskToken, ...safe } = profile;
    this.profileCache = { data: safe, expiresAt: Date.now() + this.PROFILE_TTL };
    return safe;
  }

  // ═══ Kiosk link (token publik Ruang Guru) ══════════════════════════════════
  async getKioskToken() {
    const profile = await this.prisma.schoolProfile.findFirst({ select: { kioskToken: true } });
    return { token: profile?.kioskToken ?? null };
  }

  async regenerateKioskToken() {
    const profile = await this.prisma.schoolProfile.findFirst({ select: { id: true } });
    if (!profile) throw new NotFoundException('School profile belum dikonfigurasi');
    const token = randomBytes(24).toString('base64url'); // ~32 char URL-safe, sulit ditebak
    await this.prisma.schoolProfile.update({ where: { id: profile.id }, data: { kioskToken: token } });
    this.profileCache = null;
    return { token };
  }

  async validateKioskToken(token: string): Promise<boolean> {
    if (!token || token.length < 16) return false;
    const profile = await this.prisma.schoolProfile.findFirst({ select: { kioskToken: true } });
    return !!profile?.kioskToken && profile.kioskToken === token;
  }

  async updateProfile(data: Record<string, unknown>) {
    const profile = await this.prisma.schoolProfile.findFirst();
    if (!profile) throw new NotFoundException('School profile belum dikonfigurasi');

    const updated = await this.prisma.schoolProfile.update({
      where: { id: profile.id },
      data,
    });
    this.profileCache = null;
    // JANGAN ekspos kioskToken — strip sebelum return (sama seperti getProfile).
    const { kioskToken: _kioskToken, ...safe } = updated;
    return safe;
  }

  // ═══ Majors ════════════════════════════════════════════════════════════════

  async getMajors(activeOnly = false) {
    return this.prisma.major.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { code: 'asc' },
    });
  }

  async createMajor(data: { code: string; name: string; description?: string | null; isActive?: boolean }) {
    const exists = await this.prisma.major.findUnique({ where: { code: data.code }, select: { id: true } });
    if (exists) throw new ConflictException(`Kode jurusan ${data.code} sudah terdaftar.`);
    return this.prisma.major.create({ data });
  }

  async updateMajor(id: string, data: Record<string, unknown>) {
    try {
      return await this.prisma.major.update({ where: { id }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException('Jurusan tidak ditemukan.');
        if (e.code === 'P2002') throw new ConflictException('Kode jurusan sudah digunakan.');
      }
      throw e;
    }
  }

  // ═══ Academic Years ════════════════════════════════════════════════════════

  async getAcademicYears() {
    return this.prisma.academicYear.findMany({
      orderBy: { code: 'desc' },
    });
  }

  async getActiveAcademicYear() {
    const ay = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!ay) throw new NotFoundException('Tidak ada tahun ajaran aktif');
    return ay;
  }

  async createAcademicYear(data: { code: string; startDate: Date; endDate: Date; isActive?: boolean }) {
    // Cek duplikat SEBELUM menonaktifkan yang lain (hindari efek samping bila gagal).
    const exists = await this.prisma.academicYear.findUnique({ where: { code: data.code }, select: { id: true } });
    if (exists) throw new ConflictException(`Tahun ajaran ${data.code} sudah terdaftar.`);
    // TF2-P1-1: Capture oldActiveYear SEBELUM transaction mengubah isActive.
    const oldActiveYear = data.isActive
      ? await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
      : null;
    // C1: Transactional — deactivate-all + create must be atomic.
    // BUG FIX: Activating a new TA must also deactivate ALL semesters from the old TA.
    const result = await this.prisma.$transaction(async (tx) => {
      if (data.isActive) {
        await tx.academicYear.updateMany({ data: { isActive: false } });
        await tx.semester.updateMany({ data: { isActive: false } });
      }
      return tx.academicYear.create({ data });
    });
    // TF2-P1-1: Cascade cleanup tahun lama setelah commit berhasil.
    if (oldActiveYear && oldActiveYear.id !== result.id) {
      await this.cleanupOldYearPermissions(oldActiveYear.id);
    }
    return result;
  }

  async updateAcademicYear(id: string, data: Record<string, unknown>) {
    // C1: Transactional — deactivate-all + activate-target must be atomic.
    // H1: Map Prisma P2025 → NotFoundException.
    // BUG FIX: Activating a TA must also deactivate ALL semesters from the old TA.
    // TF2-P1-1: Capture oldActiveYear SEBELUM transaction mengubah isActive.
    const oldActiveYear = data.isActive === true
      ? await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
      : null;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (data.isActive === true) {
          await tx.academicYear.updateMany({ data: { isActive: false } });
          await tx.semester.updateMany({ data: { isActive: false } });
        }
        return tx.academicYear.update({ where: { id }, data });
      });
      // TF2-P1-1: Cascade cleanup tahun lama setelah commit berhasil.
      if (oldActiveYear && oldActiveYear.id !== id) {
        await this.cleanupOldYearPermissions(oldActiveYear.id);
      }
      return result;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Tahun ajaran tidak ditemukan.');
      }
      throw e;
    }
  }

  // ── TF2-P1-1: Zombie Permissions cleanup ─────────────────────────────────────
  // Saat tahun ajaran berganti, nonaktifkan semua StaffPosition tahun lama dan
  // hapus UserPermissionOverride yang terikat tahun tersebut. Ini mencegah
  // "zombie permissions" — izin bekas pejabat yang tetap aktif setelah tahun
  // berganti. resolvePermissions juga memfilter by activeYearId, jadi cleanup
  // ini adalah housekeeping fisik untuk integritas data.
  private async cleanupOldYearPermissions(oldYearId: string): Promise<void> {
    try {
      const spResult = await this.prisma.staffPosition.updateMany({
        where: { academicYearId: oldYearId, isActive: true },
        data: { isActive: false },
      });
      const upoResult = await this.prisma.userPermissionOverride.deleteMany({
        where: { academicYearId: oldYearId },
      });
      logger.info('[SchoolConfig] TF2-P1-1 zombie cleanup', {
        oldYearId,
        staffPositionsDeactivated: spResult.count,
        overridesDeleted: upoResult.count,
      });
    } catch (err) {
      // Fail-soft: cleanup gagal tidak harus memblokir aktivasi tahun baru.
      // resolvePermissions filter tetap melindungi dari zombie access.
      logger.warn('[SchoolConfig] TF2-P1-1 zombie cleanup failed (non-blocking)', {
        oldYearId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Active-year changes affect permission resolution even if physical
      // cleanup fails, so stale cached permissions must always be discarded.
      this.permissionsService.invalidateAll();
    }
  }

  // ═══ Semesters ═════════════════════════════════════════════════════════════

  async getSemesters(academicYearId?: string) {
    return this.prisma.semester.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: { academicYear: { select: { code: true } } },
      orderBy: [{ academicYear: { code: 'desc' } }, { number: 'asc' }],
    });
  }

  async getActiveSemester() {
    const semester = await this.prisma.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { code: true } } },
    });
    if (!semester) throw new NotFoundException('Tidak ada semester aktif');
    return semester;
  }

  async createSemester(data: { academicYearId: string; number: number; startDate: Date; endDate: Date; isActive?: boolean }) {
    const exists = await this.prisma.semester.findUnique({
      where: { academicYearId_number: { academicYearId: data.academicYearId, number: data.number } },
      select: { id: true },
    });
    if (exists) throw new ConflictException(`Semester ${data.number} sudah ada untuk tahun ajaran ini.`);
    // C1: Transactional — deactivate-all + create must be atomic.
    return this.prisma.$transaction(async (tx) => {
      if (data.isActive) {
        await tx.semester.updateMany({ data: { isActive: false } });
      }
      return tx.semester.create({ data });
    });
  }

  async updateSemester(id: string, data: Record<string, unknown>) {
    // C1: Transactional — deactivate-all + activate-target must be atomic.
    // H1: Map Prisma P2025 → NotFoundException.
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.isActive === true) {
          await tx.semester.updateMany({ data: { isActive: false } });
        }
        return tx.semester.update({ where: { id }, data });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Semester tidak ditemukan.');
      }
      throw e;
    }
  }

  // ═══ Academic Calendar ═════════════════════════════════════════════════════

  async getCalendarEvents(academicYearId?: string, type?: string) {
    const where: Record<string, unknown> = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (type) where.type = type as CalendarType;

    return this.prisma.academicCalendar.findMany({
      where,
      include: { academicYear: { select: { code: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  async createCalendarEvent(data: {
    academicYearId: string; name: string; startDate: Date; endDate: Date;
    type: CalendarType; description?: string | null;
  }) {
    return this.prisma.academicCalendar.create({ data });
  }

  async updateCalendarEvent(id: string, data: Record<string, unknown>) {
    return this.prisma.academicCalendar.update({ where: { id }, data });
  }

  async deleteCalendarEvent(id: string) {
    return this.prisma.academicCalendar.delete({ where: { id } });
  }
}
