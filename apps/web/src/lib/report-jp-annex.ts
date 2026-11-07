import { z } from 'zod';
import { JpTotalsSchema } from './session-attendance';

const status = z.enum(['hadir', 'izin', 'sakit', 'alpha']);
const day = JpTotalsSchema.and(z.object({ date: z.string().date() }));
const schema = z.object({
  version: z.literal(1),
  unit: z.literal('student_session_jp'),
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  semesterId: z.string().uuid(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  semester: z.number().int().min(1).max(2),
  from: z.string().date(),
  to: z.string().date(),
  observedThrough: z.string().date().nullable(),
  generatedAt: z.string().datetime(),
  rosterBasis: z.literal('current_roster_and_recorded_history'),
  totals: JpTotalsSchema,
  days: z.array(day).max(367),
  sessions: z
    .array(
      z.object({
        id: z.string().uuid(),
        date: z.string().date(),
        subject: z.string(),
        teacher: z.string(),
        className: z.string(),
        slots: z
          .array(
            z.object({
              jp: z.number().int().positive().max(40),
              startAt: z.string().datetime(),
              endAt: z.string().datetime(),
              status: status.nullable(),
              notes: z.string().nullable(),
              revision: z.number().int().positive().nullable(),
              updatedAt: z.string().datetime().nullable(),
            }),
          )
          .min(1)
          .max(40),
      }),
    )
    .max(10000),
});
export type ReportJpAnnex = z.infer<typeof schema>;
export interface ReportJpIdentity {
  studentId: string;
  classId?: string;
  academicYear: string;
  semester: number;
}

/** Validate bindings and physical-JP reconciliation before displaying a saved document. */
export function readReportJpAnnex(
  value: unknown,
  identity: ReportJpIdentity,
): { state: 'missing' | 'invalid' } | { state: 'ready'; data: ReportJpAnnex } {
  if (value === undefined || value === null) return { state: 'missing' };
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { state: 'invalid' };
  const data = parsed.data;
  if (
    data.studentId !== identity.studentId ||
    data.classId !== identity.classId ||
    data.academicYear !== identity.academicYear ||
    data.semester !== identity.semester ||
    data.from > data.to ||
    Date.parse(data.to) - Date.parse(data.from) > 366 * 86400000
  )
    return { state: 'invalid' };
  const generatedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(data.generatedAt));
  const cutoff =
    generatedDate < data.from ? null : generatedDate < data.to ? generatedDate : data.to;
  if (
    data.observedThrough !== cutoff ||
    new Set(data.sessions.map((s) => s.id)).size !== data.sessions.length
  )
    return { state: 'invalid' };
  const physical = new Map<string, (z.infer<typeof status> | null)[]>();
  for (const session of data.sessions) {
    if (
      !cutoff ||
      session.date < data.from ||
      session.date > cutoff ||
      new Set(session.slots.map((s) => s.jp)).size !== session.slots.length
    )
      return { state: 'invalid' };
    for (const slot of session.slots) {
      if (
        slot.startAt >= slot.endAt ||
        (slot.status === null
          ? slot.notes !== null || slot.revision !== null || slot.updatedAt !== null
          : slot.revision === null || slot.updatedAt === null)
      )
        return { state: 'invalid' };
      const key = session.date + ':' + slot.jp;
      physical.set(key, [...(physical.get(key) ?? []), slot.status]);
    }
  }
  const cells = [...physical].map(([key, values]) => ({
    date: key.slice(0, 10),
    status: values.every((v) => v !== null && v === values[0]) ? values[0] : null,
  }));
  const agrees = (actual: ReportJpAnnex['totals'], rows: typeof cells) => {
    const counts = { hadir: 0, izin: 0, sakit: 0, alpha: 0, unknown: 0 };
    for (const cell of rows) {
      if (cell.status) counts[cell.status]++;
      else counts.unknown++;
    }
    return (
      actual.expected === rows.length &&
      Object.entries(counts).every(([key, count]) => actual[key as keyof typeof counts] === count)
    );
  };
  const dates = [...new Set(cells.map((c) => c.date))];
  if (
    !agrees(data.totals, cells) ||
    data.days.length !== dates.length ||
    new Set(data.days.map((d) => d.date)).size !== dates.length ||
    data.days.some(
      (d) =>
        !dates.includes(d.date) ||
        !agrees(
          d,
          cells.filter((c) => c.date === d.date),
        ),
    )
  )
    return { state: 'invalid' };
  return { state: 'ready', data };
}

const csvCell = (value: string | number) =>
  '"' + (/^\s*[=+@-]/.test(String(value)) ? "'" : '') + String(value).replaceAll('"', '""') + '"';
export function reportJpCsv(data: ReportJpAnnex, studentName?: string): string {
  const header = [
    'Tanggal',
    'Hadir (JP)',
    'Izin (JP)',
    'Sakit (JP)',
    'Alpha (JP)',
    'Belum dicatat/konflik (JP)',
    'Total (JP)',
    'Kehadiran (%)',
  ];
  const rows: (string | number)[][] = [...data.days, { date: 'TOTAL', ...data.totals }].map((d) => [
    d.date,
    d.hadir,
    d.izin,
    d.sakit,
    d.alpha,
    d.unknown,
    d.expected,
    d.pct ?? 'Belum lengkap',
  ]);
  rows.unshift(
    ['Siswa', studentName ?? data.studentId],
    [
      'Tahun ajaran',
      data.academicYear,
      'Semester',
      data.semester,
      'Dicatat sampai',
      data.observedThrough ?? '',
      'Disimpan',
      data.generatedAt,
    ],
    header,
  );
  rows.push(
    [],
    [
      'Tanggal sesi',
      'Kelas',
      'Guru',
      'Mata pelajaran',
      'JP',
      'Status',
      'Keterangan',
      'Revisi',
      'Diperbarui',
    ],
  );
  for (const s of data.sessions)
    for (const slot of s.slots)
      rows.push([
        s.date,
        s.className,
        s.teacher,
        s.subject,
        slot.jp,
        slot.status ?? 'Belum dicatat',
        slot.notes ?? '',
        slot.revision ?? '',
        slot.updatedAt ?? '',
      ]);
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
const escape = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function reportJpHtml(data: ReportJpAnnex, studentName: string): string {
  const counts = (d: ReportJpAnnex['totals']) =>
    [
      d.hadir,
      d.izin,
      d.sakit,
      d.alpha,
      d.unknown,
      d.expected,
      d.pct === null ? 'Belum lengkap' : d.pct + '%',
    ]
      .map((v) => `<td>${escape(v)}</td>`)
      .join('');
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Lampiran kehadiran JP</title><style>@page{size:A4;margin:15mm}body{font:12px/1.5 Arial,sans-serif;color:#172e26}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #cbd5e1;padding:6px;vertical-align:top;overflow-wrap:anywhere}th{background:#ecfdf5;text-align:left}tr{break-inside:avoid}thead{display:table-header-group}h2{break-after:avoid;font-size:16px}.note{white-space:pre-wrap}@media print{.toolbar{display:none}}</style><div class="toolbar"></div><h1>Lampiran kehadiran per JP</h1><p>${escape(studentName)} · ${escape(data.academicYear)} · Semester ${data.semester}</p><p>Periode ${data.from} – ${data.to}. Dicatat sampai ${data.observedThrough ?? 'belum dimulai'}. Hitungan JP terpisah dari catatan hari.</p><table><thead><tr>${['Tanggal', 'Hadir', 'Izin', 'Sakit', 'Alpha', 'Belum dicatat / konflik', 'Total JP', 'Kehadiran'].map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${[...data.days, { date: 'TOTAL', ...data.totals }].map((d) => `<tr><td>${d.date}</td>${counts(d)}</tr>`).join('')}</tbody></table>${data.sessions.map((s) => `<h2>${s.date} · ${escape(s.subject)}</h2><p>${escape(s.teacher)} · ${escape(s.className)}</p><table><thead><tr><th>JP</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${s.slots.map((slot) => `<tr><td>${slot.jp}</td><td>${escape(slot.status ?? 'Belum dicatat')}</td><td class="note">${escape(slot.notes ?? '—')}</td></tr>`).join('')}</tbody></table>`).join('')}<p>JP beririsan dihitung sekali. Perbedaan status tetap perlu diperiksa. Cakupan memakai daftar siswa saat rapor disiapkan serta catatan sesi tersimpan; keanggotaan lama yang tidak tersimpan tidak direka.</p></html>`;
}
