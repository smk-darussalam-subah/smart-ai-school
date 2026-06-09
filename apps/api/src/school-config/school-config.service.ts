import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarType } from '@prisma/client';

@Injectable()
export class SchoolConfigService {
  private profileCache: { data: unknown; expiresAt: number } | null = null;
  private readonly PROFILE_TTL = 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  // ═══ Profile (singleton) ═══════════════════════════════════════════════════

  async getProfile() {
    if (this.profileCache && Date.now() < this.profileCache.expiresAt) {
      return this.profileCache.data;
    }
    const profile = await this.prisma.schoolProfile.findFirst();
    if (!profile) throw new NotFoundException('School profile belum dikonfigurasi');

    this.profileCache = { data: profile, expiresAt: Date.now() + this.PROFILE_TTL };
    return profile;
  }

  async updateProfile(data: Record<string, unknown>) {
    const profile = await this.prisma.schoolProfile.findFirst();
    if (!profile) throw new NotFoundException('School profile belum dikonfigurasi');

    const updated = await this.prisma.schoolProfile.update({
      where: { id: profile.id },
      data,
    });
    this.profileCache = null;
    return updated;
  }

  // ═══ Majors ════════════════════════════════════════════════════════════════

  async getMajors(activeOnly = false) {
    return this.prisma.major.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { code: 'asc' },
    });
  }

  async createMajor(data: { code: string; name: string; description?: string | null; isActive?: boolean }) {
    return this.prisma.major.create({ data });
  }

  async updateMajor(id: string, data: Record<string, unknown>) {
    return this.prisma.major.update({ where: { id }, data });
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
    if (data.isActive) {
      await this.prisma.academicYear.updateMany({ data: { isActive: false } });
    }
    return this.prisma.academicYear.create({ data });
  }

  async updateAcademicYear(id: string, data: Record<string, unknown>) {
    if (data.isActive === true) {
      await this.prisma.academicYear.updateMany({ data: { isActive: false } });
    }
    return this.prisma.academicYear.update({ where: { id }, data });
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
    if (data.isActive) {
      await this.prisma.semester.updateMany({ data: { isActive: false } });
    }
    return this.prisma.semester.create({ data });
  }

  async updateSemester(id: string, data: Record<string, unknown>) {
    if (data.isActive === true) {
      await this.prisma.semester.updateMany({ data: { isActive: false } });
    }
    return this.prisma.semester.update({ where: { id }, data });
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
