'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { createGrade } from '../actions';
import { useClassRoster } from './use-class-roster';

const TYPES: [string, string][] = [
  ['uh', 'UH'],
  ['uts', 'UTS'],
  ['uas', 'UAS'],
  ['praktik', 'Praktik'],
  ['sikap', 'Sikap'],
];

interface Props {
  classId: string;
  className: string;
  subject: string;
  assignmentId?: string;
  academicYear: string;
  semester: number;
  onClose: () => void;
}

export default function InputNilaiModal({
  classId,
  className,
  subject,
  assignmentId,
  academicYear,
  semester,
  onClose,
}: Props) {
  const { roster, status: rosterStatus, error: rosterError, retry } = useClassRoster(classId);
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('uh');
  const [score, setScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const opener = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  const save = async () => {
    if (
      rosterStatus !== 'ready' ||
      !roster.some((student) => student.id === studentId) ||
      inFlight.current ||
      done
    )
      return;
    if (!assignmentId) {
      setError('Penugasan mengajar untuk kelas/mapel ini belum terdaftar.');
      return;
    }
    if (!studentId || !score) {
      setError('Lengkapi siswa & nilai.');
      return;
    }
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setError('Nilai harus berupa angka antara 0 dan 100.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const r = await createGrade({
        studentId,
        assignmentId,
        semester,
        academicYear,
        score: numericScore,
        type,
      });
      if (r?.success) setDone(true);
      else setError(r?.error || 'Nilai belum tersimpan. Silakan coba lagi.');
    } catch {
      setError('Nilai belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o: boolean) => {
        if (!o && !inFlight.current) onClose();
      }}
    >
      <DialogContent
        closeDisabled={saving}
        onCloseAutoFocus={(event: Event) => {
          if (opener.current?.isConnected && opener.current !== document.body) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
        onEscapeKeyDown={(event: Event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onInteractOutside={(event: Event) => {
          if (inFlight.current) event.preventDefault();
        }}
        className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto bg-white text-slate-950 dark:bg-slate-900 dark:text-slate-100 sm:max-w-sm"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Input Nilai</DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-300">
            {subject} · {className} · Semester {semester} · TA {academicYear || '—'}
          </DialogDescription>
        </DialogHeader>
        {!assignmentId && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
            Penugasan mengajar untuk kelas/mapel ini belum terdaftar — input nilai belum tersedia.
          </p>
        )}
        {rosterStatus === 'loading' && (
          <p role="status" className="text-sm">
            Memuat daftar siswa…
          </p>
        )}
        {rosterStatus === 'error' && (
          <div role="alert" className="space-y-2 text-sm text-red-800 dark:text-red-200">
            <p>{rosterError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={retry}
              className="min-h-11 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
            >
              Coba muat daftar siswa
            </Button>
          </div>
        )}
        {rosterStatus === 'ready' && roster.length === 0 && (
          <p className="text-sm">Belum ada siswa aktif pada kelas ini.</p>
        )}
        <div className="space-y-3">
          <div>
            <Label htmlFor="grade-student">Siswa</Label>
            <select
              id="grade-student"
              disabled={rosterStatus !== 'ready' || saving || done}
              value={roster.some((student) => student.id === studentId) ? studentId : ''}
              onChange={(e) => setStudentId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Pilih siswa…</option>
              {roster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.nis}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grade-type">Jenis</Label>
              <select
                id="grade-type"
                disabled={saving || done}
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-950 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {TYPES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="in-score">Nilai</Label>
              <Input
                id="in-score"
                type="number"
                min={0}
                max={100}
                className="min-h-11 border-slate-300 bg-white text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                disabled={saving || done}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[12.5px] text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {done ? 'Tutup' : 'Batal'}
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={
              saving ||
              done ||
              !assignmentId ||
              rosterStatus !== 'ready' ||
              !roster.some((student) => student.id === studentId)
            }
            className="min-h-11 bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {done ? 'Tersimpan ✓' : 'Simpan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
