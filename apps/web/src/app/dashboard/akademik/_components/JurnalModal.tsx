'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, Info } from 'lucide-react';
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

export default function JurnalModal({ classId, className, subject, startLabel, jpStart, approvedRpp, activities, onClose }: Props) {
  const linkedRpp = useMemo(() => approvedRpp.find((r) => r.subject === subject) ?? null, [approvedRpp, subject]);
  const pertemuan = useMemo(() => activities.filter((a) => a.classId === classId).length + 1, [activities, classId]);

  // Pre-fill otomatis (dapat disunting). Sumber CP penuh menyusul saat modul ATP jadi.
  const [tp, setTp] = useState(linkedRpp ? linkedRpp.title : `Pembelajaran ${subject}`);
  const [cp, setCp] = useState('');
  const [detail, setDetail] = useState(
    `Pendahuluan (apersepsi) → kegiatan inti ${subject} → praktik/penugasan → refleksi & penutup.` +
    (linkedRpp ? ` Mengacu Modul Ajar disetujui: "${linkedRpp.title}".` : ''),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    const description = [
      detail.trim(),
      cp.trim() ? `Poin CP: ${cp.trim()}` : '',
      note.trim() ? `Catatan: ${note.trim()}` : '',
    ].filter(Boolean).join('\n\n');
    const r = await createJurnal({ classId, date: wibTodayISO(), title: tp.trim() || `Pembelajaran ${subject}`, description, category: 'pembelajaran' });
    setSaving(false);
    if (r?.success) { setDone(true); setTimeout(onClose, 700); } else setError(r?.error || 'Gagal menyimpan');
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Jurnal Mengajar
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700"><Sparkles className="h-3 w-3" />Terisi otomatis</span>
          </DialogTitle>
          <DialogDescription>Pertemuan {pertemuan} · {subject} · {className} · {wibDateLabel()} · JP {jpStart} ({startLabel})</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="j-tp">Tujuan Pembelajaran {linkedRpp && <span className="text-[10px] font-bold text-emerald-700">· dari Modul Ajar disetujui</span>}</Label>
            <Input id="j-tp" value={tp} onChange={(e) => setTp(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="j-cp">Poin Capaian Pembelajaran (CP) — pisahkan dengan koma</Label>
            <Input id="j-cp" value={cp} onChange={(e) => setCp(e.target.value)} placeholder="mis. memahami konsep X, menerapkan Y, ..." />
            {cp.trim() && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cp.split(',').map((c) => c.trim()).filter(Boolean).map((c, i) => (
                  <span key={i} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{c}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="j-detail">Detail kegiatan pembelajaran</Label>
            <textarea id="j-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)}
              className="w-full resize-y rounded-md border border-[#e6efea] px-3 py-2 text-[13px] outline-none focus:border-emerald-400" />
          </div>
          <div>
            <Label htmlFor="j-note">Catatan / kendala (opsional)</Label>
            <textarea id="j-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="mis. 2 siswa perlu pendampingan tambahan…"
              className="w-full resize-y rounded-md border border-[#e6efea] px-3 py-2 text-[13px] outline-none focus:border-emerald-400" />
          </div>
          <p className="flex items-center gap-1.5 text-[11.5px] text-[#6b8079]"><Info className="h-3.5 w-3.5" />Tersimpan sebagai entri Kegiatan Kelas. Auto-isi poin CP penuh menyusul di modul Pembelajaran/ATP.</p>
        </div>

        {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{done ? 'Tersimpan ✓' : 'Simpan Jurnal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
