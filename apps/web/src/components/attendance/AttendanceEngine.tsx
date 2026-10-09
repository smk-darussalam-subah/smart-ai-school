'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  LogIn,
  MapPin,
  Navigation,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  attendanceGateway,
  captureLocation,
  closestTeaching,
  formatAttendanceDate,
  formatAttendanceTime,
  LOCATION_HELP,
  LOCATION_LABEL,
  type AttendanceContext,
  type AttendanceGateway,
  type AttendanceReceipt,
  type LocationInput,
  type LocationResult,
  type TeachingToday,
} from '@/lib/staff-attendance';

type Step = 'IDLE' | 'PROMPT' | 'SUBMITTING' | 'SUCCESS' | 'SCHEDULE';
interface Engine {
  context: AttendanceContext | null;
  error: string;
  loading: boolean;
  busy: boolean;
  refresh(): Promise<void>;
  openPrompt(checkout?: boolean): Promise<void>;
  gateway: AttendanceGateway;
}
const Context = createContext<Engine | null>(null);
export function useAttendance() {
  const value = useContext(Context);
  if (!value) throw new Error('Attendance provider required');
  return value;
}
export function AttendanceEngine({
  children,
  enabled = true,
  gateway = attendanceGateway,
  initial = null,
  autoPrompt = true,
  locationCapture = captureLocation,
}: {
  children: React.ReactNode;
  enabled?: boolean;
  gateway?: AttendanceGateway;
  initial?: AttendanceContext | null;
  autoPrompt?: boolean;
  locationCapture?: () => Promise<LocationInput>;
}) {
  const [context, setContext] = useState(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!initial && enabled);
  const [step, setStep] = useState<Step>('IDLE');
  const [checkout, setCheckout] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sound, setSound] = useState(true);
  const [receipt, setReceipt] = useState<AttendanceReceipt | null>(null);
  const input = useRef<LocationInput>({});
  const inFlight = useRef(false);
  const checking = useRef(false);
  const dismissed = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await gateway.context();
      setContext(data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Presensi belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, [enabled, gateway]);
  useEffect(() => {
    try {
      setSound(localStorage.getItem('diis-attendance-sound') !== 'off');
    } catch {
      /* optional preference */
    }
  }, []);
  useEffect(() => {
    if (!initial) void refresh();
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(onVisibility, 300000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, initial]);
  const cooldownKey = context
    ? 'diis-attendance-prompt:' + context.employee.id + ':' + context.date
    : '';
  function snooze() {
    dismissed.current = true;
    try {
      sessionStorage.setItem(cooldownKey, String(Date.now()));
    } catch {
      /* nonessential */
    }
    setStep('IDLE');
    setError('');
  }
  function coolingDown() {
    try {
      return (
        Date.now() - Number(sessionStorage.getItem(cooldownKey) ?? 0) <
        (context?.policy.attendancePromptCooldown ?? 30) * 60000
      );
    } catch {
      return dismissed.current;
    }
  }
  const openPrompt = async (isCheckout = false) => {
    if (!enabled || inFlight.current || checking.current || !context) return;
    checking.current = true;
    setPreparing(true);
    setCheckout(isCheckout);
    setError('');
    setStep('PROMPT');
    setLocation(null);
    try {
      input.current = await locationCapture();
      const data = await gateway.location(input.current);
      setLocation(data);
      setContext((current) => (current ? { ...current, policy: data.policy } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verifikasi lokasi gagal. Coba lagi.');
    } finally {
      checking.current = false;
      setPreparing(false);
    }
  };
  useEffect(() => {
    if (
      !enabled ||
      !autoPrompt ||
      !context?.eligible ||
      context.receipt ||
      step !== 'IDLE' ||
      coolingDown() ||
      checking.current ||
      document.hidden
    )
      return;
    let cancelled = false;
    void (async () => {
      const permission = await navigator.permissions
        ?.query({ name: 'geolocation' })
        .catch(() => null);
      if (cancelled || permission?.state !== 'granted') return; // no unsolicited browser permission dialog
      checking.current = true;
      try {
        const coordinates = await locationCapture();
        const result = await gateway.location(coordinates);
        if (!cancelled && result.status === 'INSIDE') {
          input.current = coordinates;
          setLocation(result);
          setContext((current) => (current ? { ...current, policy: result.policy } : current));
          setCheckout(false);
          setStep('PROMPT');
        }
      } catch {
        /* a failing optional reminder must not replace page error state */
      } finally {
        checking.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // The server context is refreshed on visibility/interval. No continuous GPS tracking.
  }, [context, enabled, autoPrompt, step, gateway, locationCapture]);
  useEffect(() => {
    if (step !== 'SUCCESS' || !context?.employee.teacher || checkout) return;
    const timer = setTimeout(() => setStep('SCHEDULE'), 1300);
    return () => clearTimeout(timer);
  }, [step, context?.employee.teacher, checkout]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => undefined);
    },
    [],
  );
  function primeAudio() {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => undefined);
    } catch {
      /* browser may forbid sound */
    }
  }
  function playSuccess() {
    if (!sound || !audio.current || document.hidden) return;
    const ctx = audio.current;
    try {
      [659.25, 880].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + index * 0.13;
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.06, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.24);
      });
    } catch {
      /* attendance is independent of audio */
    }
  }
  async function submit() {
    if (inFlight.current || !location || !context) return;
    primeAudio();
    inFlight.current = true;
    setStep('SUBMITTING');
    setError('');
    try {
      const fresh = await locationCapture();
      const verified = await gateway.location(fresh);
      setContext((current) => (current ? { ...current, policy: verified.policy } : current));
      if (verified.status !== 'INSIDE' && location.status === 'INSIDE') {
        input.current = fresh;
        setLocation(verified);
        setStep('PROMPT');
        setError('Lokasi berubah atau belum terverifikasi. Tinjau status sebelum melanjutkan.');
        return;
      }
      input.current = fresh;
      setLocation(verified);
      if (verified.policy.attendanceMode === 'STRICT' && verified.status !== 'INSIDE')
        throw new Error(
          'Lokasi belum memenuhi kebijakan presensi ketat. Verifikasi lokasi di area sekolah sebelum mencatat presensi.',
        );
      const result = await gateway.record(fresh, checkout);
      if (
        !result.receipt?.id ||
        !result.receipt.checkInAt ||
        (checkout && !result.receipt.checkOutAt)
      )
        throw new Error('Server belum mengonfirmasi penyimpanan. Coba periksa status presensi.');
      setReceipt(result.receipt);
      setContext((current) =>
        current
          ? { ...current, receipt: result.receipt, eligible: false, serverNow: result.serverNow }
          : current,
      );
      setStep('SUCCESS');
      if (!result.replayed) playSuccess();
      void refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Presensi belum berhasil tersimpan. Silakan coba lagi.',
      );
      setStep('PROMPT');
    } finally {
      inFlight.current = false;
    }
  }
  const serverTime = context ? new Date(context.serverNow) : new Date();
  const hour = Number(
    serverTime.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }),
  );
  const greeting =
    hour < 11
      ? 'Selamat pagi'
      : hour < 15
        ? 'Selamat siang'
        : hour < 18
          ? 'Selamat sore'
          : 'Selamat malam';
  const nearest = context ? closestTeaching(context.schedules, serverTime) : null;
  const stateBusy = step === 'SUBMITTING';
  return (
    <Context.Provider
      value={{
        context,
        error,
        loading,
        busy: stateBusy || preparing,
        refresh,
        openPrompt,
        gateway,
      }}
    >
      {children}
      {enabled &&
        autoPrompt &&
        context?.eligible &&
        !context.receipt &&
        step === 'IDLE' &&
        !coolingDown() && (
          <div className="fixed bottom-5 right-5 z-40 max-w-sm rounded-2xl border border-blue-100 bg-white p-4 shadow-xl">
            <p className="text-sm font-semibold text-slate-900">
              Anda belum presensi masuk hari ini
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Sudah tiba di sekolah? Periksa lokasi untuk mencatat kehadiran.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void openPrompt()}>
                Periksa lokasi
              </Button>
              <Button size="sm" variant="ghost" onClick={snooze}>
                Nanti
              </Button>
            </div>
          </div>
        )}
      <Dialog
        open={step !== 'IDLE'}
        onOpenChange={(value: boolean) => {
          if (!value && !stateBusy && !preparing) snooze();
        }}
      >
        <DialogContent
          className="flex max-h-[94dvh] w-[calc(100%_-_2rem)] flex-col overflow-hidden rounded-2xl p-4 sm:max-w-[480px] sm:p-6"
          closeDisabled={stateBusy || preparing}
          onEscapeKeyDown={(event: { preventDefault(): void }) => {
            if (stateBusy || preparing) event.preventDefault();
          }}
          onPointerDownOutside={(event: { preventDefault(): void }) => {
            if (stateBusy || preparing) event.preventDefault();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>
              {step === 'PROMPT' || stateBusy
                ? 'Presensi ' + (checkout ? 'pulang' : 'masuk')
                : 'Presensi berhasil'}
            </DialogTitle>
            <DialogDescription>
              Presensi mandiri dengan waktu server dan verifikasi lokasi sekolah.
            </DialogDescription>
          </DialogHeader>
          {(step === 'PROMPT' || stateBusy) && (
            <div className="min-h-0 overflow-y-auto text-center">
              <SchoolArrival />
              <LocationBadge status={location?.status ?? 'UNVERIFIED'} />
              <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-950 sm:mt-5 sm:text-2xl">
                {greeting}, {context?.employee.fullName.split(' ')[0]}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {checkout
                  ? 'Terima kasih atas aktivitas Anda hari ini.'
                  : 'Saatnya memulai aktivitas hari ini.'}
              </p>
              <p className="mt-4 text-[40px] font-bold leading-none tracking-tight text-slate-950 sm:mt-5 sm:text-5xl">
                {formatAttendanceTime(location?.serverNow ?? context?.serverNow)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {context && formatAttendanceDate(context.date)}
              </p>
              <div className="my-4 rounded-xl bg-blue-50 p-3 text-sm font-medium text-blue-950 sm:my-5">
                {checkout ? 'Catat presensi pulang Anda.' : 'Anda belum melakukan presensi masuk.'}
              </div>
              {!checkout && context?.arrival.basis === 'TEACHING' && (
                <p className="mb-4 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
                  Pelajaran pertama {formatAttendanceTime(context.arrival.firstTeachingAt)} WIB.
                  <br />
                  Anjuran datang {formatAttendanceTime(context.arrival.recommendedAt)}, batas hadir{' '}
                  {formatAttendanceTime(context.arrival.dueAt)} WIB.
                </p>
              )}
              {location?.reason && (
                <p className="mb-4 rounded-lg bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-900">
                  {LOCATION_HELP[location.reason] ?? 'Lokasi perlu ditinjau.'}
                  {context?.policy.attendanceMode === 'REVIEW' &&
                    ' Presensi dapat dicatat untuk ditinjau admin, tanpa klaim di dalam area.'}
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mb-3 rounded-lg bg-rose-50 p-3 text-left text-sm text-rose-700"
                >
                  {error}
                </p>
              )}
              <Button
                className="h-11 w-full bg-blue-600 text-sm hover:bg-blue-700 sm:h-12"
                onClick={() => void submit()}
                disabled={
                  stateBusy ||
                  preparing ||
                  !location ||
                  (context?.policy.attendanceMode === 'STRICT' && location.status !== 'INSIDE')
                }
              >
                <LogIn size={18} className="mr-2" />
                {preparing
                  ? 'Memverifikasi lokasi…'
                  : stateBusy
                    ? 'Menyimpan presensi…'
                    : location?.status !== 'INSIDE'
                      ? 'Catat untuk ditinjau'
                      : checkout
                        ? 'Presensi Pulang Sekarang'
                        : 'Presensi Masuk Sekarang'}
              </Button>
              <div className="mt-2 flex justify-center gap-2">
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={stateBusy || preparing}
                  onClick={snooze}
                >
                  Nanti
                </Button>
                {!preparing && (
                  <Button
                    className="min-h-11"
                    variant="ghost"
                    disabled={stateBusy}
                    onClick={() => void openPrompt(checkout)}
                  >
                    Coba lokasi lagi
                  </Button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t pt-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Navigation size={12} />
                  Jarak {location?.distanceM ?? '—'} m
                </span>
                <span>
                  Akurasi {location?.accuracyM != null ? Math.round(location.accuracyM) : '—'} m
                </span>
                <span>Waktu server · WIB</span>
              </div>
            </div>
          )}
          {(step === 'SUCCESS' || step === 'SCHEDULE') && (
            <div
              className={
                step === 'SCHEDULE'
                  ? 'flex h-[calc(90dvh_-_100px)] max-h-[720px] min-h-0 flex-col text-center'
                  : 'text-center'
              }
              aria-live="polite"
            >
              <div className={step === 'SCHEDULE' ? 'min-h-0 flex-1 overflow-y-auto' : ''}>
                <div className="success-mark relative mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 sm:mb-4 sm:h-24 sm:w-24 [@media(max-height:450px)]:hidden">
                  {step === 'SUCCESS' && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                      {Array.from({ length: 10 }, (_, index) => (
                        <i
                          key={index}
                          className="attendance-confetti absolute left-1/2 top-1/2 h-2 w-1.5 rounded-sm"
                          style={
                            {
                              background: index % 2 ? '#10b981' : '#60a5fa',
                              '--burst-x': Math.cos((index * Math.PI) / 5) * 82 + 'px',
                              '--burst-y': Math.sin((index * Math.PI) / 5) * 68 + 'px',
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check size={38} strokeWidth={3} />
                  </div>
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl [@media(max-height:450px)]:text-base">
                  Presensi berhasil
                </h2>
                <p
                  className={
                    'mt-2 text-sm text-slate-500 ' +
                    (step === 'SCHEDULE' ? '[@media(max-height:450px)]:hidden' : '')
                  }
                >
                  {formatAttendanceTime(checkout ? receipt?.checkOutAt : receipt?.checkInAt)} WIB ·{' '}
                  {receipt &&
                    LOCATION_LABEL[
                      checkout
                        ? (receipt.locationOutStatus ?? 'UNVERIFIED')
                        : receipt.locationInStatus
                    ]}
                </p>
                {step === 'SCHEDULE' && (
                  <div className="mt-4 border-t pt-4 text-left sm:mt-5 sm:pt-5 [@media(max-height:450px)]:mt-2 [@media(max-height:450px)]:pt-2">
                    <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-900 [@media(max-height:450px)]:sr-only">
                      <CalendarDays size={19} className="text-blue-600" />
                      Jadwal Mengajar Hari Ini
                    </h3>
                    {context?.scheduleError ? (
                      <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                        {context.scheduleError}
                      </p>
                    ) : nearest ? (
                      <TeachingCard slot={nearest} now={serverTime} highlight />
                    ) : (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                        {context?.schedules.length
                          ? 'Seluruh jadwal mengajar hari ini sudah selesai.'
                          : 'Tidak ada jadwal mengajar hari ini.'}
                      </p>
                    )}
                    {context?.schedules
                      .filter(
                        (slot) => slot.id !== nearest?.id && new Date(slot.startAt) > serverTime,
                      )
                      .slice(0, 2)
                      .map((slot) => (
                        <div key={slot.id} className="mt-2">
                          <TeachingCard slot={slot} now={serverTime} />
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 bg-white pt-3">
                {step === 'SCHEDULE' && (
                  <Button asChild className="h-11 w-full bg-blue-600 hover:bg-blue-700 sm:h-12">
                    <Link href="/dashboard/jadwal" onClick={snooze}>
                      <CalendarDays size={18} className="mr-2" />
                      Buka Jadwal Hari Ini
                    </Link>
                  </Button>
                )}
                <Button variant="secondary" className="mt-2 h-11 w-full" onClick={snooze}>
                  Selesai
                </Button>
              </div>
            </div>
          )}
          <button
            type="button"
            className="mx-auto flex min-h-11 shrink-0 items-center gap-1 text-xs text-slate-500"
            aria-pressed={sound}
            onClick={() =>
              setSound((current) => {
                try {
                  localStorage.setItem('diis-attendance-sound', current ? 'off' : 'on');
                } catch {
                  /* preference only */
                }
                return !current;
              })
            }
          >
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {sound ? 'Suara aktif' : 'Suara nonaktif'}
          </button>
          <style>{`@keyframes attendancePop { 0% {transform:scale(.65);opacity:0} 70% {transform:scale(1.08)} 100% {transform:scale(1);opacity:1} } @keyframes attendanceBurst {0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--burst-x),var(--burst-y)) rotate(180deg);opacity:0}} .attendance-confetti{animation:attendanceBurst .85s ease-out forwards} .success-mark {animation:attendancePop .55s ease-out} @media(prefers-reduced-motion:reduce) {.success-mark {animation:none}.attendance-confetti{display:none}}`}</style>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export function LocationBadge({ status }: { status: LocationResult['status'] }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ' +
        (status === 'INSIDE'
          ? 'bg-emerald-100 text-emerald-800'
          : status === 'OUTSIDE'
            ? 'bg-rose-100 text-rose-800'
            : 'bg-amber-100 text-amber-900')
      }
    >
      <MapPin size={13} />
      {LOCATION_LABEL[status]}
    </span>
  );
}
export function TeachingCard({
  slot,
  now,
  highlight = false,
}: {
  slot: TeachingToday;
  now: Date;
  highlight?: boolean;
}) {
  const current = new Date(slot.startAt) <= now && now < new Date(slot.endAt);
  const past = now >= new Date(slot.endAt);
  return (
    <div
      className={
        'rounded-xl border p-3 sm:p-4 [@media(max-height:450px)]:p-2 ' +
        (highlight
          ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50'
          : 'border-slate-200 bg-white')
      }
    >
      {highlight && (
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 text-[11px] font-bold text-teal-800 sm:mb-3 [@media(max-height:450px)]:mb-1">
          <Clock3 size={12} />
          {current
            ? 'SEDANG BERLANGSUNG'
            : past
              ? 'SELESAI'
              : 'BERIKUTNYA · ' +
                Math.max(0, Math.ceil((new Date(slot.startAt).getTime() - now.getTime()) / 60000)) +
                ' MENIT LAGI'}
        </span>
      )}
      <div className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <CalendarDays size={23} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-950 sm:text-lg [@media(max-height:450px)]:text-base">
            JP {slot.jpStart}
            {slot.jpEnd !== slot.jpStart ? ' – ' + slot.jpEnd : ''}
          </p>
          <p className="text-sm font-semibold text-slate-900">{slot.classes.join(' + ')}</p>
          <p className="mt-1 text-sm leading-normal text-slate-600">{slot.subject}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Clock3 size={14} />
            {formatAttendanceTime(slot.startAt)} – {formatAttendanceTime(slot.endAt)}
            {slot.room && ' · ' + slot.room}
          </p>
          {slot.mode && (
            <span
              className={
                'mt-2 inline-block rounded-md px-2 py-1 text-[10px] font-medium ' +
                (slot.expired ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800')
              }
            >
              {slot.expired
                ? 'Persetujuan kedaluwarsa · perlu review'
                : slot.mode === 'JOINT_CLASS'
                  ? 'Kelas gabungan resmi'
                  : 'Pengecualian sementara'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
function SchoolArrival() {
  return (
    <svg
      viewBox="0 0 320 135"
      className="mx-auto mb-3 h-28 w-full max-w-xs sm:mb-4 sm:h-32"
      aria-hidden="true"
    >
      <ellipse cx="160" cy="119" rx="77" ry="12" fill="#dbeafe" />
      <path d="M73 69h174v39H73z" fill="#eff6ff" />
      <path d="M90 53h140l24 17H66z" fill="#dbeafe" />
      <path d="M133 40h54v68h-54z" fill="#dbeafe" />
      <path d="m121 41 39-28 39 28z" fill="#bfdbfe" />
      <path d="M158 13V3h20l-5 6h-15" fill="#93c5fd" />
      <path d="M150 82h20v26h-20z" fill="#93c5fd" />
      <g fill="#bfdbfe">
        <path d="M91 82h15v15H91zm25 0h15v15h-15zm80 0h15v15h-15zm25 0h15v15h-15z" />
      </g>
      <circle cx="160" cy="62" r="6" fill="white" />
      <circle cx="160" cy="108" r="25" fill="#10b981" />
      <path
        d="m149 108 8 8 15-17"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="97" r="13" fill="#dbeafe" />
      <circle cx="276" cy="96" r="15" fill="#dbeafe" />
      <path d="M46 108v10m230-10v10" stroke="#bfdbfe" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
