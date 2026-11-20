'use client';

import { CalendarDays, ClipboardCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ExamIncidentActions } from './ExamIncidentActions';

type Exam = {
  sessionId: string; room: string; opensAt: string; latestEntryAt: string; closesAt: string;
  publishedAt: string | null; cancelledAt: string | null; makeupOfSessionId: string | null;
  package: { title: string; version: number; subject: string };
  session: { title: string; status: string; durationMinutes: number; academicYear: string; semester: number; class: { name: string } | null };
  _count: { participants: number; incidents: number }; counts?: { working: number; done: number };
};
type Person = { studentId: string; extraMinutes: number; student: { user: { fullName: string } };
  response: { startedAt: string | null; submittedAt: string | null; lastSavedAt: string | null; lastHeartbeatAt: string | null;
    lateSubmissionStatus: string | null; _count: { integrityEvents: number } } | null;
};
type MakeupCandidate = { studentId: string; fullName: string; mode: 'absence' | 'improvement' };
type Incident = { id: string; kind: string; reason: string; decision: string | null; resolvedAt: string | null };
type Monitor = Exam & { participants: Person[]; incidents: Incident[]; asOf: string; canReport: boolean };
type MonitorLabel = 'Belum mulai' | 'Mengerjakan' | 'Koneksi tidak terpantau' | 'Perlu keputusan' | 'Terkirim' | 'Ditolak';
const monitorLabels: MonitorLabel[] = ['Belum mulai', 'Mengerjakan', 'Koneksi tidak terpantau', 'Perlu keputusan', 'Terkirim', 'Ditolak'];
function participantLabel(person: Person, asOf: number): MonitorLabel {
  const response = person.response;
  if (response?.lateSubmissionStatus === 'pending') return 'Perlu keputusan';
  if (response?.lateSubmissionStatus === 'rejected') return 'Ditolak';
  if (response?.submittedAt) return 'Terkirim';
  if (!response?.startedAt) return 'Belum mulai';
  const activityAt = Math.max(
    Date.parse(response.startedAt),
    response.lastHeartbeatAt ? Date.parse(response.lastHeartbeatAt) : 0,
    response.lastSavedAt ? Date.parse(response.lastSavedAt) : 0,
  );
  return asOf - activityAt > 45_000 ? 'Koneksi tidak terpantau' : 'Mengerjakan';
}
type Options = {
  drafts: { id: string; title: string; class: { name: string } | null; durationMinutes: number }[];
  packages: { id: string; title: string; subject: string; version: number }[];
  proctors: { id: string; fullName: string }[];
};
const panel = 'min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5';
const control = 'min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm';
const primary = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
function status(exam: Exam, now: number) {
  if (exam.cancelledAt) return 'Dibatalkan';
  if (!exam.publishedAt) return 'Draf';
  if (exam.session.status === 'completed') return 'Selesai';
  if (now >= Date.parse(exam.closesAt)) return 'Menunggu penutupan';
  return now >= Date.parse(exam.opensAt) ? 'Berlangsung' : 'Terjadwal';
}
class ExamRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
function lostMonitorAccess(error: unknown) {
  return error instanceof ExamRequestError && [401, 403, 404].includes(error.status);
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/backend/exam-schedule${path}`, {
    ...init, headers, cache: 'no-store',
  });
  if (response.redirected) throw new ExamRequestError('Sesi perlu diperbarui. Masuk kembali.', 401);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ExamRequestError(typeof data?.message === 'string' ? data.message : 'Permintaan belum berhasil. Coba lagi.', response.status);
  }
  return response.json();
}

export function ExamWorkspace({ student, canAuthor, canPlan, day }: {
  student: boolean; canAuthor: boolean; canPlan: boolean; day: string;
}) {
  const [date, setDate] = useState(day);
  const [result, setResult] = useState<{ rows: Exam[]; asOf: string; nextCursor: string | null }>();
  const [options, setOptions] = useState<Options>();
  const [selected, setSelected] = useState<string | null>(null);
  const [monitorData, setMonitor] = useState<Monitor>();
  const monitor = monitorData?.sessionId === selected ? monitorData : undefined;
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirm, setConfirm] = useState<Exam>();
  const [cancel, setCancel] = useState<Exam>();
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [monitorFailure, setMonitorFailure] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [room, setRoom] = useState('');
  const [starts, setStarts] = useState('');
  const [entry, setEntry] = useState('');
  const [ends, setEnds] = useState('');
  const [proctors, setProctors] = useState<string[]>([]);
  const [makeupOf, setMakeupOf] = useState('');
  const [makeupRoster, setMakeupRoster] = useState<MakeupCandidate[]>([]);
  const [makeupParticipants, setMakeupParticipants] = useState<string[]>([]);
  const [makeupLoading, setMakeupLoading] = useState(false);
  const [roomFilter, setRoomFilter] = useState('');
  const request = useRef(0);
  const mutation = useRef(false);
  const refreshMonitor = useRef<{ sessionId: string; refresh: () => Promise<void> } | undefined>(undefined);
  const monitorSummary = useMemo(() => {
    if (!monitor) return;
    const now = Date.parse(monitor.asOf);
    const counts = new Map<MonitorLabel, number>();
    const rows = monitor.participants.map((person) => {
      const label = participantLabel(person, now);
      counts.set(label, (counts.get(label) ?? 0) + 1);
      return { person, label };
    });
    return { counts, rows };
  }, [monitor]);

  const reload = useCallback(async (cursor?: string) => {
    const id = ++request.current;
    setLoading(true);
    setFailure('');
    try {
      const query = new URLSearchParams({ day: date, ...(cursor ? { cursor } : {}) });
      const data = await api<NonNullable<typeof result>>(`?${query}`);
      if (request.current !== id) return;
      setResult((previous) => cursor && previous ? { ...data, rows: [...previous.rows, ...data.rows] } : data);
    } catch (error) {
      if (request.current === id) setFailure((error as Error).message);
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [date]);
  useEffect(() => { void reload(); return () => { request.current++; }; }, [reload]);
  useEffect(() => {
    if (!panelOpen || (!canAuthor && !canPlan)) return;
    let live = true;
    void api<Options>('/options').then((value) => { if (live) setOptions(value); },
      (error: Error) => { if (live) setFailure(error.message); });
    return () => { live = false; };
  }, [panelOpen, canAuthor, canPlan]);

  useEffect(() => {
    if (!makeupOf || !canPlan) return;
    let live = true;
    setMakeupLoading(true);
    void api<MakeupCandidate[]>(`/${makeupOf}/makeup-options`).then((data) => {
      if (live) setMakeupRoster(data);
    }, (error: Error) => { if (live) setFailure(error.message); })
      .finally(() => { if (live) setMakeupLoading(false); });
    return () => { live = false; };
  }, [canPlan, makeupOf]);

  useEffect(() => {
    if (!selected) return;
    const sessionId = selected;
    setMonitor(undefined);
    setMonitorFailure('');
    let active = true;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function cancelRead() {
      clearTimeout(timer);
      request?.abort();
      request = undefined;
    }
    async function refresh() {
      if (!active || request || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      try {
        const data = await api<Monitor>(`/${sessionId}/monitor`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setMonitor(data);
        setMonitorFailure('');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (lostMonitorAccess(error)) {
          setMonitor(undefined);
          setMonitorFailure((error as Error).message);
          return;
        }
        setMonitorFailure('Pembaruan monitor gagal. Periksa koneksi atau coba muat ulang.');
      } finally {
        if (request === controller) request = undefined;
      }
      timer = setTimeout(() => void refresh(), 15_000);
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void refresh();
      else cancelRead();
    }
    refreshMonitor.current = { sessionId, refresh };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refresh();
    return () => {
      active = false;
      cancelRead();
      refreshMonitor.current = undefined;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [selected]);

  async function save(work: () => Promise<void>) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try { await work(); } catch (error) { setFailure((error as Error).message); }
    finally { mutation.current = false; setBusy(false); }
  }

  function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId || !selectedPackage || !proctors.length || starts > entry || entry >= ends ||
        (makeupOf && !makeupParticipants.length)) {
      setFailure('Pilih paket, draft, proktor, dan urutkan waktu buka, batas masuk, lalu tutup.');
      return;
    }
    void save(async () => {
      const tz = (value: string) => `${value}:00+07:00`;
      await api(`/${sessionId}`, { method: 'PUT', body: JSON.stringify({
        packageId: selectedPackage, room, opensAt: tz(starts), latestEntryAt: tz(entry), closesAt: tz(ends),
        proctorIds: proctors,
        ...(makeupOf ? { makeupOfSessionId: makeupOf, participantIds: makeupParticipants } : {}),
      }) });
      setNotice('Draf jadwal tersimpan. Periksa sebelum diterbitkan.');
      setPanelOpen(false);
      setMakeupOf(''); setMakeupRoster([]); setMakeupParticipants([]);
      if (date === starts.slice(0, 10)) await reload();
      else setDate(starts.slice(0, 10));
    });
  }

  const rows = result?.rows.filter((exam) => !roomFilter ||
    `${exam.room} ${exam.session.class?.name ?? ''} ${exam.session.title}`.toLocaleLowerCase('id').includes(roomFilter.trim().toLocaleLowerCase('id')));

  return (
    <main className="mx-auto max-w-7xl space-y-5 text-[var(--text)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6 text-emerald-600" />{student ? 'Jadwal Ujian' : 'Ujian'}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{student ? 'Lihat jadwal dan waktu masuk ujian Anda.' : 'Lihat jadwal, peserta, dan status ujian sesuai kewenangan Anda.'}</p></div>
        {(canAuthor || canPlan) && <button className={primary} onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>
          {panelOpen ? 'Tutup penyusunan' : 'Siapkan ujian'}
        </button>}
      </header>
      {failure && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{failure}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
      {panelOpen && (
        <section className={panel}>
          <h2 className="text-lg font-bold">Siapkan ujian</h2>
          {!options ? <p role="status">Memuat draft dan paket…</p> : (
            <form onSubmit={plan} className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Draft sumatif
                <select className={control} value={sessionId} onChange={(event) => setSessionId(event.target.value)} required>
                  <option value="">Pilih draft dari Studio Asesmen</option>
                  {options.drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.title} · {draft.class?.name}</option>)}
                </select>
              </label>
              {canAuthor && <button type="button" className={control} disabled={busy || !sessionId} onClick={() => void save(async () => {
                await api(`/${sessionId}/package`, { method: 'POST' });
                setOptions(await api<Options>('/options'));
                setNotice('Versi paket soal tersedia untuk dijadwalkan.');
              })}>Buat versi paket dari draft</button>}
              {canPlan && <>
                <label className="grid gap-1 text-sm font-semibold">Paket soal
                  <select className={control} value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)} required>
                    <option value="">Pilih paket</option>
                    {options.packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.subject} · {pkg.title} · versi {pkg.version}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">Ruang
                  <input className={control} value={room} onChange={(event) => setRoom(event.target.value)} required maxLength={80} />
                </label>
                {([['Waktu buka (WIB)', starts, setStarts], ['Batas masuk (WIB)', entry, setEntry], ['Tutup (WIB)', ends, setEnds]] as const).map(([label, value, change]) =>
                  <label className="grid gap-1 text-sm font-semibold" key={label}>{label}
                    <input className={control} type="datetime-local" value={value} onChange={(event) => change(event.target.value)} required />
                  </label>)}
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="font-semibold">Proktor</legend>
                  <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                    {options.proctors.map((person) => <label key={person.id} className="flex min-h-11 items-center gap-2 px-2 text-sm">
                      <input type="checkbox" checked={proctors.includes(person.id)} onChange={(event) => setProctors((previous) =>
                        event.target.checked ? [...previous, person.id] : previous.filter((id) => id !== person.id))} />
                      {person.fullName}
                    </label>)}
                  </div>
                </fieldset>
                <label className="grid gap-1 text-sm font-semibold">Sesi asal untuk ujian susulan
                  <select className={control} value={makeupOf} onChange={(event) => {
                    setMakeupOf(event.target.value); setMakeupRoster([]); setMakeupParticipants([]);
                  }}>
                    <option value="">Ujian reguler</option>
                    {result?.rows.filter((exam) => exam.session.status === 'completed' && !exam.makeupOfSessionId)
                      .map((exam) => <option key={exam.sessionId} value={exam.sessionId}>
                        {exam.session.title} · {exam.session.class?.name}
                      </option>)}
                  </select>
                  <span className="font-normal text-[var(--muted)]">Pilih tanggal ujian asal untuk memuat sesi yang sudah selesai.</span>
                </label>
                {makeupOf && <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="font-semibold">Peserta susulan</legend>
                  <p className="text-sm text-[var(--muted)]">Untuk perbaikan nilai, pilih paket soal dari materi yang masih belum dikuasai siswa.</p>
                  {makeupLoading ? <p role="status">Memuat peserta…</p> : !makeupRoster.length ?
                    <p className="text-sm text-[var(--muted)]">Tidak ada peserta yang dapat dijadwalkan dari sesi ini.</p> :
                    <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                      {makeupRoster.map((person) => <label className="flex min-h-11 items-center gap-2 px-2 text-sm" key={person.studentId}>
                        <input type="checkbox" checked={makeupParticipants.includes(person.studentId)} onChange={(event) => {
                          setMakeupParticipants(event.target.checked ? [...makeupParticipants, person.studentId] :
                            makeupParticipants.filter((id) => id !== person.studentId));
                        }} /><span>{person.fullName}<small className="block text-[var(--muted)]">
                          {person.mode === 'improvement' ? 'Perbaikan nilai' : 'Belum memiliki nilai'}</small></span>
                      </label>)}
                    </div>}
                </fieldset>}
                <button type="submit" disabled={busy || (Boolean(makeupOf) && !makeupParticipants.length)} className={primary}>Simpan draf jadwal</button>
              </>}
            </form>
          )}
        </section>
      )}
      <section className={panel} aria-busy={loading}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-sm font-semibold">Tanggal ujian
            <input type="date" className={control} value={date} onChange={(event) => { if (event.target.value) { setResult(undefined); setDate(event.target.value); } }} />
          </label>
          {!student && <label className="grid gap-1 text-sm font-semibold">Cari pada jadwal yang dimuat
            <input type="search" className={control} value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)}
              placeholder="Ruang, kelas, atau judul" />
          </label>}
          <button className={control} disabled={loading} onClick={() => void reload()}><RefreshCw className="mr-1 inline h-4 w-4" />Muat ulang</button>
        </div>
        {loading && !result && <p role="status">Memuat jadwal…</p>}
        {rows?.length === 0 && <p className="text-sm text-[var(--muted)]">{roomFilter ? 'Tidak ada ujian yang cocok.' : 'Belum ada ujian dalam cakupan Anda pada tanggal ini.'}</p>}
        {rows?.map((exam) => {
          if (!result) return null;
          const state = status(exam, Date.parse(result.asOf));
          return <article key={exam.sessionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3 sm:p-4">
            <div className="min-w-0 space-y-1"><h2 className="font-bold">{exam.session.title}</h2>
              <p className="text-sm text-[var(--muted)]"><CalendarDays className="mr-1 inline h-4 w-4" />
                {time.format(new Date(exam.opensAt))}–{time.format(new Date(exam.closesAt))} WIB · {exam.session.class?.name ?? 'Kelas'} · {exam.room}</p>
              <p className="text-sm"><strong>{state}</strong>{exam.makeupOfSessionId ? ' · Susulan' : ''}
                {student ? ` · Batas masuk ${time.format(new Date(exam.latestEntryAt))} WIB` :
                  ` · ${exam._count.participants} peserta · ${exam.counts?.working ?? 0} mengerjakan · ${exam.counts?.done ?? 0} terkirim`}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {student && exam.publishedAt && !exam.cancelledAt && (
                <Link className={`${control} inline-flex items-center`} href={{ pathname: '/dashboard/akademik', query: {
                  view: 'assessment', sessionId: exam.sessionId,
                  academicYear: exam.session.academicYear, semester: exam.session.semester,
                } }}>Lihat detail ujian</Link>
              )}
              {!student && <button className={control} onClick={() => setSelected(exam.sessionId)}>Pantau sesi</button>}
              {canPlan && state === 'Draf' && <button className={primary} onClick={() => setConfirm(exam)}>Terbitkan</button>}
              {canPlan && ['Draf', 'Terjadwal'].includes(state) && <button className={control} onClick={() => {
                setCancelReason(''); setFailure(''); setCancel(exam);
              }}>Batalkan jadwal</button>}
            </div>
          </article>;
        })}
        {result?.nextCursor && <button className={control} disabled={loading} onClick={() => void reload(result.nextCursor!)}>Muat sesi berikutnya</button>}
      </section>
      {cancel && <Dialog open onOpenChange={(open) => { if (!open && !busy) setCancel(undefined); }}>
        <DialogContent className="bg-white dark:bg-slate-900">
          <DialogTitle>Batalkan jadwal ujian?</DialogTitle>
          <DialogDescription>{cancel.session.title}. Pembatalan tersedia selama belum ada peserta yang mulai.</DialogDescription>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              await api(`/${cancel.sessionId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason }) });
              setCancel(undefined); setNotice('Jadwal ujian dibatalkan.'); await reload();
            });
          }}>
            <label className="grid gap-1 text-sm font-semibold">Alasan
              <textarea className={control} required minLength={8} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            </label>
            {failure && <p role="alert" className="text-sm text-rose-700">{failure}</p>}
            <button type="submit" disabled={busy || cancelReason.trim().length < 8} className={primary}>Konfirmasi batalkan jadwal</button>
          </form>
        </DialogContent>
      </Dialog>}
      {confirm && <Dialog open onOpenChange={(open) => { if (!open && !busy) setConfirm(undefined); }}>
        <DialogContent className="bg-white dark:bg-slate-900">
          <DialogTitle>Terbitkan ujian?</DialogTitle><DialogDescription>{confirm.session.title} · {confirm.room} · {confirm._count.participants} peserta.</DialogDescription>
          {failure && <p role="alert" className="text-sm text-rose-700">{failure}</p>}
          <button className={primary} disabled={busy} onClick={() => void save(async () => {
            await api(`/${confirm.sessionId}/publish`, { method: 'POST' });
            setConfirm(undefined); setNotice('Jadwal ujian diterbitkan.'); await reload();
          })}>Konfirmasi terbitkan</button>
        </DialogContent>
      </Dialog>}
      {selected && <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto bg-white dark:bg-slate-900">
          <DialogTitle>{monitor?.session.title ?? 'Pantau sesi ujian'}</DialogTitle>
          <DialogDescription>{monitor ? `Diperbarui ${time.format(new Date(monitor.asOf))} WIB` : 'Status peserta sesuai cakupan Anda.'}</DialogDescription>
          {monitorFailure && <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <p role="alert" className="text-sm">{monitorFailure}</p>
            <button type="button" className={control} onClick={() => void refreshMonitor.current?.refresh()}>Muat ulang monitor</button>
          </div>}
          {!monitor || !monitorSummary ? (!monitorFailure && <p role="status">Memuat monitor…</p>) : <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--border)] pb-3 text-sm sm:grid-cols-3">
              {monitorLabels.map((label) => <div key={label} className="flex items-baseline justify-between gap-2">
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd className="font-semibold tabular-nums">{monitorSummary.counts.get(label) ?? 0}</dd>
              </div>)}
            </dl>
            <div className="overflow-x-auto" role="region" aria-label="Status peserta" tabIndex={0}>
              <table className="w-full text-left text-sm">
                <thead><tr>{['Peserta', 'Status', 'Simpan terakhir', 'Insiden'].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
                <tbody>{monitorSummary.rows.map(({ person, label }) => {
                  const response = person.response;
                  return <tr key={person.studentId} className="border-t border-[var(--border)]">
                    <th scope="row" className="p-2 text-left font-medium">{person.student.user.fullName}</th><td className="p-2">{label}</td>
                    <td className="p-2">{response?.lastSavedAt ? time.format(new Date(response.lastSavedAt)) : '—'}</td>
                    <td className="p-2">{response?._count.integrityEvents ?? 0}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <ExamIncidentActions key={selected} canReport={monitor.canReport} canDecide={canPlan}
              incidents={monitor.incidents} participants={monitor.participants}
              save={async (path, payload) => {
                await api(`/${selected}${path}`, { method: 'POST', body: JSON.stringify(payload) });
                const current = refreshMonitor.current;
                if (current?.sessionId === selected) await current.refresh();
              }} />
          </>}
        </DialogContent>
      </Dialog>}
    </main>
  );
}
