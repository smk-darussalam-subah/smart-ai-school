'use client';
import QuestionContent from '@/components/learning/QuestionContent';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

// EssayGradingModal — U2 Wave 2: Manual essay grading with rubrik.
// GURU views essay responses for a completed session, enters per-criteria
// scores, sees real-time weighted total, saves via gradeEssayResponse().

import { useRef, useState, useTransition } from 'react';
import { ClipboardPenLine, Loader2, Check, AlertTriangle, GraduationCap } from 'lucide-react';
import clsx from 'clsx';
import { gradeEssayResponse, type EssayRubricCriteria } from '../actions';
import AssessmentDiscardDialog, { useAssessmentExitWarning } from './AssessmentDiscardDialog';

interface EssayQuestion {
  questionId: string;
  body: string;
  rubric: EssayRubricCriteria[];
}

interface EssayResponse {
  responseId: string;
  studentName: string;
  nis: string;
  answers: Record<string, string>; // questionId -> student answer text
}

interface Props {
  sessionId: string;
  questions: EssayQuestion[];
  responses: EssayResponse[];
  onClose: () => void;
  onSaved?: (responseId: string, questionId: string) => void;
}

export default function EssayGradingModal({
  sessionId,
  questions,
  responses,
  onClose,
  onSaved,
}: Props) {
  const returnFocus = useDialogReturnFocus();
  const [selectedResponseId, setSelectedResponseId] = useState(responses[0]?.responseId ?? '');
  const [scores, setScores] = useState<Record<string, Record<string, number | undefined>>>({});
  const confirmedScores = useRef<Record<string, Record<string, number>>>({});
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [discardOpen, setDiscardOpen] = useState(false);
  const saveFlight = useRef(false);
  useAssessmentExitWarning(dirty.size > 0 || saving);

  const essayQuestions = questions.filter((q) => q.rubric && q.rubric.length > 0);
  const current =
    responses.find((response) => response.responseId === selectedResponseId) ?? responses[0];
  const currentIdx = Math.max(
    0,
    responses.findIndex((response) => response.responseId === current?.responseId),
  );
  const selectResponse = (index: number) => {
    const response = responses[index];
    if (response) setSelectedResponseId(response.responseId);
  };
  const requestClose = () => {
    if (saving || saveFlight.current || discardOpen) return;
    if (dirty.size > 0) setDiscardOpen(true);
    else onClose();
  };
  const discardDialog = discardOpen && (
    <AssessmentDiscardDialog
      description="Nilai yang belum disimpan akan dibuang. Nilai yang sudah berhasil disimpan tetap tersedia."
      onKeepEditing={() => setDiscardOpen(false)}
      onDiscard={onClose}
    />
  );

  if (responses.length === 0) {
    return (
      <>
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) requestClose();
          }}
        >
          <DialogContent
            {...returnFocus}
            className="z-[70] w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"
            closeDisabled={saving}
            onEscapeKeyDown={(event) => {
              if (saving) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (saving) event.preventDefault();
            }}
          >
            <GraduationCap className="mx-auto h-8 w-8 text-[#9bb0a8]" />
            <DialogTitle>Koreksi esai</DialogTitle>
            <DialogDescription>Tidak ada jawaban esai yang perlu dinilai.</DialogDescription>
          </DialogContent>
        </Dialog>
        {discardDialog}
      </>
    );
  }

  const handleScoreChange = (
    responseId: string,
    questionId: string,
    criteriaId: string,
    value: number,
    maxScore: number,
  ) => {
    if (saving || saveFlight.current) return;
    const key = `${responseId}:${questionId}`;
    const nextValue = Number.isFinite(value) ? Math.max(0, Math.min(maxScore, value)) : undefined;
    if (scores[key]?.[criteriaId] === nextValue) return;
    setScores((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [criteriaId]: nextValue,
      },
    }));
    setDirty((previous) => new Set(previous).add(key));
    setSaved((previous) => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  };

  const computeWeighted = (question: EssayQuestion, responseId: string): number => {
    const s = scores[`${responseId}:${question.questionId}`];
    if (!s) return 0;
    let weightedSum = 0;
    let maxWeightedSum = 0;
    question.rubric.forEach((c) => {
      weightedSum += (s[c.id] ?? 0) * c.weight;
      maxWeightedSum += c.maxScore * c.weight;
    });
    return maxWeightedSum > 0 ? Math.round((weightedSum / maxWeightedSum) * 100) : 0;
  };

  const handleSave = (questionId: string, responseId: string) => {
    const key = `${responseId}:${questionId}`;
    if (saveFlight.current || saved.has(key)) return;
    const question = essayQuestions.find((item) => item.questionId === questionId);
    if (!question) return;
    const criteriaScores: Record<string, number> = {};
    for (const { id } of question.rubric) {
      const value = scores[key]?.[id];
      if (value === undefined) return;
      criteriaScores[id] = value;
    }
    saveFlight.current = true;
    setErr(null);
    startSave(async () => {
      try {
        const res = await gradeEssayResponse(sessionId, responseId, {
          questionId,
          criteriaScores,
          expectedCriteriaScores: confirmedScores.current[key] ?? null,
        });
        if (!res.success) {
          setErr(res.error ?? 'Gagal menyimpan nilai. Isian tetap tersedia.');
          return;
        }
        confirmedScores.current[key] = criteriaScores;
        setSaved((prev) => new Set(prev).add(key));
        setDirty((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        onSaved?.(responseId, questionId);
      } catch {
        setErr('Koneksi terputus. Isian tetap tersedia; periksa status sebelum mencoba lagi.');
      } finally {
        saveFlight.current = false;
      }
    });
  };

  const FIELD =
    'min-h-11 w-24 rounded-lg border border-[#e6efea] px-2 py-2 text-base text-[#0f2e25] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50';

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          {...returnFocus}
          className="z-[70] block max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          closeDisabled={saving || discardOpen}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pr-10">
            <DialogTitle className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
              <ClipboardPenLine className="h-[18px] w-[18px] text-emerald-600" />
              Penilaian Esai — Siswa {currentIdx + 1}/{responses.length}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Periksa jawaban dan isi nilai sesuai rubrik.
          </DialogDescription>
          {dirty.size > 0 && (
            <p role="status" className="mt-3 text-sm font-semibold text-amber-800">
              {dirty.size} penilaian belum disimpan
            </p>
          )}

          {/* Student selector */}
          <div className="mt-3 flex items-center gap-2">
            <select
              aria-label="Siswa yang dinilai"
              value={current?.responseId ?? ''}
              disabled={saving}
              onChange={(e) => setSelectedResponseId(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-base font-semibold text-[#0f2e25] focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {responses.map((r) => (
                <option key={r.responseId} value={r.responseId}>
                  {r.studentName} ({r.nis})
                </option>
              ))}
            </select>
          </div>

          {err && (
            <div
              role="alert"
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800"
            >
              <AlertTriangle className="h-3 w-3" />
              {err}
            </div>
          )}

          {/* Essay questions with rubric grading */}
          <div className="mt-4 space-y-4">
            {essayQuestions
              .filter((question) => Object.hasOwn(current?.answers ?? {}, question.questionId))
              .map((q, qi) => {
                const responseId = current?.responseId ?? '';
                const answerText = current?.answers?.[q.questionId] ?? '(tidak dijawab)';
                const weighted = computeWeighted(q, responseId);
                const key = `${responseId}:${q.questionId}`;
                const isSaved = saved.has(key);
                const ready = q.rubric.every(({ id }) => scores[key]?.[id] !== undefined);
                const weightTotal = q.rubric.reduce((sum, c) => sum + c.weight, 0);

                return (
                  <div
                    key={q.questionId}
                    role="region"
                    aria-label={`Esai ${qi + 1}`}
                    className="rounded-xl border border-[#e6efea] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-amber-50 px-2 py-1 text-sm font-bold text-amber-800">
                        Esai {qi + 1}
                      </span>
                      {isSaved && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <Check className="h-3 w-3" />
                          Tersimpan
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[#0f2e25]">
                      <QuestionContent body={q.body} />
                    </div>
                    <div className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-dashed border-[#e6efea] bg-[#f9fbfa] px-3 py-3 text-base leading-relaxed text-[#355a4e]">
                      <span className="font-bold text-emerald-900">Jawaban siswa </span>
                      {answerText.trim() || 'Tidak dijawab'}
                    </div>

                    {/* Rubric criteria */}
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#6b8079]">
                          Rubrik Penilaian
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold',
                            Math.abs(weightTotal - 100) < 0.01
                              ? 'text-emerald-600'
                              : 'text-amber-600',
                          )}
                        >
                          Total bobot: {weightTotal.toFixed(0)}{' '}
                          {Math.abs(weightTotal - 100) < 0.01 ? 'valid' : '(harus 100)'}
                        </span>
                      </div>
                      {q.rubric.map((c) => {
                        const val = scores[key]?.[c.id] ?? '';
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-3 py-2"
                          >
                            <div className="min-w-0 flex-1 break-words">
                              <div className="text-sm font-bold text-[#0f2e25]">{c.name}</div>
                              <div className="text-xs text-slate-700">{c.description}</div>
                              <div className="text-xs text-slate-600">
                                Bobot: {c.weight.toFixed(0)}% · Maks: {c.maxScore}
                              </div>
                            </div>
                            <input
                              aria-label={`Nilai ${c.name}`}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min={0}
                              max={c.maxScore}
                              value={val}
                              disabled={saving}
                              onChange={(e) =>
                                handleScoreChange(
                                  responseId,
                                  q.questionId,
                                  c.id,
                                  e.target.valueAsNumber,
                                  c.maxScore,
                                )
                              }
                              className={FIELD}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Weighted score + save */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                      <span className="text-xs font-bold text-emerald-800">Skor berbobot</span>
                      <span className="text-[16px] font-extrabold text-emerald-700">
                        {ready ? `${weighted}/100` : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSave(q.questionId, responseId)}
                        disabled={saving || isSaved || !ready}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Simpan Nilai
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => selectResponse(currentIdx - 1)}
              disabled={saving || currentIdx === 0}
              className="rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-30"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => selectResponse(currentIdx + 1)}
              disabled={saving || currentIdx === responses.length - 1}
              className="rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-30"
            >
              Berikutnya →
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {discardDialog}
    </>
  );
}
