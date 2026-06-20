'use client';

// ModulAjarForm — buat/edit Modul Ajar (RPP) NYATA, tersimpan via /rpp (W1).
// Simpan Draft (POST/PATCH) atau Simpan & Ajukan (submit=true → status submitted,
// masuk antrean review Wakakur). Aturan backend dihormati: edit hanya draft/revision,
// content wajib (atau lampiran). Parent me-remount via key={editing?.id ?? 'new'}.

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Save, Send, AlertTriangle } from 'lucide-react';
import type { RppItem } from './guru-types';
import { createRpp, updateRpp, submitRpp } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: RppItem | null;
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';

export default function ModulAjarForm({ open, onClose, subjects, classes, academicYear, semester, editing }: Props) {
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [content, setContent] = useState(editing?.content ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (submitNow: boolean) => {
    setErr(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (content.trim().length === 0) return setErr('Isi materi / RPP wajib diisi.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    startTransition(async () => {
      let res;
      if (editing) {
        res = await updateRpp(editing.id, { subject, title, content, classId: classId || null });
        if (res.success && submitNow) res = await submitRpp(editing.id);
      } else {
        res = await createRpp({
          subject, title, content,
          classId: classId || undefined,
          academicYear, semester, submit: submitNow,
        });
      }
      if (!res.success) return setErr(res.error ?? 'Gagal menyimpan Modul Ajar.');
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Modul Ajar' : 'Buat Modul Ajar'}</DialogTitle>
          <DialogDescription>
            TA {academicYear || '—'} · Semester {semester}. Simpan sebagai draft atau ajukan ke Wakakur.
          </DialogDescription>
        </DialogHeader>

        {editing?.status === 'revision' && editing.reviewNote && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span><b>Catatan revisi Wakakur:</b> {editing.reviewNote}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Mapel</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD}>
                <option value="">— pilih —</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Kelas (opsional)</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={FIELD}>
                <option value="">— umum —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Judul Modul Ajar</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD}
              placeholder="mis. Pemrograman Dasar — Struktur Kontrol" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Isi (Tujuan Pembelajaran, materi, asesmen)</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7}
              className={`${FIELD} resize-y`} placeholder="Tuliskan TP, capaian, materi pokok, langkah, dan asesmen…" />
          </label>

          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />{err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending}
            className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">
            Batal
          </button>
          <button type="button" onClick={() => save(false)} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan Draft
          </button>
          <button type="button" onClick={() => save(true)} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Simpan &amp; Ajukan
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
