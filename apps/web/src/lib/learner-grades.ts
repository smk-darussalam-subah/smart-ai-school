import { z } from 'zod';
import type { ApiFetchResult } from './api';

const score = z.number().finite().min(0).max(100).nullable();
const subjectSchema = z
  .object({
    subject: z.string().trim().min(1),
    uh: score,
    praktik: score,
    sikap: score,
    uts: score,
    uas: score,
    na: score,
    kktp: score,
    kktpProvenance: z.enum(['config', 'module', 'system_default', 'unconfigured']),
    status: z.enum(['tuntas', 'remedial']).nullable(),
  })
  .superRefine((row, ctx) => {
    const expected =
      row.na === null || row.kktp === null ? null : row.na >= row.kktp ? 'tuntas' : 'remedial';
    if (row.status !== expected)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Grade status does not match official threshold',
      });
  });
const responseSchema = z.object({
  data: z.array(
    z.object({
      studentId: z.string().min(1),
      subjects: z.array(subjectSchema),
    }),
  ),
});

/** Validated read model. Scores/thresholds come from server analytics; missing
 * components are null, not zero. No invented trend, CP count, or ordinal code. */
export interface LearnerGrade {
  studentId: string;
  mp: string;
  na: number | null;
  kktp: number | null;
  kktpProvenance: z.infer<typeof subjectSchema>['kktpProvenance'];
  status: 'tuntas' | 'remedial' | null;
  components: {
    uh: number | null;
    praktik: number | null;
    sikap: number | null;
    uts: number | null;
    uas: number | null;
  };
}
export type LearnerGradeState = 'ready' | 'denied' | 'unavailable' | 'period-unavailable';
export interface LearnerGradeRead {
  state: LearnerGradeState;
  data: LearnerGrade[];
}

export function readLearnerGrades(result: ApiFetchResult<unknown> | null): LearnerGradeRead {
  if (!result) return { state: 'period-unavailable', data: [] };
  if (result.status !== 'success')
    return { state: result.status === 'forbidden' ? 'denied' : 'unavailable', data: [] };
  const parsed = responseSchema.safeParse(result.data);
  if (!parsed.success) return { state: 'unavailable', data: [] };
  const students = new Set<string>();
  for (const student of parsed.data.data) {
    if (
      students.has(student.studentId) ||
      new Set(student.subjects.map((s) => s.subject)).size !== student.subjects.length
    )
      return { state: 'unavailable', data: [] };
    students.add(student.studentId);
  }
  return {
    state: 'ready',
    data: parsed.data.data.flatMap((student) =>
      student.subjects.map((subject) => ({
        studentId: student.studentId,
        mp: subject.subject,
        na: subject.na,
        kktp: subject.kktp,
        kktpProvenance: subject.kktpProvenance,
        status: subject.status,
        components: {
          uh: subject.uh,
          praktik: subject.praktik,
          sikap: subject.sikap,
          uts: subject.uts,
          uas: subject.uas,
        },
      })),
    ),
  };
}

export function learnerGradeSummary(grades: LearnerGrade[]) {
  const scored = grades.filter((g): g is LearnerGrade & { na: number } => g.na !== null);
  const assessed = grades.filter((g) => g.status !== null);
  return {
    average: scored.length
      ? Math.round((scored.reduce((s, g) => s + g.na, 0) / scored.length) * 10) / 10
      : null,
    assessed: assessed.length,
    tuntas: assessed.filter((g) => g.status === 'tuntas').length,
    remedial: assessed.filter((g) => g.status === 'remedial').length,
  };
}
export function learnerGradeStatus(grade: LearnerGrade): string {
  return grade.na === null
    ? 'Nilai belum lengkap'
    : grade.kktp === null
      ? 'KKTP belum tersedia'
      : grade.status === 'tuntas'
        ? 'Tuntas'
        : 'Perlu remedial';
}
