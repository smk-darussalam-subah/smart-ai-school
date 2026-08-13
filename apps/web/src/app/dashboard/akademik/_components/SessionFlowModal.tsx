'use client';
import { useState } from 'react';
import {
  PlayCircle, X, ChevronLeft, ChevronRight, Flag, CalendarCheck, Search,
  BookOpen, ClipboardCheck, ClipboardPenLine, MessageCircle, PenLine,
} from 'lucide-react';
import type { TodayClass } from './guru-types';

interface Props {
  session: TodayClass | null;
  onAbsen: (c: { classId: string; className: string }) => void;
  onJurnal: (c: { classId: string; className: string; subject: string; startLabel: string; jpStart: number }) => void;
  onOpenPenilaian: (session: TodayClass, mode: 'preview' | 'monitor' | 'analysis', tab: 'diag' | 'form' | 'fb') => void;
  /** Step 4 "Buka Modul Ajar": buka popup Modul Ajar DI ATAS modal sesi (z-50 > z-40),
   *  pre-fill sesuai mapel/kelas sesi. Modal sesi TETAP TERBUKA agar flow tak terputus
   *  (pola yang sama dgn step 3 → PenilaianSesiModal). */
  onOpenModule?: (session: TodayClass) => void;
  onClose: () => void;
}

// P2: Session flow data derived from real session.subject + assessmentSessionId.
// Steps mengikuti in-class procedure: Pembukaan → Absen → Diagnostik → Materi → Formatif → Nilai → Feedback → Jurnal
const SESSION_STEPS = [
  { n: 'Pembukaan', icon: Flag },
  { n: 'Absensi', icon: CalendarCheck },
  { n: 'Diagnostik', icon: Search },
  { n: 'Materi Inti', icon: BookOpen },
  { n: 'Formatif', icon: ClipboardCheck },
  { n: 'Penilaian', icon: ClipboardPenLine },
  { n: 'Feedback', icon: MessageCircle },
  { n: 'Jurnal', icon: PenLine },
] as const;

export default function SessionFlowModal({ session, onAbsen, onJurnal, onOpenPenilaian, onOpenModule, onClose }: Props) {
  const [step, setStep] = useState(1);

  if (!session) return null;

  const current = SESSION_STEPS[step - 1];
  if (!current) return null;
  const CurrentIcon = current.icon;
  const isLast = step === 8;

  const handleAction = () => {
    switch (step) {
      case 2: onAbsen({ classId: session.classId, className: session.className }); break;
      case 3: onOpenPenilaian(session, 'preview', 'diag'); break;
      // Step 4: buka popup Modul Ajar DI ATAS modal sesi (modal sesi tetap terbuka,
      // flow tak terputus — sama seperti step 3). Sebelumnya: close+navigate = salah
      // (memutus flow sesi).
      case 4: onOpenModule?.(session); break;
      case 5: onOpenPenilaian(session, 'preview', 'form'); break;
      case 6: onOpenPenilaian(session, 'monitor', 'form'); break;
      case 7: onOpenPenilaian(session, 'preview', 'fb'); break;
      case 8: onJurnal({ classId: session.classId, className: session.className, subject: session.subject, startLabel: session.startLabel, jpStart: session.jpStart }); break;
    }
  };

  const handleNext = () => {
    if (step < 8) setStep(step + 1);
    else onClose();
  };
  const handlePrev = () => { if (step > 1) setStep(step - 1); };

  // Action button config per step
  const actionBtns: Record<number, { label: string; icon: typeof Flag } | null> = {
    2: { label: 'Buka Absensi', icon: CalendarCheck },
    3: { label: 'Buka Diagnostik', icon: Search },
    4: { label: 'Buka Modul Ajar', icon: BookOpen },
    5: { label: 'Buka Formatif', icon: ClipboardCheck },
    6: { label: 'Realtime Monitor', icon: ClipboardPenLine },
    7: { label: 'Buka Feedback', icon: MessageCircle },
    8: { label: 'Buka Jurnal', icon: PenLine },
  };
  const act = actionBtns[step];
  const ActIcon = act?.icon;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><PlayCircle className="h-[18px] w-[18px] text-emerald-600" />Sesi Mengajar — {session.subject} · {session.className}</h3>
            <p className="text-[11px] text-[#6b8079]">{session.startLabel} · JP {session.jpStart}–{session.jpEnd}{session.room ? ` · ${session.room}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>

        {/* Step progress indicator */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {SESSION_STEPS.map((st, i) => {
            const idx = i + 1;
            const isPast = idx < step;
            const isCurrent = idx === step;
            return (
              <div key={idx} className="flex items-center gap-1">
                <div className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-extrabold ${isCurrent ? 'bg-emerald-600 text-white' : isPast ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f4f7f5] text-[#9bb0a8]'}`}>
                  {idx}
                </div>
                {isCurrent && <span className="text-[9px] font-extrabold text-emerald-700">{st.n}</span>}
                {i < 7 && <ChevronRight className="h-2.5 w-2.5 text-[#9bb0a8]" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="mt-4 rounded-xl border border-[#e6efea] p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CurrentIcon className="h-5 w-5" /></div>
            <div className="flex-1">
              <h4 className="text-[14px] font-bold text-[#0f2e25]">Step {step}: {current.n}</h4>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {act && ActIcon && <button type="button" onClick={handleAction} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white hover:bg-emerald-700"><ActIcon className="h-3.5 w-3.5" />{act.label}</button>}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
          {step > 1 && <button type="button" onClick={handlePrev} className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><ChevronLeft className="h-4 w-4" /></button>}
          <button type="button" onClick={handleNext} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">{isLast ? (<><X className="h-4 w-4" />Tutup Alur</>) : (<>Lanjut <ChevronRight className="h-4 w-4" /></>)}</button>
        </div>
      </div>
    </div>
  );
}
