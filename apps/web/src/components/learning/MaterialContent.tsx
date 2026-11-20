'use client';

import React, { useEffect, useState } from 'react';
import { MATERIAL_STYLE, materialHasText, sanitizeMaterialHtml, sanitizeQuestionHtml } from '@/lib/material-content';
import { questionMediaSource } from '@/lib/question-content';
import { renderQuestionFormula } from '@/lib/question-math';

export default function MaterialContent({
  content,
  label = 'materi',
  sessionId,
}: {
  content: string;
  label?: 'materi' | 'soal';
  sessionId?: string;
}) {
  const [ready, setReady] = useState<{ source: string; sessionId?: string; html: string } | null>(null);
  useEffect(() => {
    if (label === 'materi') {
      setReady({ source: content, html: sanitizeMaterialHtml(content) });
      return;
    }
    let active = true;
    const root = document.createElement('template');
    root.innerHTML = sanitizeQuestionHtml(content);
    for (const img of root.content.querySelectorAll<HTMLImageElement>('img[data-diis-media]')) {
      img.src = questionMediaSource(img.dataset.diisMedia!, sessionId);
      img.loading = 'lazy';
      img.decoding = 'async';
    }
    const publish = () => { if (active) setReady({ source: content, sessionId, html: root.innerHTML }); };
    const formulas = Array.from(root.content.querySelectorAll<HTMLElement>('[data-diis-latex]')).slice(0, 20);
    if (formulas.length) {
      void Promise.allSettled(formulas.map(async (formula) => {
        formula.innerHTML = await renderQuestionFormula(formula.dataset.diisLatex!, formula.dataset.diisDisplay === 'true');
      })).then(publish);
    } else publish();
    return () => { active = false; };
  }, [content, label, sessionId]);
  const html = ready?.source === content && ready.sessionId === sessionId ? ready.html : null;
  return (
    <div className="min-w-0">
      <style>{MATERIAL_STYLE}</style>
      {html === null ? (
        <p role="status" className="text-sm opacity-75">
          Menyiapkan {label}…
        </p>
      ) : materialHasText(html) || (label === 'soal' && html.includes('data-diis-media=')) ? (
        <div className="diis-material" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm opacity-75">Belum ada isi {label} yang dapat ditampilkan.</p>
      )}
    </div>
  );
}
