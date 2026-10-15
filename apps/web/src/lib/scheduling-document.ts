import { fmtMin } from './bell-times';
import type { CellObject, Feature, Row, Sheet } from 'write-excel-file/browser';
import type { patternForPeriod } from './bell-patterns';
import { detectConflicts } from '@/app/dashboard/jadwal/_components/conflicts';
import {
  allocatedJp, coverageStatus, normalizedRoom, practiceRoomLabels, WEEK_DAYS,
  type ScheduleItem, type SchedulingSubject, type WorkspaceAssignment,
} from '@/app/dashboard/jadwal/_components/scheduling-workspace';

export type SchedulingDocumentView = 'assignments' | 'classes' | 'teachers' | 'rooms';
export interface SchedulingDocumentInput {
  view: SchedulingDocumentView;
  schoolName?: string;
  academicYear: string;
  semester: number;
  schedules: ScheduleItem[];
  assignments: WorkspaceAssignment[];
  classes: { id: string; name: string }[];
  subjects?: SchedulingSubject[];
  bell: ReturnType<typeof patternForPeriod>;
  /** In assignment view a selected assignment resolves to ALL assignments of that teacher. */
  selectedId?: string;
  generatedAt?: Date;
}
export interface DocumentSection {
  id: string;
  title: string;
  assignments: WorkspaceAssignment[];
  schedules: ScheduleItem[];
}
export interface SchedulingDocument {
  title: string;
  schoolName: string;
  academicYear: string;
  semesterLabel: string;
  periodLabel: string;
  scopeLabel: string;
  generatedLabel: string;
  view: SchedulingDocumentView;
  sections: DocumentSection[];
  notes: string[];
  bell: SchedulingDocumentInput['bell'];
  conflicts: Map<string, string[]>;
  subjectCodes: Map<string, string>;
  filename: string;
}
const TITLES = { assignments: 'Daftar Penugasan Mengajar', classes: 'Jadwal Per Kelas', teachers: 'Jadwal Per Guru', rooms: 'Jadwal RPS/LAB' };
const COVERAGE = { empty: 'Belum dijadwalkan', partial: 'Parsial', complete: 'Lengkap', excess: 'Melebihi target' };
const COLORS = ['#eff6ff', '#ecfdf5', '#fffbeb', '#f5f3ff', '#fff1f2', '#ecfeff'];
function subjectColor(subject: string) {
  let hash = 0;
  for (const char of subject) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
function ordered(items: ScheduleItem[]) {
  return [...items].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.jpStart - b.jpStart || a.class.name.localeCompare(b.class.name, 'id-ID') || a.id.localeCompare(b.id));
}
/** Only unique, exact catalog matches earn a code. Missing or ambiguous legacy names stay readable. */
function catalogSubjectCodes(subjects: SchedulingSubject[]): Map<string, string> {
  const names = new Map<string, number>(), codes = new Map<string, number>();
  for (const subject of subjects) {
    const name = subject.name.trim(), code = subject.code.trim();
    names.set(name, (names.get(name) ?? 0) + 1);
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  return new Map(subjects.filter(s => s.name.trim() && s.code.trim()
    && names.get(s.name.trim()) === 1 && codes.get(s.code.trim()) === 1)
    .map(s => [s.name.trim(), s.code.trim()]));
}
function subjectLabel(doc: SchedulingDocument, subject: string) {
  return doc.subjectCodes.get(subject.trim()) ?? subject;
}
export function documentTime(item: ScheduleItem, bell: SchedulingDocument['bell']): string {
  const slots = bell.slotsForDay(item.dayOfWeek);
  const range = slots.filter(s => s.jp >= item.jpStart && s.jp <= item.jpEnd);
  const first = range.find(s => s.jp === item.jpStart), last = range.find(s => s.jp === item.jpEnd);
  if (!bell.available || !first || !last || range.length !== item.jpEnd - item.jpStart + 1) return 'Waktu JP belum tersedia';
  if (range.some(s => s.timingVaries)) return 'Waktu bervariasi; periksa tanggal';
  return `${fmtMin(first.startMin)}–${fmtMin(last.endMin)} WIB`;
}
export function documentSlotStatus(item: ScheduleItem, conflicts: SchedulingDocument['conflicts'], compact = false): string {
  const labels: string[] = [];
  if (item.concurrencyGroup) {
    labels.push(item.concurrencyGroup.mode === 'JOINT_CLASS' ? 'Kelas gabungan tercatat' : 'Pengecualian tercatat');
    if (item.concurrencyGroup.expiresOn) labels.push(`s.d. ${item.concurrencyGroup.expiresOn.slice(0, 10)}`);
  }
  const reasons = conflicts.get(item.id) ?? [];
  labels.push(...(compact ? [...new Set(reasons.map(reason => reason.startsWith('Guru ') ? 'Bentrok guru' : reason.startsWith('Kelas ') ? 'Bentrok kelas' : 'Bentrok'))] : reasons));
  return labels.join(' · ') || (compact ? 'Tidak ada bentrok terdeteksi' : 'Tidak ada bentrok terdeteksi pada data terbaca');
}
/** Capture the entire loaded period, independent of list search/pagination; never mutate source arrays. */
export function buildSchedulingDocument(input: SchedulingDocumentInput): SchedulingDocument {
  const { view, academicYear, semester, bell } = input;
  if (!academicYear || ![1, 2].includes(semester)) throw new Error('Periode dokumen tidak valid.');
  if (input.schedules.some(s => s.academicYear !== academicYear || s.semester !== semester) || input.assignments.some(a => a.academicYear !== academicYear))
    throw new Error('Data dokumen tidak sesuai periode pilihan. Muat ulang.');
  const schedules = ordered(input.schedules), assignments = [...input.assignments];
  let entities: { id: string; name: string }[];
  if (view === 'classes') entities = [...new Map([...input.classes, ...schedules.map(s => s.class), ...assignments.map(a => a.class)].map(c => [c.id, c])).values()];
  else if (view === 'rooms') entities = practiceRoomLabels(schedules).map(room => ({ id: room, name: room }));
  else entities = [...new Map([...schedules.map(s => s.teachingAssignment.teacher), ...assignments.map(a => a.teacher)].map(t => [t.id, { id: t.id, name: t.user.fullName }])).values()];
  let selected = input.selectedId;
  if (view === 'assignments' && selected) selected = assignments.find(a => a.id === selected)?.teacher.id;
  if (input.selectedId && (!selected || !entities.some(e => e.id === selected))) throw new Error('Pilihan dokumen tidak tersedia. Pilih data kembali.');
  if (selected) entities = entities.filter(e => e.id === selected);
  entities.sort((a, b) => a.name.localeCompare(b.name, 'id-ID') || a.id.localeCompare(b.id));
  const sections = entities.map(e => ({ id: e.id, title: e.name,
    assignments: assignments.filter(a => view === 'classes' ? a.class.id === e.id : view === 'rooms' ? false : a.teacher.id === e.id)
      .sort((a, b) => a.class.name.localeCompare(b.class.name, 'id-ID') || a.subject.localeCompare(b.subject, 'id-ID') || a.id.localeCompare(b.id)),
    schedules: schedules.filter(s => view === 'classes' ? s.classId === e.id : view === 'rooms' ? normalizedRoom(s.room) === e.id : s.teachingAssignment.teacher.id === e.id),
  }));
  const scopeLabel = selected ? `${view === 'classes' ? 'Kelas' : view === 'rooms' ? 'RPS/LAB' : 'Guru'}: ${sections[0]!.title}` : 'Seluruh data dalam cakupan akses · tidak dibatasi pencarian atau halaman';
  const title = TITLES[view];
  return { title, schoolName: input.schoolName?.trim() || 'DIIS · nama sekolah belum tersedia', academicYear,
    semesterLabel: `${semester === 1 ? 'Ganjil' : 'Genap'} (${semester})`,
    periodLabel: bell.period ? `${bell.period.startDate.slice(0, 10)} s.d. ${bell.period.endDate.slice(0, 10)}` : 'Rentang semester belum tersedia',
    scopeLabel, generatedLabel: new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(input.generatedAt ?? new Date()) + ' WIB',
    view, sections, bell, conflicts: detectConflicts(schedules), subjectCodes: catalogSubjectCodes(input.subjects ?? []),
    notes: ['Salinan jadwal tersimpan saat dokumen dibuat; bukan sertifikasi publikasi atau bukti mengajar.',
      'JP dihitung per sesi kelas, bukan durasi kerja guru. Jeda mengikuti konfigurasi bel.',
      'Kode mapel mengikuti katalog Mata Pelajaran DIIS. Nama lengkap digunakan jika kode tidak tersedia atau tidak unik.',
      'Warna membedakan mapel, bukan kategori resmi. Bentrok bersifat indikatif; pengecualian tetap perlu validasi server.',
      ...(bell.problem ? [bell.problem] : bell.varies ? ['Waktu JP bervariasi dalam semester; periksa tanggal pelaksanaan.'] : []),
      ...(view === 'rooms' ? ['RPS = Ruang Praktik Siswa. Daftar memakai label lokasi terjadwal, bukan inventaris atau bukti kapasitas fasilitas.'] : [])],
    filename: `${title}-${selected ? sections[0]!.title : 'seluruh'}-${academicYear}-semester-${semester}`.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 170),
  };
}
function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function table(doc: SchedulingDocument, section: DocumentSection, headers: string[], rows: string[][], kind: string) {
  const widths = kind === 'weekly' ? [5, ...headers.slice(1).map(() => 95 / (headers.length - 1))] : kind === 'assignments' ? [19, 10, 35, 11, 11, 14] : [7, 7, 13, 9, 24, 15, 12, 13];
  return `<table class="${kind}"><colgroup>${widths.map(width => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr><th class="context" colspan="${headers.length}">${escape(doc.schoolName)} · ${escape(doc.academicYear)} · ${escape(doc.semesterLabel)} · ${escape(doc.title)} — ${escape(section.title)}</th></tr><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function weeklyGrid(doc: SchedulingDocument, section: DocumentSection) {
  const subjects = [...new Set(section.schedules.map(s => s.teachingAssignment.subject))].sort((a, b) => a.localeCompare(b, 'id-ID'));
  const days = WEEK_DAYS.map((label, i) => ({ label, day: i + 1 })).filter(d => d.day <= 6 || section.schedules.some(s => s.dayOfWeek === d.day));
  const numbers = new Set(doc.bell.weeklySlots);
  for (const s of section.schedules) for (let jp = s.jpStart; jp <= s.jpEnd; jp++) numbers.add(jp);
  const rows = [...numbers].sort((a, b) => a - b).map(jp => [`<strong>JP ${jp}</strong>`, ...days.map(({ day }) => {
    const timing = doc.bell.slotsForDay(day).find(s => s.jp === jp);
    const label = !timing ? 'Waktu belum tersedia' : timing.timingVaries ? 'Waktu bervariasi' : `${fmtMin(timing.startMin)}–${fmtMin(timing.endMin)}`;
    const slots = section.schedules.filter(s => s.dayOfWeek === day && s.jpStart <= jp && s.jpEnd >= jp);
    return `<div class="time">${escape(label)}</div>${slots.length ? slots.map(s => `<div class="lesson" style="background:${subjectColor(s.teachingAssignment.subject)}"><strong>${escape(subjectLabel(doc, s.teachingAssignment.subject))}</strong>${doc.view === 'classes' ? '' : ` · ${escape(s.class.name)}`} · ${s.jpStart}–${s.jpEnd}${doc.conflicts.has(s.id) ? ' <b class="warning">Bentrok</b>' : ''}${s.concurrencyGroup ? ' · Gabungan/pengecualian' : ''}</div>`).join('') : '<span class="muted">—</span>'}`;
  })]);
  const legend = `<div class="legend">${subjects.map(subject => `<span><b style="background:${subjectColor(subject)}">${escape(subjectLabel(doc, subject))}</b> ${doc.subjectCodes.has(subject.trim()) ? escape(subject) : '(kode katalog belum tersedia atau tidak unik)'}</span>`).join('')}</div><p class="muted">Kode mengikuti katalog Mata Pelajaran DIIS, bukan nomor urut dokumen. Tanda — berarti tidak ada slot tersimpan. Semua sesi bertumpuk tetap ditampilkan; rincian lengkap ada di bawah.</p>`;
  return rows.length ? table(doc, section, ['JP', ...days.map(d => d.label)], rows, 'weekly') + legend : '<p>Konfigurasi JP dan jadwal belum tersedia.</p>';
}
/** Standalone, escaped, script-free print content; source labels cannot execute HTML or Excel formulas. */
export function schedulingDocumentHtml(doc: SchedulingDocument, colorMode: 'color' | 'monochrome' = 'color'): string {
  const sections = doc.sections.map(section => {
    const assigned = section.assignments.map(a => { const actual = allocatedJp(section.schedules, a.id); return [a.teacher.user.fullName, a.class.name, a.subject, String(a.hoursPerWeek), String(actual), COVERAGE[coverageStatus(a.hoursPerWeek, actual)]].map(escape); });
    const slots = section.schedules.map(s => [WEEK_DAYS[s.dayOfWeek - 1], `JP ${s.jpStart}–${s.jpEnd}`, documentTime(s, doc.bell), s.class.name, s.teachingAssignment.subject, s.teachingAssignment.teacher.user.fullName, s.room?.trim() || 'Belum ditentukan', documentSlotStatus(s, doc.conflicts, true)].map(escape));
    return `<section class="entity"><h2>${escape(section.title)}</h2><p class="muted">${section.assignments.length} penugasan · ${section.schedules.length} slot · ${section.schedules.reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0)} JP kelas</p>${doc.view !== 'assignments' ? weeklyGrid(doc, section) : ''}${assigned.length ? table(doc, section, ['Guru', 'Kelas', 'Mata pelajaran', 'Target JP/minggu', 'JP terjadwal', 'Cakupan'], assigned, 'assignments') : ''}${slots.length ? table(doc, section, ['Hari', 'JP', 'Waktu (WIB)', 'Kelas', 'Mata pelajaran', 'Guru', 'RPS/LAB/Ruang', 'Catatan'], slots, 'slots') : '<p>Belum ada slot jadwal tersimpan untuk pilihan ini.</p>'}</section>`;
  }).join('');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(doc.filename)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#0f172a;font:12px/1.45 Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums}main{max-width:1120px;margin:24px auto;padding:28px;background:white}h1{font-size:23px;margin:8px 0}h2{font-size:17px;margin:24px 0 4px;break-after:avoid}p{margin:6px 0}.brand{font-size:15px;font-weight:bold;color:#1e3a8a}.metadata{display:flex;flex-wrap:wrap;gap:8px 24px;padding:12px 0;border-block:1px solid #cbd5e1}.muted,.time{color:#475569}.notice{background:#eff6ff;padding:10px 12px;margin:12px 0}.notice ul{margin:0;padding-left:18px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0 20px;font-size:11px}th,td{padding:7px;border:1px solid #cbd5e1;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#dbeafe;color:#1e3a8a;font-weight:bold}.context{background:#f8fafc;color:#334155;font-size:10px}tbody tr:nth-child(even){background:#f8fafc}thead{display:table-header-group}tr{break-inside:avoid}.weekly th:first-child,.weekly td:first-child{width:44px}.weekly td{font-size:10px}.time{font-size:9px;margin-bottom:4px}.lesson{padding:5px;margin:3px 0;border:1px solid #cbd5e1;color:#0f172a}.warning{color:#9f1239}.toolbar{position:sticky;top:0;background:#0f172a;color:white;padding:12px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:12px}.toolbar button{min-height:44px;background:white;color:#1e3a8a;border:0;border-radius:8px;padding:10px 16px;font:600 14px Arial;cursor:pointer}.toolbar button:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
  @page{size:A4 landscape;margin:12mm 10mm 16mm;@bottom-right{content:"Halaman " counter(page) " / " counter(pages);font:8pt Arial;color:#475569}}
  .legend{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:10px}.legend b{padding:2px 4px;color:#0f172a}
  @media print{body{background:white;font-size:8pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}main{max-width:none;margin:0;padding:0}.toolbar{display:none}h1{font-size:16pt;margin:4px 0}h2{font-size:11pt;margin:12px 0 3px}table{font-size:7.5pt;margin:8px 0 12px}.weekly td{font-size:7.5pt}.time,.context,.legend{font-size:6.5pt}.weekly th:first-child,.weekly td:first-child{width:auto}.weekly .lesson{padding:1px 2px;margin:2px 0}.entity{break-before:${doc.view === 'assignments' ? 'auto' : 'page'}}.entity:first-of-type{break-before:auto}.entity>p.muted{break-inside:avoid;break-after:avoid}.notice{font-size:7pt;margin:8px 0;padding:6px 8px}.metadata{padding:6px 0}th,td{padding:4px}.weekly th,.weekly td{padding:3px}}
  @media screen and (max-width:700px){main{margin:12px;padding:16px}table{min-width:780px}.entity{overflow-x:auto}.toolbar{position:static}}
  ${colorMode === 'monochrome' ? 'body,.brand,th,.warning{color:#111}.muted,.time,.context{color:#444}th{background:#e5e5e5}.notice,.context,tbody tr:nth-child(even){background:#f5f5f5}th,td,.lesson{border-color:#ccc}.metadata{border-color:#ccc}.lesson,.legend b{background:white!important;color:#111}.warning{text-decoration:underline}.toolbar{background:#222}.toolbar button{color:#111}@page{@bottom-right{color:#444}}' : ''}
  </style></head><body data-color-mode="${colorMode}"><div class="toolbar"><span>Cetakan A4 mendatar · ${colorMode === 'monochrome' ? 'Hitam-putih; kode mapel, legenda, dan label bentrok tetap ditampilkan.' : 'pilih Simpan sebagai PDF pada dialog cetak · aktifkan grafis latar agar warna ikut tercetak.'}</span></div><main><header><div class="brand">${escape(doc.schoolName)}</div><h1>${escape(doc.title)}</h1><div class="metadata"><span><b>Tahun ajaran:</b> ${escape(doc.academicYear)}</span><span><b>Semester:</b> ${escape(doc.semesterLabel)}</span><span><b>Periode:</b> ${escape(doc.periodLabel)}</span></div><p>${escape(doc.scopeLabel)}</p><p class="muted">Dibuat ${escape(doc.generatedLabel)} · ${doc.sections.length} ${doc.view === 'classes' ? 'kelas' : doc.view === 'rooms' ? 'RPS/LAB terjadwal' : 'guru'}</p></header><aside class="notice"><ul>${doc.notes.map(n => `<li>${escape(colorMode === 'monochrome' && n.startsWith('Warna membedakan') ? 'Kode mapel mengikuti legenda. Bentrok ditandai teks dan bersifat indikatif; pengecualian tetap perlu validasi server.' : n)}</li>`).join('')}</ul></aside>${sections || '<p>Belum ada data pada periode ini dalam cakupan akses Anda.</p>'}</main></body></html>`;
}
export function openSchedulingPrint(doc: SchedulingDocument, colorMode: 'color' | 'monochrome' = 'color'): void {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Jendela cetak diblokir browser. Izinkan pop-up untuk DIIS lalu coba lagi.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(schedulingDocumentHtml(doc, colorMode));
  popup.document.close();
  const button = popup.document.createElement('button');
  button.type = 'button'; button.textContent = 'Cetak / Simpan PDF';
  button.addEventListener('click', () => popup.print());
  popup.document.querySelector('.toolbar')?.prepend(button);
  popup.focus();
}

export function schedulingWorkbook(doc: SchedulingDocument) {
  const headers = ['Sekolah', 'Tahun ajaran', 'Semester', 'Periode', 'Cakupan', 'Dibuat (WIB)', 'Kelompok', 'Guru', 'Kelas', 'Mata pelajaran', 'Target JP/minggu', 'JP terjadwal', 'Status cakupan', 'Hari', 'JP mulai', 'JP selesai', 'Waktu (WIB)', 'RPS/LAB/Ruang', 'Catatan'];
  const rows: (string | number)[][] = [];
  for (const section of doc.sections) {
    const prefix = [doc.schoolName, doc.academicYear, doc.semesterLabel, doc.periodLabel, doc.scopeLabel, doc.generatedLabel, section.title];
    if (doc.view === 'assignments') {
      for (const a of section.assignments) {
        const actual = allocatedJp(section.schedules, a.id), slots = section.schedules.filter(s => s.teachingAssignment.id === a.id);
        for (const s of slots.length ? slots : [null]) rows.push([...prefix, a.teacher.user.fullName, a.class.name, a.subject, a.hoursPerWeek, actual, COVERAGE[coverageStatus(a.hoursPerWeek, actual)], ...(s ? [WEEK_DAYS[s.dayOfWeek - 1]!, s.jpStart, s.jpEnd, documentTime(s, doc.bell), s.room?.trim() || 'Belum ditentukan', documentSlotStatus(s, doc.conflicts)] : ['', '', '', '', '', 'Belum ada slot tersimpan'])]);
      }
      // Keep legacy schedules whose assignment is outside the readable assignment catalogue.
    }
    const slots = doc.view === 'assignments' ? section.schedules.filter(s => !section.assignments.some(a => a.id === s.teachingAssignment.id)) : section.schedules;
    for (const s of slots) {
      const a = section.assignments.find(a => a.id === s.teachingAssignment.id);
      const actual = a ? allocatedJp(section.schedules, a.id) : '';
      rows.push([...prefix, s.teachingAssignment.teacher.user.fullName, s.class.name, s.teachingAssignment.subject, a?.hoursPerWeek ?? '', actual, a ? COVERAGE[coverageStatus(a.hoursPerWeek, Number(actual))] : 'Target tidak dimuat', WEEK_DAYS[s.dayOfWeek - 1]!, s.jpStart, s.jpEnd, documentTime(s, doc.bell), s.room?.trim() || 'Belum ditentukan', documentSlotStatus(s, doc.conflicts)]);
    }
    if (doc.view !== 'assignments') for (const a of section.assignments.filter(a => !section.schedules.some(s => s.teachingAssignment.id === a.id))) {
      rows.push([...prefix, a.teacher.user.fullName, a.class.name, a.subject, a.hoursPerWeek, 0, COVERAGE[coverageStatus(a.hoursPerWeek, 0)], '', '', '', '', '', 'Belum ada slot tersimpan']);
    }
    if (!section.schedules.length && !section.assignments.length) rows.push([...prefix, '', '', '', '', '', '', '', '', '', '', '', 'Belum ada slot tersimpan']);
  }
  return { headers, rows, notes: doc.notes };
}
/** Reader-facing report mirrors the PDF; the separate data sheet retains sortable full records. */
export function schedulingPresentationSheet(doc: SchedulingDocument): Sheet<Blob> {
  const widths = [12, 24, 24, 24, 24, 24, 24, 24];
  const data: Row[] = [[]];
  const cell = (value: string | number, options: Partial<CellObject> = {}): CellObject => ({ value,
    type: typeof value === 'number' ? Number : String, fontFamily: 'Arial', fontSize: 10,
    textColor: '#0F172A', wrap: true, alignVertical: 'top', ...options });
  const add = (cells: CellObject[]) => {
    const row: Row = [];
    let column = 0, height = 22;
    for (const c of cells) {
      const span = c.columnSpan ?? 1;
      const capacity = Math.max(1, Math.floor(widths.slice(column, column + span).reduce((n, w) => n + w, 0) * 0.85));
      const text = String(c.value ?? '');
      const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / capacity)), 0);
      height = Math.max(height, lines * 15 + 8, c.height ?? 0);
      if (text.length > 32767 || height > 409) throw new Error('Isi laporan terlalu padat untuk satu sel Excel. Gunakan PDF atau ekspor per guru/kelas/RPS.');
      row.push(c, ...Array<null>(span - 1).fill(null)); column += span;
    }
    if (column > widths.length) throw new Error('Susunan laporan Excel tidak valid.');
    for (const c of cells) c.height = height;
    data.push(row);
  };
  const band = (text: string) => add([cell(text, { columnSpan: 8, fontWeight: 'bold', backgroundColor: '#DBEAFE', textColor: '#1E3A8A' })]);
  const note = (text: string) => add([cell(text, { columnSpan: 8, textColor: '#475569' })]);
  const heading = (values: [string, number][]) => add(values.map(([v, columnSpan]) => cell(v, { columnSpan,
    fontWeight: 'bold', backgroundColor: '#1E3A8A', textColor: '#FFFFFF', align: 'center', alignVertical: 'center' })));
  add([cell(doc.schoolName, { columnSpan: 8, fontWeight: 'bold', textColor: '#1E3A8A' })]);
  add([cell(doc.title, { columnSpan: 8, fontSize: 14, fontWeight: 'bold', bottomBorderColor: '#2563EB', bottomBorderStyle: 'thin' })]);
  note(`Tahun ajaran: ${doc.academicYear} · Semester: ${doc.semesterLabel} · Periode: ${doc.periodLabel}`);
  note(`${doc.scopeLabel}. Dibuat ${doc.generatedLabel}.`);
  for (const section of doc.sections) {
    data.push([]);
    band(section.title);
    note(`${section.assignments.length} penugasan · ${section.schedules.length} slot · ${section.schedules.reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0)} JP kelas`);
    if (doc.view !== 'assignments') {
      const subjects = [...new Set(section.schedules.map(s => s.teachingAssignment.subject))].sort((a, b) => a.localeCompare(b, 'id-ID'));
      const days = WEEK_DAYS.map((label, i) => ({ label, day: i + 1 })).filter(d => d.day <= 6 || section.schedules.some(s => s.dayOfWeek === d.day));
      const numbers = new Set(doc.bell.weeklySlots);
      for (const s of section.schedules) for (let jp = s.jpStart; jp <= s.jpEnd; jp++) numbers.add(jp);
      heading([['JP', 1], ...days.map(d => [d.label, 1] as [string, number])]);
      for (const jp of [...numbers].sort((a, b) => a - b)) {
        add([cell(jp, { fontWeight: 'bold', align: 'center', backgroundColor: '#F1F5F9' }), ...days.map(({ day }) => {
          const timing = doc.bell.slotsForDay(day).find(s => s.jp === jp);
          const label = !timing ? 'Waktu belum tersedia' : timing.timingVaries ? 'Waktu bervariasi' : `${fmtMin(timing.startMin)}–${fmtMin(timing.endMin)}`;
          const slots = section.schedules.filter(s => s.dayOfWeek === day && s.jpStart <= jp && s.jpEnd >= jp);
          return cell([label, ...slots.map(s => `${subjectLabel(doc, s.teachingAssignment.subject)}${doc.view === 'classes' ? '' : ` · ${s.class.name}`} · JP ${s.jpStart}–${s.jpEnd}${doc.conflicts.has(s.id) ? ' · BENTROK' : ''}${s.concurrencyGroup ? ' · Gabungan/pengecualian' : ''}`), ...(slots.length ? [] : ['—'])].join('\n'), {
            backgroundColor: slots.some(s => doc.conflicts.has(s.id)) ? '#FFE4E6' : slots.length ? subjectColor(slots[0]!.teachingAssignment.subject) : '#F8FAFC',
            bottomBorderColor: '#CBD5E1', bottomBorderStyle: 'thin' });
        })]);
      }
      note('Kode mengikuti katalog Mata Pelajaran DIIS, bukan nomor urut dokumen. — berarti tidak ada slot tersimpan. Semua sesi bertumpuk tetap ditampilkan.');
      for (const subject of subjects) add([cell(doc.subjectCodes.has(subject.trim()) ? `${subjectLabel(doc, subject)} — ${subject}` : `${subject} (kode katalog belum tersedia atau tidak unik)`, { columnSpan: 8, backgroundColor: subjectColor(subject) })]);
    }
    if (section.assignments.length) {
      data.push([]);
      heading([['Guru', 2], ['Kelas', 1], ['Mata pelajaran', 2], ['Target JP/minggu', 1], ['JP terjadwal', 1], ['Cakupan', 1]]);
      for (const a of section.assignments) {
        const actual = allocatedJp(section.schedules, a.id);
        add([cell(a.teacher.user.fullName, { columnSpan: 2 }), cell(a.class.name), cell(a.subject, { columnSpan: 2, backgroundColor: subjectColor(a.subject) }),
          cell(a.hoursPerWeek, { align: 'right' }), cell(actual, { align: 'right' }), cell(COVERAGE[coverageStatus(a.hoursPerWeek, actual)], { indent: 1 })]);
      }
    }
    if (section.schedules.length) {
      data.push([]);
      heading([['Hari', 1], ['JP', 1], ['Waktu (WIB)', 1], ['Kelas', 1], ['Mata pelajaran', 1], ['Guru', 1], ['RPS/LAB/Ruang', 1], ['Catatan', 1]]);
      for (const s of section.schedules) add([cell(WEEK_DAYS[s.dayOfWeek - 1]!), cell(`JP ${s.jpStart}–${s.jpEnd}`), cell(documentTime(s, doc.bell)),
        cell(s.class.name), cell(s.teachingAssignment.subject, { backgroundColor: subjectColor(s.teachingAssignment.subject) }),
        cell(s.teachingAssignment.teacher.user.fullName), cell(s.room?.trim() || 'Belum ditentukan'),
        cell(documentSlotStatus(s, doc.conflicts, true), doc.conflicts.has(s.id) ? { fontWeight: 'bold', backgroundColor: '#FFE4E6', textColor: '#9F1239' } : {})]);
    } else note('Belum ada slot jadwal tersimpan untuk pilihan ini.');
  }
  if (!doc.sections.length) note('Belum ada data pada periode ini dalam cakupan akses Anda.');
  return { data, sheet: 'Laporan', orientation: 'landscape', showGridLines: false, columns: widths.map(width => ({ width })) };
}

export async function downloadSchedulingWorkbook(doc: SchedulingDocument): Promise<void> {
  const { default: writeXlsx } = await import('write-excel-file/browser');
  const book = schedulingWorkbook(doc);
  const header = (values: string[]) => values.map(value => ({ value, type: String, fontWeight: 'bold' as const, fontSize: 10, backgroundColor: '#1E3A8A', textColor: '#FFFFFF', wrap: true }));
  const data = [header(book.headers), ...book.rows.map((row, index) => row.map(value => ({ value, type: typeof value === 'number' ? Number : String, fontSize: 10, wrap: true, backgroundColor: index % 2 ? '#F8FAFC' : '#FFFFFF' })))];
  // Every externally supplied value is a String cell, never a Formula cell.
  await writeXlsx([
    schedulingPresentationSheet(doc),
    { data, sheet: 'Data Jadwal', orientation: 'landscape', stickyRowsCount: 1, columns: book.headers.map((_, i) => ({ width: [0, 4, 7, 9, 18].includes(i) ? 36 : 20 })) },
    { data: [header(['Informasi dokumen']), ...[doc.title, doc.schoolName, doc.academicYear, doc.semesterLabel, doc.periodLabel, doc.scopeLabel, doc.generatedLabel, ...book.notes].map(value => [{ value, type: String, wrap: true }])], sheet: 'Informasi', columns: [{ width: 110 }] },
  ], { features: [schedulingReportPrintFeature] }).toFile(doc.filename + '.xlsx');
}

/** Supported writer extension: keep the presentation report one page wide, not one page tall. */
export const schedulingReportPrintFeature: Feature<File | Blob | ArrayBuffer> = {
  files: { transform: { 'xl/worksheets/sheet{id}.xml': {
    transform(content, options) {
      if (options.sheet !== 'Laporan') return content;
      // Fail explicitly on unexpected writer output instead of returning silently broken print settings.
      if (!/<worksheet\b[^>]*>/.test(content) || !/<pageSetup\b[^>]*\/>/.test(content)
        || /<sheetPr\b|\bfitToWidth=|\bfitToHeight=/.test(content)) throw new Error('Pengaturan cetak Excel belum dapat dibuat. Gunakan PDF.');
      return content.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
        .replace(/<pageSetup\b([^>]*)\/>/, '<pageSetup$1 fitToWidth="1" fitToHeight="0"/>');
    },
  } } },
};
