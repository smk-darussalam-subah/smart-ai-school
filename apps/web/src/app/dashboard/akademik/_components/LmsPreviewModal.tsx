'use client';

// LmsPreviewModal — pratinjau Modul LMS seperti tampilan siswa (read-only). Konten
// dirender sbg teks pre-wrap (AMAN — tanpa dangerouslySetInnerHTML/XSS). `content`
// sudah ada di item modul, jadi tak perlu fetch tambahan.

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen } from 'lucide-react';
import type { LmsModuleItem } from './guru-types';

export default function LmsPreviewModal({ module, onClose }: { module: LmsModuleItem; onClose: () => void }) {
  const meta = [
    module.tp,
    module.jpAllocation ? `${module.jpAllocation} JP` : null,
    `KKTP ${module.kktp}`,
  ].filter(Boolean).join(' · ');

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-emerald-600" />{module.title}</DialogTitle>
          <DialogDescription>{module.subject}{meta ? ` · ${meta}` : ''} · pratinjau tampilan siswa</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
          {module.content?.trim() ? (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{module.content}</div>
          ) : (
            <div className="grid h-24 place-items-center text-[12.5px] font-medium text-slate-400">Modul ini belum memiliki konten materi.</div>
          )}
        </div>

        {module.status !== 'published' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
            Modul belum dipublikasikan — siswa belum melihat materi ini.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
