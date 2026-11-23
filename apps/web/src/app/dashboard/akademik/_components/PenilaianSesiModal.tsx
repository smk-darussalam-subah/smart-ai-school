'use client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import QuestionContent from '@/components/learning/QuestionContent';
import { learningRecordStatus } from '@/lib/learning-recap';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ClipboardCheck,
  ClipboardPenLine,
  Clock,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Send,
  Users,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TodayClass } from './guru-types';
import EssayGradingModal from './EssayGradingModal';
import QuestionBankEditor, { type QuestionRecord } from './QuestionBankEditor';
import SessionAnalysisPanel from './SessionAnalysisPanel';
import AssessmentQuestionPreview from './AssessmentQuestionPreview';
import AssessmentDiscardDialog, { useAssessmentExitWarning } from './AssessmentDiscardDialog';
import AssessmentCompletionDialog from './AssessmentCompletionDialog';
import { parsePreviewQuestion } from './assessment-question-preview';
import {
  assessmentCompletionLabel,
  assessmentCompletionMessage,
} from './assessment-completion-feedback';
import {
  createAssessmentSession,
  fetchAssessmentResults,
  fetchAssessmentSession,
  reviewLateAssessmentSubmission,
  startAssessmentSession,
  type AssessmentResultsData,
  type AssessmentSessionData,
  type CreateAssessmentSessionData,
} from '../actions';

import {
  connectAssessmentMonitor,
  requestAssessmentMonitorToken,
  type LiveMonitorData,
  type LiveMonitorState,
} from './assessment-live-monitor';

interface Props {
  session: TodayClass | null;
  academicYear: string;
  semester: number;
  initialMode?: 'preview' | 'monitor' | 'analysis';
  initialTab?: AssessmentStudioTab;
  onClose: () => void;
}

type AssessmentStudioTab = 'diag' | 'form' | 'uts' | 'uas' | 'fb';

const INCIDENT_LABELS: Record<string, string> = {
  fullscreen_exit: 'Keluar layar penuh',
  visibility_hidden: 'Berpindah aplikasi/tab',
  window_blur: 'Jendela kehilangan fokus',
  pagehide: 'Aplikasi ditutup/ditinggalkan',
  exit_attempt: 'Mencoba keluar ujian',
  offline_submit_review_required: 'Sinkronisasi terlambat perlu keputusan guru',
  offline_submit_accepted: 'Jawaban terlambat diterima guru',
  offline_submit_rejected: 'Jawaban terlambat ditolak guru',
  offline: 'Koneksi terputus',
  online: 'Koneksi pulih',
};

function connectionLabel(status: LiveMonitorData['roster'][number]['connectionStatus']): string {
  if (status === 'online') return 'Online';
  if (status === 'stale') return 'Koneksi lambat';
  if (status === 'offline') return 'Terputus';
  if (status === 'completed') return 'Selesai';
  return 'Menghubungkan';
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
  const returnFocus = useDialogReturnFocus();
  const [mode, setMode] = useState<'preview' | 'monitor' | 'analysis'>(initialMode);
  const [tab, setTab] = useState<AssessmentStudioTab>(initialTab);
  const [workingSessionId, setWorkingSessionId] = useState<string | null>(
    session?.assessmentSessionId ?? null,
  );
  const [sessionData, setSessionData] = useState<AssessmentSessionData | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionLoadVersion, setSessionLoadVersion] = useState(0);
  const [selection, setSelection] = useState<{
    points: Record<string, number>;
    questions: ReadonlyMap<string, QuestionRecord>;
  }>({ points: {}, questions: new Map() });
  const { points: selectedPoints, questions: selectedQuestions } = selection;
  const [bankOpen, setBankOpen] = useState(false);
  const [studioStep, setStudioStep] = useState<'konteks' | 'soal' | 'review' | 'aktifkan'>(
    session?.assessmentSessionId ? 'aktifkan' : 'konteks',
  );
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');
  const [randomizeOrder, setRandomizeOrder] = useState(true);
  const [resultsData, setResultsData] = useState<AssessmentResultsData | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const resultsRequest = useRef(0);
  const [gradingResults, setGradingResults] = useState<AssessmentResultsData | null>(null);
  const essayGradingOpen = gradingResults !== null;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [lateReviewTarget, setLateReviewTarget] = useState<{
    responseId: string;
    studentName: string;
    decision: 'accept' | 'reject';
  } | null>(null);
  const [lateReviewNote, setLateReviewNote] = useState('');
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const studioSaveFlight = useRef(false);
  const draftAttempt = useRef<CreateAssessmentSessionData | null>(null);
  const [draftUncertain, setDraftUncertain] = useState(false);
  const [liveData, setLiveData] = useState<LiveMonitorData | null>(null);
  const [liveState, setLiveState] = useState<LiveMonitorState>('idle');
  const [liveRetry, setLiveRetry] = useState(0);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const monitorTab = useRef<HTMLButtonElement | null>(null);
  const analysisTab = useRef<HTMLButtonElement | null>(null);

  const closeLateReview = (saved = false) => {
    setLateReviewTarget(null);
    setLateReviewNote('');
    requestAnimationFrame(() => {
      const target = saved ? monitorTab.current : reviewTrigger.current;
      (target?.isConnected ? target : monitorTab.current)?.focus();
    });
  };

  const submitLateReview = () => {
    if (!workingSessionId || !lateReviewTarget || lateReviewNote.trim().length < 3) return;
    startSave(async () => {
      const result = await reviewLateAssessmentSubmission(
        workingSessionId,
        lateReviewTarget.responseId,
        { decision: lateReviewTarget.decision, note: lateReviewNote.trim() },
      );
      if (!result.success) {
        toast.error(result.error ?? 'Keputusan belum dapat disimpan.');
        return;
      }
      toast.success(
        lateReviewTarget.decision === 'accept'
          ? 'Jawaban terlambat diterima untuk dinilai.'
          : 'Jawaban terlambat ditolak.',
      );
      closeLateReview(true);
      loadResults();
      setAnalysisVersion((version) => version + 1);
    });
  };

  const selectedList = useMemo(
    () =>
      Object.entries(selectedPoints).map(([questionId, points], order) => ({
        questionId,
        points,
        order,
      })),
    [selectedPoints],
  );
  const draftDirty =
    !workingSessionId &&
    (selectedList.length > 0 || durationMinutes !== '' || !randomizeOrder || tab !== initialTab);
  useAssessmentExitWarning(draftDirty);
  const previewItems = useMemo(
    () =>
      workingSessionId
        ? (sessionData?.questions ?? []).map((question) => parsePreviewQuestion(question))
        : selectedList.map((selection) =>
            parsePreviewQuestion(selectedQuestions.get(selection.questionId), selection.points),
          ),
    [workingSessionId, sessionData?.questions, selectedList, selectedQuestions],
  );
  const previewQuestions = previewItems.filter((question) => question !== null);
  const missingPreviewCount = previewItems.length - previewQuestions.length;
  const pendingEssayCorrections = useMemo(
    () =>
      ((gradingResults ?? resultsData)?.essayCorrections ?? []).filter(
        (item) => item.status === 'manual_pending',
      ),
    [gradingResults, resultsData],
  );
  const essayQuestions = useMemo(() => {
    const byId = new Map<
      string,
      {
        questionId: string;
        body: string;
        rubric: NonNullable<AssessmentResultsData['essayCorrections'][number]['rubric']>;
      }
    >();
    for (const item of pendingEssayCorrections) {
      byId.set(item.questionId, {
        questionId: item.questionId,
        body: item.body,
        rubric: item.rubric,
      });
    }
    return Array.from(byId.values());
  }, [pendingEssayCorrections]);
  const essayResponses = useMemo(() => {
    const byId = new Map<
      string,
      { responseId: string; studentName: string; nis: string; answers: Record<string, string> }
    >();
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

  const updateSelectedQuestions = (questions: QuestionRecord[]) => {
    setSelection((previous) => {
      const updates = questions.filter(({ id }) => Object.hasOwn(previous.points, id));
      if (!updates.length) return previous;
      const next = new Map(previous.questions);
      for (const question of updates) next.set(question.id, question);
      return { ...previous, questions: next };
    });
  };

  const changeSelection = (points: Record<string, number>, details: QuestionRecord[] = []) => {
    setSelection((previous) => {
      const questions = new Map(previous.questions);
      for (const detail of details) questions.set(detail.id, detail);
      for (const id of questions.keys()) {
        if (!Object.hasOwn(points, id)) questions.delete(id);
      }
      return { points, questions };
    });
  };

  const loadResults = (openGrading = false) => {
    if (!workingSessionId) {
      setResultsData(null);
      return;
    }
    const request = ++resultsRequest.current;
    setResultsError(null);
    startLoad(async () => {
      try {
        const res = await fetchAssessmentResults(workingSessionId);
        if (request !== resultsRequest.current) return;
        if (!res.success || res.data?.session.id !== workingSessionId) {
          setResultsError(res.error ?? 'Gagal memuat hasil asesmen.');
          return;
        }
        setResultsData(res.data);
        if (openGrading) {
          if (res.data.essayCorrections.some((item) => item.status === 'manual_pending')) {
            setGradingResults(res.data);
          } else {
            toast.info('Tidak ada jawaban esai yang perlu dikoreksi.');
          }
        }
      } catch {
        if (request === resultsRequest.current)
          setResultsError('Hasil asesmen belum dapat dimuat. Coba lagi.');
      }
    });
  };

  useEffect(() => {
    const existingSessionId = session?.assessmentSessionId;
    if (!existingSessionId) return;
    let current = true;
    setSessionLoadError(null);
    void (async () => {
      try {
        const res = await fetchAssessmentSession(existingSessionId);
        if (!current) return;
        if (!res.success || res.data?.id !== existingSessionId) {
          setSessionLoadError(res.error ?? 'Sesi asesmen belum dapat dimuat.');
          return;
        }
        setSessionData(res.data);
      } catch {
        if (current) setSessionLoadError('Sesi asesmen belum dapat dimuat.');
      }
    })();
    return () => {
      current = false;
    };
  }, [session?.assessmentSessionId, sessionLoadVersion]);

  useEffect(() => {
    if (!workingSessionId || mode !== 'analysis') return;
    loadResults();
  }, [mode, workingSessionId]);

  useEffect(() => {
    if (mode !== 'monitor' || !workingSessionId) {
      setLiveState('idle');
      setLiveData(null);
      return;
    }
    return connectAssessmentMonitor({
      sessionId: workingSessionId,
      getToken: requestAssessmentMonitorToken,
      onData: setLiveData,
      onState: setLiveState,
    });
  }, [mode, workingSessionId, liveRetry]);

  if (!session) return null;

  const createDraft = () => {
    if (!session.moduleId) {
      toast.error(
        'Belum ada modul LMS untuk kelas dan mapel ini. Buat modul dulu dari tab Pembelajaran.',
      );
      return;
    }
    if (selectedList.length === 0) {
      toast.error('Pilih minimal satu soal dari Bank Soal.');
      return;
    }
    if (missingPreviewCount > 0) {
      toast.error('Rincian beberapa soal belum lengkap. Buka Bank Soal untuk memuatnya kembali.');
      return;
    }
    const config = assessmentConfigFromTab(tab);
    runStudioSave(async () => {
      const payload = draftAttempt.current ?? {
        requestId: crypto.randomUUID(),
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
      };
      draftAttempt.current = payload;
      try {
        const res = await createAssessmentSession(payload);
        if (!res.success || !res.data?.id) {
          const definitivelyNotCreated =
            !draftUncertain &&
            !res.success &&
            res.httpStatus !== undefined &&
            [400, 401, 403, 404, 422, 429].includes(res.httpStatus);
          if (definitivelyNotCreated) {
            draftAttempt.current = null;
          } else {
            setDraftUncertain(true);
          }
          toast.error(res.error ?? 'Penyimpanan draf belum terkonfirmasi.');
          return;
        }
        draftAttempt.current = null;
        setDraftUncertain(false);
        setWorkingSessionId(res.data.id);
        setSessionData(res.data);
        setStudioStep('aktifkan');
        toast.success(
          draftUncertain ? 'Draf yang sama berhasil dipulihkan.' : 'Draft sesi asesmen dibuat.',
        );
      } catch {
        setDraftUncertain(true);
        toast.error('Penyimpanan draf belum terkonfirmasi.');
      }
    });
  };

  const runStudioSave = (action: () => Promise<void>) => {
    if (studioSaveFlight.current || saving) return;
    studioSaveFlight.current = true;
    startSave(async () => {
      try {
        await action();
      } catch {
        toast.error('Hasil belum dapat dipastikan. Periksa daftar sesi sebelum mencoba lagi.');
      } finally {
        studioSaveFlight.current = false;
      }
    });
  };

  const activateOrComplete = () => {
    if (!workingSessionId || !sessionData) return;
    if (sessionData.status === 'active') {
      setCompletionOpen(true);
      return;
    }
    runStudioSave(async () => {
      if (sessionData.status === 'draft') {
        const res = await startAssessmentSession(workingSessionId);
        if (!res.success || res.data?.id !== workingSessionId || res.data.status !== 'active') {
          toast.error(res.error ?? 'Gagal mengaktifkan sesi.');
          return;
        }
        setSessionData(res.data);
        setMode('monitor');
        toast.success('Sesi aktif untuk siswa.');
        return;
      }
    });
  };

  const selesai = liveData?.selesai ?? 0;
  const sedang = liveData?.sedang ?? 0;
  const belum = liveData?.belum ?? 0;
  const rata = liveData?.rata ?? null;
  const total = liveData?.classStudentCount ?? 0;
  const progressPct = total > 0 ? Math.round((selesai / total) * 100) : 0;
  const incidentTotal = (liveData?.roster ?? []).reduce((sum, row) => sum + row.incidentCount, 0);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (
          !open &&
          !saving &&
          !lateReviewTarget &&
          !essayGradingOpen &&
          !bankOpen &&
          !completionOpen &&
          !discardOpen
        ) {
          if (draftDirty) setDiscardOpen(true);
          else onClose();
        }
      }}
    >
      <DialogContent
        className="block max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        {...returnFocus}
        closeDisabled={
          saving ||
          !!lateReviewTarget ||
          essayGradingOpen ||
          bankOpen ||
          completionOpen ||
          discardOpen
        }
        onEscapeKeyDown={(event) => {
          if (saving || lateReviewTarget || essayGradingOpen || bankOpen) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving || lateReviewTarget || essayGradingOpen || bankOpen) event.preventDefault();
        }}
        aria-modal={!lateReviewTarget && !essayGradingOpen && !bankOpen}
        inert={lateReviewTarget || essayGradingOpen || bankOpen ? true : undefined}
        aria-label="Penilaian sesi"
      >
        <div className="flex items-start justify-between gap-3 pr-10">
          <div>
            <DialogTitle className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
              <ClipboardPenLine className="h-5 w-5 text-emerald-600" />
              Penilaian - {session.subject} - {session.className}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[11px] font-semibold text-[#6b8079]">
              {workingSessionId
                ? `Sesi ${sessionData ? learningRecordStatus(sessionData.status) : 'sedang dimuat'}`
                : 'Pilih soal, buat draft, lalu aktifkan untuk siswa.'}
            </DialogDescription>
            {draftDirty && (
              <p role="status" className="mt-1 text-sm font-semibold text-amber-800">
                {draftUncertain ? 'Status simpan belum terkonfirmasi' : 'Draft belum disimpan'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-[#f4f7f5] p-1">
          {(
            [
              ['preview', ClipboardCheck, 'Sesi'],
              ['monitor', Activity, 'Monitor'],
              ['analysis', BarChart3, 'Analisis'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={String(key)}
              ref={key === 'monitor' ? monitorTab : key === 'analysis' ? analysisTab : undefined}
              type="button"
              onClick={() => setMode(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-bold ${mode === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
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
                      disabled={saving || draftUncertain}
                      onClick={() => setStudioStep(key as typeof studioStep)}
                      className={`rounded-md px-2 py-2 text-center text-[11px] font-bold disabled:opacity-50 ${studioStep === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-[#6b8079]'}`}
                    >
                      <span className="mr-1 text-[10px]">{index + 1}</span>
                      {label}
                    </button>
                  ))}
                </div>
                {!session.moduleId && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Belum ada modul LMS untuk kelas-mapel ini. Sesi asesmen dibuat dari modul LMS
                    agar tugas siswa punya konteks pembelajaran.
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
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTab(key as AssessmentStudioTab)}
                          className={`rounded-md px-3 py-2 text-left text-[12px] font-bold ${tab === key ? 'bg-emerald-600 text-white' : 'border border-[#dfe9e4] text-[#355a4e] hover:bg-[#f9fbfa]'}`}
                        >
                          {label}
                          <span className="block text-[10px] font-semibold opacity-80">{desc}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-semibold text-slate-700">
                        <span>Durasi pengerjaan (menit)</span>
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={durationMinutes}
                          onChange={(event) =>
                            setDurationMinutes(
                              event.target.value === ''
                                ? ''
                                : Math.max(1, Math.min(300, Number(event.target.value))),
                            )
                          }
                          className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-semibold text-[#0f2e25]"
                          placeholder="Durasi menit opsional"
                        />
                      </label>
                      <label className="flex items-center justify-center gap-2 rounded-lg border border-[#dfe9e4] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e]">
                        <input
                          type="checkbox"
                          checked={randomizeOrder}
                          onChange={(event) => setRandomizeOrder(event.target.checked)}
                          className="accent-emerald-600"
                        />
                        Acak soal
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudioStep('soal')}
                      disabled={!session.moduleId}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Lanjut ke Soal
                    </button>
                  </section>
                )}

                {studioStep === 'soal' && (
                  <section className="space-y-3 rounded-lg border border-[#dfe9e4] p-3">
                    <button
                      type="button"
                      onClick={() => setBankOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#dfe9e4] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
                    >
                      <Database className="h-4 w-4 text-emerald-600" />
                      Pilih dari Bank Soal ({selectedList.length})
                    </button>
                    <div className="rounded-lg border border-[#dfe9e4]">
                      <div className="border-b border-[#dfe9e4] bg-[#f9fbfa] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">
                        Soal terpilih
                      </div>
                      {selectedList.length === 0 ? (
                        <div className="p-4 text-[12px] font-semibold text-[#9bb0a8]">
                          Belum ada soal dipilih.
                        </div>
                      ) : (
                        selectedList.map((selection, index) => {
                          const question = selectedQuestions.get(selection.questionId);
                          return (
                            <div
                              key={selection.questionId}
                              className="flex items-start justify-between gap-3 border-b border-[#eef4f1] px-3 py-2 last:border-b-0"
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-emerald-700">
                                  #{index + 1} - {question?.type ?? 'soal'} - {selection.points}{' '}
                                  poin
                                </div>
                                {question ? (
                                  <QuestionContent body={question.body} />
                                ) : (
                                  <p className="text-sm text-slate-600">
                                    Rincian soal belum dimuat.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setStudioStep('konteks')}
                        className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-bold text-[#355a4e]"
                      >
                        Kembali
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudioStep('review')}
                        disabled={selectedList.length === 0}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                      >
                        Lanjut Review
                      </button>
                    </div>
                  </section>
                )}

                {studioStep === 'review' && (
                  <section className="space-y-3 rounded-lg border border-[#dfe9e4] p-3">
                    <div className="rounded-lg bg-[#f9fbfa] px-3 py-2 text-[12px] font-bold text-[#0f2e25]">
                      {assessmentConfigFromTab(tab).label} - {selectedList.length} soal -{' '}
                      {selectedList.reduce((sum, item) => sum + item.points, 0)} poin -{' '}
                      {durationMinutes ? `${durationMinutes} menit` : 'tanpa timer'}
                    </div>
                    {missingPreviewCount > 0 && (
                      <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        Rincian {missingPreviewCount} soal belum lengkap. Buka Bank Soal untuk
                        memuatnya kembali sebelum menyimpan draft.
                      </p>
                    )}
                    {draftUncertain && (
                      <p
                        role="status"
                        className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                      >
                        Draf mungkin sudah tersimpan. Pulihkan untuk memeriksa hasil pengaturan ini.
                      </p>
                    )}
                    <AssessmentQuestionPreview questions={previewQuestions} />
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        disabled={saving || draftUncertain}
                        onClick={() => setStudioStep('soal')}
                        className="rounded-lg border border-[#dfe9e4] px-3 py-2 text-[12px] font-bold text-[#355a4e] disabled:opacity-50"
                      >
                        Kembali
                      </button>
                      <button
                        type="button"
                        onClick={createDraft}
                        disabled={
                          saving ||
                          selectedList.length === 0 ||
                          !session.moduleId ||
                          missingPreviewCount > 0
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {draftUncertain ? 'Pulihkan Draft' : 'Buat Draft'}
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
                {sessionLoadError ? (
                  <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p role="alert">{sessionLoadError}</p>
                    <button
                      type="button"
                      onClick={() => setSessionLoadVersion((version) => version + 1)}
                      className="min-h-11 rounded-lg border border-amber-700 px-3 font-semibold"
                    >
                      Muat ulang sesi
                    </button>
                  </div>
                ) : !sessionData ? (
                  <div
                    role="status"
                    className="grid h-24 place-items-center rounded-lg border border-dashed border-[#dfe9e4] text-[12px] font-semibold text-[#6b8079]"
                  >
                    Memuat sesi...
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-800">
                      {sessionData?.title ?? 'Sesi asesmen'} - {sessionData?.questions?.length ?? 0}{' '}
                      soal ·{' '}
                      {sessionData ? learningRecordStatus(sessionData.status) : 'Sedang dimuat'} ·{' '}
                      {sessionData?.gradeTarget
                        ? `Rekap nilai: ${sessionData.gradeTarget.toUpperCase()}`
                        : 'Tidak masuk rekap nilai'}
                    </div>
                    {missingPreviewCount > 0 && (
                      <p role="alert" className="text-sm text-amber-900">
                        Sebagian soal belum dapat dipratinjau. Periksa paket sebelum aktivasi.
                      </p>
                    )}
                    <AssessmentQuestionPreview questions={previewQuestions} />
                    {sessionData &&
                      (sessionData.status === 'draft' || sessionData.status === 'active') && (
                        <button
                          type="button"
                          onClick={activateOrComplete}
                          disabled={
                            saving || (sessionData.status === 'draft' && missingPreviewCount > 0)
                          }
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {sessionData?.status === 'draft'
                            ? 'Aktifkan untuk siswa'
                            : assessmentCompletionLabel(sessionData)}
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
              <div className="rounded-lg border border-[#dfe9e4] p-6 text-center text-[12px] font-semibold text-[#6b8079]">
                Buat atau pilih sesi terlebih dahulu.
              </div>
            ) : liveState !== 'live' || !liveData ? (
              <div
                role="status"
                aria-live="polite"
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
              >
                <p>
                  {liveState === 'closed'
                    ? 'Monitor belum dapat dimuat. Coba sambungkan kembali atau buka Analisis untuk memeriksa hasil tersimpan.'
                    : liveState === 'reconnecting'
                      ? 'Koneksi terputus. Sedang menyambungkan kembali…'
                      : 'Memuat data monitor…'}
                </p>
                {liveState === 'closed' && (
                  <button
                    type="button"
                    onClick={() => setLiveRetry((value) => value + 1)}
                    className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    Sambungkan kembali
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700">
                  Live
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Metric
                    icon={Users}
                    label="Selesai"
                    value={`${selesai}/${total}`}
                    tone="emerald"
                  />
                  <Metric icon={Clock} label="Sedang" value={String(sedang)} tone="sky" />
                  <Metric icon={UserX} label="Belum" value={String(belum)} tone="amber" />
                  <Metric
                    icon={ClipboardCheck}
                    label="Perlu keputusan"
                    value={String(liveData?.pendingLateReview ?? 0)}
                    tone="amber"
                  />
                  <Metric
                    icon={CheckCircle}
                    label="Rata-rata nilai final"
                    value={rata === null ? '—' : String(rata)}
                    tone="slate"
                  />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e6efea]">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {incidentTotal > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {incidentTotal} kejadian koneksi atau perpindahan layar tercatat. Gunakan
                    sebagai bahan pemeriksaan, bukan keputusan otomatis tentang kecurangan.
                  </div>
                )}
                {(liveData?.pendingManualCount ?? pendingEssayCorrections.length) > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-[12px] font-bold text-amber-800">
                      {liveData?.pendingManualCount ?? pendingEssayCorrections.length} jawaban
                      menunggu koreksi guru.
                    </div>
                    <button
                      type="button"
                      onClick={() => loadResults(true)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600"
                    >
                      <ClipboardPenLine className="h-3.5 w-3.5" />
                      Koreksi esai
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-[#dfe9e4]">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[#f9fbfa] text-left text-[10px] uppercase tracking-wide text-[#6b8079]">
                      <tr>
                        <th className="px-3 py-2">Siswa</th>
                        <th className="px-3 py-2">Pengerjaan</th>
                        <th className="px-3 py-2">Koneksi</th>
                        <th className="px-3 py-2">Insiden</th>
                        <th className="px-3 py-2">Nilai</th>
                        <th className="px-3 py-2">Waktu</th>
                        <th className="px-3 py-2">Keputusan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(liveData?.roster ?? []).map((row, index) => (
                        <tr key={index} className="border-t border-[#eef4f1]">
                          <td className="px-3 py-2 font-semibold text-[#0f2e25]">{row.name}</td>
                          <td className="px-3 py-2">{row.status}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
                                row.connectionStatus === 'online' ||
                                row.connectionStatus === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : row.connectionStatus === 'stale' ||
                                      row.connectionStatus === 'connecting'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {connectionLabel(row.connectionStatus)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div
                              className={
                                row.incidentCount > 0
                                  ? 'font-bold text-amber-700'
                                  : 'text-[#6b8079]'
                              }
                            >
                              {row.incidentCount || '-'}
                            </div>
                            {row.lastIncidentType && (
                              <div className="mt-0.5 max-w-[150px] text-[10px] font-semibold text-[#6b8079]">
                                {INCIDENT_LABELS[row.lastIncidentType] ?? 'Kejadian perangkat'}
                                {row.lastIncidentDelayed ? ' (diterima setelah submit)' : ''}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-bold">{row.nilai ?? '—'}</td>
                          <td className="px-3 py-2 text-[#6b8079]">{row.waktu}</td>
                          <td className="px-3 py-2">
                            {row.lateSubmissionStatus === 'pending' ? (
                              <div className="flex min-w-[138px] gap-1.5">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    reviewTrigger.current = event.currentTarget;
                                    setLateReviewTarget({
                                      responseId: row.responseId,
                                      studentName: row.name,
                                      decision: 'accept',
                                    });
                                    setLateReviewNote('');
                                  }}
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"
                                >
                                  Terima
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    reviewTrigger.current = event.currentTarget;
                                    setLateReviewTarget({
                                      responseId: row.responseId,
                                      studentName: row.name,
                                      decision: 'reject',
                                    });
                                    setLateReviewNote('');
                                  }}
                                  className="rounded-md border border-rose-300 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
                                >
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#6b8079]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sessionData?.status === 'active' && (
                  <button
                    type="button"
                    onClick={activateOrComplete}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {assessmentCompletionLabel(sessionData)}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {resultsError && (mode === 'monitor' || mode === 'analysis') && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p role="alert">{resultsError}</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => loadResults(true)}
              className="min-h-11 rounded-lg border border-amber-700 px-3 font-semibold"
            >
              Muat ulang koreksi
            </button>
          </div>
        )}
        {mode === 'analysis' && (
          <div className="mt-4 space-y-3">
            {pendingEssayCorrections.length > 0 && !resultsError && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[12px] font-bold text-amber-800">
                  Analisis belum final: {pendingEssayCorrections.length} jawaban esai perlu dinilai.
                </div>
                <button
                  type="button"
                  onClick={() => loadResults(true)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600"
                >
                  <ClipboardPenLine className="h-3.5 w-3.5" />
                  Buka Koreksi Esai
                </button>
              </div>
            )}
            {workingSessionId ? (
              <SessionAnalysisPanel sessionId={workingSessionId} refreshVersion={analysisVersion} />
            ) : (
              <div className="rounded-lg border border-[#dfe9e4] p-6 text-center text-[12px] font-semibold text-[#6b8079]">
                Analisis tersedia setelah ada sesi.
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {bankOpen && (
        <QuestionBankEditor
          subject={session.subject}
          moduleId={session.moduleId}
          classId={session.classId}
          academicYear={academicYear}
          semester={semester}
          selectable
          selectedPoints={selectedPoints}
          onSelectedPointsChange={changeSelection}
          onQuestionsLoaded={updateSelectedQuestions}
          onClose={() => setBankOpen(false)}
        />
      )}
      {essayGradingOpen && workingSessionId && (
        <EssayGradingModal
          sessionId={workingSessionId}
          questions={essayQuestions}
          responses={essayResponses}
          onClose={() => {
            setGradingResults(null);
            loadResults();
            requestAnimationFrame(() => analysisTab.current?.focus());
          }}
          onSaved={(responseId, questionId) => {
            setResultsData((current) =>
              current
                ? {
                    ...current,
                    essayCorrections: current.essayCorrections.map((item) =>
                      item.responseId === responseId && item.questionId === questionId
                        ? { ...item, status: 'manual_scored' }
                        : item,
                    ),
                  }
                : null,
            );
            setAnalysisVersion((version) => version + 1);
          }}
        />
      )}
      {completionOpen && workingSessionId && (
        <AssessmentCompletionDialog
          key={workingSessionId}
          sessionId={workingSessionId}
          session={sessionData}
          onClose={() => setCompletionOpen(false)}
          onCompleted={(completed) => {
            setSessionData(completed);
            setCompletionOpen(false);
            setMode('analysis');
            setAnalysisVersion((version) => version + 1);
            toast.success(assessmentCompletionMessage(completed));
            requestAnimationFrame(() => analysisTab.current?.focus());
          }}
        />
      )}
      {discardOpen && (
        <AssessmentDiscardDialog
          description={
            draftUncertain
              ? 'Status simpan belum diketahui. Jika keluar, periksa daftar sesi sebelum membuat draf lagi.'
              : 'Pilihan soal dan pengaturan yang belum disimpan akan dibuang jika jendela ini ditutup.'
          }
          onKeepEditing={() => setDiscardOpen(false)}
          onDiscard={onClose}
        />
      )}
      {lateReviewTarget && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !saving) closeLateReview();
          }}
        >
          <DialogContent
            className="z-[80] w-[calc(100%-2rem)] max-w-md p-5"
            closeDisabled={saving}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (saving) event.preventDefault();
            }}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogTitle className="text-base font-extrabold text-[#0f2e25]">
              {lateReviewTarget.decision === 'accept' ? 'Terima' : 'Tolak'} jawaban terlambat
            </DialogTitle>
            <DialogDescription className="text-sm text-[#5f746d]">
              {lateReviewTarget.studentName}. Konfirmasikan secara lisan, lalu catat alasan
              keputusan untuk jejak audit.
            </DialogDescription>
            <label
              className="mt-4 block text-[11px] font-bold text-[#294c41]"
              htmlFor="late-review-note"
            >
              Catatan keputusan
            </label>
            <textarea
              id="late-review-note"
              value={lateReviewNote}
              onChange={(event) => setLateReviewNote(event.target.value)}
              maxLength={500}
              rows={4}
              autoFocus
              disabled={saving}
              className="mt-1 w-full resize-none rounded-lg border border-[#cbdad4] px-3 py-2 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              placeholder="Contoh: koneksi siswa terputus selama ujian dan telah dikonfirmasi setelah sesi."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeLateReview()}
                disabled={saving}
                className="min-h-11 rounded-lg border border-[#cbdad4] px-3 py-2 text-sm font-bold text-[#294c41] focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitLateReview}
                disabled={saving || lateReviewNote.trim().length < 3}
                className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50 ${
                  lateReviewTarget.decision === 'accept'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {saving ? 'Menyimpan...' : 'Simpan keputusan'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: 'emerald' | 'sky' | 'amber' | 'slate';
}) {
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
