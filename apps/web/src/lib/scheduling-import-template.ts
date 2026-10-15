import { downloadImportBlob } from './operational-import';
import type { ImportCatalog } from './scheduling-import';
import type { CellObject, Sheet } from 'write-excel-file/browser';

export interface SchedulingTemplateContext {
  assignments: ImportCatalog;
  academicYear: string;
  semester: number;
  effectiveFrom: string;
  effectiveUntil: string;
  classNames: string[];
}

/** These exact headers are shared by the downloads and the import column suggestions. */
export const schedulingTemplateColumns = [
  { key: 'assignment', header: 'Penugasan', width: 38, hint: 'Salin Kode penugasan dari sheet Referensi Penugasan. Kode menghubungkan kelas, mapel, dan guru secara tepat.' },
  { key: 'day', header: 'Hari', width: 16, hint: 'Senin–Minggu atau angka 1–7. Contoh: Senin.' },
  { key: 'jpStart', header: 'JP mulai', width: 14, hint: 'Nomor JP awal, bukan jam. Contoh: 1.' },
  { key: 'jpEnd', header: 'JP selesai', width: 14, hint: 'Nomor JP akhir (termasuk JP tersebut). Contoh: 2.' },
  { key: 'room', header: 'Ruang', width: 28, hint: 'Opsional. Nama/label RPS, lab, atau ruang; bukan verifikasi kapasitas.' },
] as const;

export function buildSchedulingTemplateData() {
  // Do not pre-create blank data rows: the API deliberately reports every blank row.
  return [schedulingTemplateColumns.map(({ header }) => ({
    value: header, type: String, fontWeight: 'bold' as const,
    backgroundColor: '#EFF6FF', textColor: '#1E3A8A',
  }))];
}

export function schedulingTemplateCsv() {
  return '\uFEFF' + schedulingTemplateColumns.map(({ header }) => header).join(',') + '\r\n';
}

export function suggestSchedulingTemplateColumns(headers: string[]) {
  const columns: Partial<Record<(typeof schedulingTemplateColumns)[number]['key'], number>> = {};
  for (const { key, header } of schedulingTemplateColumns) {
    const index = headers.indexOf(header);
    if (index >= 0 && headers.lastIndexOf(header) === index) columns[key] = index;
  }
  return columns;
}

export function schedulingTemplateSheets(context?: SchedulingTemplateContext): Sheet<Blob>[] {
  const cell = (value: string | number, heading = false, width = 110): CellObject => ({ value,
    type: typeof value === 'number' ? Number : String, fontFamily: 'Arial', fontSize: 10,
    wrap: true, alignVertical: 'center', height: Math.max(heading ? 28 : 32,
      String(value).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (width * 0.85))), 0) * 15 + 8),
    ...(heading ? { fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#1E3A8A' } : {}) });
  const reference = [...(context?.assignments ?? [])].sort((a, b) => a.className.localeCompare(b.className, 'id-ID')
    || a.subject.localeCompare(b.subject, 'id-ID') || a.teacherName.localeCompare(b.teacherName, 'id-ID') || a.id.localeCompare(b.id));
  const guidance = [
    'Isi hanya sheet Jadwal, mulai baris 2. Pertahankan header baris 1 dan pilih sheet nomor 1 saat impor.',
    'Cari kelas, mapel, dan guru di Referensi Penugasan. Salin isi Kode penugasan ke kolom Penugasan di Jadwal. Jangan ketik ulang kodenya.',
    'Satu baris Jadwal untuk satu sesi. Untuk penugasan yang dibagi beberapa hari, ulangi kode yang sama pada setiap sesi.',
    'Guru produktif berbeda pada kelas dan mapel yang sama memiliki kode berbeda. Pilih sesuai guru yang ditugaskan; jangan gabungkan kodenya.',
    'Contoh pengisian: salin satu kode dari referensi, isi Hari = Senin, JP mulai = 1, JP selesai = 2, Ruang = Lapangan. Ini ilustrasi, bukan rekomendasi slot.',
    'Hari: Senin–Minggu atau angka 1–7. JP adalah nomor pelajaran sesuai konfigurasi sekolah, bukan jam seperti 07.00.',
    'Ruang opsional. Tanpa formula, tanpa baris kosong di tengah data. Hapus baris sesi yang tidak digunakan.',
    'CSV memiliki header yang sama, tetapi tidak dapat menyimpan sheet referensi. Gunakan referensi XLSX untuk menyalin kode ke CSV.',
    'Referensi adalah salinan saat unduhan, bukan jadwal aktif. Server memeriksa ulang periode, penugasan, akses, JP, dan bentrok pada validasi impor.',
    ...(context ? [`Tahun ajaran: ${context.academicYear}. Semester: ${context.semester}. Berlaku: ${context.effectiveFrom} s.d. ${context.effectiveUntil}.`,
      `Kelas pilihan: ${context.classNames.join(', ')}. ${reference.length} penugasan tersedia.`] : ['Referensi belum diisi. Unduh melalui dialog DIIS setelah memilih tanggal dan kelas.']),
  ];
  return [
    { data: buildSchedulingTemplateData(), sheet: 'Jadwal', stickyRowsCount: 1,
      columns: schedulingTemplateColumns.map(({ width }) => ({ width })) },
    { data: [['Kode penugasan', 'Kelas', 'Mata pelajaran', 'Guru', 'Target JP/minggu'].map((v, i) => cell(v, true, [40, 18, 52, 38, 18][i])),
      ...reference.map(a => [a.id, a.className, a.subject, a.teacherName, a.targetJp].map((v, i) => cell(v, false, [40, 18, 52, 38, 18][i])))],
      sheet: 'Referensi Penugasan', stickyRowsCount: 1, showGridLines: false,
      columns: [40, 18, 52, 38, 18].map(width => ({ width })) },
    { data: [[cell('Panduan impor jadwal', true)], ...guidance.map(v => [cell(v)])],
      sheet: 'Panduan', showGridLines: false, columns: [{ width: 110 }] },
  ];
}

export async function downloadSchedulingTemplate(format: 'XLSX' | 'CSV', context?: SchedulingTemplateContext) {
  if (format === 'CSV') {
    downloadImportBlob(new Blob([schedulingTemplateCsv()], { type: 'text/csv;charset=utf-8' }), 'template-jadwal-diis.csv');
    return;
  }
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(schedulingTemplateSheets(context)).toFile('template-jadwal-diis.xlsx');
}
