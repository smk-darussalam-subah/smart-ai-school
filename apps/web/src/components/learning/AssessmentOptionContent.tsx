'use client';

import type { AssessmentOption } from '@smk/types';
import { questionMediaSource } from '@/lib/question-content';
import { FormulaPreview } from './QuestionEditorExtensions';

export default function AssessmentOptionContent({ option, sessionId, previewImages }: {
  option: AssessmentOption;
  sessionId?: string;
  previewImages?: Readonly<Record<string, string>>;
}) {
  if (!option.parts?.length) return <span dir="auto" className="whitespace-pre-wrap break-words">{option.text}</span>;
  return (
    <span dir="auto" className="min-w-0 max-w-full whitespace-pre-wrap break-words">
      {option.parts.map((part, index) => {
        if (part.type === 'text') return <span key={index}>{part.text}</span>;
        if (part.type === 'formula') return <FormulaPreview key={index} latex={part.latex} />;
        const source = previewImages ? previewImages[part.mediaId] : questionMediaSource(part.mediaId, sessionId);
        return source ? (
          <img key={index} src={source} alt={part.alt} loading="lazy" decoding="async"
            className="my-1 block max-h-48 max-w-full rounded object-contain" />
        ) : <span key={index}>{part.alt}</span>;
      })}
    </span>
  );
}
