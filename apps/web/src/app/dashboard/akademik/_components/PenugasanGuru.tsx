'use client';

// PenugasanGuru — layar Penugasan Dashboard Guru (W1).
// W2-B-2: TUGAS_DATA + PENGUMPULAN hardcoded arrays dihapus.
// Tugas list + submission detail dari data NYATA /submissions.
// "Tugas Baru" → honest label (buat sesi asesmen dari modul pembelajaran).

import { useEffect, useState } from 'react';
import { ClipboardList, Plus, FolderGit2, CheckCircle, Inbox, Paperclip, Loader2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { fetchSubmissions, fetchSubmissionDetails, type SubmissionItem, type SubmissionDetailStudent } from '../actions';

const STATUS_BADGE: Record<string, string> = {
  Terkumpul: 'bg-emerald-50 text-emerald-700',
  Terlambat: 'bg-amber-50 text-amber-700',
  Belum: 'bg-slate-100 text-slate-500',
};

function cls(v: number | null) {
  if (v === null) return 'bg-slate-100 text-slate-400';
  return v >= 75 ? 'bg-emerald-50 text-emerald-700' : v >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600';
}

export default function PenugasanGuru() {
  const [tugasList, setTugasList] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selTugas, setSelTugas] = useState<SubmissionItem | null>(null);
  const [detail, setDetail] = useState<SubmissionDetailStudent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSubmissions()
      .then((res) => {
        if (res.success && res.data) {
          setTugasList(res.data.data);
        } else {
          setError(res.error ?? 'Gagal memuat data tugas');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const openDetail = (t: SubmissionItem) => {
    setSelTugas(t);
    setDetailLoading(true);
    setDetailTitle(t.title);
    setDetail([]);
    fetchSubmissionDetails(t.id)
      .then((res) => {
        if (res.success && res.data) setDetail(res.data.students);
      })
      .finally(() => setDetailLoading(false));
  };

  return (
    <div className="space-y-4">
      {/* Tugas / Proyek */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <ClipboardList className="h-[18px] w-[18px] text-emerald-600" />Tugas / Proyek
          </h3>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
            <Plus className="h-3.5 w-3.5" />Buat sesi asesmen dari Modul Pembelajaran
          </span>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f9fbfa] px-3 py-6 text-[12px] font-semibold text-[#6b8079]">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Memuat data tugas...
          </div>
        ) : error ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-4 text-[12px] font-semibold text-rose-600">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        ) : tugasList.length === 0 ? (
          <div className="mt-3 grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ada tugas. Buat sesi asesmen dari modul pembelajaran untuk membuat tugas.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {tugasList.map((t) => {
              const aktif = t.status === 'aktif';
              const pct = t.total > 0 ? Math.round((t.submitted / t.total) * 100) : 0;
              return (
                <div key={t.id} className="rounded-xl border border-[#e6efea] overflow-hidden">
                  <button type="button" onClick={() => openDetail(t)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#f9fbfa]">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f1f5f5] text-[#9bb0a8]'}`}>
                      {aktif ? <FolderGit2 className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="text-[13px] text-[#0f2e25]">{t.title}</b>
                      <div className="text-[11px] text-[#6b8079]">{t.subject} · {t.className} · {aktif ? 'Aktif' : 'Selesai'}</div>
                    </div>
                    <span className={clsx('rounded-md px-2 py-1 text-[10.5px] font-bold', aktif ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                      {t.submitted}/{t.total} kumpul · {t.graded} dinilai
                    </span>
                  </button>
                  {aktif && (
                    <div className="border-t border-[#e6efea] p-3">
                      <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#355a4e]">
                        <Inbox className="h-3.5 w-3.5 text-emerald-600" />Pengumpulan: {t.submitted}/{t.total}
                        <div className="ml-2 h-2 flex-1 overflow-hidden rounded-full bg-[#f0f4f2]">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pengumpulan detail — untuk tugas terpilih */}
      {selTugas && (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
              <Inbox className="h-[18px] w-[18px] text-emerald-600" />Pengumpulan — {detailTitle}
            </h3>
            <button type="button" onClick={() => setSelTugas(null)} className="text-[11px] font-bold text-[#6b8079] hover:text-[#0f2e25]">Tutup</button>
          </div>
          {detailLoading ? (
            <div className="flex items-center gap-2 rounded-xl bg-[#f9fbfa] px-3 py-6 text-[12px] font-semibold text-[#6b8079]">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Memuat detail pengumpulan...
            </div>
          ) : detail.length === 0 ? (
            <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
              Belum ada pengumpulan untuk tugas ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                    <th className="px-3 py-2">Siswa</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Berkas</th>
                    <th className="px-3 py-2">Nilai</th>
                    <th className="px-3 py-2">Jenis</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((p, i) => (
                    <tr key={`${p.name}-${i}`} className="border-b border-[#f0f4f2]">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{p.name.charAt(0)}</div>
                          <b className="text-[#0f2e25]">{p.name}</b>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', STATUS_BADGE[p.status])}>{p.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[#355a4e]">
                        {p.fileName ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3 text-[#9bb0a8]" />{p.fileName}</span> : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.score !== null ? <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-extrabold', cls(p.score))}>{p.score}</span> : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10.5px] font-bold text-violet-700">Asesmen</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-[#9bb0a8]">Nilai tugas/praktik tersinkron ke kolom <b>Praktik</b> Gradebook. Observasi → kolom <b>Sikap</b>.</p>
        </div>
      )}
    </div>
  );
}
