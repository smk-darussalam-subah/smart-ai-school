'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { JpSummaryContent } from '../../akademik/_components/AttendanceJpSummary';
import type { JpOverview } from '@/lib/session-attendance';

export default function AttendanceDetailDialog({
  data,
  onClose,
  returnFocusTo,
}: {
  data: JpOverview | null;
  onClose: () => void;
  returnFocusTo: HTMLButtonElement | null;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[85vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto bg-white dark:bg-slate-900 dark:text-slate-100"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusTo?.isConnected) returnFocusTo.focus();
        }}
      >
        <div className="min-w-0 pr-10">
          <DialogTitle className="text-base font-bold text-slate-950 dark:text-slate-100">
            Rincian absensi siswa
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Agregat JP pada periode dan jurusan pilihan, bukan daftar siswa atau absensi harian.
          </DialogDescription>
        </div>
        {data ? (
          <JpSummaryContent data={data} />
        ) : (
          <p role="status" className="py-4 text-sm text-slate-600 dark:text-slate-300">
            Rincian absensi belum tersedia. Tidak ada persentase yang disimpulkan.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
