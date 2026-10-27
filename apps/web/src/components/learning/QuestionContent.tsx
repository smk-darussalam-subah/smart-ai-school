'use client';
import React from 'react';

import MaterialContent from './MaterialContent';
import { QUESTION_HTML_PREFIX, questionBodyForEditor } from '@/lib/question-content';

/** All question consumers share sanitization; unmarked historical code stays literal. */
export default function QuestionContent({ body }: { body: string }) {
  if (!body.startsWith(QUESTION_HTML_PREFIX))
    return <div className="whitespace-pre-wrap break-words text-base leading-relaxed">{body}</div>;
  return <MaterialContent content={questionBodyForEditor(body)} label="soal" />;
}
