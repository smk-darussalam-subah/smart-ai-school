'use client';

import { useState } from 'react';
import QuestionContent from '@/components/learning/QuestionContent';
import QuestionAnswerInput, { type AnswerValue } from '@/components/learning/QuestionAnswerInput';
import { studentPreviewQuestion, type PreviewQuestion } from './assessment-question-preview';

export default function AssessmentQuestionPreview({ questions }: { questions: PreviewQuestion[] }) {
  const [showTeacher, setShowTeacher] = useState(false);
  return (
    <section aria-label="Pratinjau paket soal" className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mode pratinjau">
        {[
          { teacher: false, label: 'Tampilan siswa' },
          { teacher: true, label: 'Kunci dan rubrik' },
        ].map(({ teacher, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={showTeacher === teacher}
            onClick={() => setShowTeacher(teacher)}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-emerald-900 aria-pressed:border-emerald-600 aria-pressed:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        {showTeacher
          ? 'Periksa kunci dan rubrik sebelum mengaktifkan sesi.'
          : 'Coba isi soal. Jawaban pratinjau tidak disimpan.'}
      </p>
      {questions.map((question, index) => (
        <PreviewItem
          key={question.id}
          question={question}
          number={index + 1}
          showTeacher={showTeacher}
        />
      ))}
    </section>
  );
}

function PreviewItem({
  question,
  number,
  showTeacher,
}: {
  question: PreviewQuestion;
  number: number;
  showTeacher: boolean;
}) {
  const [answer, setAnswer] = useState<AnswerValue>();
  return (
    <article
      aria-label={`Soal ${number}`}
      className="min-w-0 rounded-xl border border-slate-200 p-4"
    >
      <div className="mb-3 text-sm font-semibold text-emerald-800">
        Soal {number} · {question.points} poin
      </div>
      <QuestionContent body={question.body} />
      {showTeacher ? (
        <TeacherAnswer question={question} />
      ) : (
        <QuestionAnswerInput
          question={studentPreviewQuestion(question)}
          answer={answer}
          locked={false}
          setAnswer={(_id, next) => setAnswer(next)}
        />
      )}
    </article>
  );
}

function TeacherAnswer({ question }: { question: PreviewQuestion }) {
  if (question.type === 'essay')
    return (
      <div className="mt-4 space-y-3 text-sm text-slate-700">
        {question.guideAnswer && (
          <p>
            <strong>Panduan jawaban</strong> {question.guideAnswer}
          </p>
        )}
        <ul className="space-y-2" aria-label="Rubrik guru">
          {question.rubric.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong> · Maksimum {item.maxScore} · Bobot {item.weight}%
              {item.description && <p>{item.description}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  if (question.type === 'matching')
    return (
      <ul className="mt-4 space-y-2 text-sm text-slate-700" aria-label="Kunci pasangan">
        {question.pairs.map((item) => (
          <li key={item.id}>
            {item.prompt} →{' '}
            {question.pairs.find((choice) => choice.id === question.answer[item.id])?.match ??
              'Kunci belum lengkap'}
          </li>
        ))}
      </ul>
    );
  const answer =
    question.type === 'true_false'
      ? question.answer
        ? 'Benar'
        : 'Salah'
      : (question.options.find((option) => option.id === question.answer)?.text ??
        'Kunci belum lengkap');
  return <p className="mt-4 text-sm font-semibold text-emerald-800">Kunci jawaban · {answer}</p>;
}
