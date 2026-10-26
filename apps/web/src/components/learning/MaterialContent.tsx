'use client';

import React, { useEffect, useState } from 'react';
import { MATERIAL_STYLE, materialHasText, sanitizeMaterialHtml } from '@/lib/material-content';

export default function MaterialContent({
  content,
  label = 'materi',
}: {
  content: string;
  label?: 'materi' | 'soal';
}) {
  const [ready, setReady] = useState<{ source: string; html: string } | null>(null);
  useEffect(() => {
    setReady({ source: content, html: sanitizeMaterialHtml(content) });
  }, [content]);
  const html = ready?.source === content ? ready.html : null;
  return (
    <div className="min-w-0">
      <style>{MATERIAL_STYLE}</style>
      {html === null ? (
        <p role="status" className="text-sm opacity-75">
          Menyiapkan {label}…
        </p>
      ) : materialHasText(html) ? (
        <div className="diis-material" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-sm opacity-75">Belum ada isi {label} yang dapat ditampilkan.</p>
      )}
    </div>
  );
}
