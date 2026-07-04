'use client';
import { useState } from 'react';
import {
  ClipboardPenLine, X, Edit3, Activity, Info, Brain, ClipboardCheck, MessageCircle,
  AlertTriangle, Sparkles, Database, Cpu, Send, RefreshCw, Check, Users, Clock,
  UserX, GraduationCap, TrendingUp, CheckCircle, BarChart3,
} from 'lucide-react';
import type { TodayClass } from './guru-types';
import SessionAnalysisPanel from './SessionAnalysisPanel';

interface Props {
  session: TodayClass | null;
  initialMode?: 'preview' | 'monitor' | 'analysis';
  initialTab?: 'diag' | 'form' | 'fb';
  onClose: () => void;
}

// SIMULASI — seluruh data penilaian sesi (diagnostik, formatif, feedback, realtime monitor)
// belum memiliki backend. Saat endpoint /assessments/sessions/* ready, ganti simulasi di bawah.

const FB_EMOJI: [number, string][] = [[20, '😣'], [40, '😕'], [60, '😐'], [80, '🙂'], [101, '🤩']];

// SIMULASI student monitor data
const MONITOR_DATA = [
  { name: 'Ahmad Fauzi', status: 'Selesai', nilai: 85, waktu: '5m 20s' },
  { name: 'Siti Aminah', status: 'Selesai', nilai: 78, waktu: '4m 10s' },
  { name: 'Budi Santoso', status: 'Selesai', nilai: 92, waktu: '6m 45s' },
  { name: 'Dewi Lestari', status: 'Sedang mengerjakan', nilai: 0, waktu: '—' },
  { name: 'Eko Prasetyo', status: 'Selesai', nilai: 88, waktu: '3m 55s' },
  { name: 'Fitri Handayani', status: 'Selesai', nilai: 74, waktu: '7m 12s' },
  { name: 'Gilang Ramadhan', status: 'Belum mulai', nilai: 0, waktu: '—' },
  { name: 'Hana Pertiwi', status: 'Selesai', nilai: 90, waktu: '4m 30s' },
];

export default function PenilaianSesiModal({ session, initialMode = 'preview', initialTab = 'diag', onClose }: Props) {
  const [mode, setMode] = useState<'preview' | 'monitor' | 'analysis'>(initialMode);
  const [tab, setTab] = useState<'diag' | 'form' | 'fb'>(initialTab);
  const [fbVal, setFbVal] = useState(78);
  const [synced, setSynced] = useState(false);

  if (!session) return null;

  const fbEmoji = (FB_EMOJI.find(([v]) => fbVal < v) ?? [0, '😊'])[1];
  const selesai = MONITOR_DATA.filter((m) => m.status === 'Selesai').length;
  const sedang = MONITOR_DATA.filter((m) => m.status === 'Sedang mengerjakan').length;
  const belum = MONITOR_DATA.filter((m) => m.status === 'Belum mulai').length;
  const rata = selesai ? Math.round(MONITOR_DATA.filter((m) => m.nilai > 0).reduce((a, b) => a + b.nilai, 0) / selesai) : 0;
  const progressPct = Math.round((selesai / MONITOR_DATA.length) * 100);

  // SIMULASI — auto-grade: sistem menilai PG otomatis berdasarkan kunci jawaban
  const handleSync = () => {
    setSynced(true);
    setTimeout(() => { setSynced(false); onClose(); }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-[18px] w-[18px] text-emerald-600" />Penilaian — {session.subject} · {session.className}</h3>
            <p className="text-[11.5px] text-[#6b8079]">Pertemuan 6 · TP 3.3 · {session.className}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>

        {/* Mode toggle */}
        <div className="mt-3 flex gap-1.5 rounded-xl bg-[#f4f7f5] p-1">
          <button type="button" onClick={() => setMode('preview')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition ${mode === 'preview' ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}><Edit3 className="h-3.5 w-3.5" />Preview & Edit</button>
          <button type="button" onClick={() => setMode('monitor')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition ${mode === 'monitor' ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}><Activity className="h-3.5 w-3.5" />Realtime Monitor</button>
          <button type="button" onClick={() => setMode('analysis')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition ${mode === 'analysis' ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}><BarChart3 className="h-3.5 w-3.5" />Analisis</button>
        </div>

        {mode === 'preview' && (
          <div className="mt-3">
            <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[11.5px] text-sky-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><b>Mode Preview & Edit.</b> Lihat dan sunting soal sebelum ditugaskan ke LMS siswa. Klik &quot;Tugaskan & Sinkronkan&quot; untuk mempublish.</span>
            </div>

            {/* Tabs */}
            <div className="mb-3 flex gap-1 border-b border-[#e6efea]">
              {([['diag', Brain, 'Diagnostik'], ['form', ClipboardCheck, 'Formatif'], ['fb', MessageCircle, 'Feedback']] as const).map(([key, Icon, label]) => (
                <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-bold transition ${tab === key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-[#6b8079] hover:text-[#355a4e]'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
              ))}
            </div>

            {/* Diagnostik tab */}
            {tab === 'diag' && (
              <div>
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Diagnostik <b>tidak masuk nilai</b> — hanya memetakan kesiapan siswa.</span>
                </div>
                {/* SIMULASI question card */}
                <div className="rounded-xl border border-[#e6efea] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-[11px] font-bold text-emerald-700">1</span><span className="text-[11px] font-bold text-[#6b8079]">PG</span></div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">TP 3.3</span>
                      <span className="flex items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600"><Sparkles className="h-2.5 w-2.5" />AI</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[12px] text-[#0f2e25]">Properti CSS untuk menyusun item dalam satu baris fleksibel…</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-2.5 py-1.5 text-[11.5px] text-[#355a4e]"><span className="grid h-5 w-5 place-items-center rounded bg-[#f4f7f5] text-[10px] font-bold">A</span>display: block</div>
                    <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-700"><span className="grid h-5 w-5 place-items-center rounded bg-emerald-100 text-[10px] font-bold">B</span>display: flex <Check className="ml-auto h-3 w-3" /></div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-2.5 py-1.5 text-[11.5px] text-[#355a4e]"><span className="grid h-5 w-5 place-items-center rounded bg-[#f4f7f5] text-[10px] font-bold">C</span>position: absolute</div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-2.5 py-1.5 text-[11.5px] text-[#355a4e]"><span className="grid h-5 w-5 place-items-center rounded bg-[#f4f7f5] text-[10px] font-bold">D</span>float: left</div>
                  </div>
                </div>
                <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Sparkles className="h-3.5 w-3.5 text-violet-500" />Edit / Tambah Soal</button>
              </div>
            )}

            {/* Formatif tab */}
            {tab === 'form' && (
              <div>
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10.5px] text-emerald-700">
                  <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Formatif <b>masuk gradebook</b> kolom UH secara otomatis. <b>PG auto-grade</b> — sistem menilai otomatis berdasarkan kunci jawaban.</span>
                </div>
                {/* SIMULASI PG question */}
                <div className="rounded-xl border border-[#e6efea] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-[11px] font-bold text-emerald-700">1</span><span className="text-[11px] font-bold text-[#6b8079]">PG</span><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-extrabold text-emerald-700">AUTO-GRADE</span></div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">TP 3.3</span>
                      <span className="flex items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-600"><Sparkles className="h-2.5 w-2.5" />AI</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[12px] text-[#0f2e25]">justify-content: space-between akan…</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-700"><span className="grid h-5 w-5 place-items-center rounded bg-emerald-100 text-[10px] font-bold">A</span>Jarak merata, item tepi menempel <Check className="ml-auto h-3 w-3" /></div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-2.5 py-1.5 text-[11.5px] text-[#355a4e]"><span className="grid h-5 w-5 place-items-center rounded bg-[#f4f7f5] text-[10px] font-bold">B</span>Menumpuk di kiri</div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-2.5 py-1.5 text-[11.5px] text-[#355a4e]"><span className="grid h-5 w-5 place-items-center rounded bg-[#f4f7f5] text-[10px] font-bold">C</span>Menyembunyikan item</div>
                  </div>
                </div>
                {/* SIMULASI Essay question */}
                <div className="mt-2 rounded-xl border border-[#e6efea] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-50 text-[11px] font-bold text-amber-600">2</span><span className="text-[11px] font-bold text-[#6b8079]">Essay</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold text-amber-700">MANUAL</span></div>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">manual/rubrik</span>
                  </div>
                  <p className="mt-2 text-[12px] text-[#0f2e25]">Jelaskan perbedaan flex-direction: row dan column.</p>
                  <div className="mt-2 rounded-lg border border-dashed border-[#e6efea] px-2.5 py-1.5 text-[11px] text-[#9bb0a8]">Rubrik: menyebut arah sumbu + contoh (0–100)</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Sparkles className="h-3.5 w-3.5 text-violet-500" />Edit / Tambah Soal</button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Database className="h-3.5 w-3.5 text-emerald-600" />Bank Soal PG</button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white hover:bg-emerald-700"><Cpu className="h-3.5 w-3.5" />Simulasi Auto-Grade</button>
                </div>
              </div>
            )}

            {/* Feedback tab */}
            {tab === 'fb' && (
              <div className="rounded-xl border border-[#e6efea] p-4">
                <div className="mb-1.5 text-[11px] font-bold text-[#6b8079]">Template Feedback</div>
                <div className="flex items-center gap-4">
                  <div className="text-[36px]">{fbEmoji}</div>
                  <div className="flex-1">
                    <input type="range" min={1} max={100} value={fbVal} onChange={(e) => setFbVal(Number(e.target.value))} className="w-full accent-emerald-600" />
                    <div className="mt-1 text-[13px] font-bold text-[#0f2e25]"><span>{fbVal}</span>/100</div>
                  </div>
                </div>
                <textarea className="mt-3 w-full rounded-lg border border-[#e6efea] p-2.5 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300" rows={2} placeholder="Catatan singkat untuk siswa…" />
              </div>
            )}
          </div>
        )}

        {/* REALTIME MONITOR MODE */}
        {mode === 'monitor' && (
          <div className="mt-3">
            <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-700">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><b>Mode Realtime Monitor.</b> Pantau progres pengerjaan siswa secara langsung. Nilai formatif otomatis tersinkron ke Gradebook.</span>
            </div>
            {/* SIMULASI KPIs */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl border border-[#e6efea] p-2 text-center"><Users className="mx-auto h-3.5 w-3.5 text-emerald-600" /><div className="mt-1 text-[16px] font-extrabold text-emerald-700">{selesai}/{MONITOR_DATA.length}</div><div className="text-[9.5px] font-semibold text-[#6b8079]">Selesai</div></div>
              <div className="rounded-xl border border-[#e6efea] p-2 text-center"><Clock className="mx-auto h-3.5 w-3.5 text-sky-500" /><div className="mt-1 text-[16px] font-extrabold text-sky-600">{sedang}</div><div className="text-[9.5px] font-semibold text-[#6b8079]">Sedang</div></div>
              <div className="rounded-xl border border-[#e6efea] p-2 text-center"><UserX className="mx-auto h-3.5 w-3.5 text-amber-500" /><div className="mt-1 text-[16px] font-extrabold text-amber-600">{belum}</div><div className="text-[9.5px] font-semibold text-[#6b8079]">Belum</div></div>
              <div className="rounded-xl border border-[#e6efea] p-2 text-center"><GraduationCap className="mx-auto h-3.5 w-3.5 text-[#6b8079]" /><div className="mt-1 text-[16px] font-extrabold text-[#0f2e25]">{rata}</div><div className="text-[9.5px] font-semibold text-[#6b8079]">Rata²</div></div>
            </div>
            {/* Progress bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[11px] font-bold text-[#6b8079]">Progress kelas</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e6efea]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPct}%` }} /></div>
              <span className="text-[11px] font-bold text-[#6b8079]">{progressPct}%</span>
            </div>
            {/* SIMULASI student table */}
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-[#e6efea]">
              <table className="w-full text-[11.5px]">
                <thead><tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10px] uppercase tracking-wide text-[#6b8079]"><th className="px-3 py-2">Siswa</th><th className="px-3 py-2 text-center">Status</th><th className="px-3 py-2 text-center">Nilai</th><th className="px-3 py-2 text-center">Waktu</th></tr></thead>
                <tbody>
                  {MONITOR_DATA.map((m, i) => (
                    <tr key={i} className="border-b border-[#f0f4f2]">
                      <td className="px-3 py-2 font-semibold text-[#0f2e25]">{m.name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${m.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700' : m.status === 'Sedang mengerjakan' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>{m.status}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-[#0f2e25]">{m.nilai || '—'}</td>
                      <td className="px-3 py-2 text-center text-[11px] text-[#6b8079]">{m.waktu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Nilai formatif <b>otomatis tersinkron ke Gradebook</b> kolom UH saat siswa selesai.</span>
            </div>
          </div>
        )}

        {/* ANALYSIS MODE — U2 Wave 3 */}
        {mode === 'analysis' && (
          <div className="mt-3">
            {session.assessmentSessionId ? (
              <SessionAnalysisPanel sessionId={session.assessmentSessionId} />
            ) : (
              <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-6 text-center">
                <BarChart3 className="mx-auto h-8 w-8 text-[#9bb0a8]" />
                <p className="mt-2 text-[12.5px] font-medium text-[#6b8079]">Analisis hasil tersedia setelah sesi asesmen diselesaikan dan memiliki ID sesi yang terhubung.</p>
                <p className="mt-1 text-[10.5px] font-bold text-amber-600">ⓘ Mode Analisis — backend /assessment/sessions/:id/analysis siap, menunggu sesi aktif</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
          <button type="button" onClick={handleSync} disabled={synced} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {synced ? (<><Check className="h-4 w-4" />Tersinkron…</>) : mode === 'preview' ? (<><Send className="h-4 w-4" />Tugaskan & Sinkronkan</>) : (<><RefreshCw className="h-4 w-4" />Sinkron ke Gradebook</>)}
          </button>
        </div>
        <p className="mt-2 text-center text-[10.5px] font-bold text-amber-600">ⓘ Seluruh data Penilaian Sesi: Simulasi — backend /assessments/sessions/* belum tersedia</p>
      </div>
    </div>
  );
}
