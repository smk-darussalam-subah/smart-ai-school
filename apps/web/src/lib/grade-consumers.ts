import { z } from 'zod';
import { GRADE_COMPONENT_KEYS, type StudentGradeComponents } from './academic';
import type { GradeItem } from './api';
import type { SummaryReadState, TeacherThreshold } from './teacher-summary';

/** One authoritative parent read, not a fabricated server revision. */
export interface GradeReadSnapshot {
  rows: readonly GradeItem[];
  state: SummaryReadState;
}
export interface AcknowledgedGradeEdit {
  snapshot: GradeReadSnapshot;
  score: number;
}
/** Save acknowledgements can overlay only the read from which the edit started. */
export function gradeRecordScore(
  serverScore: number,
  snapshot: GradeReadSnapshot,
  edit?: AcknowledgedGradeEdit,
): number {
  return snapshot.state === 'ready' && edit?.snapshot === snapshot ? edit.score : serverScore;
}

/** Average repeated component records before existing weighted NA; order is not policy. */
export function meanGradeScores(scores: number[]): number | null {
  const valid = scores
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100)
    .sort((a, b) => a - b);
  return valid.length ? valid.reduce((sum, score) => sum + score, 0) / valid.length : null;
}

export function averageGradeComponents(
  rows: Pick<GradeItem, 'type' | 'score'>[],
): StudentGradeComponents {
  const components: StudentGradeComponents = {};
  for (const type of GRADE_COMPONENT_KEYS) {
    const value = meanGradeScores(
      rows
        .filter((row) => row.type === type && row.score.trim() !== '')
        .map((row) => Number(row.score)),
    );
    if (value !== null) components[type] = value;
  }
  return components;
}

export function subjectThreshold(rows: TeacherThreshold[], subject: string): number | null {
  const matches = rows.filter((row) => row.mapel === subject);
  if (matches.length !== 1) return null;
  const row = matches[0]!;
  return ['config', 'module', 'system_default'].includes(row.kktpProvenance) &&
    row.kktp !== null &&
    Number.isFinite(row.kktp) &&
    row.kktp >= 0 &&
    row.kktp <= 100
    ? row.kktp
    : null;
}

const ConfigRows = z.array(
  z.object({
    id: z.string().min(1),
    subject: z.string().min(1),
    kktp: z.number().int().min(0).max(100),
    academicYear: z.string(),
    semester: z.number().int(),
  }),
);
export function kktpConfigSnapshot(
  result: { success: boolean; data?: unknown; state?: string },
  academicYear: string,
  semester: number,
): { state: 'ready' | 'denied' | 'unavailable'; values: Record<string, number> } {
  const empty = { values: {} };
  if (!result.success)
    return { ...empty, state: result.state === 'denied' ? 'denied' : 'unavailable' };
  const parsed = ConfigRows.safeParse(result.data);
  if (
    !/^\d{4}\/\d{4}$/.test(academicYear) ||
    ![1, 2].includes(semester) ||
    !parsed.success ||
    parsed.data.some((row) => row.academicYear !== academicYear || row.semester !== semester) ||
    new Set(parsed.data.map((row) => row.subject)).size !== parsed.data.length
  )
    return { ...empty, state: 'unavailable' };
  return {
    state: 'ready',
    values: Object.fromEntries(parsed.data.map((row) => [row.subject, row.kktp])),
  };
}

export function validKktpDraft(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

export function gradeCsvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Spreadsheet text must not become a formula when a name/label starts with an operator.
  const safe = typeof value === 'string' && /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
