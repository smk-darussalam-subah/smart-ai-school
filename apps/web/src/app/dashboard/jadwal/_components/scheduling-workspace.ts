import { z } from 'zod';

const identity = z.object({ id: z.string(), user: z.object({ fullName: z.string() }) });
const kelas = z.object({
  id: z.string(),
  name: z.string(),
  majorCode: z.string(),
  grade: z.number(),
});
export const WorkspaceScheduleSchema = z
  .object({
    id: z.string(),
    classId: z.string(),
    dayOfWeek: z.number().int().min(1).max(7),
    jpStart: z.number().int().positive(),
    jpEnd: z.number().int().positive(),
    room: z.string().nullable().optional(),
    academicYear: z.string(),
    semester: z.number().int(),
    concurrencyGroupId: z.string().nullable().optional(),
    concurrencyGroup: z
      .object({ id: z.string(), mode: z.string(), expiresOn: z.string().nullable() })
      .nullable()
      .optional(),
    class: kelas,
    teachingAssignment: z.object({ id: z.string(), subject: z.string(), teacher: identity }),
  })
  .refine((row) => row.jpEnd >= row.jpStart);
export type ScheduleItem = z.infer<typeof WorkspaceScheduleSchema>;
export const WorkspaceAssignmentSchema = z.object({
  id: z.string(),
  subject: z.string(),
  hoursPerWeek: z.number().int().nonnegative(),
  academicYear: z.string(),
  teacher: identity,
  class: kelas,
});
export type WorkspaceAssignment = z.infer<typeof WorkspaceAssignmentSchema>;
export const WEEK_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

type ReadResult = { success: true; data: unknown } | { success: false; error?: string };
export interface SchedulingSubject { name: string; code: string }

/** Read the existing offset-paginated catalog, including inactive subjects used by historical schedules. */
export async function readSchedulingSubjects(
  request: (offset: number, limit: number) => Promise<ReadResult>,
): Promise<SchedulingSubject[]> {
  const schema = z.object({
    data: z.array(z.object({ id: z.string().min(1), name: z.string().trim().min(1), code: z.string().trim().min(1) })),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  });
  const subjects: SchedulingSubject[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset < 5000; offset += 200) {
    const result = await request(offset, 200);
    if (!result.success) throw new Error(result.error || 'Katalog Mata Pelajaran belum dapat dimuat.');
    const parsed = schema.safeParse(result.data);
    if (!parsed.success || parsed.data.offset !== offset || parsed.data.limit !== 200)
      throw new Error('Format katalog Mata Pelajaran tidak sesuai. Muat ulang.');
    const page = parsed.data;
    if (total === undefined) total = page.total;
    if (page.total !== total || total > 5000 || page.data.length !== Math.min(200, total - offset))
      throw new Error('Katalog Mata Pelajaran berubah atau tidak lengkap. Muat ulang.');
    for (const subject of page.data) {
      if (seen.has(subject.id)) throw new Error('Katalog Mata Pelajaran berulang. Muat ulang.');
      seen.add(subject.id);
      subjects.push({ name: subject.name, code: subject.code });
    }
    if (subjects.length === total) return subjects;
  }
  throw new Error('Katalog Mata Pelajaran terlalu besar. Muat ulang.');
}
/** Read all bounded pages, refusing changing/truncated/duplicate pages instead of certifying partial totals. */
export async function readWorkspacePages<T extends { id: string }>(
  request: (page: number, limit: number) => Promise<ReadResult>,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const pageSchema = z.object({
    data: z.array(schema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
  });
  const items: T[] = [];
  const seen = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; page <= 50; page++) {
    const result = await request(page, 100);
    if (!result.success) throw new Error(result.error || 'Data jadwal belum dapat dimuat.');
    const parsed = pageSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.page !== page)
      throw new Error('Format data jadwal tidak sesuai. Muat ulang.');
    const payload = parsed.data;
    if (expected === undefined) expected = payload.total;
    if (expected !== payload.total || expected > 5000)
      throw new Error(
        'Data berubah atau terlalu besar. Pilih periode lebih spesifik dan muat ulang.',
      );
    for (const item of payload.data) {
      if (seen.has(item.id))
        throw new Error('Data berubah selama pemuatan. Muat ulang sebelum meninjau jadwal.');
      seen.add(item.id);
      items.push(item);
    }
    if (items.length === expected) return items;
    if (!payload.data.length || items.length > expected)
      throw new Error('Data jadwal belum lengkap. Muat ulang.');
  }
  throw new Error('Data jadwal belum lengkap. Pilih periode lebih spesifik.');
}

export function allocatedJp(items: ScheduleItem[], assignmentId: string): number {
  return items
    .filter((s) => s.teachingAssignment.id === assignmentId)
    .reduce((sum, s) => sum + s.jpEnd - s.jpStart + 1, 0);
}
export function coverageStatus(
  target: number,
  actual: number,
): 'empty' | 'partial' | 'complete' | 'excess' {
  if (actual > target) return 'excess';
  if (actual === target && target > 0) return 'complete';
  return actual > 0 ? 'partial' : 'empty';
}
export function coverageSummary(assignments: WorkspaceAssignment[], schedules: ScheduleItem[]) {
  const counts = { empty: 0, partial: 0, complete: 0, excess: 0 };
  let target = 0,
    credited = 0;
  for (const a of assignments) {
    const actual = allocatedJp(schedules, a.id);
    counts[coverageStatus(a.hoursPerWeek, actual)]++;
    target += a.hoursPerWeek;
    credited += Math.min(a.hoursPerWeek, actual);
  }
  return {
    ...counts,
    target,
    credited,
    percentage: target ? Math.round((credited / target) * 100) : null,
  };
}
export function normalizedRoom(room: string | null | undefined): string {
  return (room ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('id-ID');
}
/** Labels only: this is not structured facility identity or capacity validation. */
export function practiceRoomLabels(items: ScheduleItem[]): string[] {
  return [
    ...new Set(
      items
        .map((s) => normalizedRoom(s.room))
        .filter((room) =>
          /(?:^|\s)(?:RPS|LAB|LABORATORIUM|BENGKEL|WORKSHOP)(?:\s|$|\d)/.test(room),
        ),
    ),
  ].sort((a, b) => a.localeCompare(b, 'id-ID'));
}
/** Separate overlapping entries into visible lanes; never hide a second classroom/session. */
export function timetableLanes(items: ScheduleItem[]): ScheduleItem[][] {
  const lanes: ScheduleItem[][] = [];
  for (const item of [...items].sort(
    (a, b) => a.jpStart - b.jpStart || a.jpEnd - b.jpEnd || a.id.localeCompare(b.id),
  )) {
    const lane = lanes.find((entries) =>
      entries.every((other) => other.jpEnd < item.jpStart || other.jpStart > item.jpEnd),
    );
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  return lanes;
}

/** Connected overlap summaries preserve all sessions; details remain authoritative for each. */
export function timetableGroups(items: ScheduleItem[]): ScheduleItem[][] {
  const groups: ScheduleItem[][] = [];
  for (const item of [...items].sort(
    (a, b) => a.jpStart - b.jpStart || a.jpEnd - b.jpEnd || a.id.localeCompare(b.id),
  )) {
    const previous = groups[groups.length - 1];
    if (previous && item.jpStart <= Math.max(...previous.map((s) => s.jpEnd))) previous.push(item);
    else groups.push([item]);
  }
  return groups;
}
