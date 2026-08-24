import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BellScheduleScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBellProfileDto, UpdateBellProfileDto } from './bell-schedule.dto';

const BELL_MUTATION_LOCK = 'operational:bell-schedule:mutation:v1';

const PROFILE_INCLUDE = {
  segments: { orderBy: { sortOrder: 'asc' as const } },
} as const;

export type ResolvedBellProfile = Awaited<ReturnType<BellScheduleService['resolveForDate']>>;

@Injectable()
export class BellScheduleService {
  constructor(private readonly prisma: PrismaService) {}

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

  async update(id: string, dto: UpdateBellProfileDto) {
    if (dto.segments) this.assertSegments(dto.segments);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.acquireMutationLock(tx);
        const current = await tx.bellScheduleProfile.findUnique({ where: { id } });
        if (!current || current.revokedAt) throw new NotFoundException('Profil bel tidak ditemukan');

        const effectiveFrom = dto.effectiveFrom ?? this.dateOnly(current.effectiveFrom);
        const effectiveUntil = dto.effectiveUntil !== undefined
          ? dto.effectiveUntil
          : current.effectiveUntil ? this.dateOnly(current.effectiveUntil) : null;
        this.assertProfileDates(effectiveFrom, effectiveUntil);

        if (dto.segments) {
          await tx.bellScheduleSegment.deleteMany({ where: { profileId: id } });
        }
        return tx.bellScheduleProfile.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
            ...(dto.effectiveFrom !== undefined ? { effectiveFrom: this.asDate(dto.effectiveFrom) } : {}),
            ...(dto.effectiveUntil !== undefined
              ? { effectiveUntil: dto.effectiveUntil ? this.asDate(dto.effectiveUntil) : null }
              : {}),
            ...(dto.provenance !== undefined ? { provenance: dto.provenance } : {}),
            ...(dto.segments ? { segments: { create: dto.segments } } : {}),
          },
          include: PROFILE_INCLUDE,
        });
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.rethrowProfileConflict(error);
    }
  }

  async revoke(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireMutationLock(tx);
      const result = await tx.bellScheduleProfile.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count !== 1) throw new NotFoundException('Profil bel tidak ditemukan');
      return { revoked: true };
    });
  }

  async resolveForDate(
    dateInput: string | Date,
    scope: BellScheduleScope = 'SCHOOL',
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const date = typeof dateInput === 'string' ? this.asDate(dateInput) : this.asDate(this.dateOnly(dateInput));
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
    return profile;
  }

  resolveInstructionWindow(
    date: string,
    profile: { segments: { type: string; jpNumber: number | null; startMinute: number; endMinute: number }[] },
    jpStart: number,
    jpEnd: number,
  ): { startAt: Date; endAt: Date } {
    const start = profile.segments.find((segment) => segment.type === 'INSTRUCTION' && segment.jpNumber === jpStart);
    const end = profile.segments.find((segment) => segment.type === 'INSTRUCTION' && segment.jpNumber === jpEnd);
    if (!start || !end || end.endMinute <= start.startMinute) {
      throw new ServiceUnavailableException('Rentang JP tidak tersedia pada profil bel authoritative');
    }
    return {
      startAt: this.minuteInJakarta(date, start.startMinute),
      endAt: this.minuteInJakarta(date, end.endMinute),
    };
  }

  private assertSegments(segments: { jpNumber: number | null; type: string; startMinute: number; endMinute: number; sortOrder: number }[]) {
    const ordered = [...segments].sort((a, b) => a.startMinute - b.startMinute);
    const jp = new Set<number>();
    const sort = new Set<number>();
    for (let index = 0; index < ordered.length; index += 1) {
      const segment = ordered[index]!;
      if (segment.endMinute <= segment.startMinute || segment.startMinute < 0 || segment.endMinute > 1440) {
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
      } else if (segment.jpNumber !== null) {
        throw new BadRequestException('Segmen non-pembelajaran tidak boleh memiliki nomor JP');
      }
    }
  }

  private assertProfileDates(from: string, until: string | null) {
    if (until && until < from) throw new BadRequestException('effectiveUntil tidak boleh sebelum effectiveFrom');
  }

  private async acquireMutationLock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${BELL_MUTATION_LOCK}))`);
  }

  private asDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private minuteInJakarta(date: string, minute: number): Date {
    const hours = Math.floor(minute / 60).toString().padStart(2, '0');
    const minutes = (minute % 60).toString().padStart(2, '0');
    return new Date(`${date}T${hours}:${minutes}:00.000+07:00`);
  }

  private rethrowProfileConflict(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2004'].includes(error.code)) {
      throw new ConflictException('Kode atau rentang efektif profil bel bertentangan dengan konfigurasi lain');
    }
    if (error instanceof Error && /overlap|exclusion|conflict/i.test(error.message)) {
      throw new ConflictException('Rentang efektif atau segmen profil bel bertentangan');
    }
    throw error;
  }
}
