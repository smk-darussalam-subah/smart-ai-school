'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Briefcase, Users, GraduationCap, Loader2, Check, X, ShieldCheck,
  CalendarDays, UserPlus, Info, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { assignPositionAction, unassignPositionAction, syncRolesAction } from '../actions';
import { toast } from 'sonner';
import type { Position, Assignment, Major, StaffCandidate } from '../page';

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  STRUKTURAL: { label: 'Struktural', cls: 'bg-emerald-100 text-emerald-700' },
  FUNGSIONAL: { label: 'Fungsional', cls: 'bg-sky-100 text-sky-700' },
  TENDIK: { label: 'Tenaga Kependidikan', cls: 'bg-amber-100 text-amber-700' },
};
const CATEGORY_ORDER = ['STRUKTURAL', 'FUNGSIONAL', 'TENDIK'];

// TF-1: label peran untuk dropdown pegawai. Sebelumnya item hanya menampilkan
// nama + email, tanpa konteks peran — admin harus menebak apakah user adalah
// Guru, TU, atau Kepala Sekolah.
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};
const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

interface Props {
  positions: Position[];
  academicYear: { id: string; code: string } | null;
  assignments: Assignment[];
  majors: Major[];
  staff: StaffCandidate[];
  isSuperAdmin: boolean;
}

interface SyncResult {
  created: string[];
  existing: string[];
  failed: { code: string; error: string }[];
}

export default function StrukturClient({ positions, academicYear, assignments, majors, staff, isSuperAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // dialog penugasan
  const [target, setTarget] = useState<Position | null>(null);
  const [userId, setUserId] = useState('');
  const [majorId, setMajorId] = useState('');

  // R-23: Sinkronisasi Keycloak roles
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

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
    setTarget(p); setUserId(''); setMajorId('');
  };

  const submitAssign = async () => {
    if (!target || !academicYear) return;
    if (!userId) { toast.error('Pilih pegawai dulu.'); return; }
    if (target.scopeType === 'MAJOR' && !majorId) { toast.error('Pilih jurusan dulu.'); return; }
    setBusy(true);
    const res = await assignPositionAction({
      userId,
      positionId: target.id,
      academicYearId: academicYear.id,
      ...(target.scopeType === 'MAJOR' ? { majorId } : {}),
    });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setTarget(null); toast.success('Penugasan berhasil disimpan.'); router.refresh();
  };

  const removeAssign = async (a: Assignment) => {
    const res = await unassignPositionAction(a.id);
    if (res.error) { toast.error(`Gagal: ${res.error}`); return; }
    toast.success('Penugasan dilepas.'); router.refresh();
  };

  const handleSyncRoles = async () => {
    setSyncing(true); setSyncResult(null);
    const res = await syncRolesAction();
    setSyncing(false);
    if (res.error) {
      toast.error(`Sinkronisasi gagal: ${res.error}`);
      return;
    }
    setSyncResult(res.data as SyncResult);
    const totalCreated = (res.data as SyncResult)?.created?.length ?? 0;
    const totalExisting = (res.data as SyncResult)?.existing?.length ?? 0;
    const totalFailed = (res.data as SyncResult)?.failed?.length ?? 0;
    if (totalFailed > 0) {
      toast.warning(`Sinkronisasi selesai dengan ${totalFailed} gagalan.`);
    } else {
      toast.success(`Sinkronisasi selesai: ${totalCreated} role baru, ${totalExisting} sudah ada.`);
    }
    router.refresh();
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
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              disabled={syncing}
              onClick={handleSyncRoles}
              title="Daftarkan 13 kode jabatan sebagai Keycloak realm roles (R-23)"
            >
              {syncing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyinkronkan…</>
                : <><RefreshCw className="h-4 w-4" /> Sync Role Keycloak</>
            }
            </Button>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <CalendarDays className="h-4 w-4" /> Tahun Ajaran {academicYear?.code ?? '—'}
          </span>
        </div>
      </div>

      {!academicYear && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Belum ada tahun ajaran aktif. Penugasan tidak dapat dibuat sampai tahun ajaran aktif tersedia.
        </div>
      )}
      {/* R-23: Hasil sinkronisasi Keycloak roles */}
      {syncResult && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm">
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-indigo-800">
            <ShieldCheck className="h-4 w-4" /> Hasil Sinkronisasi Keycloak Realm Roles
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <span className="font-medium text-indigo-700">Dibuat ({syncResult.created.length})</span>
              {syncResult.created.length > 0
                ? <ul className="mt-1 space-y-0.5 text-xs text-indigo-600">{syncResult.created.map((c) => <li key={c}>• {c}</li>)}</ul>
                : <p className="mt-1 text-xs text-muted-foreground">Tidak ada</p>}
            </div>
            <div>
              <span className="font-medium text-emerald-700">Sudah Ada ({syncResult.existing.length})</span>
              {syncResult.existing.length > 0
                ? <ul className="mt-1 space-y-0.5 text-xs text-emerald-600">{syncResult.existing.map((c) => <li key={c}>• {c}</li>)}</ul>
                : <p className="mt-1 text-xs text-muted-foreground">Tidak ada</p>}
            </div>
            <div>
              <span className="font-medium text-red-600">Gagal ({syncResult.failed.length})</span>
              {syncResult.failed.length > 0
                ? <ul className="mt-1 space-y-0.5 text-xs text-red-600">{syncResult.failed.map((f) => <li key={f.code}>• {f.code}: {f.error}</li>)}</ul>
                : <p className="mt-1 text-xs text-muted-foreground">Tidak ada</p>}
            </div>
          </div>
        </div>
      )}

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
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={!academicYear}
                      onClick={() => openAssign(p)}
                      // TF-3: Tooltip + label dinamis — jabatan bisa dipegang bersama.
                      title="Jabatan bisa dipegang bersama oleh beberapa pegawai."
                    >
                      <UserPlus className="h-4 w-4" /> {list.length > 0 ? '+ Tambah Penanggung Jawab' : 'Tetapkan'}
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
          <div className="space-y-4">
            <div>
              <Label>Pegawai</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Pilih pegawai…" /></SelectTrigger>
                <SelectContent>
                  {staff.length === 0
                    ? // TF-1: Actionable empty state. Sebelumnya hanya "Belum ada pegawai"
                      // tanpa panduan recovery. Sekarang admin tahu syarat dan langkah.
                      <SelectItem value="__none" disabled>
                        Belum ada pegawai (Guru/TU/KS). Tambahkan di Manajemen Pengguna.
                      </SelectItem>
                    : staff.map((s) => (
                      // TF-1: Tampilkan label peran, bukan hanya email.
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName} · {roleLabel(s.role)}{s.email ? ` · ${s.email}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {/* TF-1: Actionable helper link ke Manajemen Pengguna. */}
              {staff.length === 0 && (
                <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="mb-1.5">
                    Hanya user dengan peran <strong>Guru</strong>, <strong>Tata Usaha</strong>, atau
                    <strong> Kepala Sekolah</strong> yang muncul di daftar ini.
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold text-amber-900 underline hover:text-amber-700"
                    onClick={() => router.push('/dashboard/users')}
                  >
                    <UserPlus className="h-3 w-3" /> Kelola Pengguna →
                  </button>
                </div>
              )}
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
            {/* TF-2: Microcopy diklarifikasi — sebelumnya ambigu "selama penugasan aktif". */}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Izin modul terkait jabatan aktif segera setelah disimpan, dan dicabut otomatis
              saat penugasan dilepas atau tahun ajaran berganti.
              {academicYear && <> Berlaku di tahun ajaran {academicYear.code}.</>}
            </p>
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
