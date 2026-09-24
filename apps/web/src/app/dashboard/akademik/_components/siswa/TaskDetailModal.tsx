'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Maximize,
  Save,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import AssessmentTimer from '../AssessmentTimer';
import type { SiswaTugas } from './siswa-types';
import { startAssessmentResponse } from '../../actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  assessmentSubmitPrerequisiteFailure,
  deleteAssessmentDraft,
  deleteAssessmentSignal,
  createAssessmentClientId,
  listAssessmentSignals,
  loadAssessmentDraft,
  prepareAssessmentSignalsForSubmit,
  queueAssessmentSignal,
  saveAssessmentDraft,
  scheduleAssessmentSubmitRetry,
  selectNewestAssessmentDraft,
  type AssessmentRuntimeSignalType,
  type LocalSaveResult,
} from '@/lib/assessment-offline';

interface Props {
  task: SiswaTugas;
  onClose: () => void;
  showToast: (msg: string) => void;
}

type StudentQuestion =
  | {
      id: string;
      type: 'multiple_choice';
      body: string;
      points: number;
      options: Array<{ id: string; text: string }>;
    }
  | {
      id: string;
      type: 'true_false';
      body: string;
      points: number;
    }
  | {
      id: string;
      type: 'matching';
      body: string;
      points: number;
      prompts: Array<{ id: string; prompt: string }>;
      choices: Array<{ id: string; text: string }>;
    }
  | {
      id: string;
      type: 'essay';
      body: string;
      points: number;
      rubricCriteria?: Array<{ id: string; name: string; maxScore: number }>;
    };

type AnswerValue =
  | { type: 'multiple_choice'; optionId: string }
  | { type: 'true_false'; value: boolean }
  | { type: 'matching'; pairs: Record<string, string> }
  | { type: 'essay'; text: string };

interface AttemptState {
  responseId: string;
  startedAt: string;
  durationMinutes: number | null;
  revision: number;
  mutationId: string | null;
  questions: StudentQuestion[];
}

type SaveState = 'idle' | 'saving' | 'server' | 'device' | 'queued' | 'failed';

interface AssessmentRequestResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  retryable?: boolean;
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAttempt(data: unknown): AttemptState | null {
  if (!isRecord(data) || typeof data.responseId !== 'string' || !Array.isArray(data.questions))
    return null;
  const startedAt =
    typeof data.startedAt === 'string'
      ? data.startedAt
      : data.startedAt instanceof Date
        ? data.startedAt.toISOString()
        : null;
  if (!startedAt) return null;
  return {
    responseId: data.responseId,
    startedAt,
    durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : null,
    revision:
      typeof data.revision === 'number' && Number.isInteger(data.revision) ? data.revision : 0,
    mutationId: typeof data.mutationId === 'string' ? data.mutationId : null,
    questions: data.questions.filter(isStudentQuestion),
  };
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

async function postAssessmentRequest(
  sessionId: string,
  action: 'autosave' | 'submit' | 'runtime-signal',
  body: unknown,
  keepalive = false,
): Promise<AssessmentRequestResult> {
  try {
    const response = await fetch(`/api/backend/assessment/sessions/${sessionId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive,
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message =
        isRecord(data) && typeof data.message === 'string'
          ? data.message
          : 'Permintaan ke server gagal.';
      const code = isRecord(data) && typeof data.code === 'string' ? data.code : undefined;
      return { success: false, error: message, retryable: response.status >= 500, code };
    }
    return { success: true, data: isRecord(data) ? data : {} };
  } catch {
    return { success: false, error: 'Koneksi ke server terputus.', retryable: true };
  }
}

function isStudentQuestion(value: unknown): value is StudentQuestion {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.body !== 'string' ||
    typeof value.points !== 'number'
  ) {
    return false;
  }
  if (value.type === 'multiple_choice') {
    return (
      Array.isArray(value.options) &&
      value.options.every(
        (option) =>
          isRecord(option) && typeof option.id === 'string' && typeof option.text === 'string',
      )
    );
  }
  if (value.type === 'true_false') return true;
  if (value.type === 'matching') {
    return (
      Array.isArray(value.prompts) &&
      Array.isArray(value.choices) &&
      value.prompts.every(
        (prompt) =>
          isRecord(prompt) && typeof prompt.id === 'string' && typeof prompt.prompt === 'string',
      ) &&
      value.choices.every(
        (choice) =>
          isRecord(choice) && typeof choice.id === 'string' && typeof choice.text === 'string',
      )
    );
  }
  if (value.type === 'essay') return true;
  return false;
}

function parseAnswers(value: unknown): Record<string, AnswerValue> {
  if (!isRecord(value)) return {};
  const result: Record<string, AnswerValue> = {};
  for (const [questionId, answer] of Object.entries(value)) {
    if (!isRecord(answer) || typeof answer.type !== 'string') continue;
    if (answer.type === 'multiple_choice' && typeof answer.optionId === 'string') {
      result[questionId] = { type: 'multiple_choice', optionId: answer.optionId };
    } else if (answer.type === 'true_false' && typeof answer.value === 'boolean') {
      result[questionId] = { type: 'true_false', value: answer.value };
    } else if (answer.type === 'matching' && isRecord(answer.pairs)) {
      const pairs: Record<string, string> = {};
      for (const [left, right] of Object.entries(answer.pairs)) {
        if (typeof right === 'string') pairs[left] = right;
      }
      result[questionId] = { type: 'matching', pairs };
    } else if (answer.type === 'essay' && typeof answer.text === 'string') {
      result[questionId] = { type: 'essay', text: answer.text };
    }
  }
  return result;
}

function answerProgress(question: StudentQuestion, answers: Record<string, AnswerValue>): boolean {
  const answer = answers[question.id];
  if (!answer || answer.type !== question.type) return false;
  if (question.type === 'multiple_choice' && answer.type === 'multiple_choice')
    return Boolean(answer.optionId);
  if (question.type === 'true_false' && answer.type === 'true_false') return true;
  if (question.type === 'matching' && answer.type === 'matching') {
    return question.prompts.every((prompt) => Boolean(answer.pairs[prompt.id]));
  }
  if (question.type === 'essay' && answer.type === 'essay') return answer.text.trim().length > 0;
  return false;
}

export default function TaskDetailModal({ task, onClose, showToast }: Props) {
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [revision, setRevision] = useState(0);
  const [submittedScore, setSubmittedScore] = useState<number | null>(
    typeof task.score === 'number' ? task.score : null,
  );
  const [submitted, setSubmitted] = useState(
    task.status === 'submitted' || task.status === 'graded',
  );
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [integrityWarning, setIntegrityWarning] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [lateReviewRequired, setLateReviewRequired] = useState(
    task.lateSubmissionStatus === 'pending',
  );
  const [submitRetryAttempt, setSubmitRetryAttempt] = useState(0);
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [busy, startTransition] = useTransition();
  const attemptRef = useRef<AttemptState | null>(null);
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const revisionRef = useRef(0);
  const mutationIdRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef(false);
  const submitRequestedAtRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSignalAtRef = useRef<Record<string, number>>({});
  const submitFlightRef = useRef<Promise<boolean> | null>(null);
  const retryableSubmitRef = useRef(false);

  const answeredCount = useMemo(
    () => attempt?.questions.filter((question) => answerProgress(question, answers)).length ?? 0,
    [answers, attempt?.questions],
  );
  const totalQuestions = attempt?.questions.length ?? 0;
  const currentQuestion = attempt?.questions[currentIndex] ?? null;
  const remedialTerminalStatus =
    task.purpose === 'remedial' &&
    (task.remedialParticipant?.status === 'passed' ||
      task.remedialParticipant?.status === 'needs_retry')
      ? task.remedialParticipant.status
      : null;
  const lateDecisionAttention = lateReviewRequired || task.lateSubmissionStatus === 'rejected';

  const persistDraft = useCallback(
    async (
      nextAnswers: Record<string, AnswerValue>,
      nextRevision: number,
      shouldSubmit: boolean,
      submitRequestedAt: string | null = null,
    ): Promise<LocalSaveResult> => {
      const currentAttempt = attemptRef.current;
      if (!currentAttempt || !task.assessmentSessionId) return 'unavailable';
      const result = await saveAssessmentDraft({
        responseId: currentAttempt.responseId,
        sessionId: task.assessmentSessionId,
        revision: nextRevision,
        mutationId: mutationIdRef.current ?? createAssessmentClientId(),
        answers: nextAnswers,
        pendingSubmit: shouldSubmit,
        submitRequestedAt,
        updatedAt: new Date().toISOString(),
      });
      if (result === 'saved') {
        setSaveState(navigator.onLine ? 'device' : 'queued');
        return result;
      }
      if (result === 'unavailable') setSaveState('failed');
      return result;
    },
    [task.assessmentSessionId],
  );

  const syncDraftToServer = useCallback(async (): Promise<boolean> => {
    const currentAttempt = attemptRef.current;
    if (
      !currentAttempt ||
      !task.assessmentSessionId ||
      pendingSubmitRef.current ||
      !navigator.onLine
    )
      return false;
    setSaveState('saving');
    const result = await postAssessmentRequest(task.assessmentSessionId, 'autosave', {
      answers: answersRef.current,
      revision: revisionRef.current,
      mutationId: mutationIdRef.current ?? createAssessmentClientId(),
    });
    if (!result.success) {
      setSaveState(result.retryable ? 'queued' : 'failed');
      return false;
    }
    if (result.data?.superseded === true) {
      setSaveState('failed');
      setRevisionConflict(true);
      setIntegrityWarning(
        'Jawaban dari tab ini lebih lama daripada versi server. Tutup tab lain dan minta bantuan guru sebelum melanjutkan.',
      );
      return false;
    }
    setSaveState('server');
    return true;
  }, [task.assessmentSessionId]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void syncDraftToServer();
    }, 1_000);
  }, [syncDraftToServer]);

  const setAnswer = (questionId: string, answer: AnswerValue) => {
    if (pendingSubmitRef.current || revisionConflict || submitted) return;
    const nextAnswers = { ...answersRef.current, [questionId]: answer };
    const nextRevision = revisionRef.current + 1;
    const nextMutationId = createAssessmentClientId();
    answersRef.current = nextAnswers;
    revisionRef.current = nextRevision;
    mutationIdRef.current = nextMutationId;
    setAnswers(nextAnswers);
    setRevision(nextRevision);
    void persistDraft(nextAnswers, nextRevision, false);
    scheduleAutosave();
  };

  const flushSignals = useCallback(async (): Promise<boolean> => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt || !task.assessmentSessionId || !navigator.onLine) return false;
    const queued = await listAssessmentSignals(currentAttempt.responseId);
    if (queued.status !== 'ok') {
      setIntegrityWarning(
        'Bukti pengawasan ujian di perangkat tidak dapat dibaca. Jawaban belum dikirim; pulihkan penyimpanan atau minta bantuan guru.',
      );
      return false;
    }
    for (const signal of queued.signals) {
      const result = await postAssessmentRequest(task.assessmentSessionId, 'runtime-signal', {
        eventId: signal.eventId,
        type: signal.type,
        occurredAt: signal.occurredAt,
      });
      if (!result.success) return false;
      if (!(await deleteAssessmentSignal(signal.eventId))) {
        setIntegrityWarning(
          'Bukti pengawasan sudah diterima server, tetapi antrean perangkat belum dapat diperbarui. DIIS akan mencoba lagi sebelum submit.',
        );
        return false;
      }
    }
    setIntegrityWarning(null);
    return true;
  }, [task.assessmentSessionId]);

  const sendRuntimeSignal = useCallback(
    async (
      type: AssessmentRuntimeSignalType,
      options?: { keepalive?: boolean; throttleMs?: number },
    ) => {
      const currentAttempt = attemptRef.current;
      if (!currentAttempt || !task.assessmentSessionId || submitted) return;
      const now = Date.now();
      if (options?.throttleMs && now - (lastSignalAtRef.current[type] ?? 0) < options.throttleMs)
        return;
      lastSignalAtRef.current[type] = now;
      const signal = {
        eventId: createAssessmentClientId(),
        responseId: currentAttempt.responseId,
        sessionId: task.assessmentSessionId,
        type,
        occurredAt: new Date(now).toISOString(),
      };
      if (type !== 'heartbeat') await queueAssessmentSignal(signal);
      if (!navigator.onLine) return;
      const result = await postAssessmentRequest(
        task.assessmentSessionId,
        'runtime-signal',
        {
          eventId: signal.eventId,
          type: signal.type,
          occurredAt: signal.occurredAt,
        },
        options?.keepalive,
      );
      if (result.success && type !== 'heartbeat') await deleteAssessmentSignal(signal.eventId);
    },
    [submitted, task.assessmentSessionId],
  );

  const submitCurrentAnswers = useCallback(async (): Promise<boolean> => {
    if (submitFlightRef.current) return submitFlightRef.current;
    const submission = (async (): Promise<boolean> => {
      const currentAttempt = attemptRef.current;
      if (!currentAttempt || !task.assessmentSessionId || submitted) return false;
      pendingSubmitRef.current = true;
      setPendingSubmit(true);
      const submitRequestedAt = submitRequestedAtRef.current ?? new Date().toISOString();
      submitRequestedAtRef.current = submitRequestedAt;
      const localSave = await persistDraft(
        answersRef.current,
        revisionRef.current,
        true,
        submitRequestedAt,
      );
      if (localSave !== 'saved' && !navigator.onLine) {
        pendingSubmitRef.current = false;
        setPendingSubmit(false);
        setSaveState('failed');
        showToast(
          localSave === 'stale'
            ? 'Draft berubah di tab lain. Tutup tab lain sebelum mencoba kembali.'
            : 'Jawaban masih ada di layar, tetapi belum aman jika aplikasi ditutup. Kosongkan ruang atau pulihkan penyimpanan lalu coba lagi.',
        );
        return false;
      }
      if (!navigator.onLine) {
        retryableSubmitRef.current = true;
        setSaveState('queued');
        showToast('Jawaban aman di perangkat dan akan dikirim saat koneksi kembali.');
        return false;
      }

      setSaveState('saving');
      const queued = await listAssessmentSignals(currentAttempt.responseId);
      if (queued.status !== 'ok') {
        const failure = assessmentSubmitPrerequisiteFailure(localSave, 'queue-read');
        retryableSubmitRef.current = failure.retryable;
        pendingSubmitRef.current = failure.pendingSubmit;
        setPendingSubmit(failure.pendingSubmit);
        if (failure.retryable) setSubmitRetryAttempt((value) => value + 1);
        setSaveState(failure.saveState);
        setIntegrityWarning(failure.warning);
        showToast(failure.toast);
        return false;
      }
      const preparedSignals = await prepareAssessmentSignalsForSubmit(
        queued.signals,
        async (signal) => {
          const delivered = await postAssessmentRequest(
            task.assessmentSessionId!,
            'runtime-signal',
            {
              eventId: signal.eventId,
              type: signal.type,
              occurredAt: signal.occurredAt,
            },
          );
          return delivered.success;
        },
        deleteAssessmentSignal,
      );
      if (preparedSignals.status !== 'ok') {
        const failure = assessmentSubmitPrerequisiteFailure(localSave, 'signal-sync');
        retryableSubmitRef.current = failure.retryable;
        pendingSubmitRef.current = failure.pendingSubmit;
        setPendingSubmit(failure.pendingSubmit);
        if (failure.retryable) setSubmitRetryAttempt((value) => value + 1);
        setSaveState(failure.saveState);
        setIntegrityWarning(failure.warning);
        showToast(failure.toast);
        return false;
      }
      const queuedSignals = preparedSignals.signals;
      const result = await postAssessmentRequest(task.assessmentSessionId, 'submit', {
        answers: answersRef.current,
        revision: revisionRef.current,
        mutationId: mutationIdRef.current ?? createAssessmentClientId(),
        signals: queuedSignals.map(({ eventId, type, occurredAt }) => ({
          eventId,
          type,
          occurredAt,
        })),
      });
      if (!result.success) {
        if (result.code === 'ASSESSMENT_LATE_REVIEW_REQUIRED') {
          await Promise.all(queuedSignals.map((signal) => deleteAssessmentSignal(signal.eventId)));
          retryableSubmitRef.current = false;
          setLateReviewRequired(true);
          setSaveState('failed');
          showToast(
            'Waktu server telah habis. Jawaban tidak dinilai otomatis dan perlu keputusan guru.',
          );
          return false;
        }
        if (localSave !== 'saved') {
          pendingSubmitRef.current = false;
          setPendingSubmit(false);
        }
        retryableSubmitRef.current = result.retryable === true && localSave === 'saved';
        if (retryableSubmitRef.current) setSubmitRetryAttempt((value) => value + 1);
        setSaveState(result.retryable ? 'queued' : 'failed');
        showToast(
          result.retryable && localSave === 'saved'
            ? 'Pengiriman tertunda. DIIS akan mencoba lagi otomatis dengan jeda bertahap.'
            : localSave !== 'saved'
              ? 'Server belum menerima jawaban dan salinan tahan-tutup gagal dibuat. Jawaban masih ada di layar; tekan Kirim lagi.'
              : (result.error ?? 'Jawaban ditolak server. Hubungi guru.'),
        );
        return false;
      }
      await Promise.all(queuedSignals.map((signal) => deleteAssessmentSignal(signal.eventId)));
      await deleteAssessmentDraft(currentAttempt.responseId);
      setIntegrityWarning(null);
      const score = typeof result.data?.score === 'number' ? result.data.score : null;
      const pendingTeacherReview = result.data?.lateSubmissionStatus === 'pending';
      setSubmitted(true);
      setLateReviewRequired(pendingTeacherReview);
      setPendingSubmit(false);
      pendingSubmitRef.current = false;
      submitRequestedAtRef.current = null;
      retryableSubmitRef.current = false;
      setSubmitRetryAttempt(0);
      setSubmittedScore(score);
      setSaveState('server');
      showToast(
        pendingTeacherReview
          ? 'Jawaban terlambat sudah diterima server dan menunggu keputusan guru.'
          : score === null
            ? 'Jawaban terkirim. Esai menunggu penilaian guru.'
            : `Jawaban terkirim. Nilai ${score}.`,
      );
      return true;
    })();
    submitFlightRef.current = submission;
    try {
      return await submission;
    } finally {
      if (submitFlightRef.current === submission) submitFlightRef.current = null;
    }
  }, [persistDraft, showToast, submitted, task.assessmentSessionId]);

  const startAttempt = () => {
    if (!task.assessmentSessionId) return;
    if (!isStandaloneDisplay() && document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    startTransition(async () => {
      const res = await startAssessmentResponse(task.assessmentSessionId!);
      if (!res.success) {
        showToast(res.error ?? 'Gagal membuka asesmen.');
        return;
      }
      const parsed = parseAttempt(res.data);
      if (!parsed) {
        showToast('Respons asesmen tidak valid.');
        return;
      }
      const serverAnswers = parseAnswers(isRecord(res.data) ? res.data.answers : null);
      const localDraft = await loadAssessmentDraft(parsed.responseId);
      const selected = selectNewestAssessmentDraft(
        { answers: serverAnswers, revision: parsed.revision, mutationId: parsed.mutationId },
        localDraft,
      );
      const selectedAnswers = parseAnswers(selected.answers);
      const hydratedAttempt = { ...parsed, revision: selected.revision };
      attemptRef.current = hydratedAttempt;
      answersRef.current = selectedAnswers;
      revisionRef.current = selected.revision;
      mutationIdRef.current = selected.mutationId ?? createAssessmentClientId();
      pendingSubmitRef.current = selected.pendingSubmit;
      submitRequestedAtRef.current = selected.submitRequestedAt;
      setAttempt(hydratedAttempt);
      setCurrentIndex(0);
      setSaveState(selected.source === 'device' ? 'device' : 'server');
      setAnswers(selectedAnswers);
      setRevision(selected.revision);
      setPendingSubmit(selected.pendingSubmit);
      setRevisionConflict(false);
      setLateReviewRequired(false);
      setSubmitted(false);
      showToast(
        selected.source === 'device'
          ? 'Jawaban lokal yang lebih baru dipulihkan.'
          : 'Asesmen siap dikerjakan.',
      );
      await sendRuntimeSignal('heartbeat');
      await flushSignals();
      if (selected.pendingSubmit) await submitCurrentAnswers();
    });
  };

  const saveDraft = () => {
    if (!task.assessmentSessionId || !attempt || submitted) return;
    startTransition(async () => {
      const locallySaved =
        (await persistDraft(answersRef.current, revisionRef.current, false)) === 'saved';
      const serverSaved = await syncDraftToServer();
      showToast(
        serverSaved
          ? 'Jawaban tersimpan di server.'
          : locallySaved
            ? 'Jawaban tersimpan aman di perangkat.'
            : 'Jawaban belum dapat disimpan. Jangan tutup aplikasi.',
      );
    });
  };

  const submitAnswers = useCallback(
    (options?: { skipConfirm?: boolean }) => {
      if (!task.assessmentSessionId || !attempt || submitted) return;
      const unanswered = attempt.questions.length - answeredCount;
      if (!options?.skipConfirm && unanswered > 0) {
        setConfirmUnanswered(true);
        return;
      }
      startTransition(async () => {
        await submitCurrentAnswers();
      });
    },
    [answeredCount, attempt, submitCurrentAnswers, submitted, task.assessmentSessionId],
  );

  const handleExpire = useCallback(() => {
    if (!submitted) {
      showToast(
        navigator.onLine
          ? 'Waktu habis. Jawaban dikirim otomatis.'
          : 'Waktu habis. DIIS sedang mencoba menyimpan jawaban di perangkat.',
      );
      submitAnswers({ skipConfirm: true });
    }
  }, [showToast, submitAnswers, submitted]);

  const requestExamDisplay = useCallback(() => {
    if (isStandaloneDisplay() || !document.fullscreenEnabled || document.fullscreenElement) {
      setIntegrityWarning(null);
      return;
    }
    void document.documentElement
      .requestFullscreen()
      .then(() => {
        setIntegrityWarning(null);
      })
      .catch(() => {
        setIntegrityWarning(
          'Mode layar penuh tidak dapat diaktifkan. Insiden tetap tercatat untuk guru.',
        );
      });
  }, []);

  const handleClose = useCallback(() => {
    if (attemptRef.current && !submitted) {
      void sendRuntimeSignal('exit_attempt');
      setIntegrityWarning(
        'Keluar dari layar ujian tidak menutup sesi. Kejadian ini sudah dicatat dan terlihat oleh guru.',
      );
      return;
    }
    onClose();
  }, [onClose, sendRuntimeSignal, submitted]);

  useEffect(() => {
    if (!attempt || submitted) return;
    const heartbeat = setInterval(() => {
      void sendRuntimeSignal('heartbeat');
    }, 15_000);
    const onOnline = () => {
      setOnline(true);
      void sendRuntimeSignal('online');
      void flushSignals().then(async () => {
        if (pendingSubmitRef.current && retryableSubmitRef.current) {
          await submitCurrentAnswers();
        } else await syncDraftToServer();
      });
    };
    const onOffline = () => {
      setOnline(false);
      setSaveState('queued');
      void sendRuntimeSignal('offline');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void sendRuntimeSignal('visibility_hidden', { keepalive: true, throttleMs: 2_000 });
      } else if (!isStandaloneDisplay() && !document.fullscreenElement) {
        setIntegrityWarning('Anda meninggalkan layar ujian. Kejadian ini dicatat untuk guru.');
      }
    };
    const onFullscreen = () => {
      if (!isStandaloneDisplay() && !document.fullscreenElement) {
        void sendRuntimeSignal('fullscreen_exit', { throttleMs: 2_000 });
        setIntegrityWarning('Mode layar penuh berakhir. Kembali ke mode ujian untuk melanjutkan.');
      }
    };
    const onBlur = () => {
      void sendRuntimeSignal('window_blur', { throttleMs: 3_000 });
    };
    const onPageHide = () => {
      void sendRuntimeSignal('pagehide', { keepalive: true, throttleMs: 2_000 });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [
    attempt,
    flushSignals,
    sendRuntimeSignal,
    submitted,
    submitCurrentAnswers,
    syncDraftToServer,
  ]);

  useEffect(() => {
    if (
      !attempt ||
      submitted ||
      lateReviewRequired ||
      !pendingSubmit ||
      !online ||
      !retryableSubmitRef.current ||
      submitRetryAttempt < 1
    ) {
      return;
    }
    const timer = scheduleAssessmentSubmitRetry(submitRetryAttempt, () => {
      void submitCurrentAnswers();
    });
    return () => clearTimeout(timer);
  }, [
    attempt,
    lateReviewRequired,
    online,
    pendingSubmit,
    submitCurrentAnswers,
    submitRetryAttempt,
    submitted,
  ]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detail tugas"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
              {task.mp} - {task.type}
            </div>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--text)]">{task.title}</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {task.guru} - Deadline {task.deadline}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!task.assessmentSessionId ? (
          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-sm font-bold text-[var(--text)]">Tugas LMS</div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {task.desc || 'Tugas ini belum berupa asesmen interaktif.'}
                </p>
              </div>
            </div>
          </div>
        ) : remedialTerminalStatus ? (
          <div
            className={`mt-5 rounded-xl border p-4 ${
              remedialTerminalStatus === 'passed'
                ? 'border-emerald-500/25 bg-emerald-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}
          >
            <div className="flex items-start gap-3">
              {remedialTerminalStatus === 'passed' ? (
                <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
              )}
              <div>
                <div
                  className={`text-sm font-bold ${
                    remedialTerminalStatus === 'passed' ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {remedialTerminalStatus === 'passed'
                    ? 'Remedial tuntas'
                    : 'Perlu percobaan berikutnya'}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {remedialTerminalStatus === 'passed'
                    ? 'Guru telah memfinalisasi remedial ini sebagai tuntas.'
                    : 'Percobaan ini belum tuntas. Tunggu penugasan remedial berikutnya dari guru.'}
                </p>
              </div>
            </div>
          </div>
        ) : submitted ? (
          <div
            className={`mt-5 rounded-xl border p-4 ${
              lateDecisionAttention
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-emerald-500/25 bg-emerald-500/10'
            }`}
          >
            <div className="flex items-start gap-3">
              {lateDecisionAttention ? (
                <Clock className="mt-0.5 h-5 w-5 text-amber-500" />
              ) : (
                <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
              )}
              <div>
                <div
                  className={`text-sm font-bold ${
                    lateDecisionAttention ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  {task.lateSubmissionStatus === 'rejected'
                    ? 'Jawaban terlambat ditolak'
                    : lateReviewRequired
                      ? 'Menunggu keputusan guru'
                      : 'Jawaban sudah terkirim'}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {task.lateSubmissionStatus === 'rejected'
                    ? 'Guru telah menolak jawaban yang masuk setelah batas waktu. Hubungi guru bila Anda memerlukan penjelasan.'
                    : lateReviewRequired
                      ? 'Jawaban telah diterima server setelah batas waktu dan belum dinilai. Guru akan mengonfirmasi alasan keterlambatan sebelum menerima atau menolak.'
                      : submittedScore === null
                        ? 'Nilai akhir menunggu penilaian guru.'
                        : `Nilai sementara: ${submittedScore}`}
                </p>
              </div>
            </div>
          </div>
        ) : !attempt ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              Mulai asesmen dari tombol ini. Timer, urutan soal, dan resume jawaban mengikuti data
              server.
            </div>
            <button
              type="button"
              onClick={startAttempt}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Mulai / lanjutkan asesmen
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {integrityWarning && (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
                role="alert"
              >
                <div className="flex items-start gap-2 text-xs font-semibold text-amber-600">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{integrityWarning}</span>
                </div>
                {!isStandaloneDisplay() && document.fullscreenEnabled && (
                  <button
                    type="button"
                    onClick={requestExamDisplay}
                    className="shrink-0 rounded-lg bg-amber-500 p-2 text-white"
                    title="Kembali ke layar penuh"
                    aria-label="Kembali ke layar penuh"
                  >
                    <Maximize className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
                {online ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                )}
                Terjawab {answeredCount}/{totalQuestions}
              </div>
              <div className="text-xs font-bold text-[var(--muted)]">
                {saveState === 'saving' && 'Menyimpan...'}
                {saveState === 'server' && `Tersimpan di server · v${revision}`}
                {saveState === 'device' && `Tersimpan di perangkat · v${revision}`}
                {saveState === 'queued' && `Menunggu koneksi · v${revision}`}
                {saveState === 'failed' && 'Penyimpanan perlu perhatian'}
              </div>
              {attempt.durationMinutes && (
                <AssessmentTimer
                  durationMinutes={attempt.durationMinutes}
                  startedAt={attempt.startedAt}
                  onExpire={handleExpire}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {attempt.questions.map((question, index) => {
                const answered = answerProgress(question, answers);
                const active = index === currentIndex;
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-9 w-9 rounded-lg border text-xs font-extrabold ${
                      active
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : answered
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                          : 'border-[var(--border)] text-[var(--muted)]'
                    }`}
                    aria-label={`Soal ${index + 1}${answered ? ' terjawab' : ' belum terjawab'}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            {currentQuestion && (
              <article
                key={currentQuestion.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
                  Soal {currentIndex + 1} dari {totalQuestions} - {currentQuestion.points} poin
                </div>
                <p className="text-sm font-bold leading-relaxed text-[var(--text)]">
                  {currentQuestion.body}
                </p>
                <QuestionAnswerInput
                  question={currentQuestion}
                  answers={answers}
                  setAnswer={setAnswer}
                  locked={pendingSubmit || revisionConflict}
                />
              </article>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                disabled={currentIndex === 0}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.min(totalQuestions - 1, index + 1))}
                disabled={currentIndex >= totalQuestions - 1}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>

            <div className="sticky bottom-0 grid gap-2 border-t border-[var(--border)] bg-[var(--bg2)] pt-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={busy || pendingSubmit || revisionConflict}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-extrabold text-[var(--text)] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan sementara
              </button>
              <button
                type="button"
                onClick={() => submitAnswers()}
                disabled={busy || pendingSubmit || revisionConflict}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim jawaban
              </button>
            </div>

            {answeredCount < totalQuestions && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-semibold text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Masih ada soal yang belum terjawab. Sistem tetap mengizinkan simpan sementara; kirim
                jawaban saat sudah siap.
              </div>
            )}
            {pendingSubmit && !submitted && (
              <div
                className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs font-semibold text-sky-600"
                role="status"
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                {lateReviewRequired
                  ? 'Waktu server telah habis. Jawaban tetap terkunci di perangkat dan menunggu keputusan guru; belum dinilai atau dinyatakan terkirim.'
                  : 'Jawaban telah tersimpan dan dikunci di perangkat. DIIS sedang menunggu konfirmasi server; jangan hapus data aplikasi sampai status berubah menjadi terkirim.'}
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmUnanswered}
        onOpenChange={setConfirmUnanswered}
        title="Kirim jawaban belum lengkap?"
        description={`${Math.max(0, totalQuestions - answeredCount)} soal belum terjawab. Jawaban akan dikirim apa adanya dan tidak dapat dilengkapi setelah terkirim.`}
        confirmLabel="Tetap kirim"
        variant="warning"
        onConfirm={() => {
          setConfirmUnanswered(false);
          submitAnswers({ skipConfirm: true });
          return true;
        }}
      />
    </div>
  );
}

function QuestionAnswerInput({
  question,
  answers,
  setAnswer,
  locked,
}: {
  question: StudentQuestion;
  answers: Record<string, AnswerValue>;
  setAnswer: (questionId: string, answer: AnswerValue) => void;
  locked: boolean;
}) {
  const current = answers[question.id];

  if (question.type === 'multiple_choice') {
    return (
      <div className="mt-3 space-y-2">
        {question.options.map((option) => {
          const selected = current?.type === 'multiple_choice' && current.optionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              onClick={() =>
                setAnswer(question.id, { type: 'multiple_choice', optionId: option.id })
              }
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${selected ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--border2)]'}`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'true_false') {
    const value = current?.type === 'true_false' ? current.value : null;
    return (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            [true, 'Benar'],
            [false, 'Salah'],
          ] as const
        ).map(([choice, label]) => (
          <button
            key={String(choice)}
            type="button"
            disabled={locked}
            onClick={() => setAnswer(question.id, { type: 'true_false', value: choice })}
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${value === choice ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--border2)]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === 'matching') {
    const pairs = current?.type === 'matching' ? current.pairs : {};
    return (
      <div className="mt-3 space-y-2">
        {question.prompts.map((prompt) => (
          <label key={prompt.id} className="block rounded-xl border border-[var(--border)] p-3">
            <span className="text-xs font-bold text-[var(--muted)]">{prompt.prompt}</span>
            <select
              value={pairs[prompt.id] ?? ''}
              disabled={locked}
              onChange={(event) =>
                setAnswer(question.id, {
                  type: 'matching',
                  pairs: { ...pairs, [prompt.id]: event.target.value },
                })
              }
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              <option value="">Pilih pasangan</option>
              {question.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  const text = current?.type === 'essay' ? current.text : '';
  return (
    <div className="mt-3 space-y-2">
      {question.rubricCriteria && question.rubricCriteria.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
            Rubrik
          </div>
          <ul className="mt-2 space-y-1 text-xs font-semibold text-[var(--muted)]">
            {question.rubricCriteria.map((criterion) => (
              <li key={criterion.id}>
                {criterion.name} - maks {criterion.maxScore}
              </li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={text}
        disabled={locked}
        onChange={(event) => setAnswer(question.id, { type: 'essay', text: event.target.value })}
        rows={5}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
        placeholder="Tulis jawaban esai..."
      />
    </div>
  );
}
