'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AssessmentRequestError, assessmentRequest } from './assessment-program-client';
import { RoomPlacementFields, type RoomSlot, type ExamRoomAssignment } from './ExamOperationsPanel';
import { examControl, examDate, examSurface, examTime, getDraftPublicationState, getExamPhase, statusLabel, useExamServerClock, type Exam } from './ExamScheduleList';

type Staff = { id: string; fullName: string };
type Detail = Exam & { version: string; proctors: Staff[]; canReschedule: boolean; canClose: boolean; accepted: number;
  roster: Staff[]; cohortProctor: string | null; rooms: { room: string; supervisor: string | null }[];
  asOf: string; started: number; latePublication: 'upcoming' | 'ready' | 'reschedule' | null };
const wibInput = (value: string) => new Date(Date.parse(value) + 7 * 3_600_000).toISOString().slice(0, 16);
const format = (value: string) => examDate.format(new Date(value)) + ', ' + examTime.format(new Date(value)) + ' WIB';
const primary = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60';

export function PublishNowFields({ opensAt, latestEntryAt, closesAt, now, duration }: {
  opensAt: string; latestEntryAt: string; closesAt: string; now: number; duration: number;
}) {
  return <>
    <dl className="grid gap-3 rounded-lg border border-[var(--staff-line)] p-3 text-sm sm:grid-cols-2">
      {[
        ['Jam buka rencana', format(opensAt)],
        ['Perkiraan jam buka aktual', format(new Date(now).toISOString())],
        ['Batas masuk', format(latestEntryAt)],
        ['Jam tutup tetap', format(closesAt)],
        ['Durasi per peserta', duration + ' menit'],
        ['Waktu tersisa hingga tutup', Math.max(0, Math.floor((Date.parse(closesAt) - now) / 60_000)) + ' menit'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}
    </dl>
    <p className="text-sm">Siswa dapat masuk segera setelah jadwal terbit. Jam buka aktual mengikuti waktu server saat penerbitan.</p>
  </>;
}

function AgendaPlacement({ detail, day, onChange }: {
  detail: Detail; day: string;
  onChange: (value: { agendaId: string; roomAssignments: ExamRoomAssignment[] } | null) => void;
}) {
  const [agendas, setAgendas] = useState<{ id: string; title: string }[]>();
  const [agendaId, setAgendaId] = useState('');
  const [slots, setSlots] = useState<RoomSlot[]>();
  const [error, setError] = useState('');
  const [roomAssignments, setAssignments] = useState<ExamRoomAssignment[] | null>(null);
  useEffect(() => {
    let live = true;
    assessmentRequest<{ id: string; title: string }[]>('exam-schedule/operations/agendas?day=' + day)
      .then((rows) => { if (live) setAgendas(rows); })
      .catch((cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [day]);
  useEffect(() => {
    if (!agendaId) return;
    let live = true;
    assessmentRequest<{ slots: RoomSlot[] }>('exam-schedule/operations/agendas/' + agendaId + '?day=' + day)
      .then((value) => { if (live) setSlots(value.slots); })
      .catch((cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [agendaId, day]);
  useEffect(() => {
    onChange(agendaId && roomAssignments ? { agendaId, roomAssignments } : null);
    return () => onChange(null);
  }, [agendaId, onChange, roomAssignments]);
  return <div className="space-y-3">
    <label className="grid gap-1 text-sm font-semibold">Agenda baru
      <select required value={agendaId} onChange={(event) => {
        setAgendaId(event.target.value); setSlots(undefined); setAssignments(null); setError('');
      }} className={examControl}>
        <option value="">Pilih agenda pada tanggal buka</option>
        {agendas?.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
      </select>
    </label>
    {error ? <p role="alert" className="text-sm">{error}</p>
      : !agendas?.length ? <p role="status" className="text-sm">{agendas ? 'Siapkan agenda dan slot ruang untuk tanggal ini.' : 'Memuat agenda…'}</p> : null}
    {agendaId && slots && <RoomPlacementFields key={agendaId} sessionId={detail.sessionId} slots={slots}
      makeup={detail.roster} onChange={setAssignments} />}
  </div>;
}

function RescheduleFields({ detail, onPlacement }: {
  detail: Detail; onPlacement: (value: { agendaId: string; roomAssignments: ExamRoomAssignment[] } | null) => void;
}) {
  const [openingDay, setOpeningDay] = useState(wibInput(detail.opensAt).slice(0, 10));
  const [newPlacement, setNewPlacement] = useState(false);
  const [proctors, setProctors] = useState(detail.proctors);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<Staff[]>([]);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) return;
    let current = true;
    const timeout = setTimeout(() => {
      assessmentRequest<Staff[]>('assessment-programs/proctors?' + new URLSearchParams({ q: q.trim() }))
        .then((rows) => { if (current) setOptions(rows); })
        .catch(() => { if (current) setSearchError('Pencarian Proktor gagal. Perbarui pencarian.'); });
    }, 250);
    return () => { current = false; clearTimeout(timeout); };
  }, [q]);
  return <>
    <div className="grid gap-3 sm:grid-cols-3">
      {([
        ['opensAt', 'Waktu buka', detail.opensAt], ['latestEntryAt', 'Batas masuk', detail.latestEntryAt],
        ['closesAt', 'Waktu tutup', detail.closesAt],
      ] as const).map(([name, label, value]) => (
        <label key={name} className="grid min-w-0 gap-1 text-sm font-semibold">{label} (WIB)
          <input className={examControl} type="datetime-local" name={name} defaultValue={wibInput(value)} required onChange={name === 'opensAt' ? (event) => setOpeningDay(event.target.value.slice(0, 10)) : undefined} />
        </label>
      ))}
    </div>
    {detail.agendaId ? <div className="space-y-2">
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={newPlacement} onChange={(event) => setNewPlacement(event.target.checked)} />Pakai agenda atau slot ruang baru
      </label>
      {newPlacement && openingDay ? <AgendaPlacement key={openingDay} detail={detail} day={openingDay} onChange={onPlacement} />
        : <p className="text-sm">Waktu baru harus berada dalam slot yang sama jika penempatan tidak diubah.</p>}
      <input type="hidden" name="newPlacement" value={newPlacement ? 'yes' : 'no'} />
    </div> : <>
      <label className="grid gap-1 text-sm font-semibold">Ruang
        <input className={examControl} name="room" defaultValue={detail.room} maxLength={80} required />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Proktor</legend>
        <ul className="flex flex-wrap gap-2">
          {proctors.map((person) => <li key={person.id} className="flex items-center gap-2">
            <input type="hidden" name="proctorIds" value={person.id} />
            <button type="button" className={examControl} onClick={() => setProctors((rows) => rows.filter(({ id }) => id !== person.id))}>
              Lepas {person.fullName}
            </button>
          </li>)}
        </ul>
        <label className="grid gap-1 text-sm">Cari Proktor pengganti
          <input className={examControl} type="search" maxLength={80} value={q} onChange={(event) => {
            setQ(event.target.value); setOptions([]); setSearchError('');
          }} />
        </label>
        {searchError && <p role="alert" className="text-sm">{searchError}</p>}
        {options.length > 0 && <label className="grid gap-1 text-sm">Tambahkan dari hasil pencarian
          <select className={examControl} value="" disabled={proctors.length >= 12} onChange={(event) => {
            const candidate = options.find(({ id }) => id === event.target.value);
            if (candidate) setProctors((rows) => [...rows, candidate]);
          }}>
            <option value="">Pilih Proktor</option>
            {options.filter(({ id }) => !proctors.some((person) => person.id === id))
              .map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
          </select>
        </label>}
      </fieldset>
    </>}
  </>;
}

export function ExamScheduleDetails({ exam, student, initialAction, onClose, onSaved, restoreFocus }: {
  exam: Exam; student: boolean; initialAction?: 'publish' | 'edit'; onClose: () => void; onSaved: (message: string, day?: string) => void; restoreFocus: () => void;
}) {
  const [detail, setDetail] = useState<Detail>();
  const [mode, setMode] = useState<'read' | 'edit' | 'close' | 'publish'>('read');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<{ agendaId: string; roomAssignments: ExamRoomAssignment[] } | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const lock = useRef(false);
  const readToken = useRef(0);
  const clock = useExamServerClock(detail?.latePublication ? detail.asOf : undefined);
  const publication = detail?.latePublication ? getDraftPublicationState(clock, detail.opensAt, detail.latestEntryAt,
    detail.closesAt, detail.session.durationMinutes) : null;
  useEffect(() => {
    const read = ++readToken.current;
    assessmentRequest<Detail>('exam-schedule/' + exam.sessionId + '/details').then((data) => {
      if (readToken.current !== read) return;
      setDetail(data);
      if (refresh === 0 && initialAction === 'publish' && data.latePublication === 'ready') setMode('publish');
      if (refresh === 0 && initialAction === 'edit' && data.canReschedule) setMode('edit');
    }).catch((cause: Error) => {
      if (readToken.current === read) setError(cause.message);
    }).finally(() => {
      if (readToken.current === read) setLoading(false);
    });
    return () => { readToken.current++; };
  }, [exam.sessionId, initialAction, refresh]);

  async function perform(payload: Record<string, unknown>) {
    if (!detail || lock.current) return;
    lock.current = true;
    setBusy(true); setError('');
    const editing = mode === 'edit';
    const publishing = mode === 'publish';
    const action = editing ? 'reschedule' : publishing ? 'publish-now' : 'close-admission';
    try {
      await assessmentRequest(`exam-schedule/${exam.sessionId}/${action}`, editing ? 'PUT' : 'POST', payload);
      onSaved(editing ? 'Jadwal ujian diperbarui.' : publishing ? 'Jadwal terbit. Peserta dapat mulai ujian.'
        : 'Penerimaan jawaban ditutup. Koreksi dan finalisasi nilai tetap tersedia.',
        editing ? String(payload.opensAt).slice(0, 10) : undefined);
      onClose();
    } catch (cause) {
      if (cause instanceof AssessmentRequestError && [401, 403, 404].includes(cause.status)) {
        setDetail(undefined); setMode('read'); setSummary(null);
      } else if (cause instanceof AssessmentRequestError && cause.status === 409) {
        setMode('read'); setSummary(null); setDetail(undefined);
      }
      setError(cause instanceof Error ? cause.message : 'Perubahan belum berhasil.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const fields = new FormData(event.currentTarget);
    const reason = String(fields.get('reason') ?? '').trim();
    if (reason.length < 8) { setError('Alasan minimal 8 karakter.'); return; }
    if (mode === 'close') { void perform({ reason }); return; }
    if (mode === 'publish') {
      if (publication === 'ready') void perform({ reason, version: detail.version });
      return;
    }
    const opensAt = String(fields.get('opensAt')) + ':00+07:00';
    const latestEntryAt = String(fields.get('latestEntryAt')) + ':00+07:00';
    const closesAt = String(fields.get('closesAt')) + ':00+07:00';
    const proctorIds = fields.getAll('proctorIds').map(String);
    const room = String(fields.get('room') ?? '').trim();
    if (opensAt > latestEntryAt || latestEntryAt > closesAt || opensAt >= closesAt || (!detail.agendaId && (!room || !proctorIds.length))) {
      setError('Periksa urutan waktu, ruang, dan Proktor.'); return;
    }
    const newPlacement = detail.agendaId && fields.get('newPlacement') === 'yes';
    if (newPlacement && !placement) { setError('Tempatkan seluruh peserta pada agenda yang dipilih.'); return; }
    setError('');
    setSummary({ opensAt, latestEntryAt, closesAt, reason, version: detail.version,
      ...(detail.agendaId ? (newPlacement ? placement : {}) : { room, proctorIds }) });
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className={`max-h-[85dvh] w-[calc(100%_-_1.5rem)] max-w-2xl overflow-y-auto ${examSurface}`}
      closeDisabled={busy} onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}>
      <DialogTitle>{mode === 'publish' ? 'Terbitkan sekarang?' : 'Detail jadwal'}</DialogTitle>
      <DialogDescription>{detail?.session.title ?? exam.session.title}</DialogDescription>
      {loading && <p role="status" className="text-sm">Memuat detail jadwal…</p>}
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-200">{error}</p>}
      {error && !detail && <button type="button" className={examControl} onClick={() => {
        setError(''); setLoading(true); setRefresh((n) => n + 1);
      }}>Muat ulang detail</button>}
      {detail && <>
        {mode !== 'publish' && <dl className="grid grid-cols-2 gap-3 text-sm">
          {([
            ['Kelas dan mapel', [detail.session.class?.name ?? (detail.session.program ? detail.session.program._count.classes + ' rombel' : ''), detail.package.subject].filter(Boolean).join(' · ')],
            ['Status', statusLabel(getExamPhase(detail, Date.parse(detail.asOf)), {
              ...detail, counts: { started: detail.started, done: detail.accepted, working: 0 },
            }, student)],
            ['Ruang', detail.room], ['Waktu buka', format(detail.opensAt)],
            ['Batas masuk', format(detail.latestEntryAt)], ['Waktu tutup terjadwal', format(detail.closesAt)],
            ['Durasi per peserta', detail.session.durationMinutes + ' menit'], ['Peserta', detail._count.participants],
            ...(detail.proctors.length ? [['Proktor', detail.proctors.map(({ fullName }) => fullName).join(', ')]]
              : []),
            ...(detail.cohortProctor ? [['Proktor angkatan', detail.cohortProctor]] : []),
            ...(detail.rooms.some(({ supervisor }) => supervisor) ? [['Pengawas Ruang', detail.rooms.map(({ room, supervisor }) => room + ' · ' + supervisor).join(', ')]] : []),
            ...(detail.session.dueAt && Date.parse(detail.session.dueAt) < Date.parse(detail.closesAt)
              ? [['Ditutup pada', format(detail.session.dueAt)]] : []),
          ]).map(([label, value]) => <div key={label} className="min-w-0 border-b border-[var(--staff-line,var(--border,#e2e8f0))] pb-2">
            <dt className="text-[var(--staff-muted,var(--muted,#475569))]">{label}</dt>
            <dd className="break-words font-semibold">{value}</dd>
          </div>)}
        </dl>}
        {publication === 'reschedule' && mode !== 'edit' && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">
          Batas masuk terlewati atau sisa waktu kurang dari durasi ujian. Atur jadwal baru.
        </p>}
        {mode === 'read' && <div className="flex flex-wrap gap-2">
          {publication === 'ready' && <button type="button" className={primary} onClick={() => { setMode('publish'); setError(''); }}>Terbitkan sekarang</button>}
          {detail.canReschedule && <button type="button" className={examControl} onClick={() => { setMode('edit'); setError(''); }}>
            {publication === 'reschedule' ? 'Atur jadwal baru' : Date.parse(detail.closesAt) <= Date.now() ? 'Jadwalkan ulang' : 'Ubah jadwal'}
          </button>}
          {detail.canClose && <button type="button" className={primary} onClick={() => { setMode('close'); setError(''); }}>Tutup penerimaan jawaban</button>}
        </div>}
        {mode !== 'read' && <form className="space-y-3" onSubmit={review}>
          <fieldset disabled={busy || summary !== null} className="space-y-3">
            {mode === 'edit' ? <RescheduleFields detail={detail} onPlacement={setPlacement} /> : mode === 'publish'
              ? <PublishNowFields opensAt={detail.opensAt} latestEntryAt={detail.latestEntryAt} closesAt={detail.closesAt}
                now={clock} duration={detail.session.durationMinutes}/>
              : <p className="text-sm font-semibold">
              {detail.accepted} dari {detail._count.participants} peserta sudah sah terkirim. Setelah ditutup, Guru dapat melanjutkan koreksi dan finalisasi nilai.
            </p>}
            <label className="grid gap-1 text-sm font-semibold">Alasan
              <textarea required minLength={8} maxLength={500} name="reason" className={examControl} />
            </label>
          </fieldset>
          {summary ? <>
            <p className="text-sm font-semibold">Periksa jadwal baru</p>
            <p className="text-sm">{format(String(summary.opensAt))} – {format(String(summary.closesAt))}</p>
            <p className="text-sm">Batas masuk {format(String(summary.latestEntryAt))}{summary.room ? ' · ' + String(summary.room) : ''}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={examControl} disabled={busy} onClick={() => setSummary(null)}>Kembali periksa</button>
              <button type="button" className={primary} disabled={busy} onClick={() => void perform(summary)}>Simpan perubahan</button>
            </div>
          </> : <div className="flex flex-wrap gap-2">
            <button type="button" className={examControl} disabled={busy} onClick={() => { setMode('read'); setError(''); }}>Batal</button>
            <button type="submit" className={primary} disabled={busy || (mode === 'publish' && publication !== 'ready')}>
              {mode === 'edit' ? 'Tinjau perubahan' : mode === 'publish' ? 'Terbitkan sekarang' : 'Konfirmasi penutupan'}
            </button>
          </div>}
        </form>}
      </>}
    </DialogContent>
  </Dialog>;
}
