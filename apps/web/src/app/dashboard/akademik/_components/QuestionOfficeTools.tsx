'use client';

import { useEffect, useRef, useState } from 'react';
import QuestionContent from '@/components/learning/QuestionContent';
import AssessmentOptionContent from '@/components/learning/AssessmentOptionContent';
import type { AssessmentOption } from '@smk/types';
import { QUESTION_HTML_PREFIX } from '@/lib/question-content';
import { renderQuestionFormula } from '@/lib/question-math';

type Preview = {
  optionImages?: Record<string, string>;
  rows: Array<{
    code: string;
    type: string;
    body: string;
    imageCount: number;
    options?: AssessmentOption[];
    answerSummary: string | null;
  }>;
  errors: Array<{ code: string; message: string }>;
};
type OfficeMode = 'xlsx' | 'docx' | 'student-docx';
type Mode = OfficeMode | 'student-print';
const button = 'min-h-11 rounded-lg border border-[var(--qb-line)] px-3 text-sm font-semibold disabled:opacity-50';

async function office(path: string, payload: object) {
  const response = await fetch(`/api/backend/question-office/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store',
  });
  if (response.ok) return response;
  const error = await response.json().catch(() => null);
  throw new Error(typeof error?.message === 'string' ? error.message : 'Berkas belum dapat diproses. Periksa format dan coba lagi.');
}

export default function QuestionOfficeTools({ subject, questions, reload }: {
  subject: string;
  questions: ReadonlyArray<{ id: string; body: string }>;
  reload: () => void;
}) {
  const [file, setFile] = useState<{ name: string; encoded: string }>();
  const [preview, setPreview] = useState<Preview>();
  const [codes, setCodes] = useState<string[]>([]);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [format, setFormat] = useState<Mode>('xlsx');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const visibleExport = questions.filter(({ id }) => exportIds.includes(id)).map(({ id }) => id);

  useEffect(() => {
    if (!preview && !error && !result) return;
    const hasOutcome = Boolean(error || result);
    const target = (hasOutcome ? outcomeRef : previewRef).current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: hasOutcome ? 'nearest' : 'center' });
  }, [preview, error, result]);

  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setResult('');
    setError('');
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Permintaan belum berhasil.'); }
    finally { lock.current = false; setBusy(false); }
  }

  function previewFile(chosen: File) {
    void run(async () => {
      setFile(undefined); setPreview(undefined); setCodes([]);
      if (!chosen.size || chosen.size > 600 * 1024) throw new Error('Gunakan berkas berukuran maksimal 600 KB.');
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      const parts: string[] = [];
      for (let index = 0; index < bytes.length; index += 8192) {
        parts.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
      }
      const encoded = btoa(parts.join(''));
      const parsed: Preview = await (await office('preview', { subject, file: encoded })).json();
      setFile({ name: chosen.name, encoded });
      setPreview(parsed);
      setCodes(parsed.rows.filter((row) => !parsed.errors.some(({ code }) => code === row.code)).map(({ code }) => code));
    });
  }

  function download(path: 'template' | 'export', mode: OfficeMode) {
    void run(async () => {
      const response = await office(path, path === 'template' ? { subject, format: mode } : { ids: visibleExport, format: mode });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      const filename = response.headers.get('content-disposition')?.match(/filename="([A-Za-z0-9.-]+)"/)?.[1];
      link.href = url;
      link.download = filename ?? `Soal-DIIS.${mode === 'xlsx' ? 'xlsx' : 'docx'}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function previewPrint() {
    if (lock.current) return;
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setError('Izinkan jendela baru untuk membuka pratinjau cetak.');
      return;
    }
    previewWindow.opener = null;
    previewWindow.document.title = 'Menyiapkan naskah soal';
    previewWindow.document.body.textContent = 'Menyiapkan naskah soal…';
    void run(async () => {
      try {
        const response = await office('export', { ids: visibleExport, format: 'student-print' });
        if (!response.headers.get('content-type')?.startsWith('text/html')) {
          throw new Error('Pratinjau cetak belum tersedia.');
        }
        const documentForPrint = new DOMParser().parseFromString(await response.text(), 'text/html');
        await Promise.all(Array.from(documentForPrint.querySelectorAll('[data-print-math]'), async (formula) => {
          try {
            const math = await renderQuestionFormula(formula.textContent ?? '', true, 'mathml');
            formula.innerHTML = math;
          } catch {
            // Keep historical LaTeX readable if it cannot be formatted.
          }
        }));
        if (previewWindow.closed) return;
        const target = previewWindow.document;
        target.documentElement.lang = 'id';
        target.head.replaceChildren(...Array.from(documentForPrint.head.children));
        target.body.replaceChildren(...Array.from(documentForPrint.body.children));
        const print = target.createElement('button');
        print.type = 'button';
        print.textContent = 'Cetak / Simpan PDF';
        print.addEventListener('click', () => previewWindow.print());
        target.querySelector('header')?.append(print);
        await Promise.all(Array.from(target.images, (image) => image.decode()));
        await target.fonts.ready;
        print.focus();
      } catch (cause) {
        previewWindow.close();
        throw cause;
      }
    });
  }

  return <details className="rounded-xl border border-[var(--qb-line)] bg-[var(--qb-bg)] p-3">
    <summary className="cursor-pointer py-1 text-sm font-semibold">Impor dan ekspor Word / Excel</summary>
    <div className="mt-3 space-y-4">
      {(error || result) && (
        <div ref={outcomeRef} tabIndex={-1} className="space-y-2">
          {error && <p role="alert" className="rounded-lg bg-[var(--qb-warn-bg)] p-2 text-sm text-[var(--qb-warn-ink)]">{error}</p>}
          {result && <p role="status" className="text-sm">{result}</p>}
        </div>
      )}
      <section className="space-y-2" aria-busy={busy}>
        <h3 className="text-sm font-semibold">Impor ke Bank Soal</h3>
        <p className="text-xs text-[var(--qb-muted)]">Gunakan template. Untuk Excel bergambar, pilih ZIP berisi XLSX dan folder media.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => download('template', 'xlsx')}>Template Excel</button>
          <button type="button" className={button} disabled={busy} onClick={() => download('template', 'docx')}>Template Word</button>
          <label className={`${button} relative inline-flex cursor-pointer items-center focus-within:outline`}>
            Pilih berkas<input type="file" accept=".docx,.xlsx,.zip" aria-label="Pilih berkas soal Word atau Excel"
              disabled={busy} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" onChange={(event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (chosen) previewFile(chosen);
              }} />
          </label>
        </div>
        {file && preview && <div className="space-y-2 rounded-lg border border-[var(--qb-line)] p-3">
          <div ref={previewRef} tabIndex={-1} role="region" aria-label="Hasil pemeriksaan berkas" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-all text-sm font-semibold">{file.name} · {codes.length} dipilih</p>
              <button type="button" className={button} disabled={busy || !codes.length} onClick={() => void run(async () => {
                const saved: { imported: number; errors: Array<{ column: string; message: string }> } =
                  await (await office('import', { subject, file: file.encoded, codes })).json();
                setResult(`${saved.imported} soal tersedia di Bank Soal.`);
                if (saved.errors.length) {
                  setError(saved.errors.map(({ column, message }) => `${column} · ${message}`).join(' | '));
                  setCodes(saved.errors.map(({ column }) => column));
                } else {
                  setCodes([]); setPreview(undefined); setFile(undefined);
                }
                reload();
              })}>Impor soal terpilih</button>
            </div>
            {preview.errors.length > 0 && <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-[var(--qb-warn-ink)]">{preview.errors.map((item, index) =>
              <li key={`${item.code}-${index}`}>{item.code} · {item.message}</li>)}</ul>}
          </div>
          {preview.rows.map((row) => <div key={row.code} className="border-t border-[var(--qb-line)] pt-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={codes.includes(row.code)} disabled={busy || preview.errors.some(({ code }) => code === row.code)}
                onChange={(event) => setCodes(event.target.checked ? [...codes, row.code] : codes.filter((code) => code !== row.code))} />
              {row.code}{row.imageCount > 0 ? ` · ${row.imageCount} gambar` : ''}
            </label>
            <QuestionContent body={QUESTION_HTML_PREFIX + row.body} />
            {row.options?.length ? (
              <ul aria-label={`Pilihan jawaban ${row.code}`} className="mt-1 space-y-1 text-sm">
                {row.options.map((option) => (
                  <li key={option.id} className="flex gap-2">
                    <span className="font-semibold">{option.id.toUpperCase()}.</span>
                    <AssessmentOptionContent option={option} previewImages={preview.optionImages ?? {}} />
                  </li>
                ))}
              </ul>
            ) : null}
            {row.answerSummary && <details className="mt-1 text-xs">
              <summary className="cursor-pointer font-semibold">Periksa kunci atau panduan</summary>
              <p dir="auto" className="mt-1 break-words">{row.answerSummary}</p>
            </details>}
          </div>)}
        </div>}
      </section>
      <section className="space-y-2 border-t border-[var(--qb-line)] pt-3">
        <h3 className="text-sm font-semibold">Ekspor soal di halaman ini</h3>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {questions.slice(0, 100).map(({ id, body }) => <label key={id} className="flex min-h-9 items-center gap-2 text-xs">
            <input type="checkbox" checked={visibleExport.includes(id)} disabled={busy}
              onChange={(event) => setExportIds(event.target.checked ? [...exportIds, id] : exportIds.filter((value) => value !== id))} />
            <span className="truncate">{body.replace(/^<!--diis-question-html:v1-->/, '').replace(/<[^>]+>/g, ' ').trim() || 'Soal bergambar'}</span>
          </label>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={button} aria-label="Format ekspor soal" value={format} onChange={(event) => setFormat(event.target.value as Mode)}>
            <option value="xlsx">Excel · dengan kunci</option>
            <option value="docx">Word · dengan kunci</option>
            <option value="student-docx">Word · naskah siswa</option>
            <option value="student-print">PDF · naskah siswa</option>
          </select>
          <button type="button" className={button} disabled={busy || !visibleExport.length}
            onClick={() => format === 'student-print' ? previewPrint() : download('export', format)}>
            {format === 'student-print' ? 'Pratinjau cetak' : `Unduh ${visibleExport.length ? `${visibleExport.length} soal` : 'soal'}`}
          </button>
        </div>
      </section>
    </div>
  </details>;
}
