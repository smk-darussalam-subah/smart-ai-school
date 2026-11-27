'use client';

import { useRef, useState, type FormEvent } from 'react';
import { assessmentRequest, programButton, programField, programPanel, programPrimary } from './assessment-program-client';

type Observation = { dimension: string; kind: 'interest' | 'observed_strength'; interpretation: string;
  score?: { value: number; max: number } };
type Profile = { programId: string; instrument: string; instrumentVersion: string; observations: Observation[];
  summary: string; nextSteps: string; program: { session: { title: string } } };
type SavedProfile = Pick<Profile, 'instrument' | 'instrumentVersion' | 'observations' | 'summary' | 'nextSteps'>
  & { publishedAt: string | null };
type Participant = { studentId: string; score?: number | null; student: { user: { fullName: string } } };

export function AssessmentProfiles() {
  const [rows, setRows] = useState<Profile[]>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function load() {
    setError(''); setBusy(true);
    void assessmentRequest<Profile[]>('assessment-programs/my-profiles').then(setRows)
      .catch((failure: Error) => setError(failure.message)).finally(() => setBusy(false));
  }
  return <section className={programPanel}>
    <h2 className="font-semibold">Profil Bakat dan Minat Saya</h2>
    <button className={programButton} type="button" aria-expanded={open} disabled={busy} onClick={() => {
      setOpen(!open); if (!open) load();
    }}>{open ? 'Tutup profil' : 'Lihat profil saya'}</button>
    {open && <div className="space-y-3" aria-busy={busy}>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {busy && <p role="status" className="text-sm">Memuat profil…</p>}
      {!busy && rows?.length === 0 && <p className="text-sm">Belum ada profil yang diterbitkan.</p>}
      {rows?.map((profile) => <article className="space-y-3" key={profile.programId}>
        <h3 className="text-lg font-semibold">{profile.program.session.title}</h3>
        <p className="text-sm">{profile.instrument} · versi {profile.instrumentVersion}</p>
        <p className="whitespace-pre-wrap break-words">{profile.summary}</p>
        <dl className="space-y-2">
          {profile.observations.map((item) => <div key={item.kind + ':' + item.dimension}>
            <dt className="font-semibold">{item.kind === 'interest' ? 'Minat' : 'Kekuatan teramati'} · {item.dimension}
              {item.score && ' · ' + item.score.value + '/' + item.score.max}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">{item.interpretation}</dd>
          </div>)}
        </dl>
        <h4 className="font-semibold">Langkah eksplorasi</h4>
        <p className="whitespace-pre-wrap break-words">{profile.nextSteps}</p>
      </article>)}
    </div>}
  </section>;
}

const emptyObservation = (): Observation => ({ dimension: '', kind: 'interest', interpretation: '' });

export function ProgramProfileEditor({ id, profile, separate }: {
  id: string; profile: boolean; separate: boolean;
}) {
  const [participants, setParticipants] = useState<Participant[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [student, setStudent] = useState('');
  const [instrument, setInstrument] = useState('');
  const [version, setVersion] = useState('');
  const [summary, setSummary] = useState('');
  const [next, setNext] = useState('');
  const [observations, setObservations] = useState<Observation[]>([emptyObservation()]);
  const [publish, setPublish] = useState(false);
  const [published, setPublished] = useState(false);
  const writing = useRef(false);
  const invalidate = () => {
    setInstrument(''); setVersion(''); setSummary(''); setNext(''); setObservations([emptyObservation()]); setPublish(false); setPublished(false);
  };
  function load() {
    setError(''); setBusy(true);
    void assessmentRequest<Participant[]>('assessment-programs/' + id + '/participants').then(setParticipants)
      .catch((failure: Error) => setError(failure.message)).finally(() => setBusy(false));
  }
  function chooseStudent(idOfStudent: string) {
    setStudent(''); invalidate(); setError(''); setNotice('');
    if (!idOfStudent) return;
    setBusy(true);
    void assessmentRequest<SavedProfile | null>('assessment-programs/' + id + '/profiles/' + idOfStudent)
      .then((saved) => {
        if (saved) {
          setInstrument(saved.instrument); setVersion(saved.instrumentVersion); setSummary(saved.summary);
          setNext(saved.nextSteps); setObservations(saved.observations); setPublished(Boolean(saved.publishedAt));
        }
        setStudent(idOfStudent);
      }).catch((failure: Error) => setError(failure.message)).finally(() => setBusy(false));
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (writing.current || busy || published || !student) return;
    writing.current = true;
    setError(''); setNotice(''); setBusy(true);
    void assessmentRequest('assessment-programs/' + id + '/profiles/' + student, 'PUT',
      { instrument, instrumentVersion: version, observations, summary, nextSteps: next, publish }).then(() => {
      setNotice(publish ? 'Profil tersedia bagi siswa yang dipilih.' : 'Draf profil tersimpan.');
      if (publish) { setStudent(''); invalidate(); }
    }).catch((failure: Error) => setError(failure.message)).finally(() => {writing.current = false; setBusy(false);});
  }
  return <div className="space-y-2">
    {!participants && <button type="button" className={programButton} disabled={busy} onClick={load}>
      {profile ? 'Kelola profil peserta' : separate ? 'Lihat hasil terpisah' : 'Lihat hasil peserta'}
    </button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {participants?.length === 0 && <p className="text-sm">Belum ada jawaban peserta yang diterima.</p>}
    {!profile && participants?.length ? <ul className="max-h-60 overflow-y-auto text-sm">
      {participants.map((row) => <li key={row.studentId}>{row.student.user.fullName} · {row.score ?? 'Belum dinilai'}</li>)}
    </ul> : null}
    {profile && participants?.length ? <form className="space-y-3" onSubmit={send}>
      <label className="grid gap-1 text-sm">Siswa<select className={programField} required value={student} disabled={busy} onChange={(event) => chooseStudent(event.target.value)}>
        <option value="">Pilih siswa</option>{participants.map((row) => <option key={row.studentId} value={row.studentId}>{row.student.user.fullName}</option>)}
      </select></label>
      {student && <fieldset disabled={busy || published} className="space-y-3">
        {published && <p role="status" className="text-sm">Profil sudah diterbitkan kepada siswa.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Nama instrumen<input className={programField} required minLength={3} maxLength={180} value={instrument} onChange={(e) => setInstrument(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Versi instrumen<input className={programField} required maxLength={40} value={version} onChange={(e) => setVersion(e.target.value)} /></label>
        </div>
        {observations.map((item, index) => {
          const edit = (update: Partial<Observation>) => setObservations((rows) => rows.map((value, pos) => pos === index ? {...value, ...update} : value));
          return <fieldset className="space-y-2" key={index}>
            <legend className="text-sm font-semibold">Aspek {index + 1}</legend>
            <select aria-label={'Jenis aspek ' + (index + 1)} className={programField} value={item.kind}
              onChange={(e) => edit({ kind: e.target.value === 'interest' ? 'interest' : 'observed_strength' })}>
              <option value="interest">Minat</option><option value="observed_strength">Kekuatan teramati</option>
            </select>
            <label className="grid gap-1 text-sm">Nama aspek<input className={programField} required minLength={2} maxLength={100} value={item.dimension} onChange={(e) => edit({ dimension: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Interpretasi<textarea className={programField} required minLength={3} maxLength={500} value={item.interpretation} onChange={(e) => edit({ interpretation: e.target.value })} /></label>
            {observations.length > 1 && <button type="button" className={programButton} onClick={() => setObservations((rows) => rows.filter((_, pos) => pos !== index))}>Hapus aspek {index + 1}</button>}
          </fieldset>;
        })}
        <button type="button" className={programButton} disabled={observations.length >= 16} onClick={() => setObservations((rows) => [...rows, emptyObservation()])}>Tambah aspek</button>
        <label className="grid gap-1 text-sm">Ringkasan profil<textarea className={programField} required minLength={3} maxLength={1600} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Saran eksplorasi<textarea className={programField} required minLength={3} maxLength={1600} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Terbitkan ke siswa</label>
        <button className={programPrimary} disabled={busy}>{publish ? 'Terbitkan profil' : 'Simpan draf profil'}</button>
      </fieldset>}
    </form> : null}
  </div>;
}
