import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BellScheduleScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { CreateBellProfileDto, UpdateBellProfileDto } from './bell-schedule.dto';

const BELL_MUTATION_LOCK = 'operational:bell-schedule:mutation:v1';

const PROFILE_INCLUDE = {
  segments: { orderBy: { sortOrder: 'asc' as const } },
} as const;

export type ResolvedBellProfile = Awaited<ReturnType<BellScheduleService['resolveForDate']>>;

@Injectable()
export class BellScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService = new PermissionsService(prisma),
  ) {}

  /** Public-to-authorized-readers timing data; no approval, custody or revoked metadata. */
  async timingCatalog() {
    const [profiles, periods] = await Promise.all([
      this.prisma.bellScheduleProfile.findMany({
        where: { scope: 'SCHOOL', revokedAt: null },
        select: { id: true, code: true, name: true, kind: true, effectiveFrom: true, effectiveUntil: true,
          segments: { select: { dayOfWeek: true, type: true, jpNumber: true, label: true,
            startMinute: true, endMinute: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.prisma.semester.findMany({
        select: { number: true, startDate: true, endDate: true, academicYear: { select: { code: true } } },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    return { profiles, periods };
  }

  list(scope?: BellScheduleScope, includeRevoked = false) {
    return this.prisma.bellScheduleProfile.findMany({
      where: {
        ...(scope ? { scope } : {}),
        ...(!includeRevoked ? { revokedAt: null } : {}),
      },
      include: PROFILE_INCLUDE,
      orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    });
  }

  async create(dto: CreateBellProfileDto, actorId: string) {
    this.assertProfileDates(dto.effectiveFrom, dto.effectiveUntil ?? null);
    this.assertSegments(dto.segments);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquireMutationLock(tx);
        await assertFreshMutationAuthority(tx, this.permissions, actorId,
          'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);
        if (dto.scope === 'SCHOOL')
          await this.assertScheduleImpact(
            tx,
            dto.segments,
            dto.effectiveFrom,
            dto.effectiveUntil ?? null,
          );
        return tx.bellScheduleProfile.create({
          data: {
            code: dto.code,
            name: dto.name,
            scope: dto.scope,
            kind: dto.kind,
            timezone: 'Asia/Jakarta',
            effectiveFrom: this.asDate(dto.effectiveFrom),
            effectiveUntil: dto.effectiveUntil ? this.asDate(dto.effectiveUntil) : null,
            provenance: dto.provenance,
            createdBy: actorId,
            segments: { create: dto.segments },
          },
          include: PROFILE_INCLUDE,
        });
      });
    } catch (error) {
      this.rethrowProfileConflict(error);
    }
  }

  async update(id: string, dto: UpdateBellProfileDto, actorId: string) {
    if (dto.segments) this.assertSegments(dto.segments);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquireMutationLock(tx);
        await assertFreshMutationAuthority(tx, this.permissions, actorId,
          'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);
        const current = await tx.bellScheduleProfile.findUnique({ where: { id } });
        if (!current || current.revokedAt)
          throw new NotFoundException('Profil bel tidak ditemukan');

        const effectiveFrom = dto.effectiveFrom ?? this.dateOnly(current.effectiveFrom);
        const effectiveUntil =
          dto.effectiveUntil !== undefined
            ? dto.effectiveUntil
            : current.effectiveUntil
              ? this.dateOnly(current.effectiveUntil)
              : null;
        this.assertProfileDates(effectiveFrom, effectiveUntil);

        if (dto.segments) {
          if (current.scope === 'SCHOOL')
            await this.assertScheduleImpact(tx, dto.segments, effectiveFrom, effectiveUntil);
          await tx.bellScheduleSegment.deleteMany({ where: { profileId: id } });
        }
        const updated = await tx.bellScheduleProfile.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
            ...(dto.effectiveFrom !== undefined
              ? { effectiveFrom: this.asDate(dto.effectiveFrom) }
              : {}),
            ...(dto.effectiveUntil !== undefined
              ? { effectiveUntil: dto.effectiveUntil ? this.asDate(dto.effectiveUntil) : null }
              : {}),
            ...(dto.provenance !== undefined ? { provenance: dto.provenance } : {}),
            ...(dto.segments ? { segments: { create: dto.segments } } : {}),
          },
          include: PROFILE_INCLUDE,
        });
        if (dto.segments || dto.effectiveFrom !== undefined || dto.effectiveUntil !== undefined) {
          await this.assertExistingCoverage(
            tx,
            current.scope,
            current.effectiveFrom,
            current.effectiveUntil,
          );
        }
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.rethrowProfileConflict(error);
    }
  }

  async revoke(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      await assertFreshMutationAuthority(tx, this.permissions, actorId,
        'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']);
      const current = await tx.bellScheduleProfile.findUnique({ where: { id } });
      if (!current || current.revokedAt) throw new NotFoundException('Profil bel tidak ditemukan');
      const result = await tx.bellScheduleProfile.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count !== 1) throw new NotFoundException('Profil bel tidak ditemukan');
      await this.assertExistingCoverage(
        tx,
        current.scope,
        current.effectiveFrom,
        current.effectiveUntil,
      );
      return { revoked: true };
    });
  }

  async resolveForDate(
    dateInput: string | Date,
    scope: BellScheduleScope = 'SCHOOL',
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const date =
      typeof dateInput === 'string'
        ? this.asDate(dateInput)
        : this.asDate(this.dateOnly(dateInput));
    const matches = await db.bellScheduleProfile.findMany({
      where: {
        scope,
        revokedAt: null,
        effectiveFrom: { lte: date },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
      },
      include: PROFILE_INCLUDE,
      take: 2,
    });
    if (matches.length !== 1) {
      throw new ServiceUnavailableException(
        matches.length === 0
          ? 'Jadwal bel authoritative belum tersedia untuk tanggal dan scope ini'
          : 'Konfigurasi jadwal bel ambigu; operasi dihentikan',
      );
    }
    const profile = matches[0]!;
    this.assertSegments(profile.segments);
    const day = date.getUTCDay() || 7;
    const hasDailyPattern = profile.segments.some((segment) => segment.dayOfWeek !== 0);
    return {
      ...profile,
      segments: profile.segments.filter(
        (segment) => segment.dayOfWeek === (hasDailyPattern ? day : 0),
      ),
    };
  }

  resolveInstructionWindow(
    date: string,
    profile: {
      segments: { type: string; jpNumber: number | null; startMinute: number; endMinute: number }[];
    },
    jpStart: number,
    jpEnd: number,
  ): { startAt: Date; endAt: Date } {
    const start = profile.segments.find(
      (segment) => segment.type === 'INSTRUCTION' && segment.jpNumber === jpStart,
    );
    const end = profile.segments.find(
      (segment) => segment.type === 'INSTRUCTION' && segment.jpNumber === jpEnd,
    );
    for (let jp = jpStart; jp <= jpEnd; jp++) {
      if (
        !profile.segments.some(
          (segment) => segment.type === 'INSTRUCTION' && segment.jpNumber === jp,
        )
      )
        throw new ServiceUnavailableException(
          'Ada JP yang tidak tersedia pada rentang pembelajaran',
        );
    }
    if (!start || !end || end.endMinute <= start.startMinute) {
      throw new ServiceUnavailableException(
        'Rentang JP tidak tersedia pada profil bel authoritative',
      );
    }
    return {
      startAt: this.minuteInJakarta(date, start.startMinute),
      endAt: this.minuteInJakarta(date, end.endMinute),
    };
  }

  async instructionDaysForPeriod(
    db: Prisma.TransactionClient,
    academicYear: string,
    semester: number,
  ) {
    const period = await db.semester.findFirst({
      where: { number: semester, academicYear: { code: academicYear } },
      select: { startDate: true, endDate: true },
    });
    if (!period) throw new BadRequestException('Periode semester belum dikonfigurasi');
    const profiles = await db.bellScheduleProfile.findMany({
      where: {
        scope: 'SCHOOL',
        revokedAt: null,
        effectiveFrom: { lte: period.endDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: period.startDate } }],
      },
      include: PROFILE_INCLUDE,
    });
    const available = new Map<number, Set<number>>();
    for (
      let stamp = period.startDate.getTime();
      stamp <= period.endDate.getTime();
      stamp += 86400000
    ) {
      const date = new Date(stamp);
      const day = date.getUTCDay();
      if (day === 0) continue;
      const matches = profiles.filter(
        (profile) =>
          profile.effectiveFrom <= date &&
          (!profile.effectiveUntil || profile.effectiveUntil >= date),
      );
      if (matches.length !== 1)
        throw new ConflictException(
          'Periode semester belum memiliki cakupan bel yang lengkap dan tunggal',
        );
      const profile = matches[0]!;
      this.assertSegments(profile.segments);
      const daily = profile.segments.some((segment) => segment.dayOfWeek !== 0);
      const numbers = new Set(
        profile.segments
          .filter(
            (segment) => segment.type === 'INSTRUCTION' && segment.dayOfWeek === (daily ? day : 0),
          )
          .map((segment) => segment.jpNumber!),
      );
      const previous = available.get(day);
      available.set(
        day,
        previous ? new Set([...previous].filter((jp) => numbers.has(jp))) : numbers,
      );
    }
    return available;
  }

  async assertWeeklyRange(
    db: Prisma.TransactionClient,
    academicYear: string,
    semester: number,
    day: number,
    from: number,
    until: number,
  ) {
    const available = (await this.instructionDaysForPeriod(db, academicYear, semester)).get(day);
    for (let jp = from; jp <= until; jp++) {
      if (!available?.has(jp))
        throw new ConflictException(
          `JP ${jp} hari ${day} tidak tersedia sepanjang periode. Konfigurasikan bel dahulu atau sesuaikan jadwal.`,
        );
    }
  }

  private assertSegments(
    segments: {
      dayOfWeek?: number;
      jpNumber: number | null;
      type: string;
      startMinute: number;
      endMinute: number;
      sortOrder: number;
    }[],
  ) {
    const days = [...new Set(segments.map((segment) => segment.dayOfWeek ?? 0))];
    if (days.includes(0) && days.length > 1)
      throw new BadRequestException('Pola umum tidak boleh dicampur dengan pola harian');
    for (const day of days)
      this.assertDaySegments(segments.filter((segment) => (segment.dayOfWeek ?? 0) === day));
  }

  private assertDaySegments(
    segments: {
      jpNumber: number | null;
      type: string;
      startMinute: number;
      endMinute: number;
      sortOrder: number;
    }[],
  ) {
    const ordered = [...segments].sort((a, b) => a.startMinute - b.startMinute);
    const jp = new Set<number>();
    const sort = new Set<number>();
    for (let index = 0; index < ordered.length; index += 1) {
      const segment = ordered[index]!;
      if (
        segment.endMinute <= segment.startMinute ||
        segment.startMinute < 0 ||
        segment.endMinute > 1440
      ) {
        throw new BadRequestException('Rentang menit segmen bel tidak valid');
      }
      if (index > 0 && ordered[index - 1]!.endMinute > segment.startMinute) {
        throw new BadRequestException('Segmen jadwal bel tidak boleh saling tumpang tindih');
      }
      if (sort.has(segment.sortOrder)) throw new BadRequestException('sortOrder segmen harus unik');
      sort.add(segment.sortOrder);
      if (segment.type === 'INSTRUCTION') {
        if (segment.jpNumber === null || jp.has(segment.jpNumber)) {
          throw new BadRequestException('Nomor JP pembelajaran wajib ada dan unik');
        }
        jp.add(segment.jpNumber);
        if (segment.jpNumber !== jp.size)
          throw new BadRequestException('Nomor JP harus berurutan mulai dari 1 sesuai waktu');
      } else if (segment.jpNumber !== null) {
        throw new BadRequestException('Segmen non-pembelajaran tidak boleh memiliki nomor JP');
      }
    }
  }

  private assertProfileDates(from: string, until: string | null) {
    if (until && until < from)
      throw new BadRequestException('effectiveUntil tidak boleh sebelum effectiveFrom');
  }

  private async acquireMutationLock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('academic:schedule:mutation:v1'))`,
    );
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${BELL_MUTATION_LOCK}))`);
  }

  private async assertScheduleImpact(
    tx: Prisma.TransactionClient,
    segments: CreateBellProfileDto['segments'],
    from: string,
    until: string | null,
  ) {
    const fromDate = this.asDate(from);
    const untilDate = until ? this.asDate(until) : null;
    const periods = await tx.semester.findMany({
      where: {
        endDate: { gte: fromDate },
        ...(untilDate ? { startDate: { lte: untilDate } } : {}),
      },
      select: {
        number: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { code: true } },
      },
    });
    if (!periods.length) return;
    const schedules = await tx.schedule.findMany({
      where: {
        OR: periods.map((period) => ({
          academicYear: period.academicYear.code,
          semester: period.number,
        })),
      },
      select: {
        academicYear: true,
        semester: true,
        dayOfWeek: true,
        jpStart: true,
        jpEnd: true,
        class: { select: { name: true } },
      },
    });
    const affected = schedules.filter((schedule) => {
      const period = periods.find(
        (item) =>
          item.academicYear.code === schedule.academicYear && item.number === schedule.semester,
      )!;
      const firstDay = new Date(Math.max(period.startDate.getTime(), fromDate.getTime()));
      const lastDay = Math.min(period.endDate.getTime(), untilDate?.getTime() ?? Infinity);
      const firstOccurrence =
        firstDay.getTime() + ((schedule.dayOfWeek - firstDay.getUTCDay() + 7) % 7) * 86400000;
      if (firstOccurrence > lastDay) return false;
      const available = new Set(
        segments
          .filter(
            (segment) =>
              segment.type === 'INSTRUCTION' &&
              (segment.dayOfWeek === schedule.dayOfWeek || segment.dayOfWeek === 0),
          )
          .map((segment) => segment.jpNumber),
      );
      for (let jp = schedule.jpStart; jp <= schedule.jpEnd; jp++)
        if (!available.has(jp)) return true;
      return false;
    });
    if (affected.length)
      throw new ConflictException(
        `Perubahan JP berdampak pada ${affected.length} slot (${affected
          .slice(0, 3)
          .map((item) => item.class.name)
          .join(', ')}). Sesuaikan jadwal tersebut dahulu.`,
      );
  }

  private async assertExistingCoverage(
    tx: Prisma.TransactionClient,
    scope: BellScheduleScope,
    from: Date,
    until: Date | null,
  ) {
    if (scope !== 'SCHOOL') return;
    const periods = await tx.semester.findMany({
      where: { endDate: { gte: from }, ...(until ? { startDate: { lte: until } } : {}) },
      select: { number: true, academicYear: { select: { code: true } } },
    });
    for (const period of periods) {
      const schedules = await tx.schedule.findMany({
        where: { academicYear: period.academicYear.code, semester: period.number },
        select: { dayOfWeek: true, jpStart: true, jpEnd: true },
      });
      if (!schedules.length) continue;
      const available = await this.instructionDaysForPeriod(
        tx,
        period.academicYear.code,
        period.number,
      );
      for (const slot of schedules)
        for (let jp = slot.jpStart; jp <= slot.jpEnd; jp++) {
          if (!available.get(slot.dayOfWeek)?.has(jp))
            throw new ConflictException(
              'Perubahan tanggal/pencabutan bel akan menghilangkan cakupan JP jadwal aktif. Siapkan pengganti atau sesuaikan jadwal dahulu.',
            );
        }
    }
  }

  private asDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private minuteInJakarta(date: string, minute: number): Date {
    const hours = Math.floor(minute / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (minute % 60).toString().padStart(2, '0');
    return new Date(`${date}T${hours}:${minutes}:00.000+07:00`);
  }

  private rethrowProfileConflict(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004'].includes(error.code)
    ) {
      throw new ConflictException(
        'Kode atau rentang efektif profil bel bertentangan dengan konfigurasi lain',
      );
    }
    if (error instanceof Error && /overlap|exclusion|conflict/i.test(error.message)) {
      throw new ConflictException('Rentang efektif atau segmen profil bel bertentangan');
    }
    throw error;
  }
}
