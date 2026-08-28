'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, Save, Send, X } from 'lucide-react';
import AssessmentTimer from '../AssessmentTimer';
import type { SiswaTugas } from './siswa-types';
import {
  autosaveAssessmentResponse,
  startAssessmentResponse,
  submitAssessmentResponse,
} from '../../actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  questions: StudentQuestion[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAttempt(data: unknown): AttemptState | null {
  if (!isRecord(data) || typeof data.responseId !== 'string' || !Array.isArray(data.questions)) return null;
  const startedAt = typeof data.startedAt === 'string'
    ? data.startedAt
    : data.startedAt instanceof Date
      ? data.startedAt.toISOString()
      : null;
  if (!startedAt) return null;
  return {
    responseId: data.responseId,
    startedAt,
    durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : null,
    questions: data.questions.filter(isStudentQuestion),
  };
}

function isStudentQuestion(value: unknown): value is StudentQuestion {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.body !== 'string' || typeof value.points !== 'number') {
    return false;
  }
  if (value.type === 'multiple_choice') {
    return Array.isArray(value.options) && value.options.every((option) => isRecord(option) && typeof option.id === 'string' && typeof option.text === 'string');
  }
  if (value.type === 'true_false') return true;
  if (value.type === 'matching') {
    return Array.isArray(value.prompts)
      && Array.isArray(value.choices)
      && value.prompts.every((prompt) => isRecord(prompt) && typeof prompt.id === 'string' && typeof prompt.prompt === 'string')
      && value.choices.every((choice) => isRecord(choice) && typeof choice.id === 'string' && typeof choice.text === 'string');
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
  if (question.type === 'multiple_choice' && answer.type === 'multiple_choice') return Boolean(answer.optionId);
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
  const [submittedScore, setSubmittedScore] = useState<number | null>(typeof task.score === 'number' ? task.score : null);
  const [submitted, setSubmitted] = useState(task.status === 'submitted' || task.status === 'graded');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [busy, startTransition] = useTransition();

  const answeredCount = useMemo(
    () => attempt?.questions.filter((question) => answerProgress(question, answers)).length ?? 0,
    [answers, attempt?.questions],
  );
  const totalQuestions = attempt?.questions.length ?? 0;
  const currentQuestion = attempt?.questions[currentIndex] ?? null;
  const remedialTerminalStatus = task.purpose === 'remedial' &&
    (task.remedialParticipant?.status === 'passed' || task.remedialParticipant?.status === 'needs_retry')
    ? task.remedialParticipant.status
    : null;

  const setAnswer = (questionId: string, answer: AnswerValue) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
  };

  const startAttempt = () => {
    if (!task.assessmentSessionId) return;
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
      setAttempt(parsed);
      setCurrentIndex(0);
      setSaveState('idle');
      setAnswers(parseAnswers(isRecord(res.data) ? res.data.answers : null));
      setSubmitted(false);
      showToast('Asesmen siap dikerjakan.');
    });
  };

  const saveDraft = () => {
    if (!task.assessmentSessionId || !attempt || submitted) return;
    setSaveState('saving');
    startTransition(async () => {
      const res = await autosaveAssessmentResponse(task.assessmentSessionId!, answers);
      setSaveState(res.success ? 'saved' : 'failed');
      showToast(res.success ? 'Jawaban sementara disimpan.' : res.error ?? 'Gagal menyimpan jawaban.');
    });
  };

  const submitAnswers = useCallback((options?: { skipConfirm?: boolean }) => {
    if (!task.assessmentSessionId || !attempt || submitted) return;
    const unanswered = attempt.questions.length - answeredCount;
    if (!options?.skipConfirm && unanswered > 0) {
      setConfirmUnanswered(true);
      return;
    }
    startTransition(async () => {
      const res = await submitAssessmentResponse(task.assessmentSessionId!, answers);
      if (!res.success) {
        showToast(res.error ?? 'Gagal mengirim jawaban.');
        return;
      }
      const score = isRecord(res.data) && typeof res.data.score === 'number' ? res.data.score : null;
      setSubmitted(true);
      setSubmittedScore(score);
      showToast(score === null ? 'Jawaban terkirim. Esai menunggu penilaian guru.' : `Jawaban terkirim. Nilai ${score}.`);
    });
  }, [answeredCount, answers, attempt, showToast, submitted, task.assessmentSessionId]);

  const handleExpire = useCallback(() => {
    if (!submitted) {
      showToast('Waktu habis. Jawaban dikirim otomatis.');
      submitAnswers({ skipConfirm: true });
    }
  }, [showToast, submitAnswers, submitted]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detail tugas"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">{task.mp} - {task.type}</div>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--text)]">{task.title}</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{task.guru} - Deadline {task.deadline}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface)]" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!task.assessmentSessionId ? (
          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-sm font-bold text-[var(--text)]">Tugas LMS</div>
                <p className="mt-1 text-sm text-[var(--muted)]">{task.desc || 'Tugas ini belum berupa asesmen interaktif.'}</p>
              </div>
            </div>
          </div>
        ) : remedialTerminalStatus ? (
          <div className={`mt-5 rounded-xl border p-4 ${
            remedialTerminalStatus === 'passed'
              ? 'border-emerald-500/25 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}>
            <div className="flex items-start gap-3">
              {remedialTerminalStatus === 'passed'
                ? <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
                : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />}
              <div>
                <div className={`text-sm font-bold ${
                  remedialTerminalStatus === 'passed' ? 'text-emerald-500' : 'text-amber-500'
                }`}>
                  {remedialTerminalStatus === 'passed' ? 'Remedial tuntas' : 'Perlu percobaan berikutnya'}
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
          <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-sm font-bold text-emerald-500">Jawaban sudah terkirim</div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {submittedScore === null ? 'Nilai akhir menunggu penilaian guru.' : `Nilai sementara: ${submittedScore}`}
                </p>
              </div>
            </div>
          </div>
        ) : !attempt ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              Mulai asesmen dari tombol ini. Timer, urutan soal, dan resume jawaban mengikuti data server.
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs font-bold text-[var(--muted)]">
                Terjawab {answeredCount}/{totalQuestions}
              </div>
              <div className="text-xs font-bold text-[var(--muted)]">
                {saveState === 'saving' && 'Menyimpan...'}
                {saveState === 'saved' && 'Tersimpan'}
                {saveState === 'failed' && 'Gagal disimpan'}
              </div>
              {attempt.durationMinutes && (
                <AssessmentTimer durationMinutes={attempt.durationMinutes} startedAt={attempt.startedAt} onExpire={handleExpire} />
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
              <article key={currentQuestion.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">
                  Soal {currentIndex + 1} dari {totalQuestions} - {currentQuestion.points} poin
                </div>
                <p className="text-sm font-bold leading-relaxed text-[var(--text)]">{currentQuestion.body}</p>
                <QuestionAnswerInput question={currentQuestion} answers={answers} setAnswer={setAnswer} />
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
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-extrabold text-[var(--text)] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan sementara
              </button>
              <button
                type="button"
                onClick={() => submitAnswers()}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim jawaban
              </button>
            </div>

            {answeredCount < totalQuestions && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-semibold text-amber-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Masih ada soal yang belum terjawab. Sistem tetap mengizinkan simpan sementara; kirim jawaban saat sudah siap.
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
}: {
  question: StudentQuestion;
  answers: Record<string, AnswerValue>;
  setAnswer: (questionId: string, answer: AnswerValue) => void;
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
              onClick={() => setAnswer(question.id, { type: 'multiple_choice', optionId: option.id })}
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
        {([
          [true, 'Benar'],
          [false, 'Salah'],
        ] as const).map(([choice, label]) => (
          <button
            key={String(choice)}
            type="button"
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
              onChange={(event) => setAnswer(question.id, {
                type: 'matching',
                pairs: { ...pairs, [prompt.id]: event.target.value },
              })}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              <option value="">Pilih pasangan</option>
              {question.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.text}</option>
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
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Rubrik</div>
          <ul className="mt-2 space-y-1 text-xs font-semibold text-[var(--muted)]">
            {question.rubricCriteria.map((criterion) => (
              <li key={criterion.id}>{criterion.name} - maks {criterion.maxScore}</li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={text}
        onChange={(event) => setAnswer(question.id, { type: 'essay', text: event.target.value })}
        rows={5}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
        placeholder="Tulis jawaban esai..."
      />
    </div>
  );
}
