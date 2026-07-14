'use client';

// Manajemen Tahun Ajaran & Semester (SA + KS). Buat TA/semester baru & set aktif
// (aktivasi otomatis menonaktifkan yang lama — ditangani backend). Inilah cara
// self-service memulai tahun ajaran baru, menggantikan seed/SQL manual.

import { useState, useTransition } from 'react';
import {
  CalendarRange, Plus, CheckCircle2, Power, AlertTriangle, Loader2, CalendarDays, Pencil,
} from 'lucide-react';
import { fmtDateShort } from '@/lib/academic';
import {
  createAcademicYear, activateAcademicYear, createSemester, activateSemester,
  updateAcademicYearAction, updateSemesterAction,
} from '../actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface AcademicYearRow {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
export interface SemesterRow {
  id: string;
  academicYearId: string;
  number: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  academicYear?: { code: string };
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';

export default function TahunAjaranClient({ years, semesters }: { years: AcademicYearRow[]; semesters: SemesterRow[] }) {
  const [yearDialog, setYearDialog] = useState(false);
  const [semForYear, setSemForYear] = useState<AcademicYearRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editTarget, setEditTarget] = useState<{ type: 'year' | 'semester'; id: string; code: string; startDate: string; endDate: string } | null>(null);

  const sortedYears = [...years].sort((a, b) => b.code.localeCompare(a.code));
  const activeYear = years.find((y) => y.isActive);
  const activeSem = semesters.find((s) => s.isActive);

  // M1: Now includes successMsg so user gets feedback on successful activation.
  const run = (id: string, fn: () => Promise<{ success: boolean; error?: string }>, successMsg?: string) => {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.success) toast.error(res.error ?? 'Aksi gagal.');
      else if (successMsg) toast.success(successMsg);
    });
  };

  const [confirmState, setConfirmState] = useState<{ title: string; description: string; action: () => void } | null>(null);

  const doActivateYear = (y: AcademicYearRow) => {
    setConfirmState({
      title: 'Aktifkan Tahun Ajaran',
      description: `Aktifkan Tahun Ajaran ${y.code}? Tahun ajaran aktif lainnya akan dinonaktifkan.`,
      action: () => run(y.id, () => activateAcademicYear(y.id), `Tahun ajaran ${y.code} diaktifkan.`),
    });
  };
  const doActivateSem = (s: SemesterRow) => {
    setConfirmState({
      title: 'Aktifkan Semester',
      description: `Aktifkan Semester ${s.number} (${s.academicYear?.code ?? ''})? Semester aktif lainnya akan dinonaktifkan.`,
      action: () => run(s.id, () => activateSemester(s.id), `Semester ${s.number} diaktifkan.`),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#0f2e25]">
            <CalendarRange className="h-6 w-6 text-emerald-600" />Tahun Ajaran &amp; Semester
          </h1>
          <p className="text-sm text-[#6b8079]">Kelola periode akademik. Aktifkan TA &amp; semester saat memulai tahun ajaran baru.</p>
        </div>
        <button type="button" onClick={() => { setYearDialog(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" />Buat Tahun Ajaran
        </button>
      </div>

      {/* Status aktif */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <span className="text-[13px] font-semibold text-emerald-800">
          Aktif sekarang: {activeYear ? `TA ${activeYear.code}` : 'belum ada TA aktif'}
          {activeSem ? ` · Semester ${activeSem.number}` : ' · belum ada semester aktif'}
        </span>
      </div>

      {sortedYears.length === 0 ? (
        <div className="grid h-32 place-items-center rounded-2xl border border-[#e6efea] bg-white text-[13px] font-medium text-[#9bb0a8]">
          Belum ada tahun ajaran. Klik <b className="mx-1">Buat Tahun Ajaran</b> untuk memulai.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedYears.map((y) => {
            const sems = semesters.filter((s) => s.academicYearId === y.id).sort((a, b) => a.number - b.number);
            return (
              <div key={y.id} className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays className="h-5 w-5" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] font-bold text-[#0f2e25]">TA {y.code}</span>
                        {y.isActive && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">AKTIF</span>}
                      </div>
                      <div className="text-[12px] text-[#6b8079]">{fmtDateShort(y.startDate)} – {fmtDateShort(y.endDate)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditTarget({ type: 'year', id: y.id, code: y.code, startDate: y.startDate.slice(0, 10), endDate: y.endDate.slice(0, 10) })}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                      <Pencil className="h-3.5 w-3.5" />Edit Tanggal
                    </button>
                    {!y.isActive && (
                      <button type="button" onClick={() => doActivateYear(y)} disabled={pending && busyId === y.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                        {pending && busyId === y.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}Aktifkan TA
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 border-t border-[#f0f4f2] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-[#6b8079]">Semester</span>
                    <button type="button" onClick={() => { setSemForYear(y); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                      <Plus className="h-3.5 w-3.5" />Tambah Semester
                    </button>
                  </div>
                  {sems.length === 0 ? (
                    <p className="mt-2 text-[12px] text-[#9bb0a8]">Belum ada semester untuk TA ini.</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {sems.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-xl border border-[#e6efea] px-3 py-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-bold text-[#0f2e25]">Semester {s.number}</span>
                              {s.isActive && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">AKTIF</span>}
                            </div>
                            <div className="text-[11px] text-[#6b8079]">{fmtDateShort(s.startDate)} – {fmtDateShort(s.endDate)}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setEditTarget({ type: 'semester', id: s.id, code: `Semester ${s.number}`, startDate: s.startDate.slice(0, 10), endDate: s.endDate.slice(0, 10) })}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                              <Pencil className="h-3 w-3" />
                            </button>
                            {!s.isActive && (
                              <button type="button" onClick={() => doActivateSem(s)} disabled={pending && busyId === s.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                                {pending && busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}Aktifkan
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {yearDialog && <YearDialog onClose={() => setYearDialog(false)} onErr={(e: string | null) => e ? toast.error(e) : toast.success('Tahun ajaran dibuat.')} />}
      {semForYear && <SemesterDialog year={semForYear} onClose={() => setSemForYear(null)} onErr={(e: string | null) => e ? toast.error(e) : toast.success('Semester dibuat.')} />}
      {editTarget && <EditDateDialog target={editTarget} onClose={() => setEditTarget(null)} />}
      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(o: boolean) => !o && setConfirmState(null)}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        variant="warning"
        confirmLabel="Aktifkan"
        onConfirm={() => { confirmState?.action(); }}
      />
    </div>
  );
}

// M2: Replaced custom Overlay with shared Dialog component for WCAG 2.1 AA compliance
// (focus trap, aria-modal, ESC-to-close, screen reader support).

function YearDialog({ onClose, onErr }: { onClose: () => void; onErr: (e: string | null) => void }) {
  const [code, setCode] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [isActive, setActive] = useState(true);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setLocal(null);
    if (!/^\d{4}\/\d{4}$/.test(code)) return setLocal('Kode harus format YYYY/YYYY, mis. 2026/2027.');
    if (!startDate || !endDate) return setLocal('Tanggal mulai & selesai wajib diisi.');
    if (endDate <= startDate) return setLocal('Tanggal selesai harus setelah tanggal mulai.');
    startTransition(async () => {
      const res = await createAcademicYear({ code, startDate, endDate, isActive });
      if (!res.success) return setLocal(res.error ?? 'Gagal menyimpan.');
      onErr(null); onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Tahun Ajaran</DialogTitle>
          <DialogDescription>Isi data tahun ajaran baru.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Kode (YYYY/YYYY)">
            <input value={code} onChange={(e) => setCode(e.target.value)} className={FIELD} placeholder="2026/2027" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Mulai"><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={FIELD} /></Labeled>
            <Labeled label="Selesai"><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={FIELD} /></Labeled>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#355a4e]">
            <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Jadikan aktif (menonaktifkan TA aktif lainnya)
          </label>
          {local && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{local}</div>}
        </div>
        <DialogButtons onClose={onClose} onSave={save} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}

function SemesterDialog({ year, onClose, onErr }: { year: AcademicYearRow; onClose: () => void; onErr: (e: string | null) => void }) {
  const [number, setNumber] = useState('1');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [isActive, setActive] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setLocal(null);
    if (!startDate || !endDate) return setLocal('Tanggal mulai & selesai wajib diisi.');
    if (endDate <= startDate) return setLocal('Tanggal selesai harus setelah tanggal mulai.');
    startTransition(async () => {
      const res = await createSemester({ academicYearId: year.id, number: Number(number), startDate, endDate, isActive });
      if (!res.success) return setLocal(res.error ?? 'Gagal menyimpan.');
      onErr(null); onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Semester — TA {year.code}</DialogTitle>
          <DialogDescription>Isi data semester baru.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Semester">
            <select value={number} onChange={(e) => setNumber(e.target.value)} className={FIELD}>
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Mulai"><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={FIELD} /></Labeled>
            <Labeled label="Selesai"><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={FIELD} /></Labeled>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#355a4e]">
            <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Jadikan aktif (menonaktifkan semester aktif lainnya)
          </label>
          {local && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{local}</div>}
        </div>
        <DialogButtons onClose={onClose} onSave={save} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Tanggal Dialog ──────────────────────────────────────────────────────

function EditDateDialog({ target, onClose }: {
  target: { type: 'year' | 'semester'; id: string; code: string; startDate: string; endDate: string };
  onClose: () => void;
}) {
  const [startDate, setStart] = useState(target.startDate);
  const [endDate, setEnd] = useState(target.endDate);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setLocal(null);
    if (!startDate || !endDate) return setLocal('Tanggal mulai & selesai wajib diisi.');
    if (endDate <= startDate) return setLocal('Tanggal selesai harus setelah tanggal mulai.');
    startTransition(async () => {
      const action = target.type === 'year' ? updateAcademicYearAction : updateSemesterAction;
      const res = await action(target.id, { startDate, endDate });
      if (!res.success) return setLocal(res.error ?? 'Gagal menyimpan.');
      toast.success(`Tanggal ${target.code} diperbarui.`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Tanggal — {target.code}</DialogTitle>
          <DialogDescription>Perbaiki tanggal mulai dan selesai.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Mulai"><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={FIELD} /></Labeled>
            <Labeled label="Selesai"><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={FIELD} /></Labeled>
          </div>
          {local && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{local}</div>}
        </div>
        <DialogButtons onClose={onClose} onSave={save} pending={pending} />
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">{label}</span>
      {children}
    </label>
  );
}

function DialogButtons({ onClose, onSave, pending }: { onClose: () => void; onSave: () => void; pending: boolean }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={pending}
        className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">Batal</button>
      <button type="button" onClick={onSave} disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Simpan
      </button>
    </div>
  );
}
