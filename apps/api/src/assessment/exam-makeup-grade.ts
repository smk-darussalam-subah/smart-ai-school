import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const score = z.number().min(0).max(100);
const snapshotSchema = z.object({
  originalScore: score,
  originalGradeVersion: z.string().datetime(),
  kktp: score.int(),
  provenance: z.enum(['module', 'config']),
  applied: z.object({ rawScore: score, finalScore: score, gradeVersion: z.string().datetime() }).optional(),
});

export type ExamMakeupGradeSnapshot = z.infer<typeof snapshotSchema>;

export function readMakeupGradeSnapshot(json: Prisma.JsonValue): ExamMakeupGradeSnapshot {
  const snapshot = snapshotSchema.safeParse(json);
  if (!snapshot.success)
    throw new ConflictException('Riwayat nilai susulan belum lengkap. Periksa sebelum menyimpan nilai.');
  return snapshot.data;
}

export function makeupFinalScore(original: number, raw: number, kktp: number): number {
  const average = new Prisma.Decimal(original).plus(raw).dividedBy(2).toDecimalPlaces(2);
  return Math.max(kktp, average.toNumber());
}
