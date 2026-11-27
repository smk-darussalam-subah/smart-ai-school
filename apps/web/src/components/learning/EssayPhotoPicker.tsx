'use client';

import { Camera, ImagePlus } from 'lucide-react';
import { MAX_ESSAY_PHOTOS } from '@smk/types';
import type { useAssessmentPhotoQueue } from '@/lib/use-assessment-photo-queue';
import { EssayPhotoList } from './EssayPhotoList';

export interface EssayPhotoContext {
  sessionId: string;
  queue: ReturnType<typeof useAssessmentPhotoQueue>;
  applyPhoto: (questionId: string, id: string, remove: boolean) => Promise<boolean>;
  startPicker: () => void;
  finishPicker: () => void;
}

const pickerStyle = 'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-emerald-600 hover:bg-[var(--bg)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';

export default function EssayPhotoPicker({ context, questionId, photoIds, disabled }: {
  context: EssayPhotoContext;
  questionId: string;
  photoIds: string[];
  disabled: boolean;
}) {
  const { queue } = context;
  const waiting = queue.pending.filter((item) => item.questionId === questionId && !photoIds.includes(item.id));
  function input(camera: boolean) {
    return (
      <label className={pickerStyle}>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture={camera ? 'environment' : undefined}
          className="sr-only" disabled={disabled || queue.busy || !queue.ready || photoIds.length + waiting.length >= MAX_ESSAY_PHOTOS}
          onClick={(event) => {
            if (!event.nativeEvent.isTrusted) return;
            const element = event.currentTarget;
            element.addEventListener('cancel', context.finishPicker, { once: true });
            context.startPicker();
          }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            event.currentTarget.removeEventListener('cancel', context.finishPicker);
            context.finishPicker();
            if (file) queue.add(questionId, file);
          }} />
        {camera ? <Camera aria-hidden="true" className="h-4 w-4" /> : <ImagePlus aria-hidden="true" className="h-4 w-4" />}
        {camera ? 'Ambil foto' : 'Pilih dari galeri'}
      </label>
    );
  }

  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-[var(--border)] px-3 pb-3">
      <legend className="px-1 text-sm font-bold">Foto jawaban</legend>
      {!disabled && (
        <>
          <p className="text-xs text-[var(--muted)]">Maksimal {MAX_ESSAY_PHOTOS} foto JPG, PNG, atau WebP, hingga 2 MB per foto.</p>
          <div className="flex flex-wrap gap-2">{input(false)}{input(true)}</div>
        </>
      )}
      {queue.note && !disabled && <p role="status" className="text-sm text-[var(--text)]">{queue.note}</p>}
      {!queue.ready && !queue.busy && queue.note && !disabled && (
        <button type="button" className="min-h-11 rounded border border-[var(--border)] px-2 text-sm"
          onClick={queue.retry}>Coba lagi</button>
      )}
      {waiting.length > 0 && !disabled && (
        <ul aria-label="Foto menunggu pengiriman" className="space-y-1">
          {waiting.map(({ id }, index) => (
            <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
              Foto antrean {index + 1}
              <button type="button" disabled={queue.busy} className="min-h-11 rounded border border-[var(--border)] px-2"
                onClick={queue.retry}>Coba lagi</button>
              <button type="button" disabled={queue.busy} className="min-h-11 rounded border border-[var(--border)] px-2"
                onClick={() => queue.discard(id)}>Hapus dari antrean</button>
            </li>
          ))}
        </ul>
      )}
      <EssayPhotoList sessionId={context.sessionId} ids={photoIds}
        onRemove={disabled || queue.busy ? undefined : (id) => { void context.applyPhoto(questionId, id, true); }} />
    </fieldset>
  );
}
