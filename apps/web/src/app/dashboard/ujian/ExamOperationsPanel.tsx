'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type StaffOption = { id: string; fullName: string };
type Agenda = { id: string; title: string; academicYear: string; semester: number; opensAt: string; closesAt: string };
type Incident = { id: string; reason: string; resolvedAt: string | null; decision: 'resume' | 'makeup' | null };
type Group = { grade: number; registered: number; working: number; submitted: number };
export type RoomSlot = {
  id: string; room: string; opensAt: string; closesAt: string; capacity: number;
  mixed: boolean; supervisorId: string; supervisorName: string; supervisorActive: boolean;
  readyAt: string | null; readyAllowed: boolean; canReport: boolean; canReadParticipants: boolean; groups: Group[]; incidents: Incident[];
};
type Overview = {
  agenda: Agenda; ownGrade?: number; transferGrade: number | null; canManage: boolean; asOf: string; slots: RoomSlot[];
  mandates: { grade: number; canTransfer: boolean; user: StaffOption }[];
};
type RoomParticipant = {
  sessionId: string; studentId: string; fullName: string; className: string; title: string;
  grade: number; canTransfer: boolean; deviceVersion: number; startedAt: string | null; submittedAt: string | null; lastSavedAt: string | null;
  lastHeartbeatAt?: string | null; lateSubmissionStatus?: string | null;
};
const participantStatuses = ['Belum mulai', 'Mengerjakan', 'Koneksi tidak terpantau', 'Terkirim',
  'Kiriman terlambat · Perlu keputusan Guru', 'Kiriman ditolak'] as const;
type ParticipantStatus = typeof participantStatuses[number];

function participantStatus(person: RoomParticipant, asOf: string): ParticipantStatus {
  if (person.lateSubmissionStatus === 'pending') return 'Kiriman terlambat · Perlu keputusan Guru';
  if (person.lateSubmissionStatus === 'rejected') return 'Kiriman ditolak';
  if (person.submittedAt) return 'Terkirim';
  if (!person.startedAt) return 'Belum mulai';
  const activityAt = Math.max(Date.parse(person.startedAt),
    person.lastSavedAt ? Date.parse(person.lastSavedAt) : 0,
    person.lastHeartbeatAt ? Date.parse(person.lastHeartbeatAt) : 0);
  return Date.parse(asOf) - activityAt > 45_000 ? 'Koneksi tidak terpantau' : 'Mengerjakan';
}
type Detail = { rows: RoomParticipant[]; asOf: string; canTransfer: boolean };
export type ExamAgendaPlacement = { agendaId: string; slots: RoomSlot[] };
export type ExamRoomAssignment = { slotId: string; studentIds: string[] };

const grades: Record<number,string> = { 10: 'X', 11: 'XI', 12: 'XII' };
const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
});
const hour = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const slotHours = (slot: RoomSlot) => hour.format(new Date(slot.opensAt)) + '–' + hour.format(new Date(slot.closesAt)) + ' WIB';
const toWib = (value: FormDataEntryValue | null) => String(value ?? '') + ':00+07:00';
const field = 'block min-h-11 w-full rounded-lg border border-[var(--staff-line,#cbd5e1)] bg-[var(--staff-panel,#fff)] px-3 py-2 text-sm';
const panel = 'min-w-0 rounded-2xl border border-[var(--staff-line,#cbd5e1)] bg-[var(--staff-panel,#fff)] p-4 text-[var(--staff-text,#0f172a)]';
const subdued = 'text-sm text-[var(--staff-muted,#475569)]';
const button = 'min-h-11 rounded-lg border border-[var(--staff-line,#cbd5e1)] px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primary = 'min-h-11 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50';

class OperationsError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/backend/exam-schedule' + path, { method, signal, cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok || response.redirected) {
    const data: { message?: string | string[] } | null = await response.json().catch(() => null);
    const message = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    throw new OperationsError(message || 'Data ujian belum dapat diperbarui.', response.redirected ? 401 : response.status);
  }
  return response.json();
}

function formAction(event: FormEvent<HTMLFormElement>, work: (data: FormData) => void) {
  event.preventDefault();
  work(new FormData(event.currentTarget));
}


export function ExamOperationsPanel({ day, canPlan, onPlacement }: {
  day: string; canPlan: boolean;
  onPlacement: (value: ExamAgendaPlacement | null) => void;
}) {
  const [agendas, setAgendas] = useState<Agenda[] | null>(null);
  const [agendaChoice, setAgendaChoice] = useState('');
  const [overview, setOverview] = useState<Overview>();
  const [room, setRoom] = useState<RoomSlot>();
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [loadingError, setLoadingError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [management, setManagement] = useState(false);
  const mutation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const agenda = agendas?.find(({ id }) => id === agendaChoice) ?? agendas?.[0];

  useEffect(() => {
    const controller = new AbortController();
    request<Agenda[]>('/operations/agendas?day=' + day, 'GET', undefined, controller.signal)
      .then((data) => { if (!controller.signal.aborted) { setAgendas(data); setLoadingError(''); } })
      .catch((error: Error) => { if (!controller.signal.aborted) { setAgendas(null); setLoadingError(error.message); } });
    return () => controller.abort();
  }, [day, reload]);

  useEffect(() => {
    if (!agenda) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: AbortController | undefined;
    let live = true;
    const run = async () => {
      if (document.visibilityState !== 'visible' || current) return;
      const controller = new AbortController();
      current = controller;
      try {
        const data = await request<Overview>('/operations/agendas/' + agenda.id + '?day=' + day, 'GET', undefined, controller.signal);
        if (!controller.signal.aborted) { setOverview(data); setLoadingError(''); }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof OperationsError && [401,403,404].includes(error.status)) {
          setOverview(undefined);
          setRoom(undefined);
        }
        setLoadingError((error as Error).message);
      } finally {
        if (current === controller) current = undefined;
        if (live && !controller.signal.aborted && document.visibilityState === 'visible') timer = setTimeout(() => void run(), 15_000);
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') void run();
      else { current?.abort(); current = undefined; }
    };
    void run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { live = false; current?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [agenda, day, reload]);

  const current = overview?.agenda.id === agenda?.id ? overview : undefined;
  const readOnly = Boolean(loadingError) || busy;
  const manage = canPlan && (current ? current.canManage : agendas?.length === 0);
  const activeRoom = current?.slots.find((slot) => slot.id === room?.id && slot.canReadParticipants);
  useEffect(() => {
    if (current && room && !activeRoom) setRoom(undefined);
  }, [current, room, activeRoom]);
  const agendaId = current?.agenda.id;
  const slotsForPlacement = current?.slots;
  useEffect(() => {
    onPlacement(agendaId && slotsForPlacement && !loadingError ? { agendaId, slots: slotsForPlacement } : null);
  }, [agendaId, slotsForPlacement, loadingError, onPlacement]);

  async function mutate(work: () => Promise<unknown>, message: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true); setActionError(''); setNotice('');
    try { await work(); setNotice(message); setReload((v) => v + 1); return true; }
    catch (error) {
      setActionError((error as Error).message);
      if (error instanceof OperationsError && [401,403,404].includes(error.status)) {
        setOverview(undefined); setReload((value) => value + 1);
      }
      return false;
    }
    finally { mutation.current = false; setBusy(false); }
  }

  const slots = (current?.slots ?? []).filter((slot) =>
    slot.room.toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id')) &&
    (!gradeFilter || slot.groups.some(({ grade }) => String(grade) === gradeFilter)));
  const selectedGrade = current?.ownGrade ?? (gradeFilter ? Number(gradeFilter) : undefined);
  const counts = slots.flatMap((slot) => slot.groups.filter(({ grade }) => !selectedGrade || grade === selectedGrade))
    .reduce((total, group) => ({ enrolled: total.enrolled + group.registered, working: total.working + group.working,
      done: total.done + group.submitted }), { enrolled: 0, working: 0, done: 0 });

  const title = current?.ownGrade ? 'Ujian Kelas ' + grades[current.ownGrade] : 'Operasional Ujian';
  if (!canPlan && agendas?.length === 0 && !loadingError) return null;
  return <section className={`${panel} space-y-4`} aria-labelledby="exam-ops-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 ref={heading} id="exam-ops-title" tabIndex={-1} className="text-xl font-bold">{title}</h2>
        <p className={subdued}>Pantau ruang, keikutsertaan, dan insiden berdasarkan agenda.</p></div>
      {manage && <button type="button" className={button} onClick={() => setManagement((v) => !v)} aria-expanded={management}>Kelola agenda</button>}
    </div>
    {loadingError && <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      {loadingError}{current ? ' Tampilan memakai pembaruan terakhir.' : ''}
      <button type="button" className={`${button} ml-2`} onClick={() => setReload((v) => v + 1)}>Muat ulang</button>
    </div>}
    {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
    {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
    {!agendas && !loadingError && <p role="status">Memuat agenda…</p>}
    {agendas?.length === 0 && <p className={subdued}>Belum ada agenda di tanggal ini.</p>}
    {(agendas?.length ?? 0) > 0 && <label className="block text-sm font-semibold">Agenda
      <select className={field} value={agenda?.id ?? ''} onChange={(event) => {
        setAgendaChoice(event.target.value); setGradeFilter(''); setRoom(undefined); setActionError('');
      }}>{agendas?.map(({ id, title: name }) => <option key={id} value={id}>{name}</option>)}</select>
    </label>}
    {management && manage && <OperationsManagement key={agenda?.id ?? 'new'} agenda={current?.agenda}
      slots={current?.slots ?? []} mandates={current?.mandates ?? []} disabled={readOnly} mutate={mutate} day={day} />}
    {current && <>
      <div className={current.ownGrade ? '' : 'grid gap-2 sm:grid-cols-2'}>
        <label className="text-sm font-semibold">Cari ruang<input className={field} value={search} onChange={(event) => setSearch(event.target.value)} type="search" /></label>
        {!current.ownGrade && <label className="text-sm font-semibold">Angkatan
          <select className={field} value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
            <option value="">Semua angkatan</option>{[10,11,12].map((grade) => <option key={grade} value={grade}>Kelas {grades[grade]}</option>)}
          </select>
        </label>}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-5">
        {[
          [slots.length, 'Ruang'], [counts.enrolled, 'Keikutsertaan'],
          [counts.enrolled - counts.working - counts.done, 'Belum mulai'],
          [counts.working, 'Mengerjakan'], [counts.done, 'Terkirim'],
        ].map(([value, label]) => <div key={label} className={panel}><dt className={subdued}>{label}</dt>
          <dd className="text-2xl font-bold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className={subdued}>Pembaruan {dateTime.format(new Date(current.asOf))} WIB</p>
      {!slots.length && <p className={subdued}>Tidak ada ruang yang cocok dalam cakupan ini.</p>}
      {slots.some((slot) => slot.incidents.some(({ resolvedAt }) => !resolvedAt)) && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <h3 className="font-bold">Perlu perhatian</h3>
        <ul className="mt-2 space-y-1">{slots.filter((slot) => slot.incidents.some(({ resolvedAt }) => !resolvedAt)).map((slot) =>
          <li key={slot.id}><a className="underline" href={'#exam-room-' + slot.id}>{slot.room} · Insiden ruang terbuka</a></li>)}</ul>
      </div>}
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {slots.map((slot) => <article id={'exam-room-' + slot.id} key={slot.id} className={`${panel} space-y-2`}>
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{slot.room}</h3>
            {slot.mixed && <span className="rounded-full bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">Ruang campuran</span>}</div>
          <p className={subdued}>{slotHours(slot)} · {slot.readyAt ? 'Siap' : 'Belum dikonfirmasi siap'}</p>
          <p className={subdued}>Pengawas Ruang <strong className="font-semibold">{slot.supervisorName}</strong>
            {!slot.supervisorActive && ' · Perlu pengganti'}</p>
          <p className={subdued}>Kapasitas ruang {slot.capacity} kursi</p>
          {slot.groups.map(({ grade, registered, submitted }) => <p key={grade} className="text-sm">
            Kelas {grades[grade]} · {registered} terdaftar · {submitted} terkirim
          </p>)}
          <div className="flex flex-wrap gap-2">
            {slot.canReadParticipants && <button type="button" className={button} onClick={(event) => {
              trigger.current = event.currentTarget; setRoom(slot);
            }}>Lihat peserta {slot.room}</button>}
            {slot.readyAllowed && !slot.readyAt && <button type="button" className={button} disabled={readOnly}
              onClick={() => void mutate(() => request('/operations/rooms/' + slot.id + '/ready', 'POST'), 'Kesiapan ruang tercatat.')}>Tandai ruang siap</button>}
          </div>
          <RoomIncident slot={slot} canPlan={manage} disabled={readOnly} mutate={mutate} />
        </article>)}
      </div>
    </>}
    {activeRoom && current && <RoomDetail key={activeRoom.id} slot={activeRoom} overview={current}
      transferGrade={loadingError ? null : current.transferGrade}
      onClose={() => setRoom(undefined)} restore={() => {
      const origin = trigger.current;
      (origin?.isConnected && origin.getClientRects().length ? origin : heading.current)?.focus();
    }} />}
  </section>;
}



type Mutate = (work: () => Promise<unknown>, message: string) => Promise<boolean>;

function StaffSelect({ label, initial }: { label: string; initial?: StaffOption }) {
  const inputId = useId();
  const [active, setActive] = useState(false);
  const [q, setQuery] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ rows: StaffOption[]; nextCursor: string | null }>();
  const [selected, setSelected] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ q: q.trim() });
    if (cursor) query.set('cursor', cursor);
    const timer = setTimeout(() => {
      request<{ rows: StaffOption[]; nextCursor: string | null }>('/operations/staff?' + query, 'GET', undefined, abort.signal)
        .then((page) => { if (!abort.signal.aborted) setResult(page); })
        .catch((cause: Error) => { if (!abort.signal.aborted) setError(cause.message); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [active, q, cursor, reload]);

  const rows = result?.rows ?? [];
  const options = selected && !rows.some(({ id }) => id === selected.id) ? [selected, ...rows] : rows;
  function move(next?: string) {
    setResult(undefined); setError(''); setCursor(next);
  }
  return <div className="min-w-0 space-y-1">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} className={field} type="search" value={q} maxLength={80}
      placeholder="Cari nama petugas" onFocus={() => setActive(true)} onChange={(event) => {
        setActive(true); setQuery(event.target.value); move();
      }} />
    <select name="userId" aria-label={'Pilih ' + label} className={field} required
      value={selected?.id ?? ''} onFocus={() => setActive(true)}
      onChange={(event) => setSelected(options.find(({ id }) => id === event.target.value))}>
      <option value="">Pilih petugas</option>
      {options.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
    </select>
    {active && !result && !error && <p role="status" className={subdued}>Mencari petugas…</p>}
    {result && !rows.length && <p role="status" className={subdued}>Tidak ada petugas yang cocok.</p>}
    {error && <div role="alert" className={subdued}>{error}{' '}
      <button type="button" className={button} onClick={() => { setError(''); setReload((v) => v + 1); }}>Coba lagi</button>
    </div>}
    {(cursor || result?.nextCursor) && <div className="flex flex-wrap gap-2">
      {cursor && <button type="button" className={button} onClick={() => move()}>Halaman pertama</button>}
      {result?.nextCursor && <button type="button" className={button}
        onClick={() => move(result.nextCursor ?? undefined)}>Petugas berikutnya</button>}
    </div>}
  </div>;
}

function Times({ day }: { day: string }) {
  return <>
    <label>Jam mulai (WIB)<input className={field} name="opensAt" type="datetime-local" defaultValue={day + 'T08:00'} required /></label>
    <label>Jam selesai (WIB)<input className={field} name="closesAt" type="datetime-local" defaultValue={day + 'T09:30'} required /></label>
  </>;
}

function OperationsManagement({ agenda, slots, mandates, disabled, mutate, day }: {
  agenda?: Agenda; slots: RoomSlot[]; mandates: Overview['mandates']; disabled: boolean; mutate: Mutate; day: string;
}) {
  const formStyle = 'grid gap-2 rounded-lg border border-[var(--staff-line,#cbd5e1)] p-3 text-sm sm:grid-cols-2 lg:grid-cols-3';
  return <div className="space-y-3" aria-label="Kelola agenda">
    <details open={!agenda}>
      <summary className="cursor-pointer font-semibold">Buat agenda baru</summary>
      <form className={formStyle} onSubmit={(event) => formAction(event, (data) => void mutate(() =>
        request('/operations/agendas', 'POST', { title: data.get('title'), academicYear: data.get('year'),
          semester: Number(data.get('semester')), opensAt: toWib(data.get('opensAt')), closesAt: toWib(data.get('closesAt')) }),
        'Agenda ujian dibuat.'))}>
        <label>Nama agenda<input name="title" className={field} required minLength={2} maxLength={120} placeholder="UAS Ganjil" /></label>
        <label>Tahun ajaran<input name="year" className={field} required pattern="[0-9]{4}/[0-9]{4}" placeholder="2026/2027" /></label>
        <label>Semester<select className={field} name="semester"><option value="1">Ganjil</option><option value="2">Genap</option></select></label>
        <Times day={day} />
        <button className={primary} type="submit" disabled={disabled}>Simpan agenda</button>
      </form>
    </details>
    {agenda && <>
      <details>
        <summary className="cursor-pointer font-semibold">Tetapkan Proktor angkatan</summary>
        <div className="space-y-2">{[10,11,12].map((grade) => {
          const mandate = mandates.find((item) => item.grade === grade);
          return <form key={grade + ':' + (mandate?.user.id ?? '')} className={formStyle}
            onSubmit={(event) => formAction(event, (data) => void mutate(() => request('/operations/agendas/' + agenda.id + '/cohorts', 'PUT',
              { grade, userId: data.get('userId'), canTransfer: data.has('transfer') }), 'Penugasan Kelas ' + grades[grade] + ' tersimpan.'))}>
            <StaffSelect label={'Proktor Kelas ' + grades[grade]} initial={mandate?.user} />
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="transfer" defaultChecked={mandate?.canTransfer} /> Izinkan transfer satu peserta</label>
            <button className={button} type="submit" disabled={disabled}>Simpan Proktor Kelas {grades[grade]}</button>
          </form>;
        })}</div>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">Daftarkan pemakaian ruang</summary>
        <form className={formStyle} onSubmit={(event) => formAction(event, (data) => void mutate(() =>
          request('/operations/rooms', 'POST', { agendaId: agenda.id, room: data.get('room'), capacity: Number(data.get('capacity')),
            supervisorId: data.get('userId'), opensAt: toWib(data.get('opensAt')), closesAt: toWib(data.get('closesAt')) }), 'Pemakaian ruang tersimpan.'))}>
          <label>Nama ruang fisik<input name="room" className={field} required maxLength={80} placeholder="Lab A" /></label>
          <label>Kapasitas kursi<input type="number" name="capacity" className={field} min={1} max={500} required /></label>
          <StaffSelect label="Pengawas Ruang" />
          <Times day={day} />
          <button className={primary} type="submit" disabled={disabled}>Simpan pemakaian ruang</button>
        </form>
      </details>
      {slots.length > 0 && <details>
        <summary className="cursor-pointer font-semibold">Serah terima Pengawas Ruang</summary>
        <form className={formStyle} onSubmit={(event) => formAction(event, (data) => void mutate(() =>
          request('/operations/rooms/' + data.get('slot') + '/supervisor', 'PUT', { supervisorId: data.get('userId') }),
          'Pengawas Ruang diperbarui. Pengawas baru dapat mengonfirmasi kesiapan.'))}>
          <label>Pemakaian ruang<select name="slot" className={field} required>
            {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.room} · {slotHours(slot)}</option>)}
          </select></label>
          <StaffSelect label="Pengawas pengganti" />
          <button className={button} type="submit" disabled={disabled}>Simpan pengganti</button>
        </form>
      </details>}
    </>}
  </div>;
}

function RoomIncident({ slot, canPlan, disabled, mutate }: { slot: RoomSlot; canPlan: boolean; disabled: boolean; mutate: Mutate }) {
  const intent = useRef<string | undefined>(undefined);
  const open = slot.incidents.find((item) => !item.resolvedAt);
  return <div className="space-y-2">
    {open && <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
      <p className="font-semibold">Insiden menunggu Panitia <span title={open.id}>· {open.id.slice(0, 8)}</span></p>
      <p>{open.reason}</p>
      {canPlan && <form className="mt-2 space-y-2" onSubmit={(event) => formAction(event, (data) => void mutate(() =>
        request('/operations/rooms/' + slot.id + '/incidents/' + open.id + '/decision', 'POST',
          { decision: data.get('decision'), reason: data.get('reason') }), 'Keputusan ruang tercatat.'))}>
        <label>Tindak lanjut<select className={field} name="decision"><option value="resume">Lanjut dengan sisa waktu</option><option value="makeup">Rekomendasikan susulan</option></select></label>
        <label>Alasan keputusan<textarea name="reason" className={field} required minLength={8} maxLength={500} /></label>
        <button className={button} type="submit" disabled={disabled}>Simpan keputusan ruang</button>
      </form>}
    </div>}
    {!open && slot.canReport && <details>
      <summary className="cursor-pointer text-sm font-semibold">Laporkan gangguan ruang</summary>
      <form className="mt-2 space-y-2" onSubmit={(event) => formAction(event, (data) => {
        intent.current ??= crypto.randomUUID();
        void mutate(() => request('/operations/rooms/' + slot.id + '/incidents', 'POST', { intentId: intent.current, reason: data.get('reason') }),
          'Insiden tercatat untuk angkatan terdampak.').then((ok) => { if (ok) intent.current = undefined; });
      })}>
        <label>Keterangan gangguan<textarea className={field} name="reason" required minLength={8} maxLength={500}
          placeholder="Contoh: koneksi ruang terputus pukul 08.45 WIB" /></label>
        <p className={subdued}>Sebutkan kondisi ruang dan waktu kejadian. Hindari nama peserta atau informasi akun.</p>
        <button className={button} type="submit" disabled={disabled}>Catat gangguan ruang</button>
      </form>
    </details>}
    {slot.incidents.filter((item) => item.resolvedAt).slice(0,1).map((item) => <p key={item.id} className={subdued}>
      Tindak lanjut · {item.decision === 'resume' ? 'Lanjut dengan sisa waktu' : 'Rekomendasi susulan'}
    </p>)}
  </div>;
}

function transferTargetKey(person: RoomParticipant) {
  return `${person.sessionId}:${person.studentId}:${person.deviceVersion}`;
}

function isTransferable(person: RoomParticipant) {
  return Boolean(person.canTransfer && person.startedAt && !person.submittedAt);
}

function RoomDetail({ slot, overview, transferGrade, onClose, restore }: {
  slot: RoomSlot; overview: Overview; transferGrade: number | null; onClose: () => void; restore: () => void;
}) {
  const [snapshot, setSnapshot] = useState<{ detail: Detail; overview: Overview; reload: number }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<RoomParticipant>();
  const [statusFilter, setStatusFilter] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const detail = snapshot?.detail;
  const fresh = snapshot?.overview === overview && snapshot.reload === reload;
  const mayTransfer = (person: RoomParticipant) => person.grade === transferGrade && isTransferable(person);
  const pendingPerson = selected ? detail?.rows.find((person) =>
    person.sessionId === selected.sessionId && person.studentId === selected.studentId &&
    person.deviceVersion === selected.deviceVersion && mayTransfer(person)) : undefined;
  const intent = useRef<string | undefined>(undefined);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const transferHadFocus = useRef(false);
  useEffect(() => {
    if (selected && !pendingPerson) {
      if (transferHadFocus.current && document.activeElement === document.body) refreshButton.current?.focus();
      transferHadFocus.current = false;
      setSelected(undefined);
      intent.current = undefined;
    }
  }, [selected, pendingPerson]);

  useEffect(() => {
    const controller = new AbortController();
    request<Detail>('/operations/rooms/' + slot.id, 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSnapshot({ detail: data, overview, reload });
          setError('');
        }
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) { setSnapshot(undefined); setSelected(undefined); setError(cause.message); }
      });
    return () => controller.abort();
  }, [slot.id, overview, reload]);

  async function transfer(data: FormData) {
    const participant = pendingPerson;
    if (!participant || !fresh || flight.current) return;
    flight.current = true;
    setBusy(true); setError(''); setNotice('');
    intent.current ??= crypto.randomUUID();
    try {
      await request('/' + participant.sessionId + '/device-transfer', 'POST', {
        slotId: slot.id, studentId: participant.studentId, expectedVersion: participant.deviceVersion,
        intentId: intent.current, newDeviceId: data.get('device'), reason: data.get('reason'),
      });
      setSelected(undefined);
      setReload((v) => v + 1);
      setNotice('Perangkat dipindahkan. Attempt dan tenggat semula tetap berlaku.');
      intent.current = undefined;
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof OperationsError && [401,403,404,409].includes(cause.status)) {
        if (cause.status !== 409) setSnapshot(undefined);
        setSelected(undefined);
        intent.current = undefined;
        setReload((v) => v + 1);
      }
    } finally { flight.current = false; setBusy(false); }
  }

  const rows = detail?.rows.filter((person) => !statusFilter || participantStatus(person, detail.asOf) === statusFilter) ?? [];
  return <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className={`max-h-[88dvh] w-[calc(100%_-_1.5rem)] max-w-3xl overflow-y-auto ${panel}`}
      onCloseAutoFocus={(event) => { event.preventDefault(); restore(); }}>
      <DialogTitle>Peserta · {slot.room}</DialogTitle>
      <DialogDescription>{slotHours(slot)} · Penugasan Anda</DialogDescription>
      {error && <div role="alert" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{error}
        {!detail && <button type="button" className={button} onClick={() => setReload((v) => v + 1)}>Muat ulang rincian</button>}
      </div>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!detail && !error && <p role="status">Memuat peserta…</p>}
      {detail && <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className={subdued}>{rows.length} dari {detail.rows.length} keikutsertaan · {dateTime.format(new Date(detail.asOf))} WIB</p>
          {!fresh && <span className={subdued} role="status">Memperbarui status peserta…</span>}
          <button ref={refreshButton} className={button} type="button" onClick={() => setReload((v) => v + 1)}>Perbarui peserta</button>
        </div>
        <label className="block text-sm font-semibold">Status peserta
          <select className={field} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Semua status</option>
            {participantStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        {!rows.length && <p className={subdued}>Tidak ada peserta pada status ini.</p>}
        <ul className="divide-y divide-[var(--staff-line,#cbd5e1)]">
          {rows.map((person) => <li key={person.sessionId + ':' + person.studentId} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="min-w-0"><p className="font-semibold">{person.fullName}</p>
              <p className={subdued}>{person.className} · {person.title} · {participantStatus(person, detail.asOf)}</p>
              {person.lastSavedAt && <p className={subdued}>Simpan terakhir {hour.format(new Date(person.lastSavedAt))} WIB</p>}</div>
            {mayTransfer(person) && <button type="button" className={button} disabled={!fresh || busy} onClick={() => {
              if (!pendingPerson || transferTargetKey(pendingPerson) !== transferTargetKey(person)) {
                setSelected(person);
                intent.current = undefined;
                setError('');
              }
            }}>Pindahkan perangkat</button>}
          </li>)}
        </ul>
      </div>}
      {pendingPerson && <form key={transferTargetKey(pendingPerson)} className={`${panel} space-y-2`}
        onFocus={() => { transferHadFocus.current = true; }}
        onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) transferHadFocus.current = false; }}
        onSubmit={(event) => formAction(event, (data) => void transfer(data))}>
        <h3 className="font-semibold">Verifikasi · {pendingPerson.fullName}</h3>
        <p className={subdued}>Cocokkan identitas siswa dan kode yang ditampilkan di perangkat baru.</p>
        <label>Kode perangkat baru<input className={field} name="device" required maxLength={36} minLength={36} autoComplete="off" /></label>
        <label>Alasan<textarea className={field} name="reason" required minLength={8} maxLength={500} /></label>
        <label className="flex min-h-11 gap-2"><input type="checkbox" required /> Identitas siswa dan kode sudah sesuai</label>
        <button className={primary} type="submit" disabled={busy || !fresh}>Setujui transfer satu peserta</button>
      </form>}
    </DialogContent>
  </Dialog>;
}

export function RoomPlacementFields({ sessionId, slots, makeup, onChange }: {
  sessionId: string; slots: RoomSlot[]; makeup: { id: string; fullName: string }[] | null;
  onChange: (assignments: ExamRoomAssignment[] | null) => void;
}) {
  const [roster, setRoster] = useState<{ id: string; fullName: string }[]>();
  const [placement, setPlacement] = useState<Record<string,string>>({});
  const [error, setError] = useState('');
  const [all, setAll] = useState('');
  const members = makeup ?? roster;
  useEffect(() => {
    if (!sessionId || makeup !== null) return;
    const abort = new AbortController();
    request<{ id: string; user: { fullName: string } }[]>('/operations/rosters/' + sessionId, 'GET', undefined, abort.signal)
      .then((rows) => { if (!abort.signal.aborted) setRoster(rows.map(({ id, user }) => ({ id, fullName: user.fullName }))); })
      .catch((cause: Error) => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [sessionId, makeup]);
  useEffect(() => {
    const grouped = new Map<string,string[]>();
    if (!members?.length || members.some(({ id }) => !slots.some((slot) => slot.id === placement[id]))) {
      onChange(null);
      return;
    }
    for (const { id } of members) {
      const slotId = placement[id];
      if (!slotId) return;
      const group = grouped.get(slotId) ?? [];
      group.push(id);
      grouped.set(slotId,group);
    }
    onChange(Array.from(grouped, ([slotId, studentIds]) => ({ slotId,studentIds })));
  }, [members, slots, placement, onChange]);
  return <fieldset className="space-y-2 rounded-lg border border-[var(--staff-line,#cbd5e1)] p-3 sm:col-span-2">
    <legend className="font-semibold">Penempatan peserta</legend>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {!members && !error && <p role="status">{sessionId ? 'Memuat daftar peserta…' : 'Pilih draf terlebih dahulu.'}</p>}
    {members && <><div className="flex flex-wrap items-end gap-2"><label className="grow">Ruang seluruh peserta
      <select className={field} value={all} onChange={(event) => setAll(event.target.value)}>
        <option value="">Pilih ruang</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.room} · {slotHours(slot)}</option>)}
      </select></label>
      <button type="button" className={button} disabled={!all} onClick={() =>
        setPlacement(Object.fromEntries(members.map(({ id }) => [id, all])))}>Tempatkan semua</button></div>
      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {members.map((person) => <label key={person.id} className="text-sm">{person.fullName}
          <select className={field} value={placement[person.id] ?? ''} onChange={(event) =>
            setPlacement((prev) => ({ ...prev, [person.id]: event.target.value }))} required>
            <option value="">Pilih ruang</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.room} · {slotHours(slot)}</option>)}
          </select></label>)}
      </div></>}
  </fieldset>;
}
