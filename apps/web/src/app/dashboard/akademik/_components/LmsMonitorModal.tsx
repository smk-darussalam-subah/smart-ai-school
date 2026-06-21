'use client';

// LmsMonitorModal — progres siswa untuk satu Modul LMS (NYATA, dari /lms/modules/:id/progress).
// Guru pemilik melihat siapa sudah mulai/selesai. Data terisi penuh saat siswa pakai
// LMS (W2); sebelum itu jujur kosong.

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { LmsModuleItem, LmsProgressResponse } from './guru-types';
import { fetchLmsProgress } from '../actions';

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  active: 'bg-sky-50 text-sky-700',
  locked: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<string, string> = { completed: 'Selesai', active: 'Mengerjakan', locked: 'Terkunci' };

export default function LmsMonitorModal({ module, onClose }: { module: LmsModuleItem; onClose: () => void }) {
  const [data, setData] = useState<LmsProgressResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetchLmsProgress(module.id).then((res) => {
      if (!alive) return;
      if (res.success) setData(res.data as LmsProgressResponse);
      else setErr(res.error ?? 'Gagal memuat progres.');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [module.id]);

  const started = data?.progress.length ?? 0;
  const completed = data?.progress.filter((p) => p.status === 'completed').length ?? 0;
  const totalN = data?.classStudentCount ?? null;

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Monitor — {module.title}</DialogTitle>
          <DialogDescription>{module.subject}{module.class ? ` · ${module.class.name}` : ' · Umum'}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : err ? (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Mulai" value={totalN != null ? `${started}/${totalN}` : `${started}`} tone="text-sky-600" />
              <Stat label="Selesai" value={`${completed}`} tone="text-emerald-600" />
              <Stat label="Belum mulai" value={totalN != null ? `${Math.max(0, totalN - started)}` : '—'} tone="text-slate-500" />
            </div>

            {started === 0 ? (
              <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
                Belum ada siswa yang membuka modul ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                      <th className="py-2 pr-3">Siswa</th>
                      <th className="py-2 pr-3">Progres</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Selesai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.progress.map((p) => (
                      <tr key={p.nis} className="border-b border-[#f0f4f2]">
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-[#0f2e25]">{p.name}</div>
                          <div className="text-[11px] text-[#9bb0a8]">{p.nis}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-500/15">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, p.progress))}%` }} />
                            </div>
                            <span className="tabular-nums">{p.progress}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-[#6b8079]">{p.completedAt ? new Date(p.completedAt).toLocaleDateString('id') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
