'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Printer } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { buildSchedulingDocument, downloadSchedulingWorkbook, openSchedulingPrint, type SchedulingDocumentInput } from '@/lib/scheduling-document';

export default function SchedulingDocumentActions({ input, disabled, selected = false }: {
  input: SchedulingDocumentInput;
  disabled: boolean;
  selected?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const inFlight = useRef(false);
  const scope = selected ? input.view === 'assignments' || input.view === 'teachers' ? 'guru ini' : input.view === 'classes' ? 'kelas ini' : 'RPS/LAB ini' : 'seluruh data';
  async function perform(format: 'print' | 'monochrome' | 'xlsx') {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setProblem('');
    try {
      const document = buildSchedulingDocument(input);
      if (format !== 'xlsx') openSchedulingPrint(document, format === 'monochrome' ? 'monochrome' : 'color');
      else await downloadSchedulingWorkbook(document);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Dokumen belum dapat dibuat. Coba lagi.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  return (
    <div className="min-w-0 max-w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={disabled || busy} aria-busy={busy} title={disabled ? 'Muat data periode ini dengan lengkap terlebih dahulu.' : `Ekspor/cetak ${scope}`} className="flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{busy ? 'Menyiapkan…' : `Ekspor/cetak ${selected ? scope : 'semua'}`}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
          <p className="max-w-64 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {input.academicYear} · Semester {input.semester}<br />
            {selected ? `Hanya ${scope}.` : 'Seluruh data dalam cakupan akses, termasuk halaman lain. Pencarian tidak membatasi dokumen.'}
          </p>
          <DropdownMenuItem className="min-h-11 gap-2 px-3 dark:focus:bg-slate-800 dark:focus:text-slate-100" onSelect={() => void perform('print')}>
            <Printer className="h-4 w-4" aria-hidden="true" />Cetak / Simpan PDF
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2 px-3 dark:focus:bg-slate-800 dark:focus:text-slate-100" onSelect={() => void perform('monochrome')}>
            <Printer className="h-4 w-4" aria-hidden="true" />Cetak / PDF hitam-putih
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2 px-3 dark:focus:bg-slate-800 dark:focus:text-slate-100" onSelect={() => void perform('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Unduh Excel (XLSX)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {busy && <p role="status" className="mt-1 text-xs text-slate-600 dark:text-slate-300">Menyiapkan dokumen periode pilihan…</p>}
      {problem && <p role="alert" className="mt-2 max-w-sm text-xs leading-relaxed text-rose-800 dark:text-rose-200">{problem}</p>}
    </div>
  );
}
