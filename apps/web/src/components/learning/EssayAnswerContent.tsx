
'use client';

import { Fragment, type ReactNode } from 'react';
import { readEssayDocument, type EssayBlock, type EssayDocument } from '@smk/types';
import { FormulaPreview } from './QuestionEditorExtensions';

function Blocks({ blocks }: { blocks: EssayBlock[] }) {
  return blocks.map((block, index) => block.type === 'bulletList' ? (
    <ul key={index} className="list-disc space-y-1 ps-6">
      {block.content.map((item, itemIndex) => <li key={itemIndex}><Blocks blocks={item.content} /></li>)}
    </ul>
  ) : (
    <p key={index} dir="auto" className="min-h-[1em] whitespace-pre-wrap break-words">
      {block.content?.map((part, partIndex) => {
        if (part.type === 'hardBreak') return <br key={partIndex} />;
        if (part.type === 'questionFormula') {
          return <FormulaPreview key={partIndex} latex={part.attrs.latex} display={part.attrs.display} />;
        }
        let text: ReactNode = part.text;
        for (const mark of part.marks ?? []) {
          text = mark.type === 'bold' ? <strong>{text}</strong> : <em>{text}</em>;
        }
        return <Fragment key={partIndex}>{text}</Fragment>;
      })}
    </p>
  ));
}

export default function EssayAnswerContent({ text, document }: { text: string; document?: EssayDocument }) {
  const safe = readEssayDocument(document);
  if (!safe || !text.trim()) return <p dir="auto" className="whitespace-pre-wrap break-words">{text.trim() || 'Tidak dijawab'}</p>;
  return <div className="space-y-2"><Blocks blocks={safe.content} /></div>;
}
