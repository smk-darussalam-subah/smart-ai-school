'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AssessmentProfiles, ProgramProfileEditor } from './AssessmentProfiles';
import { AssessmentRequestError, assessmentRequest, programButton, programField, programPanel as box, programPrimary } from './assessment-program-client';

type Kind = { id: string; name: string; version: number; category: string; allowsGrade: boolean };
type Package = { id: string; title: string; subject: string; version: number; sharedForPrograms: boolean; owned?: boolean };
type Class = { id: string; name: string; grade: number; participants: number };
type Options = {
  academicYear: string | null; semester: number | null; kinds: Kind[]; packages: Package[]; classes: Class[];
  assignments: { subject: string; classId: string }[]; canDefineAcademicKind: boolean;
};
type Program = {
  id: string; sessionId: string; kind: Kind; package: Package; owned: boolean; canProfile: boolean;
  classes: { class: { id: string; name: string; grade: number } }[];
  session: { title: string; status: string; gradeTarget: string | null; examSchedule: { closesAt: string } | null };
};
type Request = {
  sessionId: string; title: string; packageId: string | null; revision: number; examDate: string | null;
  room: string | null; opensAt: string | null; latestEntryAt: string | null; closesAt: string | null;
  proctorIds: string[]; missing: string[]; status: string; canEdit: boolean; canPublish: boolean; publishedAt: string | null;
};
type Staff = { id: string; fullName: string };
type Draft = { id: string; title: string; class: { name: string } | null };
function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function DraftForm({ options, busy, onCreated, run }: {
  options: Options; busy: boolean; onCreated: (sessionId: string) => void;
  run: (operation: () => Promise<void>) => void;
}) {
  const [kindId, kindChange] = useState('');
  const [pkgId, packageChange] = useState('');
  const [title, titleChange] = useState('');
  const [duration, durationChange] = useState('60');
  const [mode, modeChange] = useState('classes');
  const [classIds, classChange] = useState<string[]>([]);
  const [grades, gradeChange] = useState<number[]>([]);
  const [gradeTarget, gradeTargetChange] = useState('');
  const [randomizeOrder, randomizeChange] = useState(false);
  const intent = useRef<{ data: string; id: string } | null>(null);
  const pkg = options.packages.find(({ id }) => id === pkgId);
  const kind = options.kinds.find(({ id }) => id === kindId);
  const selected = options.classes.filter(({ id, grade }) => mode === 'all' ||
    (mode === 'classes' ? classIds.includes(id) : grades.includes(grade)));
  const total = selected.reduce((count, row) => count + row.participants, 0);
  const canGrade = Boolean(kind?.allowsGrade && pkg?.owned && selected.length && selected.every((cls) =>
    options.assignments.some((row) => row.classId === cls.id && row.subject === pkg.subject)));

  function create(event: FormEvent) {
    event.preventDefault();
    if (!kind || !pkg || !selected.length || !total || !options.academicYear) return;
    const roster = mode === 'all' ? { mode } : mode === 'grades' ? { mode, grades } : { mode, classIds };
    const data = { title, kindId, packageId: pkgId, academicYear: options.academicYear, semester: options.semester,
      durationMinutes: Number(duration), randomizeOrder, roster, gradeTarget: canGrade && gradeTarget ? gradeTarget : null };
    const key = JSON.stringify(data);
    if (intent.current?.data !== key) intent.current = { data: key, id: crypto.randomUUID() };
    const requestId = intent.current.id;
    run(async () => {
      const created = await assessmentRequest<{ sessionId: string }>('assessment-programs', 'POST', { ...data, requestId });
      intent.current = null;
      titleChange('');
      onCreated(created.sessionId);
    });
  }

  return <form onSubmit={create} className={box}>
    <h3 className="font-semibold">Buat draf lintas rombel</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Nama asesmen<input className={programField} value={title} onChange={(e) => titleChange(e.target.value)} required minLength={3} maxLength={160} /></label>
      <label className="grid gap-1 text-sm">Jenis asesmen<select className={programField} required value={kindId} onChange={(e) => {kindChange(e.target.value); gradeTargetChange('');}}>
        <option value="">Pilih jenis</option>
        {options.kinds.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Paket soal<select className={programField} required value={pkgId} onChange={(e) => {packageChange(e.target.value); gradeTargetChange('');}}>
        <option value="">Pilih paket</option>
        {options.packages.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.subject} · v{item.version}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Durasi per siswa (menit)<input className={programField} type="number" min={1} max={360} value={duration} onChange={(e) => durationChange(e.target.value)} required /></label>
    </div>
    {!options.packages.length && <p className="text-sm">Siapkan versi paket melalui Siapkan ujian, atau gunakan paket yang dibagikan oleh guru.</p>}
    <fieldset className="space-y-2">
      <legend className="font-semibold">Cakupan peserta</legend>
      <select aria-label="Cakupan peserta" className={programField} value={mode} onChange={(e) => {modeChange(e.target.value);gradeTargetChange('');}}>
        <option value="classes">Pilih rombel</option><option value="grades">Pilih angkatan</option><option value="all">Semua rombel aktif</option>
      </select>
      {mode === 'classes' && <div className="max-h-44 overflow-y-auto">
        {options.classes.map((cls) => <label className="flex min-h-11 items-center gap-2 text-sm" key={cls.id}>
          <input type="checkbox" checked={classIds.includes(cls.id)} onChange={() => {classChange(toggle(classIds, cls.id));gradeTargetChange('');}} />
          {cls.name} · {cls.participants} peserta aktif
        </label>)}
      </div>}
      {mode === 'grades' && <div className="flex flex-wrap gap-4">
        {[10, 11, 12].map((grade) => <label className="flex min-h-11 items-center gap-2 text-sm" key={grade}>
          <input type="checkbox" checked={grades.includes(grade)} onChange={() => {gradeChange(toggle(grades, grade));gradeTargetChange('');}} />
          Kelas {['X', 'XI', 'XII'][grade - 10]}
        </label>)}
      </div>}
      <p role="status" className="text-sm">{selected.length} rombel · {total} siswa berakun aktif</p>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Penggunaan hasil<select className={programField} value={canGrade ? gradeTarget : ''} onChange={(e) => gradeTargetChange(e.target.value)}>
        <option value="">Hasil terpisah</option>
        {canGrade && ['uh', 'uts', 'uas'].map((code) => <option key={code} value={code}>Masuk penilaian akhir · {code.toUpperCase()}</option>)}
      </select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={randomizeOrder} onChange={(e) => randomizeChange(e.target.checked)} /> Acak urutan soal</label>
    </div>
    <button className={programPrimary} disabled={busy || !total || total > 500}>Simpan draf asesmen</button>
  </form>;
}

type RequestPackagePage = { packages: Pick<Package, 'id' | 'title' | 'version'>[]; nextCursor: string | null };
type PackageFailure = { message: string; accessDenied: boolean };

function packageAccessDenied(failure: unknown): failure is AssessmentRequestError {
  return failure instanceof AssessmentRequestError && (failure.status === 401 || failure.status === 403);
}

const timeAtWib = (value: string | null | undefined) => value
  ? new Date(Date.parse(value) + 7 * 3_600_000).toISOString().slice(11, 16) : '';

function ScheduleForm({ sessionId, title, item, pkg, busy, run, onSaved, onCancel }: {
  sessionId: string; title?: string; item?: Request; pkg?: string; busy: boolean;
  run: (operation: () => Promise<void>) => void; onSaved: () => void; onCancel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = 'schedule-heading-' + sessionId;
  useEffect(() => { headingRef.current?.focus(); }, []);
  const [packageId, setPackage] = useState(item?.packageId ?? pkg ?? '');
  const [packagePage, setPackagePage] = useState<RequestPackagePage | null>(null);
  const [packageFailure, setPackageFailure] = useState<PackageFailure | null>(null);
  const [packageLoad, setPackageLoad] = useState({ cursor: null as string | null, revalidate: false });
  const [loadingPackages, setLoadingPackages] = useState(!pkg);
  const packages = packagePage?.packages;
  const savedPackageId = item?.packageId;
  const packagesReady = Boolean(packagePage && !loadingPackages && !packageFailure);
  const canSave = !busy && Boolean(pkg || packagesReady);
  const handleAccessDenied = useCallback((failure: AssessmentRequestError) => {
    setPackagePage(null);
    setPackage('');
    setPackageFailure({
      accessDenied: true,
      message: failure.status === 401 ? failure.message
        : 'Anda tidak memiliki akses ke paket soal pengajuan ini. Muat ulang setelah izin dipulihkan.',
    });
  }, []);
  useEffect(() => {
    if (pkg) return;
    let current = true;
    const path = 'exam-schedule/requests/' + sessionId + '/packages';
    const { cursor, revalidate } = packageLoad;
    void assessmentRequest<RequestPackagePage>(cursor ? path + '?after=' + encodeURIComponent(cursor) : path)
      .then((result) => {
        if (!current) return;
        setPackageFailure(null);
        if (revalidate && result.packages.some(({ id }) => id === savedPackageId)) setPackage(savedPackageId ?? '');
        setPackagePage((previous) => {
          if (!cursor || !previous) return result;
          const seen = new Set(previous.packages.map(({ id }) => id));
          return { ...result, packages: [...previous.packages, ...result.packages.filter(({ id }) => !seen.has(id))] };
        });
      })
      .catch((failure: unknown) => {
        if (!current) return;
        if (packageAccessDenied(failure)) {
          handleAccessDenied(failure);
        } else {
          setPackageFailure({
            accessDenied: revalidate,
            message: failure instanceof Error ? failure.message : 'Paket soal belum dapat dimuat.',
          });
        }
      })
      .finally(() => { if (current) setLoadingPackages(false); });
    return () => { current = false; };
  }, [pkg, sessionId, packageLoad, savedPackageId, handleAccessDenied]);

  const loadPackages = (cursor: string | null) => {
    if (loadingPackages || busy) return;
    const revalidate = packageFailure?.accessDenied ?? false;
    setLoadingPackages(true);
    setPackageLoad({ cursor: revalidate ? null : cursor, revalidate });
  };
  const [date, setDate] = useState(item?.examDate?.slice(0, 10) ?? '');
  const [opening, setOpening] = useState(timeAtWib(item?.opensAt));
  const [entry, setEntry] = useState(timeAtWib(item?.latestEntryAt));
  const [closing, setClosing] = useState(timeAtWib(item?.closesAt));
  const [room, setRoom] = useState(item?.room ?? '');
  const [ids, setIds] = useState(item?.proctorIds ?? []);
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffById, setStaffById] = useState<Record<string, string>>({});
  const wib = (hours: string) => date && hours ? date + 'T' + hours + ':00+07:00' : null;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    run(async () => {
      try {
        await assessmentRequest('exam-schedule/requests/' + sessionId, 'PUT', {
          packageId: packageId || null, revision: item?.revision ?? 0, examDate: date || null, room: room.trim() || null,
          opensAt: wib(opening), latestEntryAt: wib(entry), closesAt: wib(closing), proctorIds: ids,
        });
      } catch (failure) {
        if (pkg || !packageAccessDenied(failure)) throw failure;
        handleAccessDenied(failure);
        return;
      }
      onSaved();
    });
  };
  const findStaff = () => run(async () => {
    const rows = await assessmentRequest<Staff[]>('assessment-programs/proctors?q=' + encodeURIComponent(query));
    setStaff(rows);
    setStaffById((previous) => ({ ...previous, ...Object.fromEntries(rows.map(({ id, fullName }) => [id, fullName])) }));
  });
  return <form
    className={box + ' bg-[var(--staff-panel,#fff)] text-[var(--staff-text,#0f172a)] [&_:is(input,select,button):focus-visible]:outline [&_:is(input,select,button):focus-visible]:outline-2 [&_:is(input,select,button):focus-visible]:outline-offset-2 [&_:is(input,select,button):focus-visible]:outline-emerald-600'}
    aria-labelledby={headingId}
    onSubmit={save}
  >
    <header className="space-y-1">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-base font-semibold">Rincian pengajuan jadwal</h3>
      {title && <p className="break-words text-sm text-[var(--staff-muted,#475569)]">{title}</p>}
    </header>
    <div className="space-y-4">
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-semibold">Paket soal</legend>
        {!pkg && <div className="space-y-1 text-sm">
          <label className="grid gap-1">Paket pengajuan<select className={programField} value={packageId} disabled={busy || !packagesReady} onChange={(e) => setPackage(e.target.value)}>
            <option value="">Belum ditentukan</option>
            {packageId && !packages?.some(({ id }) => id === packageId) &&
              <option value={packageId} disabled>Paket tersimpan tidak tersedia</option>}
            {packages?.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}
          </select></label>
          {packageFailure && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{packageFailure.message}</p>}
          <div role="status" className="text-[var(--staff-muted,#475569)]">
            {loadingPackages ? 'Memuat pilihan paket soal…' : packages?.length
              ? packages.length + ' paket tersedia di pemilih.' : !packageFailure
                ? 'Belum ada paket yang sesuai dengan guru dan mapel pengajuan.' : null}
          </div>
          {(packageFailure || packagePage?.nextCursor || packageLoad.cursor || packageLoad.revalidate) &&
            <button type="button" className={programButton + ' aria-disabled:opacity-50'}
              aria-disabled={busy || loadingPackages || (!packageFailure && !packagePage?.nextCursor)}
              onClick={() => {
                if (packageFailure) loadPackages(packageLoad.cursor);
                else if (packagePage?.nextCursor) loadPackages(packagePage.nextCursor);
              }}>
              {loadingPackages ? 'Memuat paket…' : packageFailure ? 'Muat ulang paket soal'
                : packagePage?.nextCursor ? 'Tampilkan paket lebih lama' : 'Semua paket sudah dimuat'}
            </button>}
        </div>}
        {pkg && <p className="text-sm text-[var(--staff-muted,#475569)]">Menggunakan paket dari draf asesmen.</p>}
      </fieldset>
      <fieldset className="min-w-0 space-y-3 border-t border-[var(--staff-line,#e2e8f0)] pt-3">
        <legend className="px-1 text-sm font-semibold">Waktu dan lokasi</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm">Tanggal ujian<input className={programField} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="grid min-w-0 gap-1 text-sm">Ruang atau lokasi<input className={programField} maxLength={80} value={room} onChange={(e) => setRoom(e.target.value)} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid min-w-0 gap-1 text-sm">Jam buka WIB<input className={programField} type="time" disabled={!date} value={opening} onChange={(e) => setOpening(e.target.value)} /></label>
          <label className="grid min-w-0 gap-1 text-sm">Batas mulai WIB<input className={programField} type="time" disabled={!date} value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
          <label className="grid min-w-0 gap-1 text-sm">Jam tutup WIB<input className={programField} type="time" disabled={!date} value={closing} onChange={(e) => setClosing(e.target.value)} /></label>
        </div>
        {!date && <p className="text-sm text-[var(--staff-muted,#475569)]">Pilih tanggal untuk mengisi jam ujian.</p>}
      </fieldset>
    </div>
    <fieldset className="min-w-0 space-y-2 border-t border-[var(--staff-line,#e2e8f0)] pt-3">
      <legend className="px-1 text-sm font-semibold">Proktor</legend>
      <div className="flex gap-2">
        <input className={programField + ' min-w-0'} aria-label="Cari proktor berdasarkan nama" maxLength={80} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className={programButton} onClick={findStaff} disabled={busy}>Cari</button>
      </div>
      {staff.length > 0 && <div className="max-h-36 overflow-y-auto">{staff.map(({ id, fullName }) => <label key={id} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={ids.includes(id)} disabled={ids.length >= 12 && !ids.includes(id)} onChange={() => setIds(toggle(ids, id))} /> {fullName}
      </label>)}</div>}
      <p className="text-sm">{ids.length} proktor dipilih{ids.some((id) => staffById[id]) ? ' · ' + ids.flatMap((id) => staffById[id] ?? []).join(', ') : ''}</p>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--staff-line,#e2e8f0)] pt-3">
      <button type="button" className={programButton} disabled={busy} onClick={onCancel}>Batal</button>
      <button className={programPrimary} disabled={!canSave}>{item ? 'Simpan rincian jadwal' : 'Ajukan penjadwalan'}</button>
    </div>
  </form>;
}

export function AssessmentProgramsPanel({ student, canAuthor, onPublished }: {
  student: boolean; canAuthor: boolean; onPublished: () => void;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [options, setOptions] = useState<Options>();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState('');
  const scheduleTrigger = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kindName, setKindName] = useState('');
  const [academicKind, setAcademicKind] = useState(false);
  const work = useRef(false);
  const reloadRequests = useCallback(async () =>
    setRequests(await assessmentRequest<Request[]>('exam-schedule/requests')), []);
  const reload = useCallback(async () => {
    const [setup, list, pending, regular] = await Promise.all([
      assessmentRequest<Options>('assessment-programs/options'), assessmentRequest<Program[]>('assessment-programs'),
      assessmentRequest<Request[]>('exam-schedule/requests'),
      canAuthor ? assessmentRequest<{ drafts: Draft[] }>('exam-schedule/options') : Promise.resolve({ drafts: [] }),
    ]);
    setOptions(setup); setPrograms(list); setRequests(pending); setDrafts(regular.drafts);
  }, [canAuthor]);

  const run = useCallback((operation: () => Promise<void>) => {
    if (work.current) return;
    work.current = true;
    setBusy(true); setError(''); setNotice('');
    void operation().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Permintaan belum berhasil.'))
      .finally(() => { work.current = false; setBusy(false); });
  }, []);
  useEffect(() => {
    setHydrated(true);
    if (!student) void reloadRequests().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : 'Pengajuan belum dapat dibaca.'));
  }, [student, reloadRequests]);

  const openSchedule = (id: string, trigger: HTMLElement) => {
    scheduleTrigger.current = trigger;
    setEditing(id);
  };
  const closeSchedule = () => {
    const trigger = scheduleTrigger.current;
    scheduleTrigger.current = null;
    setEditing('');
    if (trigger) requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus(); });
  };

  if (student) return <AssessmentProfiles />;
  const outstanding = requests.filter((item) => item.status === 'draft' && item.missing.length > 0).length;
  const request = requests.find(({ sessionId }) => sessionId === editing);
  const program = programs.find(({ sessionId }) => sessionId === editing);
  const canEdit = editing && (!request || request.canEdit);

  return <section id="program-asesmen" className={box}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold">Program asesmen dan pengajuan jadwal</h2>
        {outstanding > 0 && <p className="text-sm">{outstanding} pengajuan perlu dilengkapi</p>}
      </div>
      <button type="button" className={programButton} aria-expanded={show} disabled={!hydrated} onClick={() => {
        setShow(!show);
        if (!show) run(reload);
      }}>{show ? 'Tutup program asesmen' : 'Buka program asesmen'}</button>
    </div>
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {show && !options && <p role="status">Memuat pilihan program…</p>}
    {show && options && <>
      <p className="text-sm">TA {options.academicYear ?? 'belum aktif'} · Semester {options.semester ?? '—'}</p>
      <details className={box}>
        <summary className="cursor-pointer font-semibold">Tambah jenis asesmen</summary>
        <form onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await assessmentRequest('assessment-programs/kinds', 'POST', { name: kindName, allowsGrade: academicKind });
            setKindName(''); setAcademicKind(false); await reload(); setNotice('Jenis asesmen tersimpan.');
          });
        }} className="space-y-2">
          <label className="grid gap-1 text-sm">Nama jenis baru<input className={programField} value={kindName} onChange={(e) => setKindName(e.target.value)} required minLength={3} maxLength={80} /></label>
          {options.canDefineAcademicKind && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={academicKind} onChange={(e) => setAcademicKind(e.target.checked)} /> Jenis ini dapat masuk penilaian akhir</label>}
          <button className={programPrimary} disabled={busy}>Simpan jenis asesmen</button>
        </form>
      </details>
      {canAuthor && options.packages.some(({ owned }) => owned) && <details className={box}>
        <summary className="cursor-pointer font-semibold">Bagikan versi paket untuk kegiatan sekolah</summary>
        {options.packages.filter(({ owned }) => owned).map((item) => <div className="flex flex-wrap items-center gap-2" key={item.id}>
          <span className="text-sm">{item.title} · v{item.version}</span>
          <button className={programButton} type="button" disabled={busy} onClick={() => run(async () => {
            await assessmentRequest('assessment-programs/packages/' + item.id + '/share', 'PUT', { shared: !item.sharedForPrograms });
            await reload();
          })}>{item.sharedForPrograms ? 'Hentikan berbagi' : 'Bagikan paket'}</button>
        </div>)}
      </details>}
      <DraftForm options={options} busy={busy} run={run} onCreated={(id) => {
        setEditing(id); void reload().catch(() => setError('Draf tersimpan. Buka kembali panel untuk membaca draf.'));
        setNotice('Draf tersimpan. Lengkapi rincian yang sudah diketahui untuk mengajukan jadwal.');
      }} />
      {programs.length > 0 && <ul className="space-y-2" aria-label="Draf dan program asesmen">
        {programs.map((row) => <li className={box} key={row.id}>
          <p className="font-semibold">{row.session.title}</p>
          <p className="text-sm">{row.kind.name} · {row.classes.length} rombel · {row.session.gradeTarget ? row.session.gradeTarget.toUpperCase() : 'Hasil terpisah'}</p>
          {row.owned && row.session.status === 'draft' && <button type="button" className={programButton} onClick={(event) => openSchedule(row.sessionId, event.currentTarget)}>Atur jadwal {row.session.title}</button>}
          {row.owned && row.session.status === 'active' && row.session.examSchedule && <button type="button" className={programButton} disabled={busy} onClick={() => run(async () => {
              await assessmentRequest('assessment-programs/' + row.id + '/complete', 'POST');
              await reload(); setNotice('Asesmen selesai.');
            })}>Selesaikan {row.session.title}</button>}
          {row.owned && row.session.status === 'completed' && (row.kind.category !== 'profile' || row.canProfile) && <ProgramProfileEditor id={row.id} profile={row.canProfile} separate={!row.session.gradeTarget} />}
        </li>)}
      </ul>}
      {drafts.length > 0 && <label className="grid gap-1 text-sm">Ajukan jadwal draf Studio<select className={programField} value={drafts.some(({ id }) => id === editing) ? editing : ''} onChange={(e) => openSchedule(e.target.value, e.currentTarget)}>
        <option value="">Pilih draf</option>{drafts.map((row) => <option value={row.id} key={row.id}>{row.title} · {row.class?.name}</option>)}
      </select></label>}
      <h3 className="font-semibold">Pengajuan jadwal</h3>
      {!requests.length && <p className="text-sm">Belum ada pengajuan.</p>}
      <ul className="space-y-2" aria-label="Pengajuan jadwal ujian">
        {requests.map((row) => <li className={box} key={row.sessionId}>
          <p className="font-semibold">{row.title}</p>
          <p className="text-sm">{row.publishedAt ? 'Terbit' : row.missing.length ? 'Perlu dilengkapi · ' + row.missing.join(', ') : 'Siap diterbitkan'}</p>
          <div className="flex flex-wrap gap-2">
            {row.canEdit && <button type="button" className={programButton} onClick={(event) => openSchedule(row.sessionId, event.currentTarget)}>Lengkapi {row.title}</button>}
            {row.canPublish && !row.missing.length && <button type="button" className={programPrimary} disabled={busy} onClick={() => run(async () => {
              await assessmentRequest('exam-schedule/requests/' + row.sessionId + '/publish', 'POST', { revision: row.revision });
              await reload(); setNotice('Jadwal ujian diterbitkan.'); onPublished(); router.refresh();
            })}>Terbitkan {row.title}</button>}
          </div>
        </li>)}
      </ul>
      {canEdit && <ScheduleForm key={editing + ':' + (request?.revision ?? 0)} sessionId={editing}
        title={request?.title ?? program?.session.title ?? drafts.find(({ id }) => id === editing)?.title}
        item={request} pkg={program?.package.id}
        busy={busy} run={run}
        onCancel={closeSchedule}
        onSaved={() => { closeSchedule(); void reloadRequests().catch(() => setError('Pengajuan tersimpan. Muat ulang daftar.')); setNotice('Pengajuan jadwal tersimpan.'); }} />}
    </>}
  </section>;
}
