'use client';

import { Extension, Node, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { renderQuestionFormula } from '@/lib/question-math';
import { questionMediaSource } from '@/lib/question-content';

export function FormulaPreview({ latex, display = false }: { latex: string; display?: boolean }) {
  const [result, setResult] = useState<{ latex: string; display: boolean; html: string | null }>();
  useEffect(() => {
    let current = true;
    void renderQuestionFormula(latex, display).then(
      (html) => { if (current) setResult({ latex, display, html }); },
      () => { if (current) setResult({ latex, display, html: null }); },
    );
    return () => { current = false; };
  }, [latex, display]);
  const html = result?.latex === latex && result?.display === display ? result.html : null;
  return html
    ? <span dir="ltr" className="inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: html }} />
    : <code dir="ltr" className="whitespace-pre-wrap break-words">{latex}</code>;
}

function FormulaNodeView({ node, selected }: NodeViewProps) {
  return <NodeViewWrapper as="span" contentEditable={false}
    className={`inline-block max-w-full rounded px-1 ${selected ? 'ring-2 ring-emerald-600' : ''}`}>
    <FormulaPreview latex={String(node.attrs.latex)} display={node.attrs.display === true} />
  </NodeViewWrapper>;
}

export const QuestionFormula = Node.create({
  name: 'questionFormula',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-diis-latex') ?? '' },
      display: { default: false, parseHTML: (el: HTMLElement) => el.getAttribute('data-diis-display') === 'true' },
    };
  },
  parseHTML: () => [{ tag: 'span[data-diis-latex]' }],
  renderHTML: ({ node }) => ['span', {
    'data-diis-latex': node.attrs.latex,
    ...(node.attrs.display ? { 'data-diis-display': 'true' } : {}),
  }, node.attrs.latex],
  renderText: ({ node }) => String(node.attrs.latex),
  addNodeView: () => ReactNodeViewRenderer(FormulaNodeView),
});

export const QuestionImage = Node.create({
  name: 'questionImage',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      mediaId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-diis-media') ?? '' },
      alt: { default: '' },
    };
  },
  parseHTML: () => [{ tag: 'img[data-diis-media]' }],
  renderHTML: ({ node }) => ['img', {
    'data-diis-media': node.attrs.mediaId,
    alt: node.attrs.alt,
  }],
  // Keep the live request URL out of the stored snapshot.
  addNodeView: () => ({ node }) => {
    const dom = document.createElement('img');
    dom.src = questionMediaSource(String(node.attrs.mediaId));
    dom.alt = String(node.attrs.alt);
    dom.setAttribute('data-diis-media', String(node.attrs.mediaId));
    dom.loading = 'lazy';
    return { dom };
  },
});

export const QuestionLanguage = Extension.create({
  name: 'questionLanguage',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'blockquote', 'listItem'],
      attributes: {
        dir: { default: null, parseHTML: (element) => element.getAttribute('dir') },
        lang: { default: null, parseHTML: (element) => element.getAttribute('lang') },
      },
    }];
  },
});
