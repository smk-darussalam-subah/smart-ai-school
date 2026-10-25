import React from 'react';
import { Check, Loader2, Pencil, RefreshCw } from 'lucide-react';
import type { AiQuestionDraftItem } from '../actions';
import {
  QB_BUTTON,
  QB_OUTLINE,
  questionDifficultyLabels,
  questionTypeLabels,
} from './question-bank-ui';

export default function QuestionBankAiReview({
  drafts,
  selected,
  reviewed,
  disabled,
  regeneratingKey,
  onSelect,
  onReview,
  onEdit,
  onRegenerate,
}: {
  drafts: AiQuestionDraftItem[];
  selected: ReadonlySet<string>;
  reviewed: ReadonlySet<string>;
  disabled: boolean;
  regeneratingKey: string | null;
  onSelect: (key: string, checked: boolean) => void;
  onReview: (key: string, checked: boolean) => void;
  onEdit: (item: AiQuestionDraftItem) => void;
  onRegenerate: (item: AiQuestionDraftItem) => void;
}) {
  return (
    <div className="space-y-4" aria-label="Periksa draft soal AI">
      <p className="text-sm text-[var(--qb-muted)]">
        {drafts.length} draft · {drafts.filter((item) => reviewed.has(item.itemKey)).length} sudah
        diperiksa
      </p>
      {drafts.map((item, index) => (
        <article
          key={item.itemKey}
          className="min-w-0 rounded-xl border border-[var(--qb-line)] p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-[var(--qb-ok-bg)] text-[var(--qb-ok-ink)]">
                {index + 1}
              </span>
              Soal {index + 1} · {questionTypeLabels[item.question.type]}
              <span className="rounded-md bg-[var(--qb-warn-bg)] px-2 py-1 text-xs text-[var(--qb-warn-ink)]">
                {questionDifficultyLabels[item.question.difficulty]}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onEdit(item)}
                className={`${QB_BUTTON} ${QB_OUTLINE}`}
                aria-label={`Ubah soal ${index + 1}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Ubah
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRegenerate(item)}
                className={`${QB_BUTTON} bg-[var(--qb-ai-bg)] text-[var(--qb-ai-ink)]`}
                aria-label={`Buat ulang soal ${index + 1}`}
              >
                {regeneratingKey === item.itemKey ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Buat ulang
              </button>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-7">
            {item.question.body}
          </p>
          <details open={index === 0} className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--qb-muted)] focus-visible:outline-2 focus-visible:outline-emerald-500">
              Pilihan dan kunci jawaban
            </summary>
            <AnswerPreview item={item} />
          </details>
          {item.warnings.length > 0 && (
            <p className="mt-3 rounded-lg bg-[var(--qb-warn-bg)] p-3 text-sm text-[var(--qb-warn-ink)]">
              {item.warnings.join(' ')}
            </p>
          )}
          <details className="mt-2 text-sm text-[var(--qb-muted)]">
            <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-emerald-500">
              Rincian tujuan pembelajaran
            </summary>
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {item.tpRefs.join(', ')} · {item.cognitiveLevel}. {item.rationale}
            </p>
          </details>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-[var(--qb-line)] pt-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={disabled}
                checked={reviewed.has(item.itemKey)}
                onChange={(event) => onReview(item.itemKey, event.target.checked)}
                className="h-4 w-4"
                aria-label={`Soal ${index + 1} sudah diperiksa`}
              />
              Sudah diperiksa
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.has(item.itemKey)}
                onChange={(event) => onSelect(item.itemKey, event.target.checked)}
                className="h-4 w-4"
                aria-label={`Pilih soal ${index + 1} untuk disimpan`}
              />
              Pilih untuk disimpan
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}

function AnswerPreview({ item }: { item: AiQuestionDraftItem }) {
  const question = item.question;
  const answerClass =
    'mt-3 rounded-lg bg-[var(--qb-ok-bg)] p-4 text-sm leading-relaxed text-[var(--qb-ok-ink)]';
  if (question.type === 'multiple_choice')
    return (
      <>
        <ol className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option, index) => (
            <li
              key={option.id}
              className="flex gap-3 rounded-lg border border-[var(--qb-line)] px-3 py-2 text-sm"
            >
              <span className="font-semibold">{String.fromCharCode(65 + index)}.</span>
              <span className="whitespace-pre-wrap break-words">{option.text}</span>
            </li>
          ))}
        </ol>
        <div className={answerClass}>
          <b>Kunci jawaban: </b>
          {question.options.findIndex((option) => option.id === question.answer) >= 0
            ? String.fromCharCode(
                65 + question.options.findIndex((option) => option.id === question.answer),
              )
            : 'Perlu diperiksa'}
          {' — '}
          {question.options.find((option) => option.id === question.answer)?.text}
        </div>
      </>
    );
  if (question.type === 'true_false')
    return (
      <div className={answerClass}>
        <b>Kunci jawaban: </b>
        {question.answer ? 'Benar' : 'Salah'}
      </div>
    );
  if (question.type === 'matching')
    return (
      <div className={answerClass}>
        <b>Kunci pasangan</b>
        <dl className="mt-2 space-y-2">
          {question.pairs.map((pair) => (
            <div key={pair.id} className="grid gap-1 sm:grid-cols-2">
              <dt>{pair.prompt}</dt>
              <dd className="font-semibold">
                {question.pairs.find((match) => match.id === question.answer[pair.id])?.match ??
                  'Perlu diperiksa'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  return (
    <div className={answerClass}>
      <p className="flex items-center gap-2 font-semibold">
        <Check className="h-4 w-4" aria-hidden="true" />
        Panduan jawaban dan rubrik
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words">
        {question.guideAnswer || 'Gunakan rubrik berikut untuk menilai jawaban.'}
      </p>
      <ul className="mt-3 space-y-3">
        {question.rubric.map((criterion) => (
          <li key={criterion.id}>
            <b>{criterion.name}</b>
            <span className="ml-2">
              Bobot {criterion.weight}% · Skor maks. {criterion.maxScore}
            </span>
            {criterion.description && (
              <p className="mt-1 whitespace-pre-wrap break-words">{criterion.description}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
