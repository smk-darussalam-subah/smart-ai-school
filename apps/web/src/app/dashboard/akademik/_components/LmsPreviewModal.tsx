'use client';

// LmsPreviewModal — pratinjau Modul LMS seperti tampilan siswa (read-only). Konten
// dirender sbg teks pre-wrap (AMAN — tanpa dangerouslySetInnerHTML/XSS). `content`
// sudah ada di item modul, jadi tak perlu fetch tambahan.
// P8 (F3): Enhanced with metadata cards, student-view simulation banner, and structured layout.

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, FileText, Clock, Target, Users, Eye, Info } from 'lucide-react';
import type { LmsModuleItem } from './guru-types';

export default function LmsPreviewModal({ module, onClose }: { module: LmsModuleItem; onClose: () => void }) {
  const meta = [
    module.tp,
    module.jpAllocation ? `${module.jpAllocation} JP` : null,
    `KKTP ${module.kktp}`,
  ].filter(Boolean).join(' · ');

  const statusLabel = module.status === 'published' ? 'Terbit' : module.status === 'archived' ? 'Arsip' : 'Draft';
  const statusClass = module.status === 'published' ? 'bg-emerald-50 text-emerald-700' : module.status === 'archived' ? 'bg-zinc-100 text-zinc-500' : 'bg-slate-100 text-slate-600';

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" />{module.title}
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusClass}`}>{statusLabel}</span>
          </DialogTitle>
          <DialogDescription>{module.subject}{meta ? ` · ${meta}` : ''} · pratinjau tampilan siswa</DialogDescription>
        </DialogHeader>

        {/* Student-view simulation banner */}
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11.5px] font-semibold text-sky-700">
          <Eye className="h-4 w-4 shrink-0" />
          Pratinjau tampilan siswa — konten di bawah ini seperti yang dilihat siswa di LMS mereka.
        </div>

        {/* Metadata cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {module.tp && (
            <MetaCard icon={FileText} label="TP" value={module.tp} />
          )}
          {module.jpAllocation != null && (
            <MetaCard icon={Clock} label="Alokasi" value={`${module.jpAllocation} JP`} />
          )}
          <MetaCard icon={Target} label="KKTP" value={`${module.kktp}`} />
          <MetaCard icon={Users} label="Kelas" value={module.class?.name ?? 'Umum'} />
        </div>

        {/* Content preview */}
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
          {module.content?.trim() ? (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{module.content}</div>
          ) : (
            <div className="grid h-24 place-items-center text-[12.5px] font-medium text-slate-400">Modul ini belum memiliki konten materi.</div>
          )}
        </div>

        {module.status !== 'published' && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
            <Info className="h-4 w-4 shrink-0" />
            Modul belum dipublikasikan — siswa belum melihat materi ini.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="truncate text-[12px] font-bold text-slate-700">{value}</div>
      </div>
    </div>
  );
}
