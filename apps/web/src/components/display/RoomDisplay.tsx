'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Maximize,
  Minimize,
  RadioTower,
  RefreshCw,
  Unplug,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  displayProfileLabel,
  normalizeDisplaySnapshot,
  type DisplaySession,
  type DisplaySnapshot,
} from '@/lib/display-contract';
import { chooseIndonesianVoice, neutralAlertSpeech } from '@/lib/display-alerts';
import {
  connectionLabel,
  isSnapshotStale,
  reconnectDelay,
  type ConnectionState,
} from '@/lib/display-state';

const STATUS_LABEL: Record<DisplaySession['status'], string> = {
  SCHEDULED: 'Terjadwal',
  REASSIGNED: 'Dialihkan',
  STARTED: 'Berlangsung',
  COMPLETED: 'Selesai',
  MISSED: 'Tidak dimulai',
  CANCELLED: 'Dibatalkan',
  SUPERSEDED: 'Digantikan',
};

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function shortTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '--.--';
}

function statusTone(status: DisplaySession['status']): string {
  if (status === 'STARTED' || status === 'COMPLETED')
    return 'border-emerald-500 bg-emerald-950/50 text-emerald-100';
  if (status === 'MISSED') return 'border-red-500 bg-red-950/60 text-red-100';
  if (status === 'REASSIGNED' || status === 'SUPERSEDED')
    return 'border-amber-500 bg-amber-950/50 text-amber-100';
  return 'border-slate-600 bg-slate-900 text-slate-100';
}

export default function RoomDisplay() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DisplaySnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioUnsupported, setAudioUnsupported] = useState(false);
  const [selected, setSelected] = useState<DisplaySession | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fetchInFlight = useRef(false);
  const reconnectAttempt = useRef(0);
  const deliveredRef = useRef(new Set<string>());
  const playbackInFlightRef = useRef(new Set<string>());

  const loadSnapshot = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      const response = await fetch('/api/display/snapshot', { cache: 'no-store' });
      if (response.status === 401) {
        router.replace('/display/pair?reason=credential');
        return;
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message ?? 'Snapshot display belum tersedia.');
        setConnection('offline');
        return;
      }
      const normalized = normalizeDisplaySnapshot(payload);
      if (!normalized) {
        setError('Snapshot display tidak sesuai kontrak perangkat.');
        setConnection('offline');
        return;
      }
      setSnapshot(normalized);
      setError(null);
      setConnection(
        isSnapshotStale(normalized.generatedAt, normalized.staleAfterSeconds) ? 'stale' : 'live',
      );
    } catch {
      setError('Display tidak dapat menghubungi server. Data terakhir tetap ditampilkan.');
      setConnection('offline');
    } finally {
      fetchInFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    void loadSnapshot();
    const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
    const pollTimer = window.setInterval(() => void loadSnapshot(), 60_000);
    let stopped = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;

    function connect() {
      if (stopped) return;
      setConnection((value) =>
        value === 'live' ? value : reconnectAttempt.current ? 'reconnecting' : 'connecting',
      );
      source = new EventSource('/api/display/stream');
      source.onopen = () => {
        reconnectAttempt.current = 0;
        setConnection('live');
      };
      source.onmessage = () => void loadSnapshot();
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        setConnection('reconnecting');
        const delay = reconnectDelay(reconnectAttempt.current++);
        retryTimer = window.setTimeout(connect, delay);
      };
    }
    connect();
    return () => {
      stopped = true;
      source?.close();
      if (retryTimer) window.clearTimeout(retryTimer);
      window.clearInterval(clockTimer);
      window.clearInterval(pollTimer);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot) return;
    if (isSnapshotStale(snapshot.generatedAt, snapshot.staleAfterSeconds, now.getTime())) {
      setConnection((state) => (state === 'offline' || state === 'reconnecting' ? state : 'stale'));
    }
  }, [now, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    snapshot.alerts
      .filter((alert) => !alert.acknowledged && !deliveredRef.current.has(alert.id))
      .forEach((alert) => {
        deliveredRef.current.add(alert.id);
        void fetch(`/api/display/deliveries/${encodeURIComponent(alert.id)}/delivered`, {
          method: 'POST',
        })
          .then((response) => {
            if (!response.ok) deliveredRef.current.delete(alert.id);
          })
          .catch(() => deliveredRef.current.delete(alert.id));
      });
  }, [snapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.profile !== 'RUANG_GURU' ||
      !snapshot.device.audibleLeader ||
      !audioEnabled ||
      muted ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    )
      return;
    let cancelled = false;
    snapshot.alerts
      .filter((alert) => !alert.acknowledged)
      .forEach((alert) => {
        if (!alert.audible || playbackInFlightRef.current.has(alert.id)) return;
        playbackInFlightRef.current.add(alert.id);
        void fetch(`/api/display/deliveries/${encodeURIComponent(alert.id)}/played`, {
          method: 'POST',
        })
          .then(async (response) => {
            const result = (await response.json().catch(() => null)) as {
              transitioned?: unknown;
            } | null;
            if (!response.ok || result?.transitioned !== true || cancelled) return;
            const utterance = new SpeechSynthesisUtterance(neutralAlertSpeech(alert));
            utterance.lang = 'id-ID';
            utterance.rate = 0.92;
            const voice = chooseIndonesianVoice(window.speechSynthesis.getVoices());
            if (voice) utterance.voice = voice;
            window.speechSynthesis.speak(utterance);
          })
          .catch(() => undefined)
          .finally(() => playbackInFlightRef.current.delete(alert.id));
      });
    return () => {
      cancelled = true;
    };
  }, [audioEnabled, muted, snapshot]);

  const visibleSessions = useMemo(
    () =>
      snapshot?.sessions
        .filter((session) => !['CANCELLED', 'SUPERSEDED'].includes(session.status))
        .slice(0, 6) ?? [],
    [snapshot],
  );
  const activeAlerts = snapshot?.alerts.filter((alert) => !alert.acknowledged) ?? [];

  async function enableAudio() {
    if (!('speechSynthesis' in window)) {
      setAudioUnsupported(true);
      return;
    }
    setAudioEnabled(true);
    setMuted(false);
    const utterance = new SpeechSynthesisUtterance('Audio display DIIS aktif.');
    utterance.lang = 'id-ID';
    const voice = chooseIndonesianVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    const wakeLock = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<unknown> };
    };
    await wakeLock.wakeLock?.request('screen').catch(() => undefined);
  }

  function testAudio() {
    if (!audioEnabled || muted || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance('Tes suara display DIIS.');
    utterance.lang = 'id-ID';
    const voice = chooseIndonesianVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function acknowledge(id: string) {
    const response = await fetch(`/api/display/alerts/${encodeURIComponent(id)}/ack`, {
      method: 'POST',
    });
    if (response.ok) void loadSnapshot();
  }

  async function disconnect() {
    await fetch('/api/display/disconnect', { method: 'POST' }).catch(() => undefined);
    router.replace('/display/pair');
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
    else await document.exitFullscreen?.().catch(() => undefined);
    setFullscreen(Boolean(document.fullscreenElement));
  }

  if (!snapshot && !error) {
    return (
      <main
        className="grid h-[100dvh] place-items-center overflow-hidden bg-slate-950 text-slate-100"
        aria-busy="true"
      >
        <div className="text-center">
          <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-400 motion-reduce:animate-none" />
          <p className="mt-3 text-sm text-slate-300">Menghubungkan display...</p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="grid h-[100dvh] place-items-center overflow-hidden bg-slate-950 p-6 text-slate-100">
        <section
          className="max-w-md rounded-lg border border-red-800 bg-red-950/50 p-6 text-center"
          role="alert"
        >
          <WifiOff className="mx-auto h-9 w-9 text-red-300" />
          <h1 className="mt-3 text-xl font-bold">Display belum terhubung</h1>
          <p className="mt-2 text-sm text-red-100">{error}</p>
          <Button className="mt-5 min-h-11" onClick={() => void loadSnapshot()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
          </Button>
        </section>
      </main>
    );
  }

  const guruRoom = snapshot.profile === 'RUANG_GURU';
  return (
    <main className="flex h-[100dvh] min-h-[32rem] flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-slate-800 px-[clamp(1rem,2vw,2rem)] py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-400">
            DIIS · {displayProfileLabel(snapshot.profile)}
          </p>
          <h1 className="text-[clamp(1.1rem,1.7vw,1.65rem)] font-bold leading-tight sm:truncate">
            Status KBM Hari Ini
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-[clamp(1.5rem,2.6vw,2.5rem)] font-bold tabular-nums">
            {snapshot.schoolDay.clockLabel || formatClock(now)}
          </p>
          <p className="text-xs text-slate-400">
            {snapshot.schoolDay.dateLabel || formatDate(now)}
          </p>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Perbarui snapshot"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-950 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label="Putuskan display lokal"
          >
            <Unplug className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={`shrink-0 border-b px-[clamp(1rem,2vw,2rem)] py-2 text-sm ${activeAlerts.length ? 'border-red-700 bg-red-950 text-red-50' : 'border-emerald-900 bg-emerald-950/60 text-emerald-100'}`}
        role="status"
        aria-live="polite"
      >
        {activeAlerts.length ? (
          <div className="flex items-center justify-between gap-4">
            <p className="flex min-w-0 items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="truncate">
                {activeAlerts.length} alert sesi memerlukan tindak lanjut ·{' '}
                {activeAlerts
                  .map((item) => item.className)
                  .slice(0, 3)
                  .join(', ')}
              </span>
            </p>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-lg border border-red-600 px-3 text-xs font-semibold hover:bg-red-900"
              onClick={() => void acknowledge(activeAlerts[0]!.id)}
            >
              Akui alert pertama
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> Tidak ada alert sesi aktif.
          </p>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-[clamp(.75rem,1.5vw,1.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(17rem,25%)]">
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
          aria-labelledby="room-session-heading"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h2 id="room-session-heading" className="font-bold">
                Papan sesi kelas
              </h2>
              <p className="text-xs text-slate-400">
                {snapshot.schoolDay.currentSegment ?? 'Di luar segmen pelajaran'} · berikutnya{' '}
                {snapshot.schoolDay.nextSegment ?? 'belum tersedia'}
              </p>
            </div>
            {snapshot.sessions.length > visibleSessions.length && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-300 hover:bg-slate-800"
                onClick={() => setShowAll(true)}
              >
                Lihat semua ({snapshot.sessions.length})
              </button>
            )}
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 divide-y divide-slate-800 overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
            {visibleSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => setSelected(session)}
                className={`min-h-0 border-l-4 p-[clamp(.65rem,1vw,1rem)] text-left outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${statusTone(session.status)}`}
              >
                <div className="flex h-full flex-col justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1rem,1.5vw,1.35rem)] font-bold">
                      {session.className}
                    </p>
                    <p className="truncate text-sm opacity-90">{session.subject}</p>
                  </div>
                  <div>
                    <p className="truncate text-xs opacity-75">
                      {session.room ?? 'Ruang belum ditetapkan'} ·{' '}
                      {session.teacherName ?? 'Guru belum tersedia'}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                      <span>
                        {shortTime(session.startsAt)} - {shortTime(session.endsAt)}
                      </span>
                      <span>{STATUS_LABEL[session.status]}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {visibleSessions.length === 0 && (
              <div className="col-span-2 grid place-items-center p-8 text-center">
                <div>
                  <Clock3 className="mx-auto h-8 w-8 text-slate-500" />
                  <p className="mt-3 font-semibold">Belum ada sesi untuk segmen ini</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Display akan memperbarui saat jadwal dimaterialisasi.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Koneksi</p>
                <p className="mt-1 flex items-center gap-2 font-semibold">
                  <RadioTower
                    className={`h-4 w-4 ${connection === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}
                  />{' '}
                  {connectionLabel(connection)}
                </p>
              </div>
              {guruRoom && (
                <div className="flex gap-1">
                  {!audioEnabled ? (
                    <button
                      type="button"
                      onClick={enableAudio}
                      className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-semibold hover:bg-slate-800"
                    >
                      <Volume2 className="mr-2 inline h-4 w-4" />
                      Aktifkan audio
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setMuted((value) => !value)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800"
                        aria-label={muted ? 'Nyalakan audio' : 'Bisukan audio'}
                      >
                        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={testAudio}
                        className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-semibold hover:bg-slate-800"
                      >
                        Tes
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {audioUnsupported && (
              <p className="mt-2 text-xs text-amber-300">
                Browser tidak mendukung suara. Alert visual tetap aktif.
              </p>
            )}
            {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
          </section>
          {guruRoom ? (
            <section className="min-h-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="font-bold">Kehadiran dan agenda</h2>
              {snapshot.attendance ? (
                <div className="mt-3 border-b border-slate-800 pb-3">
                  <p className="text-3xl font-bold text-emerald-300">
                    {snapshot.attendance.present}/{snapshot.attendance.total}
                  </p>
                  <p className="text-xs text-slate-400">Siswa tercatat hadir</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Rekap kehadiran belum tersedia.</p>
              )}
              <div className="mt-3 space-y-2">
                {snapshot.agenda.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex gap-2 text-sm">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-slate-400">{shortTime(item.startsAt)}</p>
                    </div>
                  </div>
                ))}
                {snapshot.agenda.length === 0 && (
                  <p className="text-sm text-slate-400">Tidak ada agenda terdekat.</p>
                )}
              </div>
            </section>
          ) : (
            <section className="min-h-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="font-bold">Antrean Tata Usaha</h2>
              <div className="mt-3 divide-y divide-slate-800">
                {snapshot.operations.slice(0, 7).map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-300">{item.label}</span>
                    <span
                      className={`rounded-md px-2 py-1 font-bold ${item.tone === 'critical' ? 'bg-red-950 text-red-200' : item.tone === 'attention' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-200'}`}
                    >
                      {item.count}
                    </span>
                  </div>
                ))}
                {snapshot.operations.length === 0 && (
                  <p className="text-sm text-slate-400">Tidak ada antrean operasional.</p>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>

      <Dialog open={!!selected} onOpenChange={(open: boolean) => !open && setSelected(null)}>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto rounded-lg [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
          <DialogHeader>
            <DialogTitle>Detail sesi</DialogTitle>
            <DialogDescription>
              Rekap display hanya memuat data yang diizinkan untuk profil ruangan ini.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Kelas</dt>
                <dd className="font-semibold">{selected.className}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Mata pelajaran</dt>
                <dd className="font-semibold">{selected.subject}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Guru terjadwal</dt>
                <dd className="font-semibold">{selected.teacherName ?? 'Belum tersedia'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ruang</dt>
                <dd className="font-semibold">{selected.room ?? 'Belum ditetapkan'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Waktu</dt>
                <dd className="font-semibold">
                  {shortTime(selected.startsAt)} - {shortTime(selected.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold">{STATUS_LABEL[selected.status]}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-lg [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
          <DialogHeader>
            <DialogTitle>Seluruh sesi hari ini</DialogTitle>
            <DialogDescription>
              Rekap sesi sesuai profil display dan snapshot terbaru.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-slate-200">
            {snapshot.sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-700"
                onClick={() => {
                  setShowAll(false);
                  setSelected(session);
                }}
              >
                <span>
                  <span className="block font-semibold">
                    {session.className} · {session.subject}
                  </span>
                  <span className="text-sm text-slate-500">
                    {session.room ?? 'Ruang belum ditetapkan'} ·{' '}
                    {session.teacherName ?? 'Guru belum tersedia'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold">
                  {STATUS_LABEL[session.status]}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
