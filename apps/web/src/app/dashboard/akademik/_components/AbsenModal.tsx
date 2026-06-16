'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCheck, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { fetchClassRoster, createAttendance, type RosterStudent } from '../actions';
import { wibTodayISO, wibDateLabel } from '@/lib/bell-times';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpha';
const STAT: Status[] = ['hadir', 'izin', 'sakit', 'alpha'];
const SHORT: Record<Status, string> = { hadir: 'H', izin: 'I', sakit: 'S', alpha: 'A' };
const ON: Record<Status, string> = {
  hadir: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  izin: 'bg-sky-50 border-sky-200 text-sky-700',
  sakit: 'bg-amber-50 border-amber-200 text-amber-700',
  alpha: 'bg-rose-50 border-rose-200 text-rose-600',
};

export default function AbsenModal({ classId, className, onClose }: { classId: string; className: string; onClose: () => void }) {
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    fetchClassRoster(classId).then((r) => {
      if (!active) return;
      setRoster(r);
      setStatuses(Object.fromEntries(r.map((s) => [s.id, 'hadir' as Status]))); // default semua hadir
      setLoading(false);
    });
    return () => { active = false; };
  }, [classId]);

  const counts = STAT.reduce((acc, s) => ({ ...acc, [s]: Object.values(statuses).filter((x) => x === s).length }), {} as Record<Status, number>);
  const setAll = () => setStatuses(Object.fromEntries(roster.map((s) => [s.id, 'hadir' as Status])));

  const save = async () => {
    setSaving(true); setError('');
    const r = await createAttendance({
      classId, date: wibTodayISO(),
      records: roster.map((s) => ({ studentId: s.id, status: statuses[s.id] ?? 'hadir' })),
    });
    setSaving(false);
    if (r?.success) { setDone(true); setTimeout(onClose, 700); } else setError(r?.error || 'Gagal menyimpan');
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Absensi — {className}</DialogTitle>
          <DialogDescription>{wibDateLabel()} · default semua hadir, ubah pengecualian saja.</DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex items-center justify-between">
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700">
            Hadir {counts.hadir} · Izin {counts.izin} · Sakit {counts.sakit} · Alpha {counts.alpha}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={setAll}><CheckCheck className="mr-1 h-4 w-4 text-emerald-600" />Semua hadir</Button>
        </div>

        <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-[#e6efea]">
          {loading ? (
            <div className="grid h-28 place-items-center text-[#9bb0a8]"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : roster.length === 0 ? (
            <div className="grid h-28 place-items-center text-[12.5px] text-[#9bb0a8]">Roster kelas kosong</div>
          ) : roster.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-[#f0f4f2] px-3 py-2 last:border-0">
              <div className="text-[12.5px]"><b className="text-[#0f2e25]">{s.name}</b> <span className="text-[#9bb0a8]">· {s.nis}</span></div>
              <div className="flex gap-1">
                {STAT.map((st) => {
                  const on = (statuses[s.id] ?? 'hadir') === st;
                  return (
                    <button key={st} type="button" onClick={() => setStatuses((p) => ({ ...p, [s.id]: st }))}
                      className={clsx('grid h-7 w-7 place-items-center rounded-lg border text-[12px] font-extrabold',
                        on ? ON[st] : 'border-[#e6efea] bg-white text-[#9bb0a8] hover:bg-[#f4f7f5]')}>
                      {SHORT[st]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={save} disabled={saving || loading || roster.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{done ? 'Tersimpan ✓' : 'Simpan Absensi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
