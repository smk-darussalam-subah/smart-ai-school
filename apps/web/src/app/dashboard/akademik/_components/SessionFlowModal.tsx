'use client';
import { useState } from 'react';
import {
  PlayCircle, X, ChevronLeft, ChevronRight, Flag, CalendarCheck, Search,
  BookOpen, ClipboardCheck, ClipboardPenLine, MessageCircle, PenLine, Check, Info,
} from 'lucide-react';
import type { TodayClass } from './guru-types';

interface Props {
  session: TodayClass | null;
  onAbsen: (c: { classId: string; className: string }) => void;
  onJurnal: (c: { classId: string; className: string; subject: string; startLabel: string; jpStart: number }) => void;
  onOpenPenilaian: (session: TodayClass, mode: 'preview' | 'monitor', tab: 'diag' | 'form' | 'fb') => void;
  onNavigate: (screen: string) => void;
  onClose: () => void;
}

// SIMULASI — session flow belum memiliki backend tersendiri.
// Steps mengikuti in-class procedure: Pembukaan → Absen → Diagnostik → Materi → Formatif → Nilai → Feedback → Jurnal
const SESSION_STEPS = [
  { n: 'Pembukaan', icon: Flag, d: 'Buka sesi, sampaikan tujuan pembelajaran & apersepsi' },
  { n: 'Absensi', icon: CalendarCheck, d: 'Catat kehadiran siswa beserta keterangan' },
  { n: 'Diagnostik', icon: Search, d: 'Cek pengetahuan awal siswa sebelum materi inti' },
  { n: 'Materi Inti', icon: BookOpen, d: 'Sampaikan materi sesuai progres CP/TP dari Modul Ajar' },
  { n: 'Formatif', icon: ClipboardCheck, d: 'Berikan asesmen formatif (PG/proyek/praktikum)' },
  { n: 'Penilaian', icon: ClipboardPenLine, d: 'Pantau & nilai pengerjaan siswa secara realtime' },
  { n: 'Feedback', icon: MessageCircle, d: 'Berikan feedback kepada siswa' },
  { n: 'Jurnal', icon: PenLine, d: 'Tulis jurnal mengajar & catat kendala' },
] as const;

export default function SessionFlowModal({ session, onAbsen, onJurnal, onOpenPenilaian, onNavigate, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState<Record<number, boolean>>({});

  if (!session) return null;

  const current = SESSION_STEPS[step - 1];
  if (!current) return null;
  const CurrentIcon = current.icon;
  const isLast = step === 8;

  const handleAction = () => {
    switch (step) {
      case 2: onAbsen({ classId: session.classId, className: session.className }); break;
      case 3: onOpenPenilaian(session, 'preview', 'diag'); break;
      case 4: onNavigate('pembelajaran'); break;
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
  const toggleDone = () => setDone((p) => ({ ...p, [step]: !p[step] }));

  // Step-specific extra content
  let extra: React.ReactNode = null;
  if (step === 1) {
    extra = (
      <div className="space-y-2.5">
        <div><label className="text-[11px] font-bold text-[#6b8079]">Modul Ajar</label><input value="TP 3.3 — Flexbox & Desain Responsif" readOnly className="mt-1 w-full rounded-lg border border-[#e6efea] bg-[#f4f7f5] px-3 py-2 text-[12px] text-[#355a4e]" /></div>
        <div><label className="text-[11px] font-bold text-[#6b8079]">Tujuan Pembelajaran</label><textarea rows={2} readOnly className="mt-1 w-full rounded-lg border border-[#e6efea] bg-[#f4f7f5] px-3 py-2 text-[12px] text-[#355a4e]">Peserta didik mampu menerapkan justify-content dan align-items untuk menyusun layout</textarea></div>
        <div><label className="text-[11px] font-bold text-[#6b8079]">Apersepsi</label><textarea rows={2} placeholder="Pertanyaan pembuka untuk siswa..." className="mt-1 w-full rounded-lg border border-[#e6efea] px-3 py-2 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300" /></div>
      </div>
    );
  } else if (step === 4) {
    extra = (
      <div>
        <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[11.5px] text-sky-700"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Klik <b>Buka Modul Ajar</b> untuk melihat progres {session.subject} di {session.className}. Sistem otomatis mengarahkan ke TP yang sedang berjalan.</span></div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#6b8079]">Progres CP</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e6efea]"><div className="h-full rounded-full bg-emerald-500" style={{ width: '64%' }} /></div>
          <span className="text-[11px] font-bold text-[#6b8079]">64% (5/8 TP)</span>
        </div>
      </div>
    );
  } else if (step === 5) {
    extra = <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Formatif: <b>PG (auto-grade)</b>, <b>Essay (rubrik)</b>, <b>Praktikum (observasi)</b>. Nilai otomatis masuk Gradebook kolom UH.</span></div>;
  } else if (step === 6) {
    extra = <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700"><ClipboardPenLine className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b>Realtime Monitor</b> — pantau progres siswa. Nilai otomatis tersinkron ke Gradebook saat siswa selesai.</span></div>;
  } else if (step === 7) {
    extra = (
      <div className="rounded-xl border border-[#e6efea] p-4">
        <div className="flex items-center gap-4">
          <div className="text-[36px]">🙂</div>
          <div className="text-[14px] font-bold text-[#0f2e25]">82/100</div>
        </div>
        <textarea className="mt-3 w-full rounded-lg border border-[#e6efea] p-2.5 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300" rows={2} placeholder="Catatan feedback untuk kelas..." defaultValue="Materi seru, agak cepat di media query. Sebagian siswa perlu latihan tambahan." />
      </div>
    );
  } else if (step === 8) {
    extra = (
      <div className="space-y-2.5">
        <div><label className="text-[11px] font-bold text-[#6b8079]">TP yang diajarkan</label><input defaultValue="TP 3.3 — Flexbox & responsif" className="mt-1 w-full rounded-lg border border-[#e6efea] px-3 py-2 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300" /></div>
        <div><label className="text-[11px] font-bold text-[#6b8079]">Catatan/kendala</label><textarea rows={2} placeholder="mis. 2 siswa perlu pendampingan..." className="mt-1 w-full rounded-lg border border-[#e6efea] px-3 py-2 text-[12px] text-[#0f2e25] outline-none focus:border-emerald-300" /></div>
      </div>
    );
  }

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
            <p className="text-[11px] text-[#6b8079]">Panduan in-class procedure: Pembukaan → Absen → Diagnostik → Materi → Formatif → Nilai → Feedback → Jurnal</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>

        {/* Step progress indicator */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {SESSION_STEPS.map((st, i) => {
            const idx = i + 1;
            const isDone = idx < step || done[idx];
            const isCurrent = idx === step;
            return (
              <div key={idx} className="flex items-center gap-1">
                <div className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-extrabold ${isDone || isCurrent ? 'bg-emerald-600 text-white' : 'bg-[#f4f7f5] text-[#9bb0a8]'}`}>
                  {isDone ? '✓' : idx}
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
              <p className="text-[11.5px] text-[#6b8079]">{current.d}</p>
            </div>
            {done[step] && <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓</span>}
          </div>
          <div className="mt-3">{extra}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {act && ActIcon && <button type="button" onClick={handleAction} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11.5px] font-bold text-white hover:bg-emerald-700"><ActIcon className="h-3.5 w-3.5" />{act.label}</button>}
            <button type="button" onClick={toggleDone} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-bold ${done[step] ? 'border border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]' : 'bg-[#f4f7f5] text-[#355a4e]'}`}>{done[step] ? 'Batalkan' : 'Tandai Selesai'}</button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">Tutup</button>
          {step > 1 && <button type="button" onClick={handlePrev} className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><ChevronLeft className="h-4 w-4" /></button>}
          <button type="button" onClick={handleNext} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">{isLast ? (<><Check className="h-4 w-4" />Selesai Sesi</>) : (<>Lanjut <ChevronRight className="h-4 w-4" /></>)}</button>
        </div>
      </div>
    </div>
  );
}
