'use client';

import { AssessmentPhotoActivity } from '@/lib/assessment-photo-activity';
import { useAssessmentPhotoQueue } from '@/lib/use-assessment-photo-queue';
import { MAX_ESSAY_PHOTOS, readEssayDocument } from '@smk/types';
import QuestionContent from '@/components/learning/QuestionContent';
import QuestionAnswerInput, {
  type StudentQuestion,
  type AnswerValue,
} from '@/components/learning/QuestionAnswerInput';
import { useLearningRefreshPause } from '@/lib/learning-refresh';
import { AssessmentAutosaveWindow } from '@/lib/assessment-autosave-window';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Maximize,
  PartyPopper,
  Save,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import AssessmentTimer from '../AssessmentTimer';
import { getAssessmentDeviceId } from '@/lib/assessment-device';
import type { SiswaTugas } from './siswa-types';
import { formatExamTime, getScheduledEntry, readScheduledExamStatus } from '@/lib/scheduled-exam-entry';
import { startAssessmentResponse } from '../../actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  assessmentSubmitPrerequisiteFailure,
  deleteAssessmentDraft,
  deleteAssessmentSignal,
  createAssessmentClientId,
  listAssessmentSignals,
  listAssessmentPhotos,
  deleteAssessmentPhoto,
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
  onOpenModule?: (moduleUuid: string) => void;
}

interface AttemptState {
  responseId: string;
  startedAt: string;
  durationMinutes: number | null;
  deadlineAt?: string;
  serverNow?: string;
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
    deadlineAt: typeof data.deadlineAt === 'string' ? data.deadlineAt : undefined,
    serverNow: typeof data.serverNow === 'string' ? data.serverNow : undefined,
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
  body: Record<string, unknown>,
  keepalive = false,
): Promise<AssessmentRequestResult> {
  try {
    const response = await fetch(`/api/backend/assessment/sessions/${sessionId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'runtime-signal' ? body : { ...body, deviceId: getAssessmentDeviceId() }),
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
      return {
        success: false,
        error: message,
        retryable: response.status === 429 || response.status >= 500,
        code,
      };
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
      const document = readEssayDocument(answer.document);
      const photoIds = Array.isArray(answer.photoIds)
        ? answer.photoIds.filter((id): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)).slice(0, MAX_ESSAY_PHOTOS)
        : [];
      result[questionId] = { type: 'essay', text: answer.text, ...(document ? { document } : {}),
        ...(photoIds.length ? { photoIds } : {}) };
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
  if (question.type === 'essay' && answer.type === 'essay') return answer.text.trim().length > 0 || Boolean(answer.photoIds?.length);
  return false;
}

export default function TaskDetailModal({ task, onClose, showToast, onOpenModule }: Props) {
  const pauseRefresh = useLearningRefreshPause();
  const mountedRef = useRef(true);
  // Keep the current form/draft in place; polling resumes when this dialog exits.
  useEffect(() => {
    mountedRef.current = true;
    pauseRefresh?.(true);
    return () => {
      mountedRef.current = false;
      pauseRefresh?.(false);
    };
  }, [pauseRefresh]);
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
  const [examExpired, setExamExpired] = useState(false);
  const examExpiredRef = useRef(false);
  const [serverTime, setServerTime] = useState<number | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<
    (NonNullable<ReturnType<typeof readScheduledExamStatus>> & { receivedAt: number }) | null
  >(null);
  const [lateRejected, setLateRejected] = useState(task.lateSubmissionStatus === 'rejected');
  const [scheduleReadError, setScheduleReadError] = useState(false);
  const [scheduleRetry, setScheduleRetry] = useState(0);
  const entry = getScheduledEntry(task, serverTime, scheduleStatus);
  const canResumeExpiredAttempt = examExpired && entry.allowed && entry.resume === true;
  const statusRequestRef = useRef<AbortController | null>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const focusResumeRef = useRef(false);
  const [examStatusBusy, setExamStatusBusy] = useState(false);
  const [examStatusMessage, setExamStatusMessage] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [integrityWarning, setIntegrityWarning] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [lateReviewRequired, setLateReviewRequired] = useState(
    task.lateSubmissionStatus === 'pending',
  );
  const [submitRetryAttempt, setSubmitRetryAttempt] = useState(0);
  const [autosaveRetryAttempt, setAutosaveRetryAttempt] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const questionHeading = useRef<HTMLDivElement>(null);
  const returnToQuestion = useRef(false);
  const remainingSeconds = useRef<number | null>(null);
  const submitTrigger = useRef<HTMLButtonElement>(null);
  const trackReviewTime = (seconds: number) => {
    remainingSeconds.current = seconds;
    if (reviewing) setReviewSeconds(seconds);
  };
  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
    else if (returnToQuestion.current) {
      returnToQuestion.current = false;
      questionHeading.current?.focus();
    }
  }, [reviewing]);
  const [busy, startTransition] = useTransition();
  const attemptRef = useRef<AttemptState | null>(null);
  const photoActivity = useMemo(() => new AssessmentPhotoActivity(), []);
  const startPhotoPicker = useCallback(() => photoActivity.begin(), [photoActivity]);
  const finishPhotoPicker = useCallback(() => photoActivity.complete(), [photoActivity]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const answersRef = useRef<Record<string, AnswerValue>>({});
  const revisionRef = useRef(0);
  const mutationIdRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef(false);
  const finishedRef = useRef(false);
  const submitRequestedAtRef = useRef<string | null>(null);
  const autosaveWindow = useMemo(() => new AssessmentAutosaveWindow(), []);
  const lastSignalAtRef = useRef<Record<string, number>>({});
  const submitFlightRef = useRef<Promise<boolean> | null>(null);
  const autosaveFlightRef = useRef<Promise<boolean> | null>(null);
  const retryableSubmitRef = useRef(false);

  const answeredCount = useMemo(
    () => attempt?.questions.filter((question) => answerProgress(question, answers)).length ?? 0,
    [answers, attempt?.questions],
  );
  const totalQuestions = attempt?.questions.length ?? 0;
  const emptyQuestions = useMemo(() => attempt?.questions.flatMap((question, index) =>
    answerProgress(question, answers) ? [] : [index]) ?? [], [attempt?.questions, answers]);
  const reviewTime = reviewSeconds === null ? '—'
    : `${Math.floor(reviewSeconds / 60)} menit ${reviewSeconds % 60} detik`;
  const syncSummary = saveState === 'server' ? 'Tersimpan di server'
    : saveState === 'saving' ? 'Sedang menyimpan'
      : saveState === 'failed' ? 'Penyimpanan perlu perhatian'
        : saveState === 'idle' ? 'Belum ada perubahan baru'
          : 'Menunggu sinkronisasi server';
  function openReview() {
    setReviewSeconds(remainingSeconds.current);
    setReviewing(true);
  }
  function goToQuestion(index: number) {
    if (reviewing) returnToQuestion.current = true;
    setReviewing(false);
    setCurrentIndex(index);
  }
  const currentQuestion = attempt?.questions[currentIndex] ?? null;
  const remedialTerminalStatus =
    task.purpose === 'remedial' &&
    (task.remedialParticipant?.status === 'passed' ||
      task.remedialParticipant?.status === 'needs_retry')
      ? task.remedialParticipant.status
      : null;
  const lateDecisionAttention = lateReviewRequired || lateRejected;

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

  const syncDraftToServer: () => Promise<boolean> = useCallback(async (): Promise<boolean> => {
    if (autosaveFlightRef.current) return autosaveFlightRef.current;
    const flight = (async (): Promise<boolean> => {
      const currentAttempt = attemptRef.current;
      if (
        !currentAttempt ||
        !task.assessmentSessionId ||
        pendingSubmitRef.current ||
        finishedRef.current ||
        !mountedRef.current ||
        !navigator.onLine
      )
        return false;
      setSaveState('saving');
      const sentRevision = revisionRef.current;
      autosaveWindow.markStarted();
      const result = await postAssessmentRequest(task.assessmentSessionId, 'autosave', {
        answers: answersRef.current,
        revision: sentRevision,
        mutationId: mutationIdRef.current ?? createAssessmentClientId(),
      });
      // A final submit can overtake this older revision. Backend CAS protects
      // persistence; do not let the older response undo the final UI state.
      if (pendingSubmitRef.current || finishedRef.current || !mountedRef.current)
        return result.success;
      if (!result.success) {
        setSaveState(result.retryable ? 'queued' : 'failed');
        if (result.retryable) setAutosaveRetryAttempt((value) => value + 1);
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
      const latestSaved = revisionRef.current === sentRevision;
      setSaveState(latestSaved ? 'server' : 'device');
      // A newer edit after a successful save is not a failed transport. Keep it
      // in the next send window instead of growing exponential failure backoff.
      setAutosaveRetryAttempt(0);
      if (!latestSaved)
        autosaveWindow.retry(() => {
          void syncDraftToServer();
        }, 0);
      return latestSaved;
    })();
    autosaveFlightRef.current = flight;
    try {
      return await flight;
    } finally {
      if (autosaveFlightRef.current === flight) autosaveFlightRef.current = null;
    }
  }, [autosaveWindow, task.assessmentSessionId]);

  const scheduleAutosave = useCallback(() => {
    autosaveWindow.schedule(() => {
      void syncDraftToServer();
    });
  }, [autosaveWindow, syncDraftToServer]);

  const setAnswer = (questionId: string, answer: AnswerValue, updatePhoto = false) => {
    if (pendingSubmitRef.current || revisionConflict || submitted || examExpiredRef.current || !mountedRef.current)
      return Promise.resolve<LocalSaveResult>('unavailable');
    const previous = answersRef.current[questionId];
    const next = !updatePhoto && answer.type === 'essay' && previous?.type === 'essay' && previous.photoIds?.length
      ? { ...answer, photoIds: previous.photoIds } : answer;
    const nextAnswers = { ...answersRef.current, [questionId]: next };
    const nextRevision = revisionRef.current + 1;
    const nextMutationId = createAssessmentClientId();
    answersRef.current = nextAnswers;
    revisionRef.current = nextRevision;
    mutationIdRef.current = nextMutationId;
    setAnswers(nextAnswers);
    setRevision(nextRevision);
    const saved = persistDraft(nextAnswers, nextRevision, false);
    scheduleAutosave();
    return saved;
  };

  const applyPhoto = async (questionId: string, id: string, remove: boolean) => {
    const previous = answersRef.current[questionId];
    const answer = previous?.type === 'essay' ? previous : { type: 'essay' as const, text: '' };
    const old = answer.photoIds ?? [];
    if (!remove && old.length >= MAX_ESSAY_PHOTOS && !old.includes(id)) return false;
    const photoIds = remove ? old.filter((value) => value !== id) : [...new Set([...old, id])];
    const result = await setAnswer(questionId, { ...answer, photoIds }, true);
    return result === 'saved' || (result === 'stale' &&
      (answersRef.current[questionId]?.type === 'essay' && answersRef.current[questionId].photoIds?.includes(id) === !remove));
  };

  const photoQueue = useAssessmentPhotoQueue({
    sessionId: task.assessmentSessionId,
    responseId: attempt?.questions.some((question) => question.type === 'essay' && question.allowAnswerPhotos)
      ? attempt.responseId : undefined,
    disabled: submitted || pendingSubmit || revisionConflict || examExpired,
    canEdit: (responseId) => mountedRef.current && !pendingSubmitRef.current &&
      !finishedRef.current && !examExpiredRef.current && attemptRef.current?.responseId === responseId,
    isAttached: (questionId, id) => {
      const answer = answersRef.current[questionId];
      return answer?.type === 'essay' && Boolean(answer.photoIds?.includes(id));
    },
    attach: (questionId, id) => applyPhoto(questionId, id, false),
  });
  const { isBusy: isPhotoQueueBusy } = photoQueue;
  const offscreenPhoto = photoQueue.pending.find(({ questionId }) => questionId !== currentQuestion?.id);
  const pendingPhotoIndex = offscreenPhoto && attempt
    ? attempt.questions.findIndex(({ id }) => id === offscreenPhoto.questionId) : -1;

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
      if (!currentAttempt || !task.assessmentSessionId || submitted || examExpiredRef.current) return false;
      if (!pendingSubmitRef.current && currentAttempt.questions.some((q) => q.type === 'essay' && q.allowAnswerPhotos)) {
        const photos = await listAssessmentPhotos(currentAttempt.responseId);
        const waiting = photos?.some(({ questionId, id }) => {
          const answer = answersRef.current[questionId];
          return answer?.type !== 'essay' || !answer.photoIds?.includes(id);
        });
        if (isPhotoQueueBusy() || photoActivity.awaitingResult() || photos === null || waiting) {
          showToast('Periksa foto yang belum terlampir. Kirim ulang atau hapus dari antrean sebelum mengirim jawaban.');
          return false;
        }
        if (examExpiredRef.current || finishedRef.current || !mountedRef.current) return false;
      }
      autosaveWindow.cancel();
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
      if (currentAttempt.questions.some((q) => q.type === 'essay' && q.allowAnswerPhotos)) {
        const photos = await listAssessmentPhotos(currentAttempt.responseId);
        if (photos) await Promise.all(photos.map(({ id }) => deleteAssessmentPhoto(id)));
      }
      setIntegrityWarning(null);
      const score = typeof result.data?.score === 'number' ? result.data.score : null;
      const pendingTeacherReview = result.data?.lateSubmissionStatus === 'pending';
      finishedRef.current = true;
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
  }, [autosaveWindow, isPhotoQueueBusy, persistDraft, photoActivity, showToast, submitted, task.assessmentSessionId]);

  const startAttempt = () => {
    if (!task.assessmentSessionId ||
      ((!attempt || examExpiredRef.current) && (!entry.allowed || scheduleReadError || examStatusBusy))) return;
    if (!isStandaloneDisplay() && document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    startTransition(async () => {
      const deviceId = getAssessmentDeviceId();
      let res = await startAssessmentResponse(task.assessmentSessionId!, deviceId);
      // Only explicit admission rejection proves that this request did not
      // execute. Do not blindly replay network/unknown mutation failures.
      for (
        let retry = 0;
        retry < 2 && !res.success && res.errorCode === 'ASSESSMENT_WRITE_BUSY';
        retry++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
        if (!mountedRef.current) return;
        res = await startAssessmentResponse(task.assessmentSessionId!, deviceId);
      }
      if (!mountedRef.current) return;
      if (!res.success) {
        if (res.errorCode === 'EXAM_DEVICE_CHANGED' && deviceId) {
          setIntegrityWarning(`Tunjukkan kode perangkat ini kepada Proktor: ${deviceId}. Jika pemindahan gagal atau tidak tersedia, hubungi Super Admin melalui Panitia.`);
        }
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
      setScheduleStatus(null);
      examExpiredRef.current = false;
      setExamExpired(false);
      setExamStatusMessage('');
      setCurrentIndex(0);
      setReviewing(false);
      setConfirmSubmit(false);
      setSaveState(selected.source === 'device' ? 'device' : 'server');
      setAnswers(selectedAnswers);
      setRevision(selected.revision);
      setPendingSubmit(selected.pendingSubmit);
      setRevisionConflict(false);
      setLateReviewRequired(false);
      finishedRef.current = false;
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
    autosaveWindow.cancel();
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
      if (!options?.skipConfirm) {
        setConfirmSubmit(true);
        return;
      }
      startTransition(async () => {
        await submitCurrentAnswers();
      });
    },
    [attempt, submitCurrentAnswers, submitted, task.assessmentSessionId],
  );

  const handleExpire = useCallback(() => {
    setConfirmSubmit(false);
    setReviewing(false);
    if (attemptRef.current?.deadlineAt) {
      examExpiredRef.current = true;
      autosaveWindow.cancel();
      setExamExpired(true);
      return;
    }
    if (!submitted) {
      showToast(
        navigator.onLine
          ? 'Waktu habis. Jawaban dikirim otomatis.'
          : 'Waktu habis. DIIS sedang mencoba menyimpan jawaban di perangkat.',
      );
      submitAnswers({ skipConfirm: true });
    }
  }, [autosaveWindow, showToast, submitAnswers, submitted]);

  const refreshScheduledStatus = useCallback(async (manual = false) => {
    if (!task.assessmentSessionId) return;
    statusRequestRef.current?.abort();
    const controller = new AbortController();
    statusRequestRef.current = controller;
    setExamStatusBusy(manual);
    setExamStatusMessage('');
    try {
      const response = await fetch(`/api/backend/exam-schedule/${task.assessmentSessionId}/my-status`, {
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Status belum dapat diperiksa. Coba lagi saat tersambung.');
      const status = readScheduledExamStatus(await response.json());
      if (!status) throw new Error('Status belum dapat diperiksa. Coba lagi.');
      if (controller.signal.aborted) return;
      setScheduleStatus({ ...status, receivedAt: performance.now() });
      setServerTime(status.serverTime);
      setScheduleReadError(false);
      if (status.state === 'submitted') {
        finishedRef.current = true;
        setSubmittedScore(status.score);
        setLateReviewRequired(status.lateSubmissionStatus === 'pending');
        setLateRejected(status.lateSubmissionStatus === 'rejected');
        setSubmitted(true);
      } else if (manual && status.state === 'expired') {
        setExamStatusMessage('Jawaban terakhir yang dikonfirmasi sedang diselesaikan oleh server.');
      } else if (manual && status.deadline !== null && status.serverTime < status.deadline) {
        focusResumeRef.current = true;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setScheduleReadError(true);
      if (manual) setExamStatusMessage(error instanceof Error ? error.message : 'Status belum tersedia.');
    } finally {
      if (!controller.signal.aborted) setExamStatusBusy(false);
    }
  }, [task.assessmentSessionId]);

  useEffect(() => {
    if (!task.examSchedule || !task.assessmentSessionId || submitted || attempt) return;
    const returnToTab = () => {
      if (document.visibilityState === 'visible') void refreshScheduledStatus();
      else {
        statusRequestRef.current?.abort();
        setExamStatusBusy(false);
      }
    };
    const onOffline = () => {
      statusRequestRef.current?.abort();
      setExamStatusBusy(false);
      setScheduleReadError(true);
    };
    void refreshScheduledStatus();
    document.addEventListener('visibilitychange', returnToTab);
    window.addEventListener('online', returnToTab);
    window.addEventListener('offline', onOffline);
    return () => {
      statusRequestRef.current?.abort();
      document.removeEventListener('visibilitychange', returnToTab);
      window.removeEventListener('online', returnToTab);
      window.removeEventListener('offline', onOffline);
    };
  }, [task.examSchedule, task.assessmentSessionId, submitted, attempt, scheduleRetry, refreshScheduledStatus]);

  useEffect(() => () => statusRequestRef.current?.abort(), [task.assessmentSessionId]);

  useEffect(() => {
    if (!scheduleStatus || submitted || (attempt && !examExpired)) return;
    const timer = setInterval(() => {
      setServerTime(scheduleStatus.serverTime + performance.now() - scheduleStatus.receivedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [scheduleStatus, submitted, attempt, examExpired]);

  useEffect(() => {
    if (!focusResumeRef.current || !entry.allowed || !entry.resume) return;
    focusResumeRef.current = false;
    resumeButtonRef.current?.focus();
  }, [entry.allowed, entry.resume]);

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
        } else {
          autosaveWindow.retry(() => {
            void syncDraftToServer();
          }, 0);
        }
      });
    };
    const onOffline = () => {
      setOnline(false);
      setSaveState('queued');
      void sendRuntimeSignal('offline');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const send = () => { void sendRuntimeSignal('visibility_hidden', { keepalive: true, throttleMs: 2_000 }); };
        if (!photoActivity.hold('visibility_hidden', send)) send();
      } else if (!photoActivity.inProgress() && !isStandaloneDisplay() && !document.fullscreenElement) {
        setIntegrityWarning('Anda meninggalkan layar ujian. Kejadian ini dicatat untuk guru.');
      }
    };
    const onFullscreen = () => {
      if (!isStandaloneDisplay() && !document.fullscreenElement) {
        const send = () => { void sendRuntimeSignal('fullscreen_exit', { throttleMs: 2_000 }); };
        if (!photoActivity.hold('fullscreen_exit', send)) {
          send();
          setIntegrityWarning('Mode layar penuh berakhir. Kembali ke mode ujian untuk melanjutkan.');
        }
      }
    };
    const onBlur = () => {
      const send = () => { void sendRuntimeSignal('window_blur', { throttleMs: 3_000 }); };
      if (!photoActivity.hold('window_blur', send)) send();
    };
    const onPageHide = () => {
      photoActivity.close();
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
    autosaveWindow,
    flushSignals,
    sendRuntimeSignal,
    submitted,
    submitCurrentAnswers,
    syncDraftToServer,
    photoActivity,
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
      autosaveWindow.cancel();
    },
    [autosaveWindow],
  );

  useEffect(() => {
    if (
      !attempt ||
      submitted ||
      revisionConflict ||
      pendingSubmit ||
      !online ||
      autosaveRetryAttempt < 1
    )
      return;
    const delay =
      Math.min(30_000, 1000 * 2 ** Math.min(autosaveRetryAttempt - 1, 4)) +
      Math.floor(Math.random() * 1000);
    return autosaveWindow.retry(() => {
      void syncDraftToServer();
    }, delay);
  }, [
    attempt,
    autosaveWindow,
    submitted,
    revisionConflict,
    pendingSubmit,
    online,
    autosaveRetryAttempt,
    syncDraftToServer,
  ]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <Dialog.Content
        className="siswa-app fixed bottom-0 left-1/2 z-50 max-h-[92dvh] w-full max-w-[560px] -translate-x-1/2 overflow-y-auto rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5 text-[var(--text)]"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
            ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('siswa-tugas-heading');
          target?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
              {task.mp} - {task.type}
            </div>
            <Dialog.Title className="mt-1 text-lg font-extrabold text-[var(--text)]">{task.title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {task.guru} · {task.examSchedule ? `Tutup ${formatExamTime(task.examSchedule.closesAt)}` : `Tenggat ${task.deadline}`}
            </Dialog.Description>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface)]"
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
                {task.uuid && onOpenModule && (
                  <button
                    type="button"
                    className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 font-bold text-white"
                    onClick={() => onOpenModule(task.uuid!)}
                  >
                    Buka materi
                  </button>
                )}
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
                <div className="text-sm font-bold text-[var(--text)]">
                  {lateRejected
                    ? 'Jawaban terlambat ditolak'
                    : lateReviewRequired
                      ? 'Menunggu keputusan guru'
                      : 'Jawaban sudah terkirim'}
                </div>
                {!lateDecisionAttention && (
                  <p className="mt-1 text-sm text-[var(--text)]">
                    Selamat, Anda telah menyelesaikan asesmen. Terima kasih sudah mengerjakan.
                    Semoga mendapat hasil terbaik.{' '}
                    <PartyPopper aria-hidden="true" className="inline h-4 w-4 align-text-bottom" />
                  </p>
                )}
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {lateRejected
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
        ) : (attempt ? examExpired && !canResumeExpiredAttempt : entry.expired) ? (
          <div className="mt-5 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-bold">Waktu ujian habis</h3>
            <p className="text-sm text-[var(--muted)]">Server menyelesaikan jawaban dari versi terakhir yang berhasil tersimpan.</p>
            {examStatusMessage && <p role="status" className="text-sm">{examStatusMessage}</p>}
            <button type="button" className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold"
              disabled={examStatusBusy || busy} onClick={() => void refreshScheduledStatus(true)}>
              {examStatusBusy ? 'Memeriksa…' : 'Periksa status ujian'}
            </button>
          </div>
        ) : !attempt && task.sessionStatus === 'completed' && task.attemptStarted === false ? (
          <div
            role="status"
            className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]"
          >
            Asesmen sudah ditutup. Anda belum memulai asesmen ini. Hubungi guru bila memerlukan
            tindak lanjut.
          </div>
        ) : !attempt || canResumeExpiredAttempt ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              {task.examSchedule ? (
                <>
                  <p>Buka {formatExamTime(task.examSchedule.opensAt)} · Batas masuk {formatExamTime(task.examSchedule.latestEntryAt)}</p>
                  <p>Durasi maksimum {task.examSchedule.durationMinutes} menit.</p>
                  <p className="mt-1 font-semibold">{scheduleReadError ? 'Waktu ujian belum dapat diperiksa.' : entry.message}</p>
                  {scheduleReadError && (
                    <button type="button" className="mt-2 min-h-11 underline" onClick={() => setScheduleRetry((value) => value + 1)}>
                      Periksa ulang waktu
                    </button>
                  )}
                </>
              ) : 'Baca petunjuk sebelum mulai. Waktu pengerjaan mengikuti ketentuan guru.'}
            </div>
            {integrityWarning && <p role="alert" className="break-words rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold">
              {integrityWarning}
            </p>}
            <button
              type="button"
              ref={resumeButtonRef}
              onClick={startAttempt}
              disabled={busy || !entry.allowed || scheduleReadError || examStatusBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              {entry.resume || task.attemptStarted
                ? 'Lanjutkan asesmen'
                : task.attemptStarted === false
                  ? 'Mulai asesmen'
                  : 'Buka asesmen'}
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
                  deadlineAt={attempt.deadlineAt}
                  serverNow={attempt.serverNow}
                  onExpire={handleExpire}
                  onTick={trackReviewTime}
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
                    onClick={() => goToQuestion(index)}
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

            {pendingPhotoIndex >= 0 && !pendingSubmit && !examExpired && (
              <div className="flex flex-wrap items-center gap-x-3 rounded-lg border border-[var(--border)] px-3 text-sm">
                <p role="status" className="text-[var(--text)]">Foto Soal {pendingPhotoIndex + 1} masih dalam antrean.</p>
                <button type="button" className="min-h-11 font-semibold text-[var(--text)] underline"
                  onClick={() => goToQuestion(pendingPhotoIndex)}>Buka Soal {pendingPhotoIndex + 1}</button>
              </div>
            )}

            {reviewing && (
              <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <h3 ref={reviewHeading} tabIndex={-1} className="text-base font-bold">Tinjau jawaban</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    ['Terjawab', `${answeredCount} dari ${totalQuestions}`],
                    ['Belum terjawab', emptyQuestions.length],
                    ['Sisa waktu', attempt.durationMinutes ? reviewTime : 'Tanpa batas waktu'],
                    ['Penyimpanan', syncSummary],
                  ].map(([label, value]) => <div key={label} className="min-w-0">
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>)}
                </dl>
                {answeredCount * 5 < totalQuestions * 4 && (
                  <p className="text-sm text-[var(--muted)]">Jawaban terisi di bawah 80%. Periksa soal kosong jika waktu masih tersedia.</p>
                )}
                {emptyQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-2" aria-label="Soal belum terjawab">
                    {emptyQuestions.map((index) => <button key={index} type="button" onClick={() => goToQuestion(index)}
                      className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold">Soal {index + 1}</button>)}
                  </div>
                )}
                <button type="button" onClick={() => goToQuestion(currentIndex)} className="min-h-11 font-semibold underline">Kembali ke soal</button>
              </section>
            )}
            {!reviewing && currentQuestion && (
              <article
                key={currentQuestion.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div ref={questionHeading} tabIndex={-1} className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
                  Soal {currentIndex + 1} dari {totalQuestions} - {currentQuestion.points} poin
                </div>
                <QuestionContent body={currentQuestion.body} sessionId={task.assessmentSessionId} />
                <QuestionAnswerInput
                  question={currentQuestion}
                  sessionId={task.assessmentSessionId}
                  answer={answers[currentQuestion.id]}
                  setAnswer={setAnswer}
                  locked={pendingSubmit || revisionConflict || examExpired}
                  photoContext={task.assessmentSessionId && attempt && currentQuestion.type === 'essay'
                    ? { sessionId: task.assessmentSessionId, queue: photoQueue, applyPhoto,
                        startPicker: startPhotoPicker, finishPicker: finishPhotoPicker }
                    : undefined}
                />
              </article>
            )}

            {!reviewing && <div className="grid grid-cols-2 gap-2">
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
                onClick={() => setCurrentIndex(currentIndex + 1)}
                disabled={currentIndex >= totalQuestions - 1}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold text-[var(--text)] disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>}

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
                ref={submitTrigger}
                onClick={() => reviewing ? submitAnswers() : openReview()}
                disabled={busy || pendingSubmit || revisionConflict || examExpired}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {reviewing ? 'Kirim jawaban' : 'Tinjau jawaban'}
              </button>
            </div>

            {!reviewing && answeredCount < totalQuestions && (
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
      </Dialog.Content>
      </Dialog.Portal>
      <ConfirmDialog
        open={confirmSubmit && !examExpired && !submitted}
        onOpenChange={setConfirmSubmit}
        title="Kirim jawaban ujian?"
        description={`${answeredCount} dari ${totalQuestions} soal terjawab · ${emptyQuestions.length} kosong${attempt?.durationMinutes ? ` · sisa ${reviewTime}` : ''} · ${syncSummary}. Jawaban yang terkirim tidak dapat diubah.`}
        confirmLabel="Kirim jawaban"
        cancelLabel="Kembali periksa"
        restoreFocus={() => { if (!examExpiredRef.current) submitTrigger.current?.focus(); }}
        variant="warning"
        onConfirm={() => {
          setConfirmSubmit(false);
          if (!examExpiredRef.current) submitAnswers({ skipConfirm: true });
          return true;
        }}
      />
    </Dialog.Root>
  );
}
