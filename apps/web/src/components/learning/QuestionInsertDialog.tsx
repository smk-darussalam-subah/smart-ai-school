'use client';

import { useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MAX_FORMULA_LENGTH, QUESTION_FORMULAS, renderQuestionFormula } from '@/lib/question-math';
import { FormulaPreview } from './QuestionEditorExtensions';

export type QuestionInsert =
  | { type: 'questionFormula'; attrs: { latex: string; display: boolean } }
  | { type: 'questionImage'; attrs: { mediaId: string; alt: string } };

const field = 'min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]';

export function QuestionInsertDialog({
  mode,
  initialFormula,
  onClose,
  onInsert,
  restoreFocus,
}: {
  mode: 'formula' | 'image';
  initialFormula?: { latex: string; display: boolean };
  onClose: () => void;
  onInsert: (content: QuestionInsert) => void;
  restoreFocus: () => void;
}) {
  const id = useId();
  const [latex, setLatex] = useState(initialFormula?.latex ?? '');
  const [display, setDisplay] = useState(initialFormula?.display ?? false);
  const [image, setImage] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const formula = mode === 'formula';

  async function insert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (formula) {
        const value = latex.trim();
        await renderQuestionFormula(value, display).catch(() => {
          throw new Error('Rumus belum dapat ditampilkan. Periksa sintaks atau pilih contoh.');
        });
        onInsert({ type: 'questionFormula', attrs: { latex: value, display } });
      } else {
        if (!image || !alt.trim()) throw new Error('Pilih gambar dan isi deskripsinya.');
        if (image.size > 480 * 1024) throw new Error('Ukuran gambar maksimum 480 KB.');
        const bytes = await image.arrayBuffer();
        const response = await fetch('/api/backend/question-media', {
          method: 'POST',
          headers: { 'Content-Type': image.type },
          body: bytes,
        });
        if (!response.ok) {
          throw new Error('Gambar belum tersimpan. Gunakan PNG, JPEG, atau WebP yang valid.');
        }
        const uploaded: { id?: string } = await response.json();
        if (!uploaded.id) throw new Error('Server belum mengonfirmasi penyimpanan gambar.');
        onInsert({ type: 'questionImage', attrs: { mediaId: uploaded.id, alt: alt.trim() } });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Penyimpanan belum berhasil.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}>
      <DialogContent className="max-w-lg bg-white dark:bg-slate-900" onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }}>
        <DialogTitle>{formula ? 'Rumus soal' : 'Gambar soal'}</DialogTitle>
        <DialogDescription>
          {formula ? 'Pilih contoh atau tulis persamaan dengan LaTeX.' : 'Gunakan PNG, JPEG, atau WebP hingga 480 KB.'}
        </DialogDescription>
        <form className="space-y-4" onSubmit={(event) => { void insert(event); }}>
          {formula ? (
            <>
              <div className="flex flex-wrap gap-2" aria-label="Contoh rumus">
                {QUESTION_FORMULAS.map((preset) => (
                  <button key={preset.label} type="button"
                    className="min-h-10 rounded-lg border border-[var(--border)] px-2 text-sm"
                    disabled={busy} onClick={() => { setLatex(preset.latex); setError(''); }}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold" htmlFor={id}>Rumus LaTeX</label>
              <textarea id={id} maxLength={MAX_FORMULA_LENGTH} dir="ltr" rows={3}
                className={`${field} py-2 font-mono`} value={latex} disabled={busy}
                onChange={(event) => { setLatex(event.target.value); setError(''); }} />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={display} disabled={busy}
                  onChange={(event) => setDisplay(event.target.checked)} />
                Tampilkan di baris sendiri
              </label>
              <section aria-label="Pratinjau rumus" className="overflow-x-auto rounded-lg border border-[var(--border)] p-3">
                {latex.trim() ? <FormulaPreview latex={latex} display={display} /> : 'Pratinjau akan muncul di sini.'}
              </section>
            </>
          ) : (
            <>
              <label className="block text-sm font-semibold" htmlFor={id}>Berkas gambar</label>
              <input id={id} type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy}
                className={field} onChange={(event) => { setImage(event.target.files?.[0] ?? null); setError(''); }} />
              <label className="block text-sm font-semibold">
                Deskripsi gambar
                <input className={field} required maxLength={180} value={alt} disabled={busy}
                  onChange={(event) => { setAlt(event.target.value); setError(''); }} />
              </label>
            </>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} className="min-h-11 rounded-lg px-3" onClick={onClose}>Batal</button>
            <button type="submit" disabled={busy || (formula ? !latex.trim() : !image || !alt.trim())}
              className="min-h-11 rounded-lg bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">
              {busy ? 'Menyiapkan…' : initialFormula ? 'Terapkan perubahan' : 'Sisipkan'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
