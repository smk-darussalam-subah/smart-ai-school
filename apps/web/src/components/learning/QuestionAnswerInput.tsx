'use client';

export type StudentQuestion =
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

export type AnswerValue =
  | { type: 'multiple_choice'; optionId: string }
  | { type: 'true_false'; value: boolean }
  | { type: 'matching'; pairs: Record<string, string> }
  | { type: 'essay'; text: string };

export default function QuestionAnswerInput({
  question,
  answer: current,
  setAnswer,
  locked,
}: {
  question: StudentQuestion;
  answer: AnswerValue | undefined;
  setAnswer: (questionId: string, answer: AnswerValue) => void;
  locked: boolean;
}) {
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
              aria-pressed={selected}
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
            aria-pressed={value === choice}
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
        aria-label="Jawaban esai"
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
