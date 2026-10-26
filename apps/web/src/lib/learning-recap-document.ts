import type { CellObject, Row } from 'write-excel-file/browser';
import { schedulingReportPrintFeature } from './scheduling-document';
import { learningDate, learningTime, learningStatus, type LearningSession } from './learning-recap';

export interface LearningDocumentInput {
  academicYear: string;
  semester: number;
  from: string;
  until: string;
  scopeLabel: string;
  rows: LearningSession[];
  codes: Record<string, string>;
}
export const learningHeaders = [
  'Tanggal',
  'Guru',
  'Kelas',
  'Mata pelajaran',
  'JP',
  'Waktu (WIB)',
  'Status',
  'Mulai aktual (WIB)',
  'Selesai aktual (WIB)',
  'Ruang',
];
export function learningDocumentRows(input: LearningDocumentInput) {
  return input.rows.map((row) => [
    learningDate(row.serviceDate),
    row.assignedTeacherName,
    row.classNameSnapshot,
    row.subjectSnapshot +
      (input.codes[row.subjectSnapshot] ? ` — ${input.codes[row.subjectSnapshot]}` : ''),
    `${row.schedule.jpStart}–${row.schedule.jpEnd}`,
    `${learningTime(row.scheduledStartAt)}–${learningTime(row.scheduledEndAt)}`,
    learningStatus[row.status],
    row.startedAt
      ? `${learningDate(row.startedAt)} ${learningTime(row.startedAt)}`
      : 'Belum tercatat',
    row.completedAt
      ? `${learningDate(row.completedAt)} ${learningTime(row.completedAt)}`
      : 'Belum tercatat',
    row.roomSnapshot || '—',
  ]);
}
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
function notes(input: LearningDocumentInput) {
  return [
    `Tahun ajaran ${input.academicYear} · Semester ${input.semester} (${input.semester === 1 ? 'Ganjil' : 'Genap'})`,
    `Periode ${learningDate(input.from)} – ${learningDate(input.until)} · ${input.scopeLabel} · ${input.rows.length} sesi`,
    `Dibuat ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    'Status selesai tidak otomatis menandakan seluruh catatan pembelajaran lengkap. Rincian absensi per JP tersedia pada sesi yang dipilih.',
  ];
}
export function learningDocumentHtml(input: LearningDocumentInput, monochrome = false) {
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Rekap Pembelajaran — DIIS</title><style>@page{size:A4 landscape;margin:12mm}body{font:10px/1.5 Arial,sans-serif;color:#172e26;background:white}h1{font-size:20px}p{margin:5px 0}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:18px}th,td{padding:7px;border:1px solid #cbd5e1;overflow-wrap:anywhere;vertical-align:top}th{background:${monochrome ? '#ddd' : '#065f46'};color:${monochrome ? '#111' : 'white'}}tbody tr:nth-child(even){background:#f1f5f9}thead{display:table-header-group}tr{break-inside:avoid}*{print-color-adjust:exact}@media print{.toolbar{display:none}}</style><div class="toolbar"></div><h1>Rekap Pembelajaran — DIIS</h1>${notes(
    input,
  )
    .map((x) => `<p>${escape(x)}</p>`)
    .join(
      '',
    )}<table><thead><tr>${learningHeaders.map((x) => `<th scope="col">${escape(x)}</th>`).join('')}</tr></thead><tbody>${learningDocumentRows(
    input,
  )
    .map((row) => `<tr>${row.map((x) => `<td>${escape(x)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></html>`;
}
export function printLearningRecap(input: LearningDocumentInput, monochrome = false) {
  const popup = window.open('', '_blank');
  if (!popup) throw Error('Izinkan pop-up untuk membuka dokumen cetak.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(learningDocumentHtml(input, monochrome));
  popup.document.close();
  const button = popup.document.createElement('button');
  button.type = 'button';
  button.textContent = 'Cetak / Simpan PDF';
  button.style.cssText = 'min-height:44px;padding:10px 16px';
  button.addEventListener('click', () => popup.print());
  popup.document.querySelector('.toolbar')?.append(button);
  popup.focus();
}
export async function downloadLearningRecap(input: LearningDocumentInput) {
  const { default: writeXlsx } = await import('write-excel-file/browser');
  const cell = (value: string, opts: Partial<CellObject> = {}): CellObject => ({
    value,
    type: String,
    fontFamily: 'Arial',
    fontSize: 9,
    wrap: true,
    alignVertical: 'top',
    ...opts,
  });
  const band = (text: string): Row => [
    cell(text, { columnSpan: 10, fontWeight: 'bold', height: 30 }),
    ...Array<null>(9).fill(null),
  ];
  const data: Row[] = [
    band('Rekap Pembelajaran — DIIS'),
    ...notes(input).map(band),
    learningHeaders.map((x) =>
      cell(x, { fontWeight: 'bold', backgroundColor: '#065F46', textColor: '#FFFFFF', height: 30 }),
    ),
    ...learningDocumentRows(input).map((row, index) =>
      row.map((x) => cell(x, { height: 45, backgroundColor: index % 2 ? '#F1F5F9' : '#FFFFFF' })),
    ),
  ];
  await writeXlsx(
    [
      {
        sheet: 'Laporan',
        data,
        orientation: 'landscape',
        columns: learningHeaders.map((_, index) => ({ width: [1, 3].includes(index) ? 32 : 22 })),
      },
    ],
    { features: [schedulingReportPrintFeature] },
  ).toFile(`rekap-pembelajaran-${input.from}-${input.until}.xlsx`);
}
