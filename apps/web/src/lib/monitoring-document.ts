import type { CellObject, Row } from 'write-excel-file/browser';
import { schedulingReportPrintFeature } from './scheduling-document';
import type { SchedulingMonitoring, MonitoringRow } from './scheduling-monitoring';
import {
  monitoringDate,
  monitoringRatio,
  monitoringSemester,
  thresholdSource,
} from './monitoring-presentation';
export const monitoringHeaders = [
  'Guru',
  'Kelas',
  'Mata pelajaran',
  'JP penugasan',
  'JP terjadwal',
  'Nilai mencapai KKTP',
  'KKTP',
  'Pertemuan selesai',
  'Jurnal mengajar',
  'Modul belajar selesai',
];
export function monitoringDocumentRows(rows: MonitoringRow[]): (string | number)[][] {
  const ratio = monitoringRatio;
  return rows.map((row) => [
    row.guru,
    row.kelas,
    row.mapel,
    row.jp,
    row.scheduledJp ?? 'Belum tersedia',
    ratio(row.passedGradeCount, row.gradeCount),
    row.kktp === null ? 'Belum tersedia' : `${row.kktp} (${thresholdSource(row.kktpProvenance)})`,
    ratio(row.sessions.completed, row.sessions.due),
    row.jurnalCount ?? 'Belum tersedia',
    ratio(row.lms.completed, row.lms.recorded),
  ]);
}
function metadata(snapshot: SchedulingMonitoring, rows: MonitoringRow[]) {
  const teacherCount = new Set(rows.map((row) => row.teacherId)).size,
    classCount = new Set(rows.map((row) => row.classId)).size;
  return [
    `Tahun ajaran ${snapshot.academicYear} · ${monitoringSemester(snapshot.semester)} · ${rows.length} penugasan mengajar`,
    `Guru: ${teacherCount === 1 ? rows[0]!.guru : teacherCount + ' guru'} · ${classCount} kelas · Mapel: ${snapshot.filters.subject ?? 'Semua'}`,
    `Periode laporan: ${monitoringDate(snapshot.window?.from)} sampai ${monitoringDate(snapshot.window?.to)} · Diperbarui ${new Date(snapshot.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    'Pertemuan dihitung dari sesi mengajar yang tercatat dan sudah waktunya; jumlah ini bukan target seluruh semester. Nilai mencapai KKTP bukan berarti seluruh capaian pembelajaran selesai.',
    'Jurnal terkait guru dan kelas. Jika muncul pada beberapa mapel, jurnal kelas yang sama tidak boleh dijumlahkan ulang. Kehadiran harian tidak menunjukkan presensi setiap JP.',
    'Jadwal adalah rencana mengajar. Belum tersedia tidak berarti nol atau gagal.',
  ];
}
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (token) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[token]!,
  );
export function monitoringDocumentHtml(
  snapshot: SchedulingMonitoring,
  rows: MonitoringRow[],
  monochrome = false,
) {
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Rincian Akademik per Guru</title><style>
    @page{size:A4 landscape;margin:12mm}body{font:10px Arial,sans-serif;color:${monochrome ? '#111' : '#163b30'}}h1{font-size:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid ${monochrome ? '#c5c5c5' : '#cbd5e1'};padding:6px;overflow-wrap:anywhere;vertical-align:top}th{background:${monochrome ? '#eee' : '#065f46'};color:${monochrome ? '#000' : '#fff'}}tbody tr:nth-child(even){background:${monochrome ? '#f5f5f5' : '#f1f5f9'}}thead{display:table-header-group}tr{break-inside:avoid}header,aside{margin-bottom:12px}*{print-color-adjust:exact}@media print{.toolbar{display:none}}</style>
    <div class="toolbar"></div><header><p>SMK Darussalam Subah · DIIS</p><h1>Rincian Akademik per Guru</h1>${metadata(
      snapshot,
      rows,
    )
      .map((note) => `<p>${escape(note)}</p>`)
      .join('')}</header>
    <table><thead><tr>${monitoringHeaders.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${monitoringDocumentRows(
      rows,
    )
      .map((row) => `<tr>${row.map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></html>`;
}
export function printMonitoring(
  snapshot: SchedulingMonitoring,
  rows: MonitoringRow[],
  monochrome: boolean,
) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Izinkan pop-up untuk membuka dokumen cetak.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(monitoringDocumentHtml(snapshot, rows, monochrome));
  popup.document.close();
  const button = popup.document.createElement('button');
  button.type = 'button';
  button.textContent = 'Cetak / Simpan PDF';
  button.addEventListener('click', () => popup.print());
  popup.document.querySelector('.toolbar')?.append(button);
  popup.focus();
}
export async function downloadMonitoring(snapshot: SchedulingMonitoring, rows: MonitoringRow[]) {
  const { default: writeXlsx } = await import('write-excel-file/browser');
  const cell = (value: string | number, options: Partial<CellObject> = {}): CellObject => ({
    value,
    type: typeof value === 'number' ? Number : String,
    fontFamily: 'Arial',
    fontSize: 9,
    wrap: true,
    alignVertical: 'top',
    ...options,
  });
  const band = (text: string): Row => [
    cell(text, { columnSpan: 10, fontWeight: 'bold', height: 40 }),
    ...Array<null>(9).fill(null),
  ];
  const data: Row[] = [
    band('SMK Darussalam Subah · DIIS — Rincian Akademik per Guru'),
    ...metadata(snapshot, rows).map(band),
    monitoringHeaders.map((value) =>
      cell(value, {
        fontWeight: 'bold',
        height: 30,
        backgroundColor: '#065F46',
        textColor: '#FFFFFF',
      }),
    ),
    ...monitoringDocumentRows(rows).map((row, index) =>
      row.map((value) =>
        cell(value, { height: 48, backgroundColor: index % 2 ? '#F1F5F9' : '#FFFFFF' }),
      ),
    ),
  ];
  await writeXlsx(
    [
      {
        sheet: 'Laporan',
        data,
        orientation: 'landscape',
        columns: monitoringHeaders.map((_, index) => ({ width: [0, 2].includes(index) ? 38 : 24 })),
      },
    ],
    { features: [schedulingReportPrintFeature] },
  ).toFile(
    `rincian-akademik-${snapshot.academicYear.replace('/', '-')}-s${snapshot.semester}.xlsx`,
  );
}
