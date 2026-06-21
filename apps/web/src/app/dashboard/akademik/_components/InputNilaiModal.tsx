'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { fetchClassRoster, createGrade, type RosterStudent } from '../actions';

const TYPES: [string, string][] = [['uh', 'UH'], ['uts', 'UTS'], ['uas', 'UAS'], ['praktik', 'Praktik'], ['sikap', 'Sikap']];

interface Props {
  classId: string;
  className: string;
  subject: string;
  assignmentId?: string;
  academicYear: string;
  semester: number;
  onClose: () => void;
}

export default function InputNilaiModal({ classId, className, subject, assignmentId, academicYear, semester, onClose }: Props) {
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('uh');
  const [score, setScore] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { fetchClassRoster(classId).then(setRoster); }, [classId]);

  const save = async () => {
    if (!assignmentId) { setError('Penugasan mengajar untuk kelas/mapel ini belum terdaftar.'); return; }
    if (!studentId || !score) { setError('Lengkapi siswa & nilai.'); return; }
    setSaving(true); setError('');
    const r = await createGrade({ studentId, assignmentId, semester, academicYear, score: Number(score), type });
    setSaving(false);
    if (r?.success) { setDone(true); setTimeout(onClose, 700); } else setError(r?.error || 'Gagal menyimpan');
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Input Nilai</DialogTitle>
          <DialogDescription>{subject} · {className} · Semester {semester} · TA {academicYear || '—'}</DialogDescription>
        </DialogHeader>
        {!assignmentId && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">Penugasan mengajar untuk kelas/mapel ini belum terdaftar — input nilai belum tersedia.</p>}
        <div className="space-y-3">
          <div>
            <Label>Siswa</Label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full rounded-md border border-[#e6efea] px-3 py-2 text-[13px] outline-none focus:border-emerald-400">
              <option value="">Pilih siswa…</option>
              {roster.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.nis}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Jenis</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-[#e6efea] px-3 py-2 text-[13px] outline-none focus:border-emerald-400">
                {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div><Label htmlFor="in-score">Nilai</Label><Input id="in-score" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} /></div>
          </div>
        </div>
        {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={save} disabled={saving || !assignmentId} className="bg-emerald-600 hover:bg-emerald-700">{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{done ? 'Tersimpan ✓' : 'Simpan'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
