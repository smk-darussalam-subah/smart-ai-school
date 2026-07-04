'use client';

// EssayGradingModal — U2 Wave 2: Manual essay grading with rubrik.
// GURU views essay responses for a completed session, enters per-criteria
// scores, sees real-time weighted total, saves via gradeEssayResponse().

import { useState, useTransition, useEffect } from 'react';
import { ClipboardPenLine, X, Loader2, Check, AlertTriangle, GraduationCap } from 'lucide-react';
import clsx from 'clsx';
import { gradeEssayResponse, type EssayRubricCriteria } from '../actions';

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
}

export default function EssayGradingModal({ sessionId, questions, responses, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const essayQuestions = questions.filter((q) => q.rubric && q.rubric.length > 0);
  const current = responses[currentIdx];

  useEffect(() => {
    if (responses.length === 0) return;
    // Initialize scores for current response
    if (current && !scores[current.responseId]) {
      const init: Record<string, number> = {};
      essayQuestions.forEach((q) => {
        q.rubric.forEach((c) => { init[c.id] = 0; });
      });
      setScores((prev) => ({ ...prev, [current.responseId]: init }));
    }
  }, [currentIdx, current, scores, essayQuestions]);

  if (responses.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
          <GraduationCap className="mx-auto h-8 w-8 text-[#9bb0a8]" />
          <p className="mt-2 text-[13px] font-medium text-[#6b8079]">Tidak ada respons essay yang perlu dinilai.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-lg border border-[#e6efea] bg-white px-4 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
        </div>
      </div>
    );
  }

  const handleScoreChange = (responseId: string, criteriaId: string, value: number, maxScore: number) => {
    setScores((prev) => ({
      ...prev,
      [responseId]: {
        ...(prev[responseId] ?? {}),
        [criteriaId]: Math.max(0, Math.min(maxScore, value)),
      },
    }));
  };

  const computeWeighted = (question: EssayQuestion, responseId: string): number => {
    const s = scores[responseId];
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
    setErr(null);
    startSave(async () => {
      const s = scores[responseId];
      if (!s) return;
      const res = await gradeEssayResponse(sessionId, responseId, { questionId, criteriaScores: s });
      if (!res.success) {
        setErr(res.error ?? 'Gagal menyimpan nilai.');
        return;
      }
      setSaved((prev) => new Set(prev).add(`${responseId}-${questionId}`));
    });
  };

  const FIELD = 'w-20 rounded-lg border border-[#e6efea] px-2 py-1.5 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <ClipboardPenLine className="h-[18px] w-[18px] text-emerald-600" />
            Penilaian Essay — Siswa {currentIdx + 1}/{responses.length}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Student selector */}
        <div className="mt-3 flex items-center gap-2">
          <select
            value={currentIdx}
            onChange={(e) => setCurrentIdx(Number(e.target.value))}
            className="flex-1 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#0f2e25] outline-none focus:border-emerald-300"
          >
            {responses.map((r, i) => (
              <option key={r.responseId} value={i}>{r.studentName} ({r.nis})</option>
            ))}
          </select>
        </div>

        {err && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
            <AlertTriangle className="h-3 w-3" />{err}
          </div>
        )}

        {/* Essay questions with rubric grading */}
        <div className="mt-4 space-y-4">
          {essayQuestions.map((q, qi) => {
            const responseId = current?.responseId ?? '';
            const answerText = current?.answers?.[q.questionId] ?? '(tidak dijawab)';
            const weighted = computeWeighted(q, responseId);
            const isSaved = saved.has(`${responseId}-${q.questionId}`);
            const weightTotal = q.rubric.reduce((sum, c) => sum + c.weight, 0);

            return (
              <div key={q.questionId} className="rounded-xl border border-[#e6efea] p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Essay #{qi + 1}</span>
                  {isSaved && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><Check className="h-3 w-3" />Tersimpan</span>}
                </div>
                <p className="mt-2 text-[12.5px] text-[#0f2e25]">{q.body}</p>
                <div className="mt-2 rounded-lg border border-dashed border-[#e6efea] bg-[#f9fbfa] px-3 py-2 text-[11.5px] text-[#355a4e]">
                  <span className="font-bold text-[#6b8079]">Jawaban siswa: </span>{answerText}
                </div>

                {/* Rubric criteria */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#6b8079]">Rubrik Penilaian</span>
                    <span className={clsx('text-[10px] font-bold', Math.abs(weightTotal - 1) < 0.01 ? 'text-emerald-600' : 'text-amber-600')}>
                      Total bobot: {weightTotal.toFixed(2)} {Math.abs(weightTotal - 1) < 0.01 ? '✓' : '⚠ (idealnya 1.0)'}
                    </span>
                  </div>
                  {q.rubric.map((c) => {
                    const val = scores[responseId]?.[c.id] ?? 0;
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-lg border border-[#e6efea] px-3 py-2">
                        <div className="flex-1">
                          <div className="text-[11.5px] font-bold text-[#0f2e25]">{c.name}</div>
                          <div className="text-[10px] text-[#9bb0a8]">{c.description}</div>
                          <div className="text-[10px] text-[#6b8079]">Bobot: {(c.weight * 100).toFixed(0)}% · Max: {c.maxScore}</div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={c.maxScore}
                          value={val}
                          onChange={(e) => handleScoreChange(responseId, c.id, Number(e.target.value), c.maxScore)}
                          className={FIELD}
                        />
                        <span className="text-[10px] text-[#9bb0a8]">/{c.maxScore}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Weighted score + save */}
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="text-[11px] font-bold text-emerald-700">Skor berbobot:</span>
                  <span className="text-[16px] font-extrabold text-emerald-700">{weighted}/100</span>
                  <button
                    type="button"
                    onClick={() => handleSave(q.questionId, responseId)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
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
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-30"
          >
            ← Sebelumnya
          </button>
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(responses.length - 1, i + 1))}
            disabled={currentIdx === responses.length - 1}
            className="rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-30"
          >
            Berikutnya →
          </button>
        </div>
      </div>
    </div>
  );
}
