'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Info } from 'lucide-react';
import { createJurnal } from '../actions';
import type { RppItem, ActivityItem } from './guru-types';
import { wibTodayISO, wibDateLabel } from '@/lib/bell-times';
interface Props {
  classId: string;
  className: string;
  subject: string;
  startLabel: string;
  jpStart: number;
  approvedRpp: RppItem[];
  activities: ActivityItem[];
  onClose: () => void;
}
const field =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
export default function JurnalModal({
  classId,
  className,
  subject,
  startLabel,
  jpStart,
  approvedRpp,
  onClose,
}: Props) {
  const modules = useMemo(
    () => approvedRpp.filter((r) => r.subject === subject && r.classId === classId),
    [approvedRpp, subject, classId],
  );
  const [title, setTitle] = useState('Pembelajaran ' + subject),
    [detail, setDetail] = useState(''),
    [cp, setCp] = useState(''),
    [note, setNote] = useState('');
  const [saving, setSaving] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const inFlight = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const save = async () => {
    if (inFlight.current || done) return;
    if (title.trim().length < 3 || !detail.trim()) {
      setError('Isi judul dan kegiatan yang benar-benar dilaksanakan.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const description = [
        detail.trim(),
        cp.trim() ? 'Poin CP: ' + cp.trim() : '',
        note.trim() ? 'Catatan: ' + note.trim() : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const result = await createJurnal({
        classId,
        date: wibTodayISO(),
        title: title.trim(),
        description,
        category: 'pembelajaran',
      });
      if (result.success) setDone(true);
      else setError(result.error || 'Jurnal belum tersimpan. Coba lagi.');
    } catch {
      setError(
        'Jurnal belum terkonfirmasi tersimpan. Periksa daftar jurnal sebelum mencoba kembali.',
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:max-w-lg"
        closeDisabled={saving}
        onOpenAutoFocus={() => {
          trigger.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          // The recap restores a recreated trigger after its refresh. Other callers can
          // return immediately when their original button remains mounted.
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
        onEscapeKeyDown={(e: Event) => {
          if (saving) e.preventDefault();
        }}
        onPointerDownOutside={(e: Event) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Jurnal Mengajar</DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-300">
            {subject} · {className} · {wibDateLabel()} · JP {jpStart} ({startLabel})
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <p className="flex gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
            Jurnal disimpan untuk kelas dan tanggal ini. Informasi JP membantu pengisian, tetapi
            jurnal belum ditautkan otomatis ke sesi tertentu.
          </p>
          <label className="grid gap-1 text-sm font-medium" htmlFor="j-title">
            Judul jurnal
            <input
              id="j-title"
              className={field}
              value={title}
              maxLength={255}
              disabled={saving || done}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {modules.length > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {modules.length} modul disetujui tersedia pada kelas dan mapel ini. Ketersediaan modul
              tidak otomatis menandakan modul telah digunakan.
            </p>
          )}
          <label className="grid gap-1 text-sm font-medium" htmlFor="j-detail">
            Kegiatan yang dilaksanakan
            <textarea
              id="j-detail"
              className={field}
              rows={4}
              maxLength={3500}
              disabled={saving || done}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Tuliskan kegiatan pembelajaran yang benar-benar dilaksanakan."
            />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="j-cp">
            Capaian pembelajaran yang dibahas (opsional)
            <textarea
              id="j-cp"
              className={field}
              rows={2}
              maxLength={600}
              disabled={saving || done}
              value={cp}
              onChange={(e) => setCp(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="j-note">
            Catatan / kendala (opsional)
            <textarea
              id="j-note"
              className={field}
              rows={2}
              maxLength={600}
              disabled={saving || done}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {done && (
            <p
              role="status"
              className="text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
              Jurnal berhasil disimpan.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={field + ' !w-auto'}
              disabled={saving}
              onClick={onClose}
            >
              {done ? 'Tutup' : 'Batal'}
            </button>
            <button
              type="submit"
              disabled={saving || done}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {done ? 'Tersimpan' : saving ? 'Menyimpan…' : 'Simpan jurnal'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
