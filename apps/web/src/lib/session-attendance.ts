import { z } from 'zod';
const status = z.enum(['hadir', 'izin', 'sakit', 'alpha']);
export const validSessionDate = (value: unknown): value is string =>
  z.string().date().safeParse(value).success;
const TotalsObject = z.object({
  expected: z.number().int().nonnegative(),
  recorded: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  hadir: z.number().int().nonnegative(),
  izin: z.number().int().nonnegative(),
  sakit: z.number().int().nonnegative(),
  alpha: z.number().int().nonnegative(),
  complete: z.boolean(),
  pct: z.number().min(0).max(100).nullable(),
  tone: z.enum(['unknown', 'green', 'yellow', 'red', 'blue']),
});
function verifyTotals(t: z.infer<typeof TotalsObject>, ctx: z.RefinementCtx) {
  const recorded = t.hadir + t.izin + t.sakit + t.alpha,
    complete = t.expected > 0 && t.unknown === 0,
    pct = complete ? Math.round((t.hadir / t.expected) * 10000) / 100 : null,
    tone = !complete
      ? 'unknown'
      : t.hadir === t.expected
        ? 'green'
        : t.hadir === 0
          ? 'red'
          : t.hadir * 2 <= t.expected
            ? 'yellow'
            : 'blue';
  if (
    recorded !== t.recorded ||
    t.expected !== recorded + t.unknown ||
    t.complete !== complete ||
    t.pct !== pct ||
    t.tone !== tone
  )
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Perhitungan kehadiran tidak konsisten' });
}
export const JpTotalsSchema = TotalsObject.superRefine(verifyTotals);
const LearnerJpObject = z.object({
  studentId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  unit: z.literal('student_session_jp'),
  scope: z.string(),
  totals: JpTotalsSchema,
  days: z.array(TotalsObject.extend({ date: z.string().date() }).superRefine(verifyTotals)),
  sessions: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string().date(),
      subject: z.string(),
      subjectCode: z.string().nullable(),
      teacher: z.string(),
      className: z.string(),
      status: z.string(),
      slots: z.array(
        z.object({
          jp: z.number().int().positive(),
          startAt: z.string().datetime(),
          endAt: z.string().datetime(),
          status: status.nullable(),
          notes: z.string().nullable(),
          updatedAt: z.string().datetime().nullable(),
        }),
      ),
    }),
  ),
});
/** Do not render a successful but internally contradictory producer response. */
export const LearnerJpSchema = LearnerJpObject.superRefine((data, ctx) => {
  const physical = new Map<string, (z.infer<typeof status> | null)[]>();
  let invalid =
    data.from > data.to ||
    data.days.length > 62 ||
    data.sessions.length > 1000 ||
    new Set(data.sessions.map((s) => s.id)).size !== data.sessions.length;
  for (const session of data.sessions) {
    if (
      session.date < data.from ||
      session.date > data.to ||
      !session.slots.length ||
      session.slots.length > 40 ||
      new Set(session.slots.map((s) => s.jp)).size !== session.slots.length
    )
      invalid = true;
    for (const slot of session.slots) {
      if (slot.startAt >= slot.endAt) invalid = true;
      const key = session.date + ':' + slot.jp;
      physical.set(key, [...(physical.get(key) ?? []), slot.status]);
    }
  }
  const counts = (entries: [string, (z.infer<typeof status> | null)[]][]) => {
    const result = {
      expected: entries.length,
      recorded: 0,
      unknown: 0,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpha: 0,
    };
    for (const [, values] of entries) {
      const s = values.every((v) => v !== null && v === values[0]) ? values[0] : null;
      if (s) {
        result[s]++;
        result.recorded++;
      } else result.unknown++;
    }
    return result;
  };
  const entries = [...physical.entries()],
    dates = [...new Set(entries.map(([key]) => key.slice(0, 10)))];
  if (
    new Set(data.days.map((d) => d.date)).size !== data.days.length ||
    dates.length !== data.days.length
  )
    invalid = true;
  const agrees = (actual: z.infer<typeof TotalsObject>, expected: ReturnType<typeof counts>) =>
    Object.entries(expected).every(([k, v]) => actual[k as keyof typeof expected] === v);
  for (const day of data.days) {
    if (
      !dates.includes(day.date) ||
      !agrees(day, counts(entries.filter(([key]) => key.startsWith(day.date + ':'))))
    )
      invalid = true;
  }
  if (!agrees(data.totals, counts(entries))) invalid = true;
  if (invalid)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Rincian sesi dan total JP tidak konsisten',
    });
});
export type LearnerJp = z.infer<typeof LearnerJpSchema>;
/** Compact display only; never merge across a break, session, status or note change. */
export function groupAttendanceSlots(slots: LearnerJp['sessions'][number]['slots']) {
  const groups: Array<{
    fromJp: number;
    toJp: number;
    startAt: string;
    endAt: string;
    status: (typeof slots)[number]['status'];
    notes: string | null;
  }> = [];
  for (const slot of [...slots].sort((a, b) => a.jp - b.jp)) {
    const previous = groups.at(-1);
    if (
      previous &&
      previous.toJp + 1 === slot.jp &&
      previous.endAt === slot.startAt &&
      previous.status === slot.status &&
      previous.notes === slot.notes
    ) {
      previous.toJp = slot.jp;
      previous.endAt = slot.endAt;
    } else
      groups.push({
        fromJp: slot.jp,
        toJp: slot.jp,
        startAt: slot.startAt,
        endAt: slot.endAt,
        status: slot.status,
        notes: slot.notes,
      });
  }
  return groups;
}
export const SessionRosterSchema = z
  .object({
    sessionId: z.string().uuid(),
    classId: z.string().uuid(),
    date: z.string().date(),
    subject: z.string(),
    slots: z.array(
      z.object({
        jp: z.number().int().positive(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
      }),
    ),
    students: z.array(z.object({ id: z.string().uuid(), name: z.string(), nis: z.string() })),
    records: z.array(
      z.object({
        studentId: z.string().uuid(),
        jp: z.number().int().positive(),
        status,
        notes: z.string().nullable(),
        revision: z.number().int().positive(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const students = new Set(data.students.map((s) => s.id)),
      slots = new Set(data.slots.map((s) => s.jp)),
      records = new Set(data.records.map((r) => r.studentId + ':' + r.jp));
    if (
      !slots.size ||
      slots.size !== data.slots.length ||
      students.size !== data.students.length ||
      records.size !== data.records.length ||
      data.records.some((r) => !students.has(r.studentId) || !slots.has(r.jp))
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Daftar siswa/JP tidak konsisten' });
  });
export type SessionRoster = z.infer<typeof SessionRosterSchema>;
export type JpRead<T> =
  | { state: 'ready'; data: T }
  | { state: 'error' | 'denied'; message: string };
export const jpLabels = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' };
export const jpTone = {
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  blue: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
  yellow: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  red: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
  unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};
export const jpDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value + 'T00:00:00+07:00'));
export const jpTime = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
