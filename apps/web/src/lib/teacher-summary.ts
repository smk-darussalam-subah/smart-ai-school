import { z } from 'zod';
import type { GradeItem } from './api';
import type { AcademicPeriod } from './academic-scheduling';

export type SummaryReadState = 'ready' | 'denied' | 'unavailable';
export interface TeacherSummaryAvailability {
  grades: SummaryReadState;
  attendance: SummaryReadState;
  journal: SummaryReadState;
  rpp: SummaryReadState;
  assessments: SummaryReadState;
  kktp: SummaryReadState;
  today: SummaryReadState | 'outside-period';
}
export interface TeacherThreshold {
  mapel: string;
  kktp: number | null;
  kktpProvenance: string;
}

// Consume only authoritative metadata, never turn NA/CP aggregates into record counts.
const ThresholdResponse = z.object({
  mapelProgress: z.array(
    z.object({
      mapel: z.string().min(1),
      kktp: z.number().finite().min(0).max(100).nullable(),
      kktpProvenance: z.enum(['config', 'module', 'system_default', 'unconfigured']),
    }),
  ),
});

export function readTeacherThresholds(value: unknown): TeacherThreshold[] | null {
  const result = ThresholdResponse.safeParse(value);
  if (!result.success) return null;
  const rows = result.data.mapelProgress;
  if (
    new Set(rows.map((row) => row.mapel)).size !== rows.length ||
    rows.some((row) => row.kktpProvenance === 'unconfigured' && row.kktp !== null)
  )
    return null;
  return rows;
}

/** Never choose the last threshold if two scoped reads disagree. */
export function mergeTeacherThresholds(groups: TeacherThreshold[][]): TeacherThreshold[] | null {
  const catalog = new Map<string, TeacherThreshold>();
  for (const row of groups.flat()) {
    const previous = catalog.get(row.mapel);
    if (previous && (previous.kktp !== row.kktp || previous.kktpProvenance !== row.kktpProvenance))
      return null;
    catalog.set(row.mapel, row);
  }
  return [...catalog.values()];
}

/** Record-level monitoring, not unique-student attainment or weighted report-card NA. */
export function teacherGradeRecords(grades: GradeItem[], thresholds: TeacherThreshold[]) {
  const catalog = new Map(thresholds.map((row) => [row.mapel, row.kktp]));
  const valid = grades.filter(
    (row) =>
      row.score.trim() !== '' &&
      Number.isFinite(Number(row.score)) &&
      Number(row.score) >= 0 &&
      Number(row.score) <= 100,
  );
  const evaluated = valid.filter((row) => catalog.get(row.assignment.subject) != null);
  const passed = evaluated.filter(
    (row) => Number(row.score) >= catalog.get(row.assignment.subject)!,
  );
  const unknown = valid.length - evaluated.length;
  return {
    records: valid.length,
    passed: passed.length,
    below: evaluated.length - passed.length,
    unknown,
    percentage: valid.length && !unknown ? Math.round((passed.length / valid.length) * 100) : null,
    average: valid.length
      ? Math.round((valid.reduce((sum, row) => sum + Number(row.score), 0) / valid.length) * 10) /
        10
      : null,
  };
}

/** Today actions require the active configured semester and its actual WIB date range. */
export function teacherTodayState(
  active: AcademicPeriod | null,
  selected: AcademicPeriod | null,
  today: string,
): 'ready' | 'outside-period' | 'unavailable' {
  if (!active || !selected) return 'unavailable';
  const date = z.string().date().safeParse(today);
  const start = z.string().date().safeParse(selected.startDate.slice(0, 10));
  const end = z.string().date().safeParse(selected.endDate.slice(0, 10));
  const activeStart = z.string().date().safeParse(active.startDate.slice(0, 10));
  const activeEnd = z.string().date().safeParse(active.endDate.slice(0, 10));
  if (
    !date.success ||
    !start.success ||
    !end.success ||
    !activeStart.success ||
    !activeEnd.success ||
    start.data > end.data ||
    activeStart.data > activeEnd.data
  )
    return 'unavailable';
  if (today < activeStart.data || today > activeEnd.data) return 'outside-period';
  return active.academicYear.code === selected.academicYear.code &&
    active.number === selected.number &&
    today >= start.data &&
    today <= end.data
    ? 'ready'
    : 'outside-period';
}

export function summaryReadMessage(state: SummaryReadState, label: string): string {
  return state === 'denied'
    ? `Anda tidak memiliki izin melihat ${label}.`
    : `${label} belum dapat dimuat. Coba muat ulang halaman.`;
}
