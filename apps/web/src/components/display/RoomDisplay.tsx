'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Maximize,
  Megaphone,
  Minimize,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  TrendingUp,
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
  type DisplayAlert,
  type DisplaySession,
  type DisplaySnapshot,
} from '@/lib/display-contract';
import {
  canRunDisplayAudioTest,
  chooseIndonesianVoice,
  configureIndonesianSpeech,
  neutralAlertSpeech,
  playClaimedDisplayAlert,
  processDisplayAudioQueue,
  resolveIndonesianVoice,
} from '@/lib/display-alerts';
import {
  connectionLabel,
  isSnapshotStale,
  reconnectDelay,
  type ConnectionState,
} from '@/lib/display-state';
import {
  DISPLAY_SESSION_PAGE_INTERVAL_MS,
  displaySessionPage,
  displaySessionPageCount,
  displaySessionRotationCopy,
  focusDisplaySessions,
  manuallyMoveDisplaySessionPage,
  moveDisplaySessionPage,
} from '@/lib/display-session-focus';

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

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
      }).format(date)
    : '--';
}

function attendancePercent(present: number, total: number): number | null {
  return total > 0 ? Math.round((present / total) * 100) : null;
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
  const [alertPlaybackBusy, setAlertPlaybackBusy] = useState(false);
  const [selected, setSelected] = useState<DisplaySession | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sessionPage, setSessionPage] = useState(0);
  const [sessionRotationEnabled, setSessionRotationEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const fetchInFlight = useRef(false);
  const reconnectAttempt = useRef(0);
  const deliveredRef = useRef(new Set<string>());
  const playbackInFlightRef = useRef(new Set<string>());
  const audioQueueRef = useRef<DisplayAlert[]>([]);
  const audioDrainActiveRef = useRef(false);
  const sessionRotationEnabledRef = useRef(true);

  const updateSessionRotation = useCallback((enabled: boolean) => {
    sessionRotationEnabledRef.current = enabled;
    setSessionRotationEnabled(enabled);
  }, []);

  const applySnapshot = useCallback((payload: unknown) => {
    const normalized = normalizeDisplaySnapshot(payload);
    if (!normalized) {
      setError('Snapshot display tidak sesuai kontrak perangkat.');
      setConnection('offline');
      return false;
    }
    setSnapshot(normalized);
    setError(null);
    setConnection(
      isSnapshotStale(normalized.generatedAt, normalized.staleAfterSeconds) ? 'stale' : 'live',
    );
    return true;
  }, []);

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
      applySnapshot(payload);
    } catch {
      setError('Display tidak dapat menghubungi server. Data terakhir tetap ditampilkan.');
      setConnection('offline');
    } finally {
      fetchInFlight.current = false;
    }
  }, [applySnapshot, router]);

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
      const consumeSnapshot = (event: MessageEvent<string>) => {
        try {
          applySnapshot(JSON.parse(event.data));
        } catch {
          setError('Pembaruan langsung tidak sesuai kontrak. Data terakhir tetap ditampilkan.');
          setConnection('stale');
        }
      };
      source.addEventListener('snapshot', consumeSnapshot as EventListener);
      source.onmessage = consumeSnapshot;
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
  }, [applySnapshot, loadSnapshot]);

  useEffect(() => {
    if (!snapshot) return;
    if (isSnapshotStale(snapshot.generatedAt, snapshot.staleAfterSeconds, now.getTime())) {
      setConnection((state) => (state === 'offline' || state === 'reconnecting' ? state : 'stale'));
    }
  }, [now, snapshot]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pauseForReducedMotion = () => {
      if (reducedMotion.matches) updateSessionRotation(false);
    };
    pauseForReducedMotion();
    reducedMotion.addEventListener('change', pauseForReducedMotion);
    return () => reducedMotion.removeEventListener('change', pauseForReducedMotion);
  }, [updateSessionRotation]);

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

  const drainAudioQueue = useCallback(async () => {
    if (audioDrainActiveRef.current || typeof window === 'undefined') return;
    audioDrainActiveRef.current = true;
    setAlertPlaybackBusy(true);
    try {
      await processDisplayAudioQueue(
        () => audioQueueRef.current.shift(),
        async (alert) => {
          const voice = chooseIndonesianVoice(window.speechSynthesis.getVoices());
          if (!voice) {
            setAudioUnsupported(true);
            playbackInFlightRef.current.delete(alert.id);
            return;
          }
          const claimResponse = await fetch(
            `/api/display/deliveries/${encodeURIComponent(alert.id)}/claim`,
            { method: 'POST' },
          ).catch(() => null);
          const claim = (await claimResponse?.json().catch(() => null)) as {
            claimed?: unknown;
            claimToken?: unknown;
            expiresAt?: unknown;
          } | null;
          const claimToken =
            claimResponse?.ok && claim?.claimed === true && typeof claim.claimToken === 'string'
              ? claim.claimToken
              : null;
          const expiresAt = typeof claim?.expiresAt === 'string' ? Date.parse(claim.expiresAt) : 0;
          if (!claimToken || !Number.isFinite(expiresAt) || expiresAt - Date.now() < 5_000) {
            playbackInFlightRef.current.delete(alert.id);
            return;
          }
          const releaseClaim = () =>
            fetch(`/api/display/deliveries/${encodeURIComponent(alert.id)}/release`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ claimToken }),
            }).catch(() => undefined);

          const utterance = new SpeechSynthesisUtterance(neutralAlertSpeech(alert));
          configureIndonesianSpeech(utterance, voice);
          await playClaimedDisplayAlert({
            utterance,
            synthesis: window.speechSynthesis,
            markPlayed: async () => {
              const response = await fetch(
                `/api/display/deliveries/${encodeURIComponent(alert.id)}/played`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ claimToken }),
                },
              );
              const result = (await response.json().catch(() => null)) as {
                transitioned?: unknown;
              } | null;
              return response.ok && result?.transitioned === true;
            },
            releaseClaim,
            onFailure: (reason) => {
              if (reason === 'start-failed') setAudioUnsupported(true);
              setError(
                reason === 'timeout'
                  ? 'Audio melewati batas waktu. Alert visual tetap aktif dan audio dapat dicoba kembali.'
                  : reason === 'confirmation-failed'
                    ? 'Konfirmasi audio gagal atau klaim kedaluwarsa. Alert tetap dapat dicoba kembali.'
                    : reason === 'start-failed'
                      ? 'Audio tidak dapat dimulai. Alert visual tetap aktif.'
                      : 'Audio gagal diputar. Alert visual tetap aktif dan audio dapat dicoba kembali.',
              );
            },
          });
          playbackInFlightRef.current.delete(alert.id);
        },
      );
    } finally {
      audioDrainActiveRef.current = false;
      setAlertPlaybackBusy(playbackInFlightRef.current.size > 0);
    }
  }, []);

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
    snapshot.alerts
      .filter((alert) => !alert.acknowledged && alert.audible)
      .forEach((alert) => {
        if (playbackInFlightRef.current.has(alert.id)) return;
        playbackInFlightRef.current.add(alert.id);
        audioQueueRef.current.push(alert);
      });
    if (audioQueueRef.current.length > 0) void drainAudioQueue();
  }, [audioEnabled, drainAudioQueue, muted, snapshot]);

  const focusedSessions = useMemo(
    () =>
      snapshot
        ? focusDisplaySessions(snapshot.sessions, snapshot.generatedAt)
        : { key: 'empty', label: 'Belum ada sesi', sessions: [] },
    [snapshot],
  );
  const sessionPageCount = displaySessionPageCount(focusedSessions.sessions.length);
  const sessionRotationCopy = displaySessionRotationCopy(sessionRotationEnabled);
  const visibleSessions = useMemo(
    () => displaySessionPage(focusedSessions.sessions, sessionPage),
    [focusedSessions.sessions, sessionPage],
  );
  const activeAlerts = snapshot?.alerts.filter((alert) => !alert.acknowledged) ?? [];

  useEffect(() => setSessionPage(0), [focusedSessions.key]);
  useEffect(() => {
    if (sessionPageCount <= 1 || showAll || selected || !sessionRotationEnabled) return;
    const timer = window.setInterval(
      () => {
        if (!sessionRotationEnabledRef.current) return;
        setSessionPage((page) => moveDisplaySessionPage(page, sessionPageCount, 1));
      },
      DISPLAY_SESSION_PAGE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [selected, sessionPageCount, sessionRotationEnabled, showAll]);

  function moveSessionPageManually(direction: -1 | 1) {
    updateSessionRotation(false);
    setSessionPage((page) =>
      manuallyMoveDisplaySessionPage(page, sessionPageCount, direction).page,
    );
  }

  function toggleSessionRotation() {
    updateSessionRotation(!sessionRotationEnabledRef.current);
  }

  async function enableAudio() {
    if (!('speechSynthesis' in window)) {
      setAudioUnsupported(true);
      return;
    }
    const voice = await resolveIndonesianVoice(window.speechSynthesis);
    if (!voice) {
      setAudioEnabled(false);
      setAudioUnsupported(true);
      return;
    }
    setAudioUnsupported(false);
    setAudioEnabled(true);
    setMuted(false);
    const utterance = new SpeechSynthesisUtterance(
      'Audio Bahasa Indonesia aktif. Display DIIS siap digunakan.',
    );
    configureIndonesianSpeech(utterance, voice);
    window.speechSynthesis.speak(utterance);
    const wakeLock = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<unknown> };
    };
    await wakeLock.wakeLock?.request('screen').catch(() => undefined);
  }

  function testAudio() {
    if (
      !canRunDisplayAudioTest({
        audioEnabled,
        muted,
        alertSpeaking: alertPlaybackBusy,
        playbackInFlight: playbackInFlightRef.current.size,
      }) ||
      !('speechSynthesis' in window)
    )
      return;
    const voice = chooseIndonesianVoice(window.speechSynthesis.getVoices());
    if (!voice) {
      setAudioEnabled(false);
      setAudioUnsupported(true);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      'Tes suara Bahasa Indonesia. Informasi display terdengar jelas.',
    );
    configureIndonesianSpeech(utterance, voice);
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
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <h2 id="room-session-heading" className="text-lg font-bold 2xl:text-xl">
                Papan sesi kelas
              </h2>
              <p className="text-sm text-slate-400 2xl:text-base" aria-live="polite">
                {focusedSessions.label} · {focusedSessions.sessions.length} kelas
                {sessionPageCount > 1 ? ` · halaman ${sessionPage + 1}/${sessionPageCount}` : ''}
                {sessionPageCount > 1
                  ? ` · ${sessionRotationCopy.statusLabel}`
                  : ''}
                {' · '}berikutnya {snapshot.schoolDay.nextSegment ?? 'belum tersedia'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sessionPageCount > 1 && (
                <div
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/60 p-1"
                  role="group"
                  aria-label="Kontrol halaman papan sesi"
                >
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400"
                    onClick={() => moveSessionPageManually(-1)}
                    aria-label="Halaman sesi sebelumnya"
                    title="Sebelumnya"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className={`flex h-11 w-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      sessionRotationEnabled
                        ? 'text-slate-200 hover:bg-slate-800'
                        : 'bg-amber-950/70 text-amber-200'
                    }`}
                    onClick={toggleSessionRotation}
                    aria-label={sessionRotationCopy.actionLabel}
                    title={sessionRotationEnabled ? 'Jeda rotasi' : 'Lanjutkan rotasi'}
                  >
                    {sessionRotationEnabled ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400"
                    onClick={() => moveSessionPageManually(1)}
                    aria-label="Halaman sesi berikutnya"
                    title="Berikutnya"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
              {focusedSessions.sessions.length > visibleSessions.length && (
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400"
                  onClick={() => setShowAll(true)}
                >
                  Lihat semua ({focusedSessions.sessions.length})
                </button>
              )}
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-800 overflow-hidden md:grid-cols-2 md:grid-rows-3 md:divide-x md:divide-y-0">
            {visibleSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => setSelected(session)}
                className={`min-h-0 border-l-4 p-[clamp(.65rem,1vw,1rem)] text-left outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${statusTone(session.status)}`}
              >
                <div className="flex h-full flex-col justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold 2xl:text-2xl">{session.className}</p>
                    <p className="truncate text-base opacity-90 2xl:text-lg">{session.subject}</p>
                  </div>
                  <div>
                    <p className="truncate text-sm opacity-75 2xl:text-base">
                      {session.room ?? 'Ruang belum ditetapkan'} ·{' '}
                      {session.teacherName ?? 'Guru belum tersedia'}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm font-semibold 2xl:text-base">
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
              <div className="col-span-2 grid place-items-center p-8 text-center md:row-span-3">
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
                        disabled={alertPlaybackBusy}
                        className="min-h-11 rounded-lg border border-slate-700 px-3 text-xs font-semibold hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          alertPlaybackBusy
                            ? 'Tes tersedia setelah alert selesai dibacakan'
                            : undefined
                        }
                      >
                        Tes
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div role="status" aria-live="polite" aria-atomic="true">
              {audioUnsupported && (
                <p className="mt-2 text-xs text-amber-300">
                  Voice Bahasa Indonesia tidak tersedia. Gunakan Chrome terbaru atau pasang voice
                  Bahasa Indonesia; alert visual tetap aktif.
                </p>
              )}
              {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
            </div>
          </section>
          {guruRoom ? (
            <section className="min-h-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-bold 2xl:text-xl">Kehadiran hari ini</h2>
              {snapshot.attendance ? (
                <div className="mt-3 border-b border-slate-800 pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-2xl font-bold text-emerald-300">
                        {snapshot.attendance.students.present}/{snapshot.attendance.students.total}
                      </p>
                      <p className="text-sm text-slate-400">
                        Hadir · {snapshot.attendance.students.recorded}/
                        {snapshot.attendance.students.total} tercatat
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-300">
                        {snapshot.attendance.teachers.present}/{snapshot.attendance.teachers.total}
                      </p>
                      <p className="text-sm text-slate-400">
                        Hadir · {snapshot.attendance.teachers.recorded}/
                        {snapshot.attendance.teachers.total} tercatat
                      </p>
                    </div>
                  </div>
                  {snapshot.attendance.trend.length > 0 && (
                    <div className="mt-3" aria-label="Tren kehadiran lima hari terakhir">
                      <p className="flex items-center gap-1 text-sm font-semibold text-slate-300">
                        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Tren 5 hari
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {snapshot.attendance.trend.map((point) => {
                          const studentPct = attendancePercent(
                            point.students.present,
                            point.students.total,
                          );
                          const teacherPct = attendancePercent(
                            point.teachers.present,
                            point.teachers.total,
                          );
                          return (
                            <div
                              key={point.date}
                              className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-xs 2xl:text-sm"
                            >
                              <span className="text-slate-400">
                                {shortDate(`${point.date}T00:00:00.000Z`)}
                              </span>
                              <div className="grid gap-1" aria-hidden="true">
                                <span className="h-1.5 rounded-sm bg-slate-800">
                                  <span
                                    className="block h-full rounded-sm bg-emerald-400"
                                    style={{ width: `${studentPct ?? 0}%` }}
                                  />
                                </span>
                                <span className="h-1.5 rounded-sm bg-slate-800">
                                  <span
                                    className="block h-full rounded-sm bg-blue-400"
                                    style={{ width: `${teacherPct ?? 0}%` }}
                                  />
                                </span>
                              </div>
                              <span className="tabular-nums text-slate-300">
                                {studentPct === null ? '-' : `${studentPct}%`} ·{' '}
                                {teacherPct === null ? '-' : `${teacherPct}%`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <i className="h-1.5 w-3 bg-emerald-400" aria-hidden="true" /> Siswa
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="h-1.5 w-3 bg-blue-400" aria-hidden="true" /> Guru
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Rekap kehadiran belum tersedia.</p>
              )}
              <div className="mt-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase text-slate-400">
                  <CalendarDays className="h-4 w-4 text-blue-300" aria-hidden="true" /> Kalender
                </h3>
                <div className="mt-2 space-y-2">
                  {snapshot.agenda.slice(0, 2).map((item) => (
                    <div key={item.id} className="flex gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium">{item.title}</p>
                        <p className="text-sm text-slate-400">{shortDate(item.startsAt)}</p>
                      </div>
                    </div>
                  ))}
                  {snapshot.agenda.length === 0 && (
                    <p className="text-sm text-slate-400">Tidak ada agenda terdekat.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 border-t border-slate-800 pt-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase text-slate-400">
                  <Megaphone className="h-4 w-4 text-amber-300" aria-hidden="true" /> Pengumuman
                </h3>
                <div className="mt-2 space-y-2">
                  {snapshot.announcements.slice(0, 2).map((item) => (
                    <div key={item.id} className="flex gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium">{item.title}</p>
                        <p className="text-sm text-slate-400">
                          {item.pinned ? 'Disematkan · ' : ''}
                          {shortDate(item.publishedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {snapshot.announcements.length === 0 && (
                    <p className="text-sm text-slate-400">Tidak ada pengumuman prioritas.</p>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="min-h-0 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="font-bold">Antrean Tata Usaha</h2>
              <div className="mt-3 divide-y divide-slate-800">
                {snapshot.operations.slice(0, 5).map((item) => (
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
              <div className="mt-3 grid gap-3 border-t border-slate-800 pt-3 xl:grid-cols-2">
                <div>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                    <CalendarDays className="h-4 w-4 text-blue-300" aria-hidden="true" /> Kalender
                  </h3>
                  <div className="mt-2 space-y-2">
                    {snapshot.agenda.slice(0, 2).map((item) => (
                      <div key={item.id} className="text-sm">
                        <p className="truncate font-medium">{item.title}</p>
                        <p className="text-xs text-slate-400">{shortDate(item.startsAt)}</p>
                      </div>
                    ))}
                    {snapshot.agenda.length === 0 && (
                      <p className="text-sm text-slate-400">Tidak ada agenda terdekat.</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                    <Megaphone className="h-4 w-4 text-amber-300" aria-hidden="true" /> Pengumuman
                  </h3>
                  <div className="mt-2 space-y-2">
                    {snapshot.announcements.slice(0, 2).map((item) => (
                      <div key={item.id} className="text-sm">
                        <p className="truncate font-medium">{item.title}</p>
                        <p className="text-xs text-slate-400">
                          {item.pinned ? 'Disematkan · ' : ''}
                          {shortDate(item.publishedAt)}
                        </p>
                      </div>
                    ))}
                    {snapshot.announcements.length === 0 && (
                      <p className="text-sm text-slate-400">Tidak ada pengumuman prioritas.</p>
                    )}
                  </div>
                </div>
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
            <DialogTitle>Seluruh kelas pada segmen ini</DialogTitle>
            <DialogDescription>
              {focusedSessions.label} · {focusedSessions.sessions.length} kelas pada snapshot
              terbaru.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-slate-200">
            {focusedSessions.sessions.map((session) => (
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
