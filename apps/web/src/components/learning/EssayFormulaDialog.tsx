
'use client';

import { useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { renderQuestionFormula } from '@/lib/question-math';
import { FormulaPreview } from './QuestionEditorExtensions';

const forms = {
  fraction: ['Pecahan', 'Pembilang', 'Penyebut'],
  power: ['Pangkat', 'Bilangan pokok', 'Eksponen'],
  root: ['Akar', 'Isi akar', ''],
  index: ['Indeks bawah', 'Simbol utama', 'Indeks'],
  vector: ['Vektor', 'Nama vektor', ''],
  symbols: ['Simbol dan satuan', 'Ekspresi', ''],
} as const;
type Form = keyof typeof forms;

const symbols: Record<string, string> = {
  '×': '\\times{}', '÷': '\\div{}', '±': '\\pm{}', '≤': '\\le{}', '≥': '\\ge{}',
  'π': '\\pi{}', 'θ': '\\theta{}', 'Δ': '\\Delta{}', 'Ω': '\\Omega{}', 'µ': '\\mu{}', '−': '-', '·': '\\cdot{}',
};

function encode(value: string): string | undefined {
  const parts: string[] = [];
  for (const char of value.trim()) {
    const part = symbols[char] ?? (/^[a-z0-9 .,+\-=()/<>]$/i.test(char) ? char : undefined);
    if (part === undefined) return undefined;
    parts.push(part);
  }
  return parts.join('');
}

function buildFormula(form: Form, first: string, second: string) {
  const a = encode(first);
  const b = encode(second);
  if (!a || (forms[form][2] && !b)) return '';
  switch (form) {
    case 'fraction': return '\\frac{' + a + '}{' + b + '}';
    case 'power': return '{' + a + '}^{' + b + '}';
    case 'root': return '\\sqrt{' + a + '}';
    case 'index': return '{' + a + '}_{' + b + '}';
    case 'vector': return '\\vec{' + a + '}';
    case 'symbols': return a;
  }
}

const field = 'min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]';

export default function EssayFormulaDialog({
  initial, onClose, onApply,
}: {
  initial?: string;
  onClose: () => void;
  onApply: (latex: string) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<Form>('fraction');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [editing, setEditing] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = editing ? buildFormula(form, first, second) : (initial ?? '');
  const [, label, secondLabel] = forms[form];

  const apply = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError('');
    try {
      await renderQuestionFormula(source, false);
      onApply(source);
    } catch {
      setError('Rumus belum dapat ditampilkan. Periksa kembali isian.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>{initial ? 'Edit rumus jawaban' : 'Sisipkan rumus jawaban'}</DialogTitle>
        <DialogDescription>Pilih bentuk rumus, isi kotak, lalu periksa pratinjau.</DialogDescription>
        {editing ? (
          <div className="space-y-3">
            <label className="grid gap-1 text-sm" htmlFor={id + '-shape'}>Bentuk rumus
              <select id={id + '-shape'} value={form} className={field} disabled={busy}
                onChange={(event) => { setForm(event.target.value as Form); setError(''); }}>
                {Object.entries(forms).map(([key, [name]]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">{label}
                <input value={first} disabled={busy} maxLength={40} dir="ltr" className={field}
                  onChange={(event) => { setFirst(event.target.value); setError(''); }} />
              </label>
              {secondLabel && <label className="grid gap-1 text-sm">{secondLabel}
                <input value={second} disabled={busy} maxLength={40} dir="ltr" className={field}
                  onChange={(event) => { setSecond(event.target.value); setError(''); }} />
              </label>}
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Simbol rumus">
              {Object.keys(symbols).map((symbol) => (
                <button type="button" key={symbol} disabled={busy || first.length >= 40}
                  aria-label={'Tambah ' + symbol + ' ke ' + label.toLocaleLowerCase('id-ID')}
                  className="min-h-11 min-w-11 rounded-lg border border-[var(--border)] px-2"
                  onClick={() => { setFirst((current) => (current + symbol).slice(0, 40)); setError(''); }}>
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="min-h-11 justify-self-start rounded-lg border border-[var(--border)] px-3"
            onClick={() => setEditing(true)}>Susun rumus pengganti</button>
        )}
        <div aria-label="Pratinjau rumus" className="overflow-x-auto rounded-lg border border-[var(--border)] p-3">
          {source ? <FormulaPreview latex={source} /> : <p className="text-sm text-[var(--muted)]">Pratinjau muncul setelah bidang terisi dengan angka, huruf, atau simbol yang tersedia.</p>}
        </div>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-[var(--border)] px-3"
            disabled={busy} onClick={onClose}>Batal</button>
          <button type="button" className="min-h-11 rounded-lg bg-emerald-700 px-4 text-white disabled:opacity-50"
            disabled={!source || busy} onClick={() => { void apply(); }}>{initial ? 'Simpan rumus' : 'Sisipkan'}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
