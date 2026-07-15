'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  Briefcase, Users, GraduationCap, Loader2, Check, X, ShieldCheck,
  CalendarDays, UserPlus, Info, RefreshCw, Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { assignPositionAction, unassignPositionAction, syncRolesAction, getPositionPermissionsAction, setPositionPermissionsAction } from '../actions';
import { toast } from 'sonner';
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
  permissions: { id: string; code: string; description: string; module: string }[];
  isSuperAdmin: boolean;
}

interface SyncResult {
  created: string[];
  existing: string[];
  failed: { code: string; error: string }[];
}

export default function StrukturClient({ positions, academicYear, assignments, majors, staff, permissions, isSuperAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // dialog penugasan
  const [target, setTarget] = useState<Position | null>(null);
  const [userId, setUserId] = useState('');
  const [majorId, setMajorId] = useState('');

  // R-23: Sinkronisasi Keycloak roles
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Step 0.10: Permission mapping dialog
  const [permTarget, setPermTarget] = useState<Position | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permModuleFilter, setPermModuleFilter] = useState<string>('all');

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

  // Step 0.10: Permission mapping handlers
  const openPermDialog = async (p: Position) => {
    setPermTarget(p);
    setPermLoading(true);
    setPermModuleFilter('all');
    const res = await getPositionPermissionsAction(p.id);
    if (res.data && 'permissions' in (res.data as object)) {
      const perms = (res.data as { permissions: { id: string }[] }).permissions;
      setPermSelected(new Set(perms.map((pp) => pp.id)));
    } else {
      setPermSelected(new Set());
    }
    setPermLoading(false);
  };

  const togglePerm = (id: string) => {
    setPermSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const savePermMapping = async () => {
    if (!permTarget) return;
    setPermSaving(true);
    const res = await setPositionPermissionsAction(permTarget.id, [...permSelected]);
    setPermSaving(false);
    if (res.error) { toast.error(`Gagal: ${res.error}`); return; }
    toast.success(`Izin ${permTarget.name} disimpan (${permSelected.size} modul).`);
    setPermTarget(null);
    router.refresh();
  };

  const permModules = useMemo(() => {
    const modules = new Set(permissions.map((p) => p.module));
    return ['all', ...Array.from(modules).sort()];
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    if (permModuleFilter === 'all') return permissions;
    return permissions.filter((p) => p.module === permModuleFilter);
  }, [permissions, permModuleFilter]);

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
                    <div className="flex shrink-0 items-center gap-2">
                      {isSuperAdmin && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openPermDialog(p)}>
                          <Settings2 className="h-4 w-4" /> Kelola Izin
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={!academicYear} onClick={() => openAssign(p)}>
                        <UserPlus className="h-4 w-4" /> Tetapkan
                      </Button>
                    </div>
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

      {/* Step 0.10: Dialog Kelola Izin per Position */}
      <Dialog open={!!permTarget} onOpenChange={(o: boolean) => { if (!o) setPermTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Kelola Izin: {permTarget?.name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Pilih modul yang dapat diakses oleh pemegang jabatan ini. Izin diterapkan otomatis saat penugasan aktif.
            </p>
          </DialogHeader>

          {permLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Module filter */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Filter modul:</span>
                {permModules.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPermModuleFilter(m)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      permModuleFilter === m
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {m === 'all' ? 'Semua' : m}
                  </button>
                ))}
              </div>

              {/* Permission list */}
              <div className="rounded-lg border divide-y">
                {filteredPermissions.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Tidak ada izin untuk ditampilkan.</p>
                ) : (
                  filteredPermissions.map((perm) => (
                    <label
                      key={perm.id}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={permSelected.has(perm.id)}
                        onChange={() => togglePerm(perm.id)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">{perm.code}</div>
                        <div className="text-xs text-muted-foreground">{perm.description}</div>
                      </div>
                      <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {perm.module}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5 text-sm">
                <span className="text-emerald-700">
                  <b>{permSelected.size}</b> modul dipilih dari <b>{permissions.length}</b> total
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPermTarget(null)}>Batal</Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  disabled={permSaving}
                  onClick={savePermMapping}
                >
                  {permSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : <><Check className="h-4 w-4" /> Simpan Izin</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
