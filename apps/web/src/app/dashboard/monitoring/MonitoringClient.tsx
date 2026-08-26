'use client';

import { type MouseEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Clipboard,
  Clock3,
  Copy,
  LoaderCircle,
  MonitorCog,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DisplaySession } from '@/lib/display-contract';
import { displayProfileLabel } from '@/lib/display-contract';
import { isSnapshotStale } from '@/lib/display-state';
import {
  canBecomeAudibleLeader,
  displayCredentialActionLabel,
  filterMonitoringSessions,
  formatMonitoringTime,
  monitoringInitialClock,
  restoreMonitoringDialogFocus,
  type MonitoringDevice,
  type MonitoringFilters,
  type MonitoringSnapshot,
} from '@/components/monitoring/monitoring-contract';
import {
  createDisplayPairingAction,
  revokeAllDisplayDevicesAction,
  revokeDisplayDeviceAction,
  rotateDisplayDeviceAction,
  setDisplayAudibleLeaderAction,
  type PairingResult,
} from './actions';

const STATUS_LABEL: Record<DisplaySession['status'], string> = {
  SCHEDULED: 'Terjadwal',
  REASSIGNED: 'Dialihkan',
  STARTED: 'Berlangsung',
  COMPLETED: 'Selesai',
  MISSED: 'Tidak dimulai',
  CANCELLED: 'Dibatalkan',
  SUPERSEDED: 'Digantikan',
};

const STATUS_TONE: Record<DisplaySession['status'], string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700',
  REASSIGNED: 'bg-blue-50 text-blue-800',
  STARTED: 'bg-emerald-50 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-900',
  MISSED: 'bg-red-50 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  SUPERSEDED: 'bg-amber-50 text-amber-900',
};

function SummaryRail({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const values = [
    ['Terjadwal', snapshot.summary.scheduled, 'text-slate-800'],
    ['Berlangsung', snapshot.summary.started, 'text-emerald-800'],
    ['Selesai', snapshot.summary.completed, 'text-emerald-900'],
    ['Tidak dimulai', snapshot.summary.missed, 'text-red-800'],
    ['Perlu tindakan', snapshot.summary.attention, 'text-amber-900'],
  ] as const;
  return (
    <section
      aria-label="Ringkasan hari sekolah"
      className="overflow-x-auto rounded-lg border border-slate-200 bg-white"
    >
      <div className="grid min-w-[44rem] grid-cols-[1.25fr_repeat(5,1fr)] divide-x divide-slate-200">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Segmen aktif</p>
          <p className="mt-1 font-semibold text-slate-900">
            {snapshot.currentSegment ?? 'Di luar jam pelajaran'}
          </p>
        </div>
        {values.map(([label, value, tone]) => (
          <div key={label} className="px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MonitoringClient({
  initialSnapshot,
  initialDevices,
  initialError,
  deviceWarning,
  canManageDevices,
  forbidden = false,
}: {
  initialSnapshot: MonitoringSnapshot | null;
  initialDevices: MonitoringDevice[];
  initialError: string | null;
  deviceWarning?: string | null;
  canManageDevices: boolean;
  forbidden?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clock, setClock] = useState(() => monitoringInitialClock(initialSnapshot?.generatedAt));
  const [filters, setFilters] = useState<MonitoringFilters>({
    query: '',
    status: 'ALL',
    attentionOnly: false,
  });
  const [selectedSession, setSelectedSession] = useState<DisplaySession | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairResult, setPairResult] = useState<PairingResult | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MonitoringDevice | 'ALL' | null>(null);
  const dialogReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  function rememberDialogTrigger(event: MouseEvent<HTMLButtonElement>) {
    dialogReturnFocusRef.current = event.currentTarget;
  }

  function restoreDialogFocus(event: Event) {
    event.preventDefault();
    restoreMonitoringDialogFocus(dialogReturnFocusRef.current);
  }

  useEffect(() => {
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const stale = initialSnapshot
    ? isSnapshotStale(initialSnapshot.generatedAt, initialSnapshot.staleAfterSeconds, clock)
    : false;
  const visibleSessions = useMemo(
    () => filterMonitoringSessions(initialSnapshot?.sessions ?? [], filters),
    [initialSnapshot, filters],
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function createPairing(formData: FormData) {
    setMutationError(null);
    const profile = formData.get('profile');
    const label = String(formData.get('label') ?? '').trim();
    if (!label || (profile !== 'RUANG_GURU' && profile !== 'RUANG_TU')) {
      setMutationError('Nama perangkat dan profil wajib dipilih.');
      return;
    }
    const result = await createDisplayPairingAction({
      label,
      profile,
      audioEnabled: profile === 'RUANG_GURU',
    });
    if (result.error || !result.data) {
      setMutationError(result.error ?? 'Kode pairing belum dapat dibuat.');
      return;
    }
    setPairResult(result.data);
    refresh();
  }

  async function rotate(device: MonitoringDevice) {
    setMutationError(null);
    const result = await rotateDisplayDeviceAction(device.id);
    if (result.error || !result.data) {
      setMutationError(result.error ?? 'Kredensial perangkat belum dapat diputar.');
      return;
    }
    setPairResult(result.data);
    setPairOpen(true);
    refresh();
  }

  async function setAudibleLeader(device: MonitoringDevice) {
    setMutationError(null);
    const result = await setDisplayAudibleLeaderAction(device.id);
    if (result.error) {
      setMutationError(result.error);
      return;
    }
    refresh();
  }

  async function confirmRevoke() {
    if (!confirmTarget) return;
    setMutationError(null);
    const result =
      confirmTarget === 'ALL'
        ? await revokeAllDisplayDevicesAction()
        : await revokeDisplayDeviceAction(confirmTarget.id);
    if (result.error) {
      setMutationError(result.error);
      return;
    }
    setConfirmTarget(null);
    refresh();
  }

  if (forbidden) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-6" role="alert">
        <div className="flex gap-3">
          <ShieldAlert className="h-6 w-6 shrink-0 text-amber-800" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold text-amber-950">Monitoring tidak tersedia</h1>
            <p className="mt-1 text-sm text-amber-900">{initialError}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">Operasional hari ini</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Monitoring KBM dan perangkat</h1>
          <p className="mt-1 text-sm text-slate-600">
            Status sesi authoritative, alert, dan kesehatan display terpasang.
          </p>
        </div>
        <Button variant="outline" className="min-h-11 gap-2" onClick={refresh} disabled={isPending}>
          <RefreshCw
            className={`h-4 w-4 ${isPending ? 'animate-spin motion-reduce:animate-none' : ''}`}
          />
          Perbarui
        </Button>
      </header>

      {initialError && (
        <section
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Data monitoring gagal dimuat</p>
              <p>{initialError}</p>
              <Button
                variant="outline"
                className="mt-3 min-h-11 border-red-300 bg-white"
                onClick={refresh}
              >
                Coba lagi
              </Button>
            </div>
          </div>
        </section>
      )}

      {initialSnapshot && <SummaryRail snapshot={initialSnapshot} />}

      {stale && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <Clock3 className="h-5 w-5" /> Data terlambat diperbarui. Tampilan akan menyambung ulang
          otomatis; gunakan Perbarui bila diperlukan.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          className="min-w-0 rounded-lg border border-slate-200 bg-white"
          aria-labelledby="session-heading"
        >
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 id="session-heading" className="font-bold text-slate-950">
                  Sesi kelas
                </h2>
                <p className="text-sm text-slate-500">
                  {visibleSessions.length} sesi sesuai filter
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_10rem_auto]">
                <label className="relative">
                  <span className="sr-only">Cari sesi</span>
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    className="h-11 pl-9"
                    value={filters.query}
                    onChange={(event) =>
                      setFilters((value) => ({ ...value, query: event.target.value }))
                    }
                    placeholder="Kelas, mapel, ruang, guru"
                  />
                </label>
                <label>
                  <span className="sr-only">Filter status</span>
                  <select
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((value) => ({
                        ...value,
                        status: event.target.value as MonitoringFilters['status'],
                      }))
                    }
                  >
                    <option value="ALL">Semua status</option>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={filters.attentionOnly}
                    onChange={(event) =>
                      setFilters((value) => ({ ...value, attentionOnly: event.target.checked }))
                    }
                  />{' '}
                  Perlu tindakan
                </label>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-200">
            {visibleSessions.map((session) => (
              <article
                key={session.id}
                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_9rem_8rem_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">
                    {session.className} · {session.subject}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {session.room ?? 'Ruang belum ditetapkan'} ·{' '}
                    {session.teacherName ?? 'Guru belum tersedia'}
                  </p>
                </div>
                <p className="text-sm text-slate-700">
                  {formatMonitoringTime(session.startsAt).split(',').at(-1)} -{' '}
                  {formatMonitoringTime(session.endsAt).split(',').at(-1)}
                </p>
                <span
                  className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${STATUS_TONE[session.status]}`}
                >
                  {STATUS_LABEL[session.status]}
                </span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={(event) => {
                    rememberDialogTrigger(event);
                    setSelectedSession(session);
                  }}
                >
                  Detail
                </Button>
              </article>
            ))}
            {!initialError && visibleSessions.length === 0 && (
              <div className="p-10 text-center">
                <Clipboard className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 font-semibold text-slate-800">Tidak ada sesi sesuai filter</p>
                <p className="mt-1 text-sm text-slate-500">
                  Ubah filter atau tunggu materialisasi jadwal berikutnya.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section
            className="rounded-lg border border-slate-200 bg-white"
            aria-labelledby="alert-heading"
          >
            <div className="border-b border-slate-200 p-4">
              <h2 id="alert-heading" className="font-bold text-slate-950">
                Alert aktif
              </h2>
              <p className="text-sm text-slate-500">Visual queue untuk tindak lanjut</p>
            </div>
            <div className="divide-y divide-slate-200">
              {(initialSnapshot?.alerts ?? [])
                .filter((alert) => !alert.acknowledged)
                .map((alert) => (
                  <div key={alert.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={`mt-0.5 h-5 w-5 shrink-0 ${alert.severity === 'CRITICAL' ? 'text-red-700' : 'text-amber-700'}`}
                      />
                      <div>
                        <p className="font-semibold text-slate-900">{alert.className}</p>
                        <p className="text-sm text-slate-600">
                          {alert.room ?? 'Ruang belum ditetapkan'} · {alert.stage}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              {!initialSnapshot?.alerts.some((alert) => !alert.acknowledged) && (
                <p className="p-4 text-sm text-slate-500">Tidak ada alert aktif.</p>
              )}
            </div>
          </section>

          <section
            className="rounded-lg border border-slate-200 bg-white"
            aria-labelledby="device-heading"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h2 id="device-heading" className="font-bold text-slate-950">
                  Perangkat display
                </h2>
                <p className="text-sm text-slate-500">
                  {initialDevices.length} perangkat terdaftar
                </p>
              </div>
              {canManageDevices && (
                <Button
                  size="icon"
                  className="h-11 w-11"
                  aria-label="Buat pairing perangkat"
                  onClick={(event) => {
                    rememberDialogTrigger(event);
                    setPairResult(null);
                    setMutationError(null);
                    setPairOpen(true);
                  }}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              )}
            </div>
            {deviceWarning && (
              <p
                className="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                role="alert"
              >
                {deviceWarning}
              </p>
            )}
            {mutationError && (
              <p
                className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-900"
                role="alert"
              >
                {mutationError}
              </p>
            )}
            <div className="divide-y divide-slate-200">
              {initialDevices.map((device) => (
                <article key={device.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <MonitorCog className="mt-0.5 h-5 w-5 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-slate-900">{device.label}</p>
                        {device.audibleLeader && (
                          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">
                            Pemimpin audio
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {displayProfileLabel(device.profile)} ·{' '}
                        {device.status === 'ACTIVE'
                          ? 'Aktif'
                          : device.status === 'PENDING'
                            ? 'Menunggu pairing'
                            : device.status === 'EXPIRED'
                              ? 'Kedaluwarsa'
                              : 'Dicabut'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Terlihat:{' '}
                        {device.status === 'EXPIRED'
                          ? 'Kredensial perlu diperbarui'
                          : formatMonitoringTime(device.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  {canManageDevices && device.status !== 'REVOKED' && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {canBecomeAudibleLeader(device) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 sm:col-span-2"
                          onClick={() => void setAudibleLeader(device)}
                        >
                          <Volume2 className="mr-2 h-4 w-4" /> Jadikan pemimpin audio
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        aria-label={`${displayCredentialActionLabel(device.status)} untuk ${device.label}`}
                        onClick={(event) => {
                          rememberDialogTrigger(event);
                          void rotate(device);
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />{' '}
                        {displayCredentialActionLabel(device.status)}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 text-red-700"
                        onClick={(event) => {
                          rememberDialogTrigger(event);
                          setConfirmTarget(device);
                        }}
                      >
                        <Ban className="mr-2 h-4 w-4" /> Cabut
                      </Button>
                    </div>
                  )}
                </article>
              ))}
              {initialDevices.length === 0 && (
                <p className="p-4 text-sm text-slate-500">Belum ada perangkat display terdaftar.</p>
              )}
            </div>
            {canManageDevices && initialDevices.some((device) => device.status !== 'REVOKED') && (
              <div className="border-t border-slate-200 p-3">
                <Button
                  variant="ghost"
                  className="min-h-11 w-full text-red-700"
                  onClick={(event) => {
                    rememberDialogTrigger(event);
                    setConfirmTarget('ALL');
                  }}
                >
                  Cabut semua perangkat
                </Button>
              </div>
            )}
          </section>
        </aside>
      </div>

      <Dialog
        open={!!selectedSession}
        onOpenChange={(open: boolean) => !open && setSelectedSession(null)}
      >
        <DialogContent
          onCloseAutoFocus={restoreDialogFocus}
          className="max-h-[88vh] max-w-xl overflow-y-auto rounded-lg [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        >
          <DialogHeader>
            <DialogTitle>Detail sesi kelas</DialogTitle>
            <DialogDescription>
              Rekap bernama ini hanya tersedia pada monitoring privat sesuai kewenangan.
            </DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Kelas</dt>
                <dd className="font-semibold">{selectedSession.className}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Mata pelajaran</dt>
                <dd className="font-semibold">{selectedSession.subject}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Guru ditugaskan</dt>
                <dd className="font-semibold">{selectedSession.teacherName ?? 'Belum tersedia'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ruang</dt>
                <dd className="font-semibold">{selectedSession.room ?? 'Belum ditetapkan'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Waktu</dt>
                <dd className="font-semibold">
                  {formatMonitoringTime(selectedSession.startsAt)} -{' '}
                  {formatMonitoringTime(selectedSession.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <span
                    className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${STATUS_TONE[selectedSession.status]}`}
                  >
                    {STATUS_LABEL[selectedSession.status]}
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pairOpen}
        onOpenChange={(open: boolean) => {
          setPairOpen(open);
          if (!open) setPairResult(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={restoreDialogFocus}
          className="max-w-md rounded-lg [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        >
          <DialogHeader>
            <DialogTitle>
              {pairResult ? 'Kode pairing siap' : 'Pasangkan perangkat display'}
            </DialogTitle>
            <DialogDescription>
              {pairResult
                ? 'Kode hanya digunakan pada halaman pairing perangkat dan memiliki masa berlaku terbatas.'
                : 'Tentukan profil yang mengendalikan proyeksi data dan kebijakan audio.'}
            </DialogDescription>
          </DialogHeader>
          {pairResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase text-emerald-800">Kode pairing</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-emerald-950">
                  {pairResult.pairingCode}
                </p>
                <p className="mt-3 break-all font-mono text-xs text-emerald-900">
                  ID: {pairResult.id}
                </p>
                <p className="mt-2 text-xs text-emerald-800">
                  Berlaku sampai {formatMonitoringTime(pairResult.expiresAt)}
                </p>
              </div>
              <Button
                variant="outline"
                className="min-h-11 w-full"
                onClick={() =>
                  navigator.clipboard.writeText(`${pairResult.id}\n${pairResult.pairingCode}`)
                }
              >
                <Copy className="mr-2 h-4 w-4" /> Salin ID dan kode
              </Button>
              <p className="text-xs leading-5 text-slate-500">
                Buka <b>/display/pair</b> pada perangkat tujuan. Jangan simpan kode di laporan atau
                screenshot; kode tidak dapat digunakan ulang setelah aktivasi.
              </p>
            </div>
          ) : (
            <form action={createPairing} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-label">Nama perangkat</Label>
                <Input
                  id="display-label"
                  name="label"
                  maxLength={100}
                  placeholder="Contoh: TV Ruang Guru"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-profile">Profil ruangan</Label>
                <select
                  id="display-profile"
                  name="profile"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  defaultValue="RUANG_GURU"
                >
                  <option value="RUANG_GURU">Ruang Guru · audio lokal tersedia</option>
                  <option value="RUANG_TU">Ruang Tata Usaha · visual saja</option>
                </select>
              </div>
              {mutationError && (
                <p className="text-sm text-red-700" role="alert">
                  {mutationError}
                </p>
              )}
              <Button type="submit" className="min-h-11 w-full">
                Buat kode pairing
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open: boolean) => !open && setConfirmTarget(null)}
      >
        <DialogContent
          onCloseAutoFocus={restoreDialogFocus}
          className="max-w-md rounded-lg [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
        >
          <DialogHeader>
            <DialogTitle>Cabut akses display?</DialogTitle>
            <DialogDescription>
              {confirmTarget === 'ALL'
                ? 'Semua display aktif akan terputus dan harus dipasangkan ulang.'
                : 'Display ini akan kehilangan akses pada refresh atau reconnect berikutnya.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" className="min-h-11" onClick={confirmRevoke}>
              <Ban className="mr-2 h-4 w-4" /> Cabut akses
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <RadioTower className="h-4 w-4" /> Terakhir diperbarui{' '}
        {initialSnapshot ? formatMonitoringTime(initialSnapshot.generatedAt) : 'belum tersedia'}
        {isPending && (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> memuat
          </>
        )}
      </p>
    </div>
  );
}
