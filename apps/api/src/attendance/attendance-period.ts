import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Official DATE boundaries; never infer a school's semester from calendar months. */
export async function readAttendancePeriod(
  db: Pick<Prisma.TransactionClient, 'semester'>,
  input: { academicYear?: string; semester?: number },
) {
  if (
    (input.academicYear === undefined) !== (input.semester === undefined) ||
    (input.academicYear !== undefined &&
      (!/^\d{4}\/\d{4}$/.test(input.academicYear) ||
        Number(input.academicYear.slice(5)) !== Number(input.academicYear.slice(0, 4)) + 1 ||
        ![1, 2].includes(input.semester!)))
  )
    throw new BadRequestException('Tahun ajaran atau semester tidak valid');
  const periods = await db.semester.findMany({
    where: input.academicYear
      ? { number: input.semester, academicYear: { code: input.academicYear } }
      : { isActive: true, academicYear: { isActive: true } },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      academicYear: { select: { id: true, code: true } },
    },
    take: 2,
  });
  const period = periods[0];
  if (
    periods.length !== 1 ||
    !period ||
    !Number.isFinite(period.startDate.getTime()) ||
    !Number.isFinite(period.endDate.getTime()) ||
    period.startDate > period.endDate
  )
    throw new ConflictException('Periode kehadiran belum dapat diverifikasi.');
  return period;
}
export type AttendancePeriod = Awaited<ReturnType<typeof readAttendancePeriod>>;
