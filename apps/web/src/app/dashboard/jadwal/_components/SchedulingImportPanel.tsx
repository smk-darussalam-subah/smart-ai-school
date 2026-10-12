'use client';
import React, { useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadSchedulingTemplate, schedulingTemplateColumns, suggestSchedulingTemplateColumns } from '@/lib/scheduling-import-template';
import { CatalogSchema, fileLimit, ImportAckSchema, ImportCatalog, ImportFile, ImportResult,
  ImportResultSchema, importIssueText, importRequest, InspectSchema } from '@/lib/scheduling-import';

const fields = { assignment: 'Penugasan', day: 'Hari', jpStart: 'JP mulai', jpEnd: 'JP selesai',
  sessionIndex: 'Indeks sesi (opsional)', room: 'Ruang (opsional)', concurrencyGroup: 'Grup resmi (opsional)' };
type Field = keyof typeof fields;
const required: Field[] = ['assignment', 'day', 'jpStart', 'jpEnd'];
const fieldStyle = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:[color-scheme:dark]';

/** Local addition to the existing scheduling workspace, not a solver/publish control. */
export default function SchedulingImportPanel({ academicYearId, academicYearLabel, semesterNumber, classes, canEdit, open, onOpenChange, onCloseAutoFocus }: {
  academicYearId: string; academicYearLabel?: string; semesterNumber: number; classes: Array<{ id: string; name: string }>; canEdit: boolean;
  open: boolean; onOpenChange: (open: boolean) => void; onCloseAutoFocus?: (event: Event) => void;
}) {
  const [name, setName] = useState('Draft impor jadwal');
  const [from, setFrom] = useState(''); const [until, setUntil] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [file, setFile] = useState<ImportFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [headerRow, setHeaderRow] = useState(1); const [sheet, setSheet] = useState(1);
  const [delimiter, setDelimiter] = useState<ImportFile['delimiter']>(',');
  const [inspection, setInspection] = useState<ReturnType<typeof InspectSchema.parse> | null>(null);
  const [catalog, setCatalog] = useState<ImportCatalog>([]);
  const [columns, setColumns] = useState<Partial<Record<Field, number>>>({});
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const templateInFlight = useRef(false);
  const inFlight = useRef(false); const requestKey = useRef<string | null>(null);
  const draft = { academicYearId, semesterNumber, name, effectiveFrom: from, effectiveUntil: until, classIds };
  function invalidate() { setPreview(null); setConfirm(false); setSaved(''); requestKey.current = null; }
  function resetFile() { invalidate(); setInspection(null); setCatalog([]); setColumns({}); setAliases({}); setSources([]); }
  async function work(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Impor belum dapat diproses. Coba lagi.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function chooseFile(value?: File) {
    resetFile(); setFile(null); setFileName('');
    if (!value) return;
    await work(async () => {
      if (!/\.(csv|xlsx)$/i.test(value.name) || !value.size || value.size > fileLimit) {
        throw new Error('Gunakan CSV UTF-8 atau XLSX tanpa formula, maksimal 512 KB.');
      }
      const bytes = new Uint8Array(await value.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      setFile({ format: /\.xlsx$/i.test(value.name) ? 'XLSX' : 'CSV', contentBase64: btoa(binary), sheet, headerRow, delimiter });
      setFileName(value.name);
    });
  }
  const request = () => ({ draft, file: file && { ...file, sheet, headerRow, delimiter },
    mapping: { columns, assignments: Object.entries(aliases).filter(([,id]) => id).map(([source, assignmentId]) => ({ source, assignmentId })) } });
  async function inspect() {
    await work(async () => {
      if (!file) throw new Error('Pilih file lebih dahulu.');
      const [read, options] = await Promise.all([
        importRequest('inspect', { ...file, sheet, headerRow, delimiter }, InspectSchema),
        importRequest('catalog', draft, CatalogSchema),
      ]);
      resetFile(); setInspection(read); setCatalog(options.assignments);
      setColumns(suggestSchedulingTemplateColumns(read.headers));
    });
  }
  async function validate() {
    await work(async () => {
      invalidate();
      const result = await importRequest('preview', request(), ImportResultSchema);
      setPreview(result); setSources(result.sources);
    });
  }
  async function save() {
    await work(async () => {
      if (!preview?.commitAllowed || !confirm || !canEdit) return;
      requestKey.current ??= crypto.randomUUID();
      const ack = await importRequest('commit', { ...request(), expectedPreviewDigest: preview.previewDigest }, ImportAckSchema, requestKey.current);
      setSaved(ack.id); setConfirm(false);
    });
  }
  const scopeConfigured = Boolean(name.trim() && from && until && until >= from && classIds.length);
  const configured = Boolean(file && scopeConfigured);
  const mapped = required.every((key) => columns[key] !== undefined);
  async function downloadTemplate(format: 'XLSX' | 'CSV') {
    if (templateInFlight.current || inFlight.current) return;
    templateInFlight.current = true; setTemplateBusy(true); setError('');
    try {
      if (format === 'XLSX') {
        if (!scopeConfigured) throw new Error('Pilih tanggal berlaku dan kelas sebelum mengunduh XLSX berisi penugasan.');
        const options = await importRequest('catalog', draft, CatalogSchema);
        if (!options.assignments.length) throw new Error('Belum ada penugasan untuk cakupan ini. Periksa penugasan mengajar atau pilih kelas lain.');
        await downloadSchedulingTemplate(format, { assignments: options.assignments, academicYear: academicYearLabel || 'Label tahun ajaran belum tersedia',
          semester: semesterNumber, effectiveFrom: from, effectiveUntil: until,
          classNames: classes.filter(c => classIds.includes(c.id)).map(c => c.name) });
      } else await downloadSchedulingTemplate(format);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Template belum dapat diunduh. Coba lagi.'); }
    finally { templateInFlight.current = false; setTemplateBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(next: boolean) => { if (!inFlight.current && !templateInFlight.current) onOpenChange(next); }}>
    <DialogContent closeDisabled={busy || templateBusy} onCloseAutoFocus={onCloseAutoFocus}
      className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 [&>button]:dark:hover:bg-slate-800 [&>button]:dark:focus:ring-slate-400">
      <DialogHeader className="shrink-0 border-b border-slate-200 p-4 pr-16 text-left dark:border-slate-700 sm:p-5 sm:pr-16">
        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg"><FileUp size={18} aria-hidden="true" />Impor ke draft jadwal</DialogTitle>
        <DialogDescription className="text-xs text-slate-600 dark:text-slate-300 sm:text-sm">Tidak mengubah jadwal aktif. Isi template, baca file, lalu periksa hasil pemetaan.</DialogDescription>
      </DialogHeader>
    <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
      <section aria-label="Template pengisian jadwal" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold">Mulai dengan template</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">XLSX menyertakan referensi penugasan dari sistem. Pilih tanggal dan kelas di bawah, lalu unduh.</p></div>
          <div className="flex flex-wrap gap-2">{(['XLSX', 'CSV'] as const).map((format) => <Button key={format} type="button" variant="outline" className="min-h-11 gap-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" disabled={busy || templateBusy || (format === 'XLSX' && !scopeConfigured)} onClick={() => void downloadTemplate(format)}><Download size={16} aria-hidden="true" />Template {format}</Button>)}</div>
        </div>
        <details className="rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Panduan pengisian</summary>
          <div className="space-y-3 border-t border-slate-200 p-3 text-xs dark:border-slate-700">
            <dl className="grid gap-3 sm:grid-cols-2">{schedulingTemplateColumns.map(({ key, header, hint }) => <div key={key}><dt className="font-semibold">{header}{key === 'room' ? ' (opsional)' : ' *'}</dt><dd className="mt-1 text-slate-600 dark:text-slate-300">{hint}</dd></div>)}</dl>
            <p>Isi semua kolom wajib. Pertahankan header di baris 1; gunakan sheet pertama dan pemisah koma untuk CSV. Jangan tambahkan formula atau baris kosong di tengah data.</p>
            <p>JP mengikuti konfigurasi sekolah per hari. Indeks sesi diisi otomatis; kolom indeks sesi dan grup resmi dapat dipetakan terpisah jika file Anda memilikinya. Grup resmi hanya untuk pengecualian yang sudah disetujui.</p>
            <p>Di Excel, buka <strong>Referensi Penugasan</strong>, cari kelas · mapel · guru, lalu salin <strong>Kode penugasan</strong> ke kolom Penugasan di sheet Jadwal. Isi Hari dan rentang JP; satu baris untuk satu sesi. Ulangi kode yang sama bila penugasan dibagi beberapa sesi.</p>
            <p>Guru produktif berbeda pada kelas dan mapel yang sama memiliki kode berbeda. Untuk CSV, salin kode dari referensi XLSX. Label buatan sendiri tetap perlu dipetakan secara eksplisit saat validasi.</p>
          </div>
        </details>
        {templateBusy && <p role="status" className="text-xs">Menyiapkan unduhan template…</p>}
      </section>
      <p className="max-w-prose text-sm text-slate-600 dark:text-slate-300">Pilih periode dan kelas, petakan kolom, lalu periksa semua baris. JP mengikuti profil bel sekolah. Ini belum merupakan hasil optimasi atau jadwal yang dipublikasikan.</p>
      <fieldset disabled={busy || templateBusy} className="min-w-0 space-y-4 disabled:opacity-70">
        <legend className="mb-2 text-sm font-semibold">Sumber dan scope · semester {semesterNumber}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Nama draft<input className={fieldStyle} value={name} maxLength={120} onChange={(e) => { invalidate(); setName(e.target.value); }} /></label>
          <label className="text-sm">Berlaku mulai<input type="date" className={fieldStyle} value={from} onChange={(e) => { invalidate(); setFrom(e.target.value); }} /></label>
          <label className="text-sm">Berlaku sampai<input type="date" className={fieldStyle} value={until} onChange={(e) => { invalidate(); setUntil(e.target.value); }} /></label>
        </div>
        <fieldset className="min-w-0"><legend className="text-sm">Kelas dalam scope</legend><div className="flex max-h-40 flex-wrap gap-x-4 overflow-y-auto">
          {classes.map((c) => <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={classIds.includes(c.id)} onChange={(e) => { resetFile(); setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((id) => id !== c.id)); }} />{c.name}</label>)}
          {!classes.length && <p className="py-2 text-sm">Daftar kelas belum tersedia. Muat ulang halaman.</p>}
        </div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm sm:col-span-2">File CSV/XLSX<input type="file" accept=".csv,.xlsx" className={`${fieldStyle} py-2`} onChange={(e) => void chooseFile(e.target.files?.[0])} /><span className="mt-1 block break-all text-xs text-slate-600 dark:text-slate-300">{fileName || 'UTF-8, tanpa formula; maksimal 512 KB dan 1.000 baris.'}</span></label>
          <label className="text-sm">Baris header<input className={fieldStyle} type="number" min={1} max={20} value={headerRow} onChange={(e) => { resetFile(); setHeaderRow(Number(e.target.value)); }} /></label>
          {file?.format === 'XLSX' ? <label className="text-sm">Nomor sheet<input className={fieldStyle} type="number" min={1} max={10} value={sheet} onChange={(e) => { resetFile(); setSheet(Number(e.target.value)); }} /></label> :
            <label className="text-sm">Pemisah CSV<select className={fieldStyle} value={delimiter} onChange={(e) => { resetFile(); setDelimiter(e.target.value as ImportFile['delimiter']); }}><option value=",">Koma</option><option value=";">Titik koma</option><option value={'\t'}>Tab</option></select></label>}
        </div>
        <Button type="button" className="min-h-11 whitespace-normal dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" variant="outline" disabled={!configured || busy} onClick={() => void inspect()}>Baca file dan penugasan</Button>
        {inspection && <section className="space-y-3" aria-label="Pemetaan impor">
          <h3 className="text-sm font-semibold">Pemetaan kolom · {inspection.rowCount} baris</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">Penugasan adalah kombinasi kelas, mapel, dan guru. Guru produktif yang berbeda tetap penugasan terpisah.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(fields) as Field[]).map((key) => <label key={key} className="text-sm">{fields[key]}<select aria-label={fields[key]} className={fieldStyle} value={columns[key] ?? ''} onChange={(e) => { invalidate(); setAliases({}); setSources([]); setColumns({ ...columns, [key]: e.target.value === '' ? undefined : Number(e.target.value) }); }}>
            <option value="">{required.includes(key) ? 'Pilih kolom' : 'Tidak digunakan'}</option>{inspection.headers.map((h,i) => <option value={i} key={i}>{i+1}. {h}</option>)}
          </select></label>)}</div>
          {sources.filter((s) => !catalog.some((a) => a.id === s)).map((source) => <label key={source} className="block text-sm"><span className="break-words">Penugasan untuk “{source || '(kosong)'}”</span><select aria-label={`Penugasan untuk “${source || '(kosong)'}”`} className={fieldStyle} value={aliases[source] ?? ''} onChange={(e) => { invalidate(); setAliases({ ...aliases, [source]: e.target.value }); }}>
            <option value="">Pilih secara eksplisit</option>{catalog.map((a) => <option key={a.id} value={a.id}>{a.className} · {a.subject} · {a.teacherName} · {a.targetJp} JP</option>)}
          </select></label>)}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-xs"><caption className="px-3 py-2 text-left text-slate-600 dark:text-slate-300">Contoh 5 baris pertama; semua baris diperiksa saat validasi.</caption><thead><tr>{inspection.headers.map((h,i) => <th className="whitespace-nowrap px-3 py-2" key={i}>{h}</th>)}</tr></thead><tbody>{inspection.sample.map((r) => <tr key={r.row}>{r.values.map((v,i) => <td className="max-w-52 break-words px-3 py-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
          <Button type="button" className="min-h-11 whitespace-normal dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" variant="outline" disabled={!mapped || busy} onClick={() => void validate()}>Validasi semua baris</Button>
        </section>}
        {preview && <section className="space-y-3" aria-label="Hasil validasi">
          <h3 className="text-sm font-semibold">Hasil pratinjau · {preview.parsedSlotCount}/{preview.rowCount} baris menjadi slot</h3>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm" aria-label="Masalah impor">{preview.errors.map((e,i) => <li key={i} className="text-red-700 dark:text-red-300">{e.row ? `Baris ${e.row}: ` : ''}{importIssueText(e.code)}</li>)}</ul>
          {preview.warnings.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-200">{preview.warnings.length} penugasan belum lengkap. Draft boleh disimpan untuk dilanjutkan; bukan jadwal siap terbit.</p>}
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><caption className="px-3 py-2 text-left">Slot hasil pemetaan</caption><thead><tr><th className="px-3 py-2">Penugasan</th><th className="px-3 py-2">Hari</th><th className="px-3 py-2">JP</th><th className="px-3 py-2">Ruang</th></tr></thead><tbody>{preview.slots.map((s,i) => { const a = catalog.find((c) => c.id === s.assignmentId); return <tr key={i}><td className="min-w-48 px-3 py-2">{a ? `${a.className} · ${a.subject} · ${a.teacherName}` : s.assignmentId}</td><td className="px-3 py-2">{['', 'Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'][s.dayOfWeek]}</td><td className="whitespace-nowrap px-3 py-2">{s.jpStart}–{s.jpEnd}</td><td className="px-3 py-2">{s.roomLabel ?? 'Belum ditetapkan'}</td></tr>; })}</tbody></table></div>
          <p className="text-xs text-slate-600 dark:text-slate-300">Kapasitas fasilitas, peralatan, keselamatan, dan ketersediaan guru belum diverifikasi.</p>
          {preview.commitAllowed && <label className="flex min-h-11 items-start gap-2 py-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Saya sudah memeriksa pemetaan. Simpan hanya sebagai draft, tanpa mengubah jadwal aktif.</label>}
          <Button type="button" className="min-h-11 whitespace-normal bg-blue-600 text-white hover:bg-blue-700 dark:text-white" disabled={!canEdit || !preview.commitAllowed || !confirm || busy || Boolean(saved)} onClick={() => void save()}>{busy ? 'Memproses…' : 'Simpan sebagai draft'}</Button>
          {!canEdit && <p className="text-sm">Akses Anda hanya untuk membaca dan memeriksa draft.</p>}
        </section>}
      </fieldset>
      {busy && <p role="status" className="text-sm">Memproses file; jadwal aktif tetap tidak berubah.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {saved && <p role="status" className="break-words rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Draft tersimpan. ID: {saved}. Belum dipublikasikan.</p>}
    </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 p-3 dark:border-slate-700 sm:px-5">
        <p className="text-xs text-slate-600 dark:text-slate-300">Menutup popup tidak menghapus isian.</p>
        <Button type="button" variant="outline" className="min-h-11 shrink-0 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800" disabled={busy || templateBusy} onClick={() => onOpenChange(false)}>Tutup impor</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
