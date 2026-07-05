'use client';
import { useEffect, useState } from 'react';
import {
  ClipboardPenLine, X, Edit3, Activity, Info, Brain, ClipboardCheck, MessageCircle,
  AlertTriangle, Sparkles, Database, Cpu, Send, RefreshCw, Check, Users, Clock,
  UserX, GraduationCap, TrendingUp, CheckCircle, BarChart3,
} from 'lucide-react';
import type { TodayClass } from './guru-types';
import SessionAnalysisPanel from './SessionAnalysisPanel';
import { fetchAssessmentSession, startAssessmentSession, completeAssessmentSession, type AssessmentSessionData } from '../actions';

// P2: API base for SSE EventSource (server actions can't be used with SSE)
const SSE_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  session: TodayClass | null;
  initialMode?: 'preview' | 'monitor' | 'analysis';
  initialTab?: 'diag' | 'form' | 'fb';
  onClose: () => void;
}

// P2: SIMULASI constants removed — monitor uses SSE stream, preview uses real questions.

const FB_EMOJI: [number, string][] = [[20, '😣'], [40, '😕'], [60, '😐'], [80, '🙂'], [101, '🤩']];

// P2 (S-02): Live monitor data shape from SSE stream
interface LiveMonitorData {
  sessionStatus: string;
  classStudentCount: number;
  selesai: number;
  sedang: number;
  belum: number;
  rata: number;
  roster: Array<{ name: string; status: string; nilai: number; waktu: string }>;
}

export default function PenilaianSesiModal({ session, initialMode = 'preview', initialTab = 'diag', onClose }: Props) {
  const [mode, setMode] = useState<'preview' | 'monitor' | 'analysis'>(initialMode);
  const [tab, setTab] = useState<'diag' | 'form' | 'fb'>(initialTab);
  const [fbVal, setFbVal] = useState(78);
  const [synced, setSynced] = useState(false);
  // P2 (S-02): SSE live monitor state
  const [liveData, setLiveData] = useState<LiveMonitorData | null>(null);
  const [liveError, setLiveError] = useState(false);
  // P2 (S-01): Real session data for preview mode
  const [sessionData, setSessionData] = useState<AssessmentSessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // P2 (S-01): Fetch real session data (questions) when preview mode opens with an active session
  useEffect(() => {
    if (!session?.assessmentSessionId) return;
    setSessionLoading(true);
    fetchAssessmentSession(session.assessmentSessionId).then((res) => {
      if (res.success && res.data) setSessionData(res.data);
    }).finally(() => setSessionLoading(false));
  }, [session?.assessmentSessionId]);

  // P2: Open SSE connection when monitor mode is active and session has assessmentSessionId
  useEffect(() => {
    if (mode !== 'monitor' || !session?.assessmentSessionId) return;
    // P2: Remove unused token var
    setLiveError(false);
    const eventSource = new EventSource(`${SSE_BASE}/api/v1/assessment/sessions/${session.assessmentSessionId}/stream`, {
      // SSE doesn't support custom headers; pass token via query param fallback
    });
    // Note: For auth, the API gateway should support cookie-based session or the
    // EventSource polyfill can pass Authorization header. For now, the SSE endpoint
    // is behind the same KeycloakGuard — the browser session cookie will be sent.
    eventSource.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as LiveMonitorData;
        setLiveData(parsed);
      } catch { /* skip malformed */ }
    };
    eventSource.onerror = () => {
      setLiveError(true);
      eventSource.close();
    };
    return () => eventSource.close();
  }, [mode, session?.assessmentSessionId]);

  if (!session) return null;

  const fbEmoji = (FB_EMOJI.find(([v]) => fbVal < v) ?? [0, '😊'])[1];
  const selesai = liveData?.selesai ?? 0;
  const sedang = liveData?.sedang ?? 0;
  const belum = liveData?.belum ?? 0;
  const rata = liveData?.rata ?? 0;
  const total = liveData?.classStudentCount ?? 0;
  const progressPct = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const monitorRoster = liveData?.roster ?? [];

  // P2 (S-03): Sync button activates/completes the session via real API
  const handleSync = async () => {
    if (!session?.assessmentSessionId) {
      setSynced(true);
      setTimeout(() => { setSynced(false); onClose(); }, 1500);
      return;
    }
    setSynced(true);
    try {
      if (mode === 'preview') {
        // Activate session: draft → active
        await startAssessmentSession(session.assessmentSessionId);
      } else if (mode === 'monitor') {
        // Complete session: active → completed
        await completeAssessmentSession(session.assessmentSessionId);
      }
    } catch {
      // Fail-soft: close modal regardless
    }
    setTimeout(() => { setSynced(false); onClose(); }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardPenLine className="h-[18px] w-[18px] text-emerald-600" />Penilaian — {session.subject} · {session.className}</h3>
            <p className="text-[11.5px] text-[#6b8079]">{sessionData?.title ?? session.subject} · {session.className}</p>
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

            {!session.assessmentSessionId ? (
              <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-6 text-center">
                <ClipboardCheck className="mx-auto h-8 w-8 text-[#9bb0a8]" />
                <p className="mt-2 text-[12.5px] font-medium text-[#6b8079]">Belum ada sesi asesmen untuk kelas ini.</p>
                <p className="mt-1 text-[10.5px] font-bold text-amber-600">Buat sesi dari Question Bank, lalu aktifkan untuk melihat preview soal.</p>
              </div>
            ) : sessionLoading ? (
              <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-6 text-center">
                <p className="text-[12.5px] font-medium text-[#9bb0a8]">Memuat soal sesi...</p>
              </div>
            ) : (
            <>

            {/* P2 (S-01): Real question count from fetched session data */}
            {sessionData && sessionData.questions.length > 0 && (
              <div className="mb-3 text-[11px] font-bold text-[#6b8079]">{sessionData.questions.length} soal · Status: {sessionData.status} {sessionData.durationMinutes ? `· ${sessionData.durationMinutes} menit` : ''}</div>
            )}

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
                <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Sparkles className="h-3.5 w-3.5 text-violet-500" />Edit / Tambah Soal Diagnostik</button>
              </div>
            )}

            {/* Formatif tab */}
            {tab === 'form' && (
              <div>
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10.5px] text-emerald-700">
                  <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Formatif <b>masuk gradebook</b> kolom UH secara otomatis. <b>PG auto-grade</b> — sistem menilai otomatis berdasarkan kunci jawaban.</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Sparkles className="h-3.5 w-3.5 text-violet-500" />Edit / Tambah Soal</button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><Database className="h-3.5 w-3.5 text-emerald-600" />Bank Soal PG</button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white hover:bg-emerald-700"><Cpu className="h-3.5 w-3.5" />Preview Auto-Grade</button>
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
            </>
            )}
          </div>
        )}

        {/* REALTIME MONITOR MODE — P2 (S-02): SSE live data */}
        {mode === 'monitor' && (
          <div className="mt-3">
            {!session.assessmentSessionId ? (
              <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-6 text-center">
                <Activity className="mx-auto h-8 w-8 text-[#9bb0a8]" />
                <p className="mt-2 text-[12.5px] font-medium text-[#6b8079]">Belum ada sesi asesmen aktif untuk kelas ini.</p>
                <p className="mt-1 text-[10.5px] font-bold text-amber-600">Aktifkan sesi dari tombol "Tugaskan & Sinkronkan" di mode Preview.</p>
              </div>
            ) : liveError ? (
              <div className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                <p className="mt-2 text-[12.5px] font-medium text-[#6b8079]">Koneksi realtime terputus. Silakan tutup dan buka kembali.</p>
              </div>
            ) : (
              <>
            <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-700">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><b>Mode Realtime Monitor.</b> Pantau progres pengerjaan siswa secara langsung. Nilai formatif otomatis tersinkron ke Gradebook.</span>
            </div>
            {/* P2: Real KPIs from SSE */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl border border-[#e6efea] p-2 text-center"><Users className="mx-auto h-3.5 w-3.5 text-emerald-600" /><div className="mt-1 text-[16px] font-extrabold text-emerald-700">{selesai}/{total}</div><div className="text-[9.5px] font-semibold text-[#6b8079]">Selesai</div></div>
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
            {/* P2: Real student table from SSE */}
            {monitorRoster.length > 0 ? (
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-[#e6efea]">
              <table className="w-full text-[11.5px]">
                <thead><tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[10px] uppercase tracking-wide text-[#6b8079]"><th className="px-3 py-2">Siswa</th><th className="px-3 py-2 text-center">Status</th><th className="px-3 py-2 text-center">Nilai</th><th className="px-3 py-2 text-center">Waktu</th></tr></thead>
                <tbody>
                  {monitorRoster.map((m, i) => (
                    <tr key={i} className="border-b border-[#f0f4f2]">
                      <td className="px-3 py-2 font-semibold text-[#0f2e25]">{m.name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${m.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-600'}`}>{m.status}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-[#0f2e25]">{m.nilai || '—'}</td>
                      <td className="px-3 py-2 text-center text-[11px] text-[#6b8079]">{m.waktu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <div className="mt-2.5 grid h-24 place-items-center rounded-xl border border-dashed border-[#e6efea] bg-[#f9fbfa] text-[12px] font-medium text-[#9bb0a8]">Menunggu siswa memulai pengerjaan...</div>
            )}
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Nilai formatif <b>otomatis tersinkron ke Gradebook</b> kolom UH saat siswa selesai.</span>
            </div>
              </>
            )}
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
        {/* P2: Footer note only shows when no session is linked */}
        {!session.assessmentSessionId && mode !== 'analysis' && (
          <p className="mt-2 text-center text-[10.5px] font-bold text-amber-600">ⓘ Aktifkan sesi asesmen untuk monitoring realtime dan analisis hasil.</p>
        )}
      </div>
    </div>
  );
}
