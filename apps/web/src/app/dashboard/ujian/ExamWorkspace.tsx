'use client';

import { ClipboardCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ExamIncidentActions } from './ExamIncidentActions';
import { AssessmentProgramsPanel } from './AssessmentProgramsPanel';
import { ExamOperationsPanel, RoomPlacementFields, type ExamAgendaPlacement, type ExamRoomAssignment } from './ExamOperationsPanel';

import { ExamScheduleList, defaultExamFilters, type Exam, type ExamView, type ExamFilters, type ExamPageResult } from './ExamScheduleList';
import { ExamScheduleDetails } from './ExamScheduleDetails';

type Person = { studentId: string; extraMinutes: number; student: { user: { fullName: string } };
  response: { startedAt: string | null; submittedAt: string | null; lastSavedAt: string | null; lastHeartbeatAt: string | null;
    lateSubmissionStatus: string | null; _count: { integrityEvents: number } } | null;
};
type MakeupCandidate = { studentId: string; fullName: string; mode: 'absence' | 'improvement' };
type Incident = { id: string; kind: string; reason: string; decision: string | null; resolvedAt: string | null };
type Monitor = Exam & { participants: Person[]; incidents: Incident[]; asOf: string; canReport: boolean; canDecide?: boolean };
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
const surface = 'border-[var(--staff-line,#e2e8f0)] bg-[var(--staff-panel,#fff)] text-[var(--staff-text,#0f172a)]';
const muted = 'text-[var(--staff-muted,#475569)]';
const panel = `min-w-0 space-y-4 rounded-2xl border p-4 sm:p-5 ${surface}`;
const control = `min-h-11 rounded-lg border px-3 py-2 text-sm ${surface}`;
const primary = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
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
  const [view, setView] = useState<ExamView>('schedule');
  const [filterState, setFilterState] = useState(() => ({
    schedule: defaultExamFilters(day, 'schedule'), archive: defaultExamFilters(day, 'archive'),
  }));
  const filters = filterState[view];
  const date = filterState.schedule.day;
  function setDate(value: string) {
    setView('schedule');
    setFilterState((state) => ({ ...state, schedule: { ...state.schedule, day: value, through: '', status: '' } }));
  }
  function updateFilters(values: Partial<ExamFilters>) {
    setFilterState((state) => ({ ...state, [view]: { ...state[view], ...values } }));
  }
  const query = useMemo(() => {
    if (filters.through && filters.through < filters.day) return '';
    const params = new URLSearchParams({ view });
    for (const [key, raw] of Object.entries(filters)) {
      const value = raw.trim();
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [filters, view]);
  const [list, setList] = useState<{ query: string; result: ExamPageResult }>();
  const result = list?.query === query ? list.result : undefined;
  const [listError, setListError] = useState<{ query: string; message: string }>();
  const [detailTarget, setDetailTarget] = useState<{ exam: Exam; action?: 'publish' | 'edit' }>();
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const [options, setOptions] = useState<Options>();
  const monitorTrigger = useRef<HTMLButtonElement | null>(null);
  const examHeading = useRef<HTMLHeadingElement>(null);
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
  const [agendaPlacement, setAgendaPlacement] = useState<ExamAgendaPlacement | null>(null);
  const [useAgenda, setUseAgenda] = useState(false);
  const [assignments, setAssignments] = useState<ExamRoomAssignment[] | null>(null);
  const [proctors, setProctors] = useState<string[]>([]);
  const [makeupDay, setMakeupDay] = useState('');
  const [makeupOptions, setMakeupOptions] = useState<ExamPageResult>();
  const [makeupOptionsError, setMakeupOptionsError] = useState('');
  const [makeupOptionsLoading, setMakeupOptionsLoading] = useState(false);
  const [makeupOf, setMakeupOf] = useState('');
  const [makeupRoster, setMakeupRoster] = useState<MakeupCandidate[]>([]);
  const [makeupParticipants, setMakeupParticipants] = useState<string[]>([]);
  const makeupPlacement = useMemo(() => makeupOf ? makeupRoster
    .filter(({ studentId }) => makeupParticipants.includes(studentId))
    .map(({ studentId, fullName }) => ({ id: studentId, fullName })) : null,
  [makeupOf, makeupRoster, makeupParticipants]);
  const [makeupLoading, setMakeupLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const refreshMonitor = useRef<{ sessionId: string; refresh: (restart?: boolean) => Promise<void> } | undefined>(undefined);
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

  const reload = useCallback(async (cursor?: string, asOf?: string) => {
    if (!query) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setListError(undefined);
    try {
      const params = new URLSearchParams(query);
      if (cursor && asOf) { params.set('cursor', cursor); params.set('asOf', asOf); }
      const data = await api<ExamPageResult>('?' + params, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setList((previous) => {
        if (!cursor || previous?.query !== query) return { query, result: data };
        const known = new Set(previous.result.rows.map(({ sessionId }) => sessionId));
        return { query, result: { ...data, rows: [...previous.result.rows, ...data.rows.filter(({ sessionId }) => !known.has(sessionId))] } };
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (lostMonitorAccess(error)) setList(undefined);
      setListError({ query, message: (error as Error).message });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    if (!query) { setLoading(false); return; }
    setLoading(true);
    const delay = setTimeout(() => void reload(), 220);
    return () => { clearTimeout(delay); request.current?.abort(); };
  }, [query, reload]);
  useEffect(() => {
    if (!canPlan && (!panelOpen || !canAuthor)) return;
    let live = true;
    void api<Options>('/options').then((value) => { if (live) setOptions(value); },
      (error: Error) => { if (live) setFailure(error.message); });
    return () => { live = false; };
  }, [panelOpen, canAuthor, canPlan]);

  const loadMakeupOptions = useCallback(async (signal?: AbortSignal, next?: ExamPageResult) => {
    if (!makeupDay) return;
    const params = new URLSearchParams({ day: makeupDay, status: 'completed' });
    if (next?.nextCursor) { params.set('cursor', next.nextCursor); params.set('asOf', next.asOf); }
    setMakeupOptionsError(''); setMakeupOptionsLoading(true);
    try {
      const page = await api<ExamPageResult>('?' + params, { signal });
      if (!signal?.aborted) setMakeupOptions({ ...page, rows: [...(next?.rows ?? []), ...page.rows] });
    } catch (error) {
      if (!signal?.aborted) setMakeupOptionsError((error as Error).message);
    } finally {
      if (!signal?.aborted) setMakeupOptionsLoading(false);
    }
  }, [makeupDay]);
  useEffect(() => {
    if (!makeupDay || !canPlan || !panelOpen || view !== 'schedule') return;
    const controller = new AbortController();
    void loadMakeupOptions(controller.signal);
    return () => controller.abort();
  }, [makeupDay, canPlan, panelOpen, view, loadMakeupOptions]);

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
    async function refresh(restart = false) {
      if (restart) cancelRead();
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
        setMonitor((snapshot) => snapshot?.sessionId === sessionId
          ? { ...snapshot, canReport: false, canDecide: false } : snapshot);
        setMonitorFailure('Pembaruan monitor gagal. Data sebelumnya mungkin berubah. Muat ulang monitor.');
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
    if (!sessionId || !selectedPackage || (useAgenda ? !agendaPlacement || !assignments : !proctors.length) ||
        starts > entry || starts >= ends || entry > ends ||
        (makeupOf && !makeupParticipants.length)) {
      setFailure('Pilih paket, draft, proktor, dan urutkan waktu buka, batas masuk, lalu tutup.');
      return;
    }
    void save(async () => {
      const tz = (value: string) => `${value}:00+07:00`;
      await api(`/${sessionId}`, { method: 'PUT', body: JSON.stringify({
        packageId: selectedPackage, opensAt: tz(starts), latestEntryAt: tz(entry), closesAt: tz(ends),
        ...(useAgenda ? { agendaId: agendaPlacement?.agendaId, roomAssignments: assignments } : { room, proctorIds: proctors }),
        ...(makeupOf ? { makeupOfSessionId: makeupOf, participantIds: makeupParticipants } : {}),
      }) });
      setNotice('Draf jadwal tersimpan. Periksa sebelum diterbitkan.');
      setPanelOpen(false);
      setMakeupOf(''); setMakeupRoster([]); setMakeupParticipants([]);
      if (date === starts.slice(0, 10)) await reload();
      else setDate(starts.slice(0, 10));
    });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 text-[var(--text,var(--staff-text,#0f172a))]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 ref={examHeading} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6 text-emerald-600" />{student ? 'Jadwal Ujian' : 'Ujian'}</h1>
          <p className="mt-1 text-sm text-[var(--staff-muted,#475569)]">{student ? 'Lihat jadwal dan waktu masuk ujian Anda.' : 'Lihat jadwal, peserta, dan status ujian sesuai kewenangan Anda.'}</p></div>
        {view === 'schedule' && (canAuthor || canPlan) && <button className={primary} onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>
          {panelOpen ? 'Tutup penyusunan' : 'Siapkan ujian'}
        </button>}
      </header>
      {failure && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{failure}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
      <ExamScheduleList view={view} filters={filters} student={student} canPlan={canPlan} result={result}
        error={listError?.query === query ? listError.message : ''} loading={Boolean(query) && (loading || (!result && listError?.query !== query))}
        onView={(next) => { setView(next); if (next === 'archive') setPanelOpen(false); }}
        onFilters={updateFilters} onReset={() => setFilterState((state) => ({ ...state, [view]: defaultExamFilters(day, view) }))}
        onReload={(cursor) => void reload(cursor, result?.asOf)}
        onDetail={(exam, event, action) => { detailTrigger.current = event.currentTarget; setDetailTarget({ exam, action }); }}
        onMonitor={(exam, event) => { monitorTrigger.current = event.currentTarget; setSelected(exam.sessionId); }}
        onPublish={setConfirm}
        onCancel={(exam) => { setCancelReason(''); setFailure(''); setCancel(exam); }} />
      {view === 'schedule' && <AssessmentProgramsPanel student={student} canAuthor={canAuthor} onPublished={() => { void reload(); }} />}
      {view === 'schedule' && !student && <ExamOperationsPanel day={date} canPlan={canPlan} onPlacement={setAgendaPlacement} /> }
      {view === 'schedule' && panelOpen && (
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
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={useAgenda} disabled={!agendaPlacement && !useAgenda}
                    onChange={(event) => { setAssignments(null); setUseAgenda(event.target.checked); }} />
                  Gunakan ruang dan penugasan dari agenda aktif
                </label>
                {!useAgenda && <label className="grid gap-1 text-sm font-semibold">Ruang
                  <input className={control} value={room} onChange={(event) => setRoom(event.target.value)} required maxLength={80} />
                </label>}
                {([['Waktu buka (WIB)', starts, setStarts], ['Batas masuk (WIB)', entry, setEntry], ['Tutup (WIB)', ends, setEnds]] as const).map(([label, value, change]) =>
                  <label className="grid gap-1 text-sm font-semibold" key={label}>{label}
                    <input className={control} type="datetime-local" value={value} onChange={(event) => change(event.target.value)} required />
                  </label>)}
                {!useAgenda && <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="font-semibold">Proktor sesi</legend>
                  <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                    {options.proctors.map((person) => <label key={person.id} className="flex min-h-11 items-center gap-2 px-2 text-sm">
                      <input type="checkbox" checked={proctors.includes(person.id)} onChange={(event) => setProctors((previous) =>
                        event.target.checked ? [...previous, person.id] : previous.filter((id) => id !== person.id))} />
                      {person.fullName}
                    </label>)}
                  </div>
                </fieldset>}
                <label className="grid gap-1 text-sm font-semibold">Tanggal ujian asal (opsional)
                  <input className={control} type="date" value={makeupDay} disabled={makeupOptionsLoading} onChange={(event) => {
                    setMakeupDay(event.target.value); setMakeupOptions(undefined); setMakeupOptionsError('');
                    setMakeupOf(''); setMakeupRoster([]); setMakeupParticipants([]);
                  }} />
                </label>
                <label className="grid gap-1 text-sm font-semibold">Sesi asal untuk ujian susulan
                  <select className={control} value={makeupOf} onChange={(event) => {
                    setMakeupOf(event.target.value); setMakeupRoster([]); setMakeupParticipants([]);
                  }}>
                    <option value="">Ujian reguler</option>
                    {makeupOptions?.rows.filter((exam) => !exam.makeupOfSessionId)
                      .map((exam) => <option key={exam.sessionId} value={exam.sessionId}>
                        {exam.session.title} · {exam.session.class?.name}
                      </option>)}
                  </select>
                </label>
                {makeupOptionsLoading && <p role="status" className="text-sm">Memuat ujian asal…</p>}
                {makeupOptionsError && <div className="space-y-2">
                  <p role="alert" className="text-sm">{makeupOptionsError}</p>
                  <button type="button" className={control} onClick={() => void loadMakeupOptions()}>Muat ulang ujian asal</button>
                </div>}
                {makeupOptions?.nextCursor && <button type="button" className={control} disabled={makeupOptionsLoading}
                  onClick={() => void loadMakeupOptions(undefined, makeupOptions)}>Muat ujian asal berikutnya</button>}
                {!makeupOptionsLoading && makeupOptions && !makeupOptions.nextCursor && !makeupOptions.rows.some((exam) => !exam.makeupOfSessionId) &&
                  <p role="status" className="text-sm">Belum ada ujian asal yang selesai pada tanggal ini.</p>}
                {makeupOf && <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="font-semibold">Peserta susulan</legend>
                  <p className="text-sm text-[var(--staff-muted,#475569)]">Untuk perbaikan nilai, pilih paket soal dari materi yang masih belum dikuasai siswa.</p>
                  {makeupLoading ? <p role="status">Memuat peserta…</p> : !makeupRoster.length ?
                    <p className="text-sm text-[var(--staff-muted,#475569)]">Tidak ada peserta yang dapat dijadwalkan dari sesi ini.</p> :
                    <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                      {makeupRoster.map((person) => <label className="flex min-h-11 items-center gap-2 px-2 text-sm" key={person.studentId}>
                        <input type="checkbox" checked={makeupParticipants.includes(person.studentId)} onChange={(event) => {
                          setMakeupParticipants(event.target.checked ? [...makeupParticipants, person.studentId] :
                            makeupParticipants.filter((id) => id !== person.studentId));
                        }} /><span>{person.fullName}<small className="block text-[var(--staff-muted,#475569)]">
                          {person.mode === 'improvement' ? 'Perbaikan nilai' : 'Belum memiliki nilai'}</small></span>
                      </label>)}
                    </div>}
                </fieldset>}
                {useAgenda && agendaPlacement && <RoomPlacementFields key={agendaPlacement.agendaId + ':' + sessionId}
                  sessionId={sessionId} slots={agendaPlacement.slots} makeup={makeupPlacement} onChange={setAssignments} />}
                {useAgenda && !agendaPlacement && <p role="status">Pilih agenda dan pemakaian ruang terlebih dahulu.</p>}
                <button type="submit" disabled={busy || (useAgenda && (!agendaPlacement || !assignments)) || (Boolean(makeupOf) && !makeupParticipants.length)} className={primary}>Simpan draf jadwal</button>
              </>}
            </form>
          )}
        </section>
      )}
      {detailTarget && <ExamScheduleDetails exam={detailTarget.exam} initialAction={detailTarget.action} student={student} onClose={() => setDetailTarget(undefined)}
        restoreFocus={() => {
          const trigger = detailTrigger.current;
          (trigger?.isConnected ? trigger : examHeading.current)?.focus();
        }}
        onSaved={(message, nextDate) => {
          setNotice(message);
          if (nextDate && nextDate !== date) setDate(nextDate); else void reload();
        }} />}
      {cancel && <Dialog open onOpenChange={(open) => { if (!open && !busy) setCancel(undefined); }}>
        <DialogContent className={surface}>
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
        <DialogContent className={surface}>
          <DialogTitle>Terbitkan ujian?</DialogTitle><DialogDescription>{confirm.session.title} · {confirm.room} · {confirm._count.participants} peserta.</DialogDescription>
          {failure && <p role="alert" className="text-sm text-rose-700">{failure}</p>}
          <button className={primary} disabled={busy} onClick={() => void save(async () => {
            await api(`/${confirm.sessionId}/publish`, { method: 'POST' });
            setConfirm(undefined); setNotice('Jadwal ujian diterbitkan.'); await reload();
          })}>Konfirmasi terbitkan</button>
        </DialogContent>
      </Dialog>}
      {selected && <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent
          className={`max-h-[85dvh] w-[calc(100%_-_1.5rem)] max-w-4xl overflow-y-auto ${surface}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = monitorTrigger.current;
            monitorTrigger.current = null;
            (trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length > 0 ? trigger : examHeading.current)?.focus();
          }}
        >
          <DialogTitle>{monitor?.session.title ?? 'Pantau sesi ujian'}</DialogTitle>
          <DialogDescription className={muted}>{monitor ? `Diperbarui ${time.format(new Date(monitor.asOf))} WIB` : 'Status peserta sesuai cakupan Anda.'}</DialogDescription>
          {monitorFailure && <div className="space-y-2 rounded-lg border border-[var(--staff-line,#cbd5e1)] bg-amber-50 p-3 text-amber-900">
            <p role="alert" className="text-sm">{monitorFailure}</p>
            <button type="button" className={control} onClick={() => void refreshMonitor.current?.refresh()}>Muat ulang monitor</button>
          </div>}
          {!monitor || !monitorSummary ? (!monitorFailure && <p role="status">Memuat monitor…</p>) : <>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {monitorLabels.map((label) => <div key={label} className="rounded-lg border border-[var(--staff-line,#cbd5e1)] bg-[var(--staff-inset,#f1f5f9)] p-2.5">
                <dt className="text-[var(--staff-muted,#475569)]">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{monitorSummary.counts.get(label) ?? 0}</dd>
              </div>)}
            </dl>
            <div className="hidden overflow-x-auto sm:block" role="region" aria-label="Status peserta" tabIndex={0}>
              <table className="w-full text-left text-sm">
                <thead><tr>{['Peserta', 'Status', 'Simpan terakhir', 'Insiden'].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
                <tbody>{monitorSummary.rows.map(({ person, label }) => {
                  const response = person.response;
                  return <tr key={person.studentId} className="border-t border-[var(--staff-line,#cbd5e1)]">
                    <th scope="row" className="p-2 text-left font-medium">{person.student.user.fullName}</th><td className="p-2">{label}</td>
                    <td className="p-2">{response?.lastSavedAt ? time.format(new Date(response.lastSavedAt)) : '—'}</td>
                    <td className="p-2">{response?._count.integrityEvents ?? 0}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-[var(--staff-line,#cbd5e1)] rounded-lg border border-[var(--staff-line,#cbd5e1)] sm:hidden" aria-label="Status peserta">
              {monitorSummary.rows.map(({ person, label }) => {
                const response = person.response;
                return <li key={person.studentId} className="space-y-1 p-3 text-sm">
                  <p className="break-words font-semibold">{person.student.user.fullName}</p>
                  <p>{label}</p>
                  <p className={muted}>Simpan terakhir {response?.lastSavedAt ? time.format(new Date(response.lastSavedAt)) + ' WIB' : '—'}
                    {' · '}{response?._count.integrityEvents ?? 0} sinyal</p>
                </li>;
              })}
            </ul>
            <ExamIncidentActions key={`${selected}:${monitor.canReport}:${monitor.canDecide}`} canReport={monitor.canReport} canDecide={monitor.canDecide === true} allowRoomReport={!monitor.agendaId}
              incidents={monitor.incidents} participants={monitor.participants}
              save={async (path, payload) => {
                try {
                  await api(`/${selected}${path}`, { method: 'POST', body: JSON.stringify(payload) });
                } catch (error) {
                  if (lostMonitorAccess(error) && refreshMonitor.current?.sessionId === selected) {
                    if (error instanceof ExamRequestError && error.status === 403) {
                      setMonitor((snapshot) => snapshot?.sessionId === selected
                        ? { ...snapshot, canReport: false, canDecide: false } : snapshot);
                    } else setMonitor(undefined);
                    setMonitorFailure((error as Error).message);
                    void refreshMonitor.current.refresh(true);
                  }
                  throw error;
                }
                const current = refreshMonitor.current;
                if (current?.sessionId === selected) await current.refresh();
              }} />
          </>}
        </DialogContent>
      </Dialog>}
    </main>
  );
}
