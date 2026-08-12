'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle, ClipboardCheck,
  ClipboardPenLine, Clock, Database, Loader2, Play, RefreshCw, Send, Users, UserX, X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TodayClass } from './guru-types';
import EssayGradingModal from './EssayGradingModal';
import QuestionBankEditor from './QuestionBankEditor';
import SessionAnalysisPanel from './SessionAnalysisPanel';
import {
  completeAssessmentSession,
  createAssessmentSession,
  fetchAssessmentResults,
  fetchAssessmentSession,
  fetchQuestions,
  getSseToken,
  startAssessmentSession,
  type AssessmentResultsData,
  type AssessmentSessionData,
} from '../actions';

const SSE_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  session: TodayClass | null;
  academicYear: string;
  semester: number;
  initialMode?: 'preview' | 'monitor' | 'analysis';
  initialTab?: AssessmentStudioTab;
  onClose: () => void;
}

type AssessmentStudioTab = 'diag' | 'form' | 'uts' | 'uas' | 'fb';

interface QuestionRecord {
  id: string;
  type: string;
  body: string;
  difficulty: string;
}

interface LiveMonitorData {
  sessionStatus: string;
  classStudentCount: number;
  selesai: number;
  sedang: number;
  belum: number;
  rata: number;
  roster: Array<{ name: string; status: string; nilai: number; waktu: string }>;
}

function assessmentConfigFromTab(tab: AssessmentStudioTab): {
  type: 'diagnostik' | 'formatif' | 'sumatif';
  gradeTarget: 'uh' | 'uts' | 'uas' | null;
  label: string;
} {
  if (tab === 'diag') return { type: 'diagnostik', gradeTarget: null, label: 'Diagnostik' };
  if (tab === 'uts') return { type: 'sumatif', gradeTarget: 'uts', label: 'Sumatif UTS' };
  if (tab === 'uas') return { type: 'sumatif', gradeTarget: 'uas', label: 'Sumatif UAS' };
  return { type: 'formatif', gradeTarget: 'uh', label: 'Formatif' };
}

export default function PenilaianSesiModal({
  session,
  academicYear,
  semester,
  initialMode = 'preview',
  initialTab = 'diag',
  onClose,
}: Props) {
  const [mode, setMode] = useState<'preview' | 'monitor' | 'analysis'>(initialMode);
  const [tab, setTab] = useState<AssessmentStudioTab>(initialTab);
  const [workingSessionId, setWorkingSessionId] = useState<string | null>(session?.assessmentSessionId ?? null);
  const [sessionData, setSessionData] = useState<AssessmentSessionData | null>(null);
  const [bankQuestions, setBankQuestions] = useState<QuestionRecord[]>([]);
  const [selectedPoints, setSelectedPoints] = useState<Record<string, number>>({});
  const [bankOpen, setBankOpen] = useState(false);
  const [studioStep, setStudioStep] = useState<'konteks' | 'soal' | 'review' | 'aktifkan'>(session?.assessmentSessionId ? 'aktifkan' : 'konteks');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');
  const [randomizeOrder, setRandomizeOrder] = useState(true);
  const [resultsData, setResultsData] = useState<AssessmentResultsData | null>(null);
  const [essayGradingOpen, setEssayGradingOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [liveData, setLiveData] = useState<LiveMonitorData | null>(null);
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed'>('idle');

  const selectedList = useMemo(
    () => Object.entries(selectedPoints).map(([questionId, points], order) => ({ questionId, points, order })),
    [selectedPoints],
  );
  const pendingEssayCorrections = useMemo(
    () => (resultsData?.essayCorrections ?? []).filter((item) => item.status === 'manual_pending'),
    [resultsData],
  );
  const essayQuestions = useMemo(() => {
    const byId = new Map<string, {
      questionId: string;
      body: string;
      rubric: NonNullable<AssessmentResultsData['essayCorrections'][number]['rubric']>;
    }>();
    for (const item of pendingEssayCorrections) {
      byId.set(item.questionId, { questionId: item.questionId, body: item.body, rubric: item.rubric });
    }
    return Array.from(byId.values());
  }, [pendingEssayCorrections]);
  const essayResponses = useMemo(() => {
    const byId = new Map<string, { responseId: string; studentName: string; nis: string; answers: Record<string, string> }>();
    for (const item of pendingEssayCorrections) {
      const current = byId.get(item.responseId) ?? {
        responseId: item.responseId,
        studentName: item.studentName,
        nis: item.nis,
        answers: {},
      };
      current.answers[item.questionId] = item.answer;
      byId.set(item.responseId, current);
    }
    return Array.from(byId.values());
  }, [pendingEssayCorrections]);

  const loadBank = () => {
    if (!session?.subject) return;
    startLoad(async () => {
      const res = await fetchQuestions(session.subject);
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Gagal memuat Bank Soal.');
        return;
      }
      const data = Array.isArray(res.data) ? res.data : (res.data as { data?: QuestionRecord[] }).data ?? [];
      setBankQuestions(data);
    });
  };

  const loadResults = () => {
    if (!workingSessionId) {
      setResultsData(null);
      return;
    }
    startLoad(async () => {
      const res = await fetchAssessmentResults(workingSessionId);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal memuat hasil asesmen.');
        return;
      }
      setResultsData(res.data ?? null);
    });
  };

  useEffect(() => {
    if (!session?.subject) return;
    loadBank();
  }, [session?.subject]);

  useEffect(() => {
    if (!workingSessionId) {
      setSessionData(null);
      setResultsData(null);
      return;
    }
    startLoad(async () => {
      const res = await fetchAssessmentSession(workingSessionId);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal memuat sesi asesmen.');
        return;
      }
      setSessionData(res.data ?? null);
    });
  }, [workingSessionId]);

  useEffect(() => {
    if (!workingSessionId) return;
    loadResults();
  }, [workingSessionId]);

  useEffect(() => {
    if (mode !== 'monitor' || !workingSessionId) {
      setLiveState('idle');
      return;
    }
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let attempt = 0;
    const connect = () => {
      if (cancelled) return;
      setLiveState(attempt === 0 ? 'connecting' : 'reconnecting');
      getSseToken().then((tokenRes) => {
        if (cancelled) return;
        if (!tokenRes.success || !tokenRes.token) {
          attempt++;
          const delay = Math.min(8000, 1000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = setTimeout(connect, delay);
          return;
        }
        es?.close();
        es = new EventSource(`${SSE_BASE}/api/v1/assessment/sessions/${workingSessionId}/stream?token=${encodeURIComponent(tokenRes.token)}`);
        es.onopen = () => {
          attempt = 0;
          setLiveState('live');
        };
        es.onmessage = (event) => {
          try {
            setLiveData(JSON.parse(event.data) as LiveMonitorData);
            setLiveState('live');
          } catch {
            setLiveState('reconnecting');
          }
        };
        es.onerror = () => {
          es?.close();
          if (cancelled) return;
          attempt++;
          if (attempt > 5) {
            setLiveState('closed');
            return;
          }
          setLiveState('reconnecting');
          const delay = Math.min(8000, 1000 * 2 ** Math.min(attempt, 3));
          reconnectTimer = setTimeout(connect, delay);
        };
      });
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [mode, workingSessionId]);

  if (!session) return null;

  const createDraft = () => {
    if (!session.moduleId) {
      toast.error('Belum ada modul LMS untuk kelas dan mapel ini. Buat modul dulu dari tab Pembelajaran.');
      return;
    }
    if (selectedList.length === 0) {
      toast.error('Pilih minimal satu soal dari Bank Soal.');
      return;
    }
    const config = assessmentConfigFromTab(tab);
    startSave(async () => {
      const res = await createAssessmentSession({
        moduleId: session.moduleId!,
        classId: session.classId,
        title: `${config.label} ${session.subject} - ${session.className}`,
        type: config.type,
        gradeTarget: config.gradeTarget,
        questionSelections: selectedList,
        academicYear,
        semester,
        ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
        randomizeOrder,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Gagal membuat sesi.');
        return;
      }
      setWorkingSessionId(res.data.id);
      setSessionData(res.data);
      setStudioStep('aktifkan');
      toast.success('Draft sesi asesmen dibuat.');
    });
  };

  const activateOrComplete = () => {
    if (!workingSessionId || !sessionData) return;
    startSave(async () => {
      if (sessionData.status === 'draft') {
        const res = await startAssessmentSession(workingSessionId);
        if (!res.success) {
          toast.error(res.error ?? 'Gagal mengaktifkan sesi.');
          return;
        }
        setSessionData(res.data ?? null);
        setMode('monitor');
        toast.success('Sesi aktif untuk siswa.');
        return;
      }
      if (sessionData.status === 'active') {
        const res = await completeAssessmentSession(workingSessionId);
        if (!res.success) {
          toast.error(res.error ?? 'Gagal menyelesaikan sesi.');
          return;
        }
        setSessionData(res.data ?? null);
        setMode('analysis');
        loadResults();
        toast.success('Sesi selesai dan nilai disinkronkan.');
      }
    });
  };

  const selesai = liveData?.selesai ?? 0;
  const sedang = liveData?.sedang ?? 0;
  const belum = liveData?.belum ?? 0;
  const rata = liveData?.rata ?? 0;
  const total = liveData?.classStudentCount ?? 0;
  const progressPct = total > 0 ? Math.round((selesai / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Penilaian sesi">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
              <ClipboardPenLine className="h-5 w-5 text-emerald-600" />Penilaian - {session.subject} - {session.className}
            </h3>
            <p className="mt-1 text-[11px] font-semibold text-[#6b8079]">
              {workingSessionId ? `Sesi ${sessionData?.status ?? 'memuat'}` : 'Pilih soal, buat draft, lalu aktifkan untuk siswa.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5]" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-[#f4f7f5] p-1">
          {[
            ['preview', ClipboardCheck, 'Sesi'],
            ['monitor', Activity, 'Monitor'],
            ['analysis', BarChart3, 'Analisis'],
          ].map(([key, Icon, label]) => (
            <button key={String(key)} type="button" onClick={() => setMode(key as 'preview' | 'monitor' | 'analysis')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-bold ${mode === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {mode === 'preview' && (
          <div className="mt-4 space-y-3">
            {!workingSessionId && (
              <>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-[#dfe9e4] bg-[#f9fbfa] p-1">
                  {[
                    ['konteks', 'Konteks'],
                    ['soal', 'Soal'],
                    ['review', 'Review'],
                    ['aktifkan', 'Aktifkan'],
                  ].map(([key, label], index) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStudioStep(key as typeof studioStep)}
                      className={`rounded-md px-2 py-2 text-center text-[11px] font-bold ${studioStep === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}
                    >
                      <span className="mr-1 text-[10px]">{index + 1}</span>{label}
                    </button>
                  ))}
                </div>
                {!session.moduleId && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Belum ada modul LMS untuk kelas-mapel ini. Sesi asesmen dibuat dari modul LMS agar tugas siswa punya konteks pembelajaran.
                  </div>
                )}

                {studioStep === 'konteks' && (
                  <section className="space-y-3 rounded-lg border border-[#dfe9e4] p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ['diag', 'Diagnostik', 'Tidak masuk Grade'],
                        ['form', 'Formatif', 'Sinkron UH'],
                        ['uts', 'Sumatif UTS', 'Sinkron UTS'],
                        ['uas', 'Sumatif UAS', 'Sinkron UAS'],
                      ].map(([key, label, desc]) => (
                        <button key={key} type="button" onClick={() => setTab(key as AssessmentStudioTab)} className={`rounded-md px-3 py-2 text-left text-[12px] font-bold ${tab === key ? 'bg-emerald-600 text-white' : 'border border-[#dfe9e4] text-[#355a4e] hover:bg-[#f9fbfa]'}`}>
                          {label}<span className="block text-[10px] font-semibold opacity-80">{desc}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input type="number" min={1} max={300} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value === '' ? '' : Math.max(1, Math.min(300, Number(event.target.value))))} className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-semibold text-[#0f2e25]" placeholder="Durasi menit opsional" />
                      <label className="flex items-center justify-center gap-2 rounded-lg border border-[#dfe9e4] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e]">
                        <input type="checkbox" checked={randomizeOrder} onChange={(event) => setRandomizeOrder(event.target.checked)} className="accent-emerald-600" />Acak soal
                      </label>
                    </div>
                    <button type="button" onClick={() => setStudioStep('soal')} disabled={!session.moduleId} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                      Lanjut ke Soal
                    </button>
                  </section>
                )}

                {studioStep === 'soal' && (
                  <section className="space-y-3 rounded-lg border border-[#dfe9e4] p-3">
                    <button type="button" onClick={() => setBankOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#dfe9e4] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                      <Database className="h-4 w-4 text-emerald-600" />Pilih dari Bank Soal ({selectedList.length})
                    </button>
                    <div className="rounded-lg border border-[#dfe9e4]">
                      <div className="border-b border-[#dfe9e4] bg-[#f9fbfa] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Soal terpilih</div>
                      {selectedList.length === 0 ? (
                        <div className="p-4 text-[12px] font-semibold text-[#9bb0a8]">Belum ada soal dipilih.</div>
                      ) : selectedList.map((selection, index) => {
                        const question = bankQuestions.find((item) => item.id === selection.questionId);
                        return (
                          <div key={selection.questionId} className="flex items-start justify-between gap-3 border-b border-[#eef4f1] px-3 py-2 last:border-b-0">
                            <div>
                              <div className="text-[11px] font-bold text-emerald-700">#{index + 1} - {question?.type ?? 'soal'} - {selection.points} poin</div>
                              <p className="text-[12px] font-semibold text-[#0f2e25]">{question?.body ?? selection.questionId}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between gap-2">
                      <button type="button" onClick={() => setStudioStep('konteks')} className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-bold text-[#355a4e]">Kembali</button>
                      <button type="button" onClick={() => setStudioStep('review')} disabled={selectedList.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50">Lanjut Review</button>
                    </div>
                  </section>
                )}

                {studioStep === 'review' && (
                  <section className="space-y-3 rounded-lg border border-[#dfe9e4] p-3">
                    <div className="rounded-lg bg-[#f9fbfa] px-3 py-2 text-[12px] font-bold text-[#0f2e25]">
                      {assessmentConfigFromTab(tab).label} - {selectedList.length} soal - {selectedList.reduce((sum, item) => sum + item.points, 0)} poin - {durationMinutes ? `${durationMinutes} menit` : 'tanpa timer'}
                    </div>
                    {selectedList.map((selection, index) => {
                      const question = bankQuestions.find((item) => item.id === selection.questionId);
                      return (
                        <article key={selection.questionId} className="rounded-lg border border-[#eef4f1] px-3 py-2">
                          <div className="text-[11px] font-bold text-emerald-700">#{index + 1} - {question?.type ?? 'soal'} - {selection.points} poin</div>
                          <p className="text-[12px] font-semibold text-[#0f2e25]">{question?.body ?? selection.questionId}</p>
                        </article>
                      );
                    })}
                    <div className="flex justify-between gap-2">
                      <button type="button" onClick={() => setStudioStep('soal')} className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-bold text-[#355a4e]">Kembali</button>
                      <button type="button" onClick={createDraft} disabled={saving || selectedList.length === 0 || !session.moduleId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Buat Draft
                      </button>
                    </div>
                  </section>
                )}

                {studioStep === 'aktifkan' && (
                  <section className="rounded-lg border border-dashed border-[#dfe9e4] p-4 text-[12px] font-semibold text-[#6b8079]">
                    Draft sesi akan tampil di langkah ini setelah dibuat dari Review.
                  </section>
                )}
              </>
            )}

            {workingSessionId && (
              <div className="space-y-3">
                {loading ? (
                  <div className="grid h-24 place-items-center rounded-lg border border-dashed border-[#dfe9e4] text-[12px] font-semibold text-[#6b8079]">Memuat sesi...</div>
                ) : (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-800">
                      {sessionData?.title ?? 'Sesi asesmen'} - {sessionData?.questions?.length ?? 0} soal - Status {sessionData?.status ?? '-'} - Target nilai {sessionData?.gradeTarget ?? 'tidak masuk Grade'}
                    </div>
                    <div className="space-y-2">
                      {(sessionData?.questions ?? []).map((question, index) => {
                        const record = question as { id?: string; type?: string; body?: string; points?: number };
                        return (
                          <article key={record.id ?? index} className="rounded-lg border border-[#dfe9e4] p-3">
                            <div className="text-[11px] font-bold text-emerald-700">#{index + 1} - {record.type} - {record.points ?? 0} poin</div>
                            <p className="mt-1 text-[13px] font-semibold text-[#0f2e25]">{record.body}</p>
                          </article>
                        );
                      })}
                    </div>
                    {sessionData?.status !== 'completed' && (
                      <button type="button" onClick={activateOrComplete} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {sessionData?.status === 'draft' ? 'Aktifkan untuk siswa' : 'Selesaikan dan sinkron Gradebook'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'monitor' && (
          <div className="mt-4 space-y-3">
            {!workingSessionId ? (
              <div className="rounded-lg border border-[#dfe9e4] p-6 text-center text-[12px] font-semibold text-[#6b8079]">Buat atau pilih sesi terlebih dahulu.</div>
            ) : liveState === 'closed' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[12px] font-bold text-amber-700">Koneksi realtime terputus setelah beberapa percobaan. Tutup dan buka kembali monitor.</div>
            ) : (
              <>
                <div className={`rounded-lg border px-3 py-2 text-[12px] font-bold ${
                  liveState === 'live'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}>
                  {liveState === 'live' ? 'Live' : liveState === 'reconnecting' ? 'Menyambungkan kembali...' : 'Menghubungkan monitor...'}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Metric icon={Users} label="Selesai" value={`${selesai}/${total}`} tone="emerald" />
                  <Metric icon={Clock} label="Sedang" value={String(sedang)} tone="sky" />
                  <Metric icon={UserX} label="Belum" value={String(belum)} tone="amber" />
                  <Metric icon={CheckCircle} label="Rata-rata" value={String(rata)} tone="slate" />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e6efea]"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPct}%` }} /></div>
                {pendingEssayCorrections.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-[12px] font-bold text-amber-800">
                      {pendingEssayCorrections.length} jawaban esai menunggu koreksi guru.
                    </div>
                    <button type="button" onClick={() => setEssayGradingOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600">
                      <ClipboardPenLine className="h-3.5 w-3.5" />Nilai Esai Pending
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-[#dfe9e4]">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[#f9fbfa] text-left text-[10px] uppercase tracking-wide text-[#6b8079]"><tr><th className="px-3 py-2">Siswa</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Nilai</th><th className="px-3 py-2">Waktu</th></tr></thead>
                    <tbody>
                      {(liveData?.roster ?? []).map((row, index) => (
                        <tr key={index} className="border-t border-[#eef4f1]">
                          <td className="px-3 py-2 font-semibold text-[#0f2e25]">{row.name}</td>
                          <td className="px-3 py-2">{row.status}</td>
                          <td className="px-3 py-2 font-bold">{row.nilai || '-'}</td>
                          <td className="px-3 py-2 text-[#6b8079]">{row.waktu}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sessionData?.status === 'active' && (
                  <button type="button" onClick={activateOrComplete} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Selesaikan dan sinkron Gradebook
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'analysis' && (
          <div className="mt-4 space-y-3">
            {pendingEssayCorrections.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[12px] font-bold text-amber-800">
                  Analisis belum final: {pendingEssayCorrections.length} jawaban esai perlu dinilai.
                </div>
                <button type="button" onClick={() => setEssayGradingOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600">
                  <ClipboardPenLine className="h-3.5 w-3.5" />Buka Koreksi Esai
                </button>
              </div>
            )}
            {workingSessionId ? <SessionAnalysisPanel sessionId={workingSessionId} /> : <div className="rounded-lg border border-[#dfe9e4] p-6 text-center text-[12px] font-semibold text-[#6b8079]">Analisis tersedia setelah ada sesi.</div>}
          </div>
        )}
      </div>

      {bankOpen && (
        <QuestionBankEditor
          subject={session.subject}
          moduleId={session.moduleId}
          selectable
          selectedPoints={selectedPoints}
          onSelectedPointsChange={setSelectedPoints}
          onClose={() => {
            setBankOpen(false);
            loadBank();
          }}
        />
      )}
      {essayGradingOpen && workingSessionId && (
        <EssayGradingModal
          sessionId={workingSessionId}
          questions={essayQuestions}
          responses={essayResponses}
          onClose={() => setEssayGradingOpen(false)}
          onSaved={loadResults}
        />
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'slate' }) {
  const colors = {
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
    amber: 'text-amber-700',
    slate: 'text-[#0f2e25]',
  };
  return (
    <div className="rounded-lg border border-[#dfe9e4] p-3 text-center">
      <Icon className={`mx-auto h-4 w-4 ${colors[tone]}`} />
      <div className={`mt-1 text-[17px] font-extrabold ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] font-bold text-[#6b8079]">{label}</div>
    </div>
  );
}
