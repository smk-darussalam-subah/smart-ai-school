import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { CalendarType, PermissionOverrideSource, Prisma } from '@prisma/client';
import { logger } from '@smk/logger';

@Injectable()
export class SchoolConfigService {
  private profileCache: { data: unknown; expiresAt: number } | null = null;
  private readonly PROFILE_TTL = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly academicPeriod: AcademicPeriodService,
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
      const updated = await this.prisma.major.update({ where: { id }, data });
      // Major identity/activity participates in appointment authority. Clear all
      // cached permission sets only after the database mutation succeeds.
      this.permissionsService.invalidateAll();
      return updated;
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
    const years = await this.prisma.academicYear.findMany({
      where: { isActive: true },
      take: 2,
      orderBy: { startDate: 'desc' },
    });
    if (Array.isArray(years)) {
      if (years.length !== 1) throw new NotFoundException('Tahun ajaran aktif harus tepat satu');
      return years[0]!;
    }
    const year = await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new NotFoundException('Tahun ajaran aktif harus tepat satu');
    return year;
  }

  async createAcademicYear(data: { code: string; startDate: Date; endDate: Date; isActive?: boolean }) {
    // Cek duplikat SEBELUM menonaktifkan yang lain (hindari efek samping bila gagal).
    const exists = await this.prisma.academicYear.findUnique({ where: { code: data.code }, select: { id: true } });
    if (exists) throw new ConflictException(`Tahun ajaran ${data.code} sudah terdaftar.`);
    // C1: Transactional — deactivate-all + create must be atomic.
    // BUG FIX: Activating a new TA must also deactivate ALL semesters from the old TA.
    let affectedAppointmentUsers: string[] = [];
    let oldActiveYearId: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      if (data.isActive) {
        await this.appointmentsService.acquireActivationLock(tx);
        const oldActiveYears = await tx.academicYear.findMany({
          where: { isActive: true },
          select: { id: true },
          take: 2,
        });
        if (Array.isArray(oldActiveYears) && oldActiveYears.length > 1) {
          throw new ConflictException('Tahun ajaran aktif harus tepat satu sebelum aktivasi baru diproses.');
        }
        oldActiveYearId = Array.isArray(oldActiveYears)
          ? oldActiveYears[0]?.id ?? null
          : (await tx.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null;
        await this.academicPeriod.assertAcademicYearActivationAllowed(tx, oldActiveYearId);
        await tx.academicYear.updateMany({ data: { isActive: false } });
        await tx.semester.updateMany({ data: { isActive: false } });
      }
      const created = await tx.academicYear.create({ data });
      if (data.isActive) {
        const summary = await this.appointmentsService.applyAcademicYearActivation(tx, {
          yearId: created.id,
          oldYearId: oldActiveYearId,
        });
        affectedAppointmentUsers = summary.affectedKeycloakIds;
        logger.info('[SchoolConfig] appointment cutover applied in academic-year create transaction', {
          yearId: created.id,
          oldYearId: oldActiveYearId,
          endedAppointments: summary.endedCount,
          cancelledAppointments: summary.cancelledCount,
          activatedAppointments: summary.activatedCount,
        });
      }
      return created;
    });
    // TF2-P1-1: Cascade cleanup tahun lama setelah commit berhasil.
    if (oldActiveYearId && oldActiveYearId !== result.id) {
      await this.cleanupOldYearPermissions(oldActiveYearId);
    }
    if (data.isActive) {
      this.invalidateAppointmentUsers(affectedAppointmentUsers);
    }
    return result;
  }

  async updateAcademicYear(id: string, data: Record<string, unknown>) {
    // C1: Transactional — deactivate-all + activate-target must be atomic.
    // H1: Map Prisma P2025 → NotFoundException.
    // BUG FIX: Activating a TA must also deactivate ALL semesters from the old TA.
    try {
      let affectedAppointmentUsers: string[] = [];
      let oldActiveYearId: string | null = null;
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.academicYear.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
        if (!existing) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
        if ('isActive' in data) {
          await this.assertGenericAcademicYearMutationAllowed(tx, existing, data.isActive);
        }
        if (data.isActive === true) {
          await this.appointmentsService.acquireActivationLock(tx);
          const oldActiveYears = await tx.academicYear.findMany({
            where: { isActive: true },
            select: { id: true },
            take: 2,
          });
          if (Array.isArray(oldActiveYears) && oldActiveYears.length > 1) {
            throw new ConflictException('Tahun ajaran aktif harus tepat satu sebelum aktivasi baru diproses.');
          }
          oldActiveYearId = Array.isArray(oldActiveYears)
            ? oldActiveYears[0]?.id ?? null
            : (await tx.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null;
          if (oldActiveYearId !== id) {
            await this.academicPeriod.assertAcademicYearActivationAllowed(tx, oldActiveYearId);
          }
          await tx.academicYear.updateMany({ data: { isActive: false } });
          await tx.semester.updateMany({ data: { isActive: false } });
        }
        const updated = await tx.academicYear.update({ where: { id }, data });
        if (data.isActive === true) {
          const summary = await this.appointmentsService.applyAcademicYearActivation(tx, {
            yearId: id,
            oldYearId: oldActiveYearId && oldActiveYearId !== id ? oldActiveYearId : null,
          });
          affectedAppointmentUsers = summary.affectedKeycloakIds;
          logger.info('[SchoolConfig] appointment cutover applied in academic-year update transaction', {
            yearId: id,
            oldYearId: oldActiveYearId,
            endedAppointments: summary.endedCount,
            cancelledAppointments: summary.cancelledCount,
            activatedAppointments: summary.activatedCount,
          });
        }
        return updated;
      });
      // TF2-P1-1: Cascade cleanup tahun lama setelah commit berhasil.
      if (oldActiveYearId && oldActiveYearId !== id) {
        await this.cleanupOldYearPermissions(oldActiveYearId);
      }
      if (data.isActive === true) {
        this.invalidateAppointmentUsers(affectedAppointmentUsers);
      }
      return result;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Tahun ajaran tidak ditemukan.');
      }
      throw e;
    }
  }

  private invalidateAppointmentUsers(keycloakIds: string[]): void {
    const uniqueIds = [...new Set(keycloakIds)];
    for (const keycloakId of uniqueIds) {
      this.permissionsService.invalidateUser(keycloakId);
    }
    if (uniqueIds.length === 0) {
      this.permissionsService.invalidateAll();
    }
  }

  private async assertGenericAcademicYearMutationAllowed(
    tx: Prisma.TransactionClient,
    existing: { id: string; isActive: boolean },
    requestedValue: unknown,
  ): Promise<void> {
    if (existing.isActive) {
      throw new ConflictException(
        'Tahun ajaran aktif tidak boleh diubah statusnya melalui endpoint generic. Gunakan workflow Penutupan Semester.',
      );
    }
    if (requestedValue !== true) return;
    const [activeYearCount, activeSemesterCount] = await Promise.all([
      tx.academicYear.count({ where: { isActive: true } }),
      tx.semester.count({ where: { isActive: true } }),
    ]);
    if (activeYearCount > 0 || activeSemesterCount > 0) {
      throw new ConflictException(
        'Aktivasi tahun ajaran harus melalui workflow Penutupan Semester.',
      );
    }
  }

  private async assertGenericSemesterMutationAllowed(
    tx: Prisma.TransactionClient,
    existing: { id: string; academicYearId: string; number: number; isActive: boolean },
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!('isActive' in data)) return;
    if (existing.isActive) {
      throw new ConflictException(
        'Semester aktif tidak boleh diubah statusnya melalui endpoint generic. Gunakan workflow Penutupan Semester.',
      );
    }
    if (data.isActive !== true) return;
    await this.academicPeriod.assertInitialSemesterActivationAllowed(tx, {
      semesterId: existing.id,
      academicYearId: typeof data.academicYearId === 'string' ? data.academicYearId : existing.academicYearId,
      number: typeof data.number === 'number' ? data.number : existing.number,
    });
  }

  // ── TF2-P1-1: Zombie Permissions cleanup ─────────────────────────────────────
  // Saat tahun ajaran berganti, nonaktifkan semua StaffPosition tahun lama dan
  // hapus UserPermissionOverride yang terikat tahun tersebut. Ini mencegah
  // "zombie permissions" — izin bekas pejabat yang tetap aktif setelah tahun
  // berganti. resolvePermissions juga memfilter by activeYearId, jadi cleanup
  // ini adalah housekeeping fisik untuk integritas data.
  // Wave C: retain MANUAL exceptions; cleanup only legacy POSITION_ASSIGNMENT rows.
  private async cleanupOldYearPermissions(oldYearId: string): Promise<void> {
    try {
      const spResult = await this.prisma.staffPosition.updateMany({
        where: { academicYearId: oldYearId, isActive: true },
        data: { isActive: false },
      });
      const upoResult = await this.prisma.userPermissionOverride.deleteMany({
        where: {
          academicYearId: oldYearId,
          source: PermissionOverrideSource.POSITION_ASSIGNMENT,
        },
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
    const semesters = await this.prisma.semester.findMany({
      where: { isActive: true },
      include: { academicYear: { select: { code: true } } },
      take: 2,
      orderBy: { startDate: 'desc' },
    });
    if (Array.isArray(semesters)) {
      if (semesters.length !== 1) throw new NotFoundException('Semester aktif harus tepat satu');
      return semesters[0]!;
    }
    const semester = await this.prisma.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: { select: { code: true } } },
    });
    if (!semester) throw new NotFoundException('Semester aktif harus tepat satu');
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
        await this.academicPeriod.assertInitialSemesterActivationAllowed(tx, {
          academicYearId: data.academicYearId,
          number: data.number,
        });
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
        const existing = await tx.semester.findUnique({
          where: { id },
          select: { id: true, academicYearId: true, number: true, isActive: true },
        });
        if (!existing) throw new NotFoundException('Semester tidak ditemukan.');
        await this.academicPeriod.assertWritableSemesterId(tx, id);
        await this.assertGenericSemesterMutationAllowed(tx, existing, data);
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
