'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Briefcase, Users, GraduationCap, Loader2, Check, X, ShieldCheck,
  CalendarDays, UserPlus, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { assignPositionAction, unassignPositionAction } from '../actions';
import type { Position, Assignment, Major, StaffCandidate } from '../page';

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  STRUKTURAL: { label: 'Struktural', cls: 'bg-emerald-100 text-emerald-700' },
  FUNGSIONAL: { label: 'Fungsional', cls: 'bg-sky-100 text-sky-700' },
  TENDIK: { label: 'Tenaga Kependidikan', cls: 'bg-amber-100 text-amber-700' },
};
const CATEGORY_ORDER = ['STRUKTURAL', 'FUNGSIONAL', 'TENDIK'];

interface Props {
  positions: Position[];
  academicYear: { id: string; code: string } | null;
  assignments: Assignment[];
  majors: Major[];
  staff: StaffCandidate[];
}

export default function StrukturClient({ positions, academicYear, assignments, majors, staff }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // dialog penugasan
  const [target, setTarget] = useState<Position | null>(null);
  const [userId, setUserId] = useState('');
  const [majorId, setMajorId] = useState('');

  const nameById = useMemo(() => new Map(positions.map((p) => [p.id, p.name])), [positions]);
  const byPosition = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = m.get(a.positionId) ?? [];
      arr.push(a);
      m.set(a.positionId, arr);
    }
    return m;
  }, [assignments]);

  const openAssign = (p: Position) => {
    setTarget(p); setUserId(''); setMajorId(''); setErr('');
  };

  const submitAssign = async () => {
    if (!target || !academicYear) return;
    if (!userId) { setErr('Pilih pegawai dulu.'); return; }
    if (target.scopeType === 'MAJOR' && !majorId) { setErr('Pilih jurusan dulu.'); return; }
    setBusy(true); setErr('');
    const res = await assignPositionAction({
      userId,
      positionId: target.id,
      academicYearId: academicYear.id,
      ...(target.scopeType === 'MAJOR' ? { majorId } : {}),
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setTarget(null); setMsg('Penugasan berhasil disimpan.'); router.refresh();
  };

  const removeAssign = async (a: Assignment) => {
    setMsg(''); setErr('');
    const res = await unassignPositionAction(a.id);
    if (res.error) { setMsg(`Gagal: ${res.error}`); return; }
    setMsg('Penugasan dilepas.'); router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Briefcase className="h-5 w-5" /></span>
            Struktur Organisasi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Tetapkan jabatan ke pegawai per tahun ajaran. Jabatan otomatis memberi akses modul terkait.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          <CalendarDays className="h-4 w-4" /> Tahun Ajaran {academicYear?.code ?? '—'}
        </span>
      </div>

      {!academicYear && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Belum ada tahun ajaran aktif. Penugasan tidak dapat dibuat sampai tahun ajaran aktif tersedia.
        </div>
      )}
      {msg && <div className={clsx('rounded-lg px-4 py-2 text-sm', msg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg}</div>}

      {CATEGORY_ORDER.map((cat) => {
        const items = positions.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', CATEGORY_META[cat]?.cls)}>{CATEGORY_META[cat]?.label}</span>
              <span className="text-sm text-muted-foreground">{items.length} jabatan</span>
            </div>
            <div className="divide-y">
              {items.map((p) => {
                const list = byPosition.get(p.id) ?? [];
                return (
                  <div key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        {p.scopeType === 'MAJOR' && <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700"><GraduationCap className="h-3 w-3" /> per jurusan</span>}
                        {p.parentId && <span className="text-[11px] text-muted-foreground">di bawah {nameById.get(p.parentId) ?? '—'}</span>}
                        {p._count.permissions > 0 && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" /> {p._count.permissions} akses modul</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {list.length === 0
                          ? <span className="text-sm text-muted-foreground">Belum ada penanggung jawab.</span>
                          : list.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800">
                              <Users className="h-3.5 w-3.5" />
                              {a.staff.user.fullName}{a.major ? ` · ${a.major.code}` : ''}
                              <button onClick={() => removeAssign(a)} className="ml-0.5 text-emerald-600 hover:text-red-600" title="Lepas"><X className="h-3.5 w-3.5" /></button>
                            </span>
                          ))}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={!academicYear} onClick={() => openAssign(p)}>
                      <UserPlus className="h-4 w-4" /> Tetapkan
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Dialog penugasan */}
      <Dialog open={!!target} onOpenChange={(o: boolean) => { if (!o) setTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tetapkan: {target?.name}</DialogTitle></DialogHeader>
          {err && <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" /> {err}</div>}
          <div className="space-y-4">
            <div>
              <Label>Pegawai</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Pilih pegawai…" /></SelectTrigger>
                <SelectContent>
                  {staff.length === 0
                    ? <SelectItem value="__none" disabled>Belum ada pegawai</SelectItem>
                    : staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName} · {s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {target?.scopeType === 'MAJOR' && (
              <div>
                <Label>Jurusan</Label>
                <Select value={majorId} onValueChange={setMajorId}>
                  <SelectTrigger><SelectValue placeholder="Pilih jurusan…" /></SelectTrigger>
                  <SelectContent>
                    {majors.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Akses modul terkait jabatan diberikan otomatis selama penugasan aktif.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setTarget(null)}>Batal</Button>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={submitAssign}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : <><Check className="h-4 w-4" /> Simpan</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
