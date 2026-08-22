import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { createHash } from 'crypto';
import { APPOINTMENT_ACTIVATION_LOCK_KEY } from '../appointments/appointments.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

type PeriodDb = PrismaService | Prisma.TransactionClient;

export interface AcademicPeriodIdentity {
  academicYearId: string;
  academicYear: string;
  semesterId: string;
  semester: number;
  startDate: Date;
  endDate: Date;
}

export interface NextPeriodIdentity {
  academicYearId: string;
  academicYear: string;
  semesterId: string;
  semester: number;
  startDate: Date;
  endDate: Date;
}

const CLOSED_PERIOD_CODE = 'ACADEMIC_PERIOD_CLOSED' as const;

@Injectable()
export class AcademicPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async acquireCutoverLock(db: Pick<Prisma.TransactionClient, '$executeRaw'>): Promise<void> {
    await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${APPOINTMENT_ACTIVATION_LOCK_KEY}))`);
  }

  async getActivePeriod(db: PeriodDb = this.prisma): Promise<AcademicPeriodIdentity> {
    const [years, semesters] = await Promise.all([
      db.academicYear.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
        take: 2,
        orderBy: { code: 'desc' },
      }),
      db.semester.findMany({
        where: { isActive: true },
        select: { id: true, academicYearId: true, number: true, startDate: true, endDate: true },
        take: 2,
        orderBy: [{ startDate: 'desc' }, { number: 'desc' }],
      }),
    ]);

    if (years.length !== 1 || semesters.length !== 1) {
      throw new ConflictException('Konfigurasi tahun ajaran dan semester aktif harus tepat satu');
    }
    const year = years[0]!;
    const semester = semesters[0]!;
    if (semester.academicYearId !== year.id) {
      throw new ConflictException('Semester aktif harus terikat pada tahun ajaran aktif');
    }
    return {
      academicYearId: year.id,
      academicYear: year.code,
      semesterId: semester.id,
      semester: semester.number,
      startDate: semester.startDate,
      endDate: semester.endDate,
    };
  }

  async findPeriodByCodeAndSemester(
    academicYear: string,
    semester: number,
    db: PeriodDb = this.prisma,
  ): Promise<AcademicPeriodIdentity> {
    const period = await db.semester.findFirst({
      where: { number: semester, academicYear: { code: academicYear } },
      select: {
        id: true,
        number: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { id: true, code: true } },
      },
    });
    if (!period) throw new NotFoundException('Periode akademik tidak ditemukan');
    return {
      academicYearId: period.academicYear.id,
      academicYear: period.academicYear.code,
      semesterId: period.id,
      semester: period.number,
      startDate: period.startDate,
      endDate: period.endDate,
    };
  }

  async findPeriodForDate(date: Date, db: PeriodDb = this.prisma): Promise<AcademicPeriodIdentity> {
    const period = await db.semester.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
      select: {
        id: true,
        number: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { id: true, code: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    if (!period) throw new BadRequestException('Tanggal berada di luar periode semester yang terdaftar');
    return {
      academicYearId: period.academicYear.id,
      academicYear: period.academicYear.code,
      semesterId: period.id,
      semester: period.number,
      startDate: period.startDate,
      endDate: period.endDate,
    };
  }

  async assertWritablePeriod(
    db: PeriodDb,
    input: { academicYear: string; semester: number },
  ): Promise<AcademicPeriodIdentity> {
    const period = await this.findPeriodByCodeAndSemester(input.academicYear, input.semester, db);
    await this.assertWritableSemesterId(db, period.semesterId);
    return period;
  }

  async assertWritablePeriodWithCutoverLock(
    db: Prisma.TransactionClient,
    input: { academicYear: string; semester: number },
  ): Promise<AcademicPeriodIdentity> {
    await this.acquireCutoverLock(db);
    return this.assertWritablePeriod(db, input);
  }

  async assertWritableDate(db: PeriodDb, date: Date): Promise<AcademicPeriodIdentity> {
    const period = await this.findPeriodForDate(date, db);
    await this.assertWritableSemesterId(db, period.semesterId);
    return period;
  }

  async assertWritableDateWithCutoverLock(
    db: Prisma.TransactionClient,
    date: Date,
  ): Promise<AcademicPeriodIdentity> {
    await this.acquireCutoverLock(db);
    return this.assertWritableDate(db, date);
  }

  async assertWritableSemesterId(db: PeriodDb, semesterId: string): Promise<void> {
    const closure = await db.semesterClosure.findUnique({
      where: { semesterId },
      select: { id: true, closedAt: true },
    });
    if (closure) {
      throw new ConflictException({
        code: CLOSED_PERIOD_CODE,
        message: 'Periode semester sudah ditutup dan tidak menerima perubahan akademik.',
        closedAt: closure.closedAt,
      });
    }
  }

  async assertPrincipalCloseAuthority(user: AuthUser): Promise<void> {
    const activePositions = await this.permissions.getActivePositionCodes(user.keycloakId);
    if (!activePositions.has('KEPALA_SEKOLAH')) {
      throw new ForbiddenException('Penutupan semester hanya dapat dilakukan oleh Kepala Sekolah dengan Appointment aktif.');
    }
  }

  async assertGenericActivationAllowed(
    tx: Prisma.TransactionClient,
    targetSemesterId?: string | null,
  ): Promise<void> {
    const activeRows = await tx.semester.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 2,
    });
    if (activeRows.length > 1) {
      throw new ConflictException('Semester aktif harus tepat satu sebelum aktivasi generik diproses.');
    }
    const active = activeRows[0] ?? null;
    if (!active) return;
    if (targetSemesterId && active.id === targetSemesterId) return;
    throw new ConflictException(
      'Aktivasi tahun ajaran atau semester aktif harus melalui workflow Penutupan Semester.',
    );
  }

  async assertAcademicYearActivationAllowed(
    tx: Prisma.TransactionClient,
    oldActiveYearId: string | null,
  ): Promise<void> {
    await this.assertGenericActivationAllowed(tx);
    if (!oldActiveYearId) return;
    const oldFinalSemester = await tx.semester.findFirst({
      where: { academicYearId: oldActiveYearId, number: 2 },
      select: { id: true, closure: { select: { id: true } } },
    });
    if (!oldFinalSemester?.closure) {
      throw new ConflictException(
        'Aktivasi tahun ajaran berikutnya hanya boleh setelah Semester 2 tahun ajaran lama ditutup final.',
      );
    }
  }

  async assertInitialSemesterActivationAllowed(
    tx: Prisma.TransactionClient,
    target: { semesterId?: string | null; academicYearId: string; number: number },
  ): Promise<void> {
    const activeRows = await tx.semester.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 2,
    });
    if (activeRows.length > 1) {
      throw new ConflictException('Semester aktif harus tepat satu sebelum aktivasi awal diproses.');
    }
    const active = activeRows[0] ?? null;
    if (active) {
      if (target.semesterId && active.id === target.semesterId) return;
      throw new ConflictException(
        'Transisi semester aktif harus melalui workflow Penutupan Semester.',
      );
    }

    const years = await tx.academicYear.findMany({
      where: { isActive: true },
      select: { id: true },
      take: 2,
    });
    if (years.length !== 1 || years[0]?.id !== target.academicYearId) {
      throw new ConflictException('Aktivasi awal semester harus berada pada tepat satu tahun ajaran aktif.');
    }
    if (target.number !== 1) {
      throw new ConflictException('Aktivasi awal hanya boleh untuk Semester 1. Semester 2 aktif melalui close Semester 1.');
    }
    if (target.semesterId) {
      await this.assertWritableSemesterId(tx, target.semesterId);
    }
  }

  async findNextPeriodForClose(
    period: AcademicPeriodIdentity,
    requestedNextSemesterId: string | null | undefined,
    db: PeriodDb = this.prisma,
  ): Promise<NextPeriodIdentity | null> {
    if (period.semester === 2) {
      if (requestedNextSemesterId) {
        throw new BadRequestException('Semester 2 tidak boleh menerima nextSemesterId dalam Wave 7.');
      }
      return null;
    }
    const next = await db.semester.findFirst({
      where: {
        ...(requestedNextSemesterId ? { id: requestedNextSemesterId } : {}),
        academicYearId: period.academicYearId,
        number: 2,
      },
      select: { id: true, academicYearId: true, number: true, startDate: true, endDate: true, isActive: true },
    });
    if (!next) throw new ConflictException('Semester 2 berikutnya belum tersedia untuk aktivasi setelah close.');
    if (next.isActive) throw new ConflictException('Semester berikutnya tidak boleh sudah aktif sebelum close.');
    await this.assertWritableSemesterId(db, next.id);
    return {
      academicYearId: next.academicYearId,
      academicYear: period.academicYear,
      semesterId: next.id,
      semester: next.number,
      startDate: next.startDate,
      endDate: next.endDate,
    };
  }

  stableJson(value: unknown): string {
    return JSON.stringify(this.sortValue(value));
  }

  sha256(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortValue(item));
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, this.sortValue(item)]),
    );
  }
}
