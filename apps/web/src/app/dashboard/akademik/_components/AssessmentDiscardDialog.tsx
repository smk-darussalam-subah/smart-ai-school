'use client';

import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

export function useAssessmentExitWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export default function AssessmentDiscardDialog({
  onKeepEditing,
  onDiscard,
  description,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
  description: string;
}) {
  const returnFocus = useDialogReturnFocus();
  const keepButton = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onKeepEditing();
      }}
    >
      <DialogContent
        {...returnFocus}
        className="z-[100] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white p-5"
        onOpenAutoFocus={(event) => {
          returnFocus.onOpenAutoFocus();
          event.preventDefault();
          keepButton.current?.focus();
        }}
      >
        <DialogTitle>Perubahan belum disimpan</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-slate-600">
          {description}
        </DialogDescription>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            ref={keepButton}
            type="button"
            onClick={onKeepEditing}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Lanjut mengedit
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-11 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:ring-2 focus-visible:ring-rose-600"
          >
            Buang perubahan dan tutup
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
