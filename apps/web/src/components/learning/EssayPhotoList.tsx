
'use client';

export function EssayPhotoList({ sessionId, ids, onRemove, openOriginal = false }: {
  sessionId: string;
  ids: string[];
  onRemove?: (id: string) => void;
  openOriginal?: boolean;
}) {
  if (!ids.length) return null;
  return (
    <ul aria-label="Foto jawaban tersimpan" className="mt-2 grid gap-2 sm:grid-cols-3">
      {ids.map((id, index) => {
        const url = '/api/backend/assessment/sessions/' + encodeURIComponent(sessionId) +
          '/answer-photos/' + encodeURIComponent(id);
        // Private binary uses the session cookie on the same-origin proxy.
        const image = <img src={url} alt={'Foto jawaban ' + (index + 1)} loading="lazy"
          className="h-24 w-full rounded-md object-contain" />;
        return (
          <li key={id} className="min-w-0 rounded-lg border border-[var(--border)] p-1.5">
            {openOriginal ? (
              <a href={url} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline focus-visible:outline-2">
                {image}
              </a>
            ) : image}
            {onRemove && (
              <button type="button" onClick={() => onRemove(id)} aria-label={'Hapus foto ' + (index + 1)}
                className="min-h-11 w-full rounded-md px-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg)]">
                Hapus
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
