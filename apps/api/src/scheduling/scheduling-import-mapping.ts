import { DraftSlot, DraftSlotSchema } from './dto/scheduling-draft.dto';
import { ImportMapping } from './dto/scheduling-import.dto';
import { SchedulingSnapshot } from './scheduling-input-snapshot';
import { parseImportFile } from './scheduling-import-parser';

export interface ImportRowIssue { row: number; code: string; field?: string }
const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
const number = (raw: string) => /^(0|[1-9][0-9]{0,8})$/.test(raw) ? Number(raw) : NaN;

/** Every row is accounted for. A duplicate alias, blank row or ambiguous name never disappears. */
export function mapImportRows(file: Awaited<ReturnType<typeof parseImportFile>>, mapping: ImportMapping,
  input: SchedulingSnapshot, classIds: string[]) {
  const errors: ImportRowIssue[] = [];
  const slots: DraftSlot[] = [];
  const rowNumbers: number[] = [];
  const sources = new Set<string>();
  const aliases = new Map(mapping.assignments.map((a) => [a.source, a.assignmentId]));
  const assignments = new Map(input.assignments.filter((a) => classIds.includes(a.classId)).map((a) => [a.id, a]));
  const indices = new Map<string, number>();
  if (Object.values(mapping.columns).some((i) => i >= file.headers.length)) {
    return { slots, rowNumbers, errors: [{ row: 0, code: 'COLUMN_OUT_OF_RANGE' }], sources: [] as string[] };
  }
  for (const row of file.rows) {
    if (row.values.every((v) => !v)) { errors.push({ row: row.row, code: 'BLANK_ROW' }); continue; }
    const get = (field: keyof ImportMapping['columns']) => {
      const index = mapping.columns[field]; return index === undefined ? '' : row.values[index] ?? '';
    };
    const source = get('assignment'); sources.add(source);
    // A real UUID needs no alias. Other values REQUIRE explicit human resolution.
    const assignmentId = aliases.get(source) ?? source;
    if (!assignments.has(assignmentId)) { errors.push({ row: row.row, code: 'ASSIGNMENT_UNMAPPED', field: 'assignment' }); continue; }
    const day = get('day').toLocaleLowerCase('id-ID').replace("'", '');
    const dayOfWeek = days.includes(day) ? days.indexOf(day) + 1 : number(day);
    const nextIndex = indices.get(assignmentId) ?? 0;
    const sessionIndex = mapping.columns.sessionIndex === undefined ? nextIndex : number(get('sessionIndex'));
    indices.set(assignmentId, nextIndex + 1);
    const parsed = DraftSlotSchema.safeParse({ assignmentId, sessionIndex, dayOfWeek,
      jpStart: number(get('jpStart')), jpEnd: number(get('jpEnd')), roomLabel: get('room') || null,
      concurrencyGroupId: get('concurrencyGroup') || null });
    if (!parsed.success) { errors.push({ row: row.row, code: 'ROW_INVALID', field: parsed.error.issues[0]?.path[0]?.toString() }); continue; }
    slots.push(parsed.data); rowNumbers.push(row.row);
  }
  for (const alias of mapping.assignments) {
    if (!sources.has(alias.source)) errors.push({ row: 0, code: 'UNUSED_ASSIGNMENT_MAPPING' });
  }
  return { slots, rowNumbers, errors, sources: [...sources].sort() };
}
