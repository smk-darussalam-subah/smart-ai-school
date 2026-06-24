'use client';

// ModulLmsForm — buat/edit Modul LMS (materi belajar siswa) NYATA via /lms/modules (W1).
// Simpan Draft atau Simpan & Publikasikan (publish=true → terlihat siswa kelasnya).
// Parent me-remount via key={editing?.id ?? 'new'}.

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Save, Send, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { LmsModuleItem } from './guru-types';
import { createLmsModule, updateLmsModule } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: LmsModuleItem | null;
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';

export default function ModulLmsForm({ open, onClose, subjects, classes, academicYear, semester, editing }: Props) {
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [tp, setTp] = useState(editing?.tp ?? '');
  const [jp, setJp] = useState(editing?.jpAllocation != null ? String(editing.jpAllocation) : '');
  const [kktp, setKktp] = useState(editing?.kktp != null ? String(editing.kktp) : '75');
  const [content, setContent] = useState(editing?.content ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (publish: boolean) => {
    setErr(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (content.trim().length === 0) return setErr('Isi materi wajib diisi.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    const jpNum = jp.trim() ? Number(jp) : null;
    const kktpNum = kktp.trim() ? Number(kktp) : 75;
    if (jpNum != null && (Number.isNaN(jpNum) || jpNum < 1 || jpNum > 40)) return setErr('Alokasi JP harus 1–40.');
    if (Number.isNaN(kktpNum) || kktpNum < 0 || kktpNum > 100) return setErr('KKTP harus 0–100.');

    startTransition(async () => {
      const payload = {
        subject, title, tp: tp.trim() || null, jpAllocation: jpNum, kktp: kktpNum,
        content, classId: classId || null,
      };
      const res = editing
        ? await updateLmsModule(editing.id, payload)
        : await createLmsModule({ ...payload, academicYear, semester, publish });
      if (!res.success) return setErr(res.error ?? 'Gagal menyimpan Modul LMS.');
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? 'Edit Modul LMS' : 'Buat Modul LMS'}
            {editing && (
              <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold',
                editing.status === 'published' ? 'bg-emerald-50 text-emerald-700'
                  : editing.status === 'archived' ? 'bg-zinc-100 text-zinc-500'
                  : 'bg-slate-100 text-slate-600'
              )}>
                {editing.status === 'published' ? 'Terbit' : editing.status === 'archived' ? 'Arsip' : 'Draft'}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            TA {academicYear || '—'} · Semester {semester}. Materi yang dipublikasikan akan terlihat siswa kelas terkait.
          </DialogDescription>
        </DialogHeader>

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
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Judul Modul</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD}
              placeholder="mis. Flexbox & Layout Responsif" />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">TP (opsional)</span>
              <input value={tp} onChange={(e) => setTp(e.target.value)} className={FIELD} placeholder="TP 2.1" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Alokasi JP</span>
              <input value={jp} onChange={(e) => setJp(e.target.value)} className={FIELD} inputMode="numeric" placeholder="4" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">KKTP</span>
              <input value={kktp} onChange={(e) => setKktp(e.target.value)} className={FIELD} inputMode="numeric" placeholder="75" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Isi Materi</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7}
              className={`${FIELD} resize-y`} placeholder="Materi pembelajaran (teks/markdown)…" />
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
          {!editing && (
            <button type="button" onClick={() => save(true)} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Simpan &amp; Publikasikan
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
