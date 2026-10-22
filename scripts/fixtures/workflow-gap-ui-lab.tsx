import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AcademicRoleModeSwitcher from '../../apps/web/src/app/dashboard/akademik/_components/AcademicRoleModeSwitcher';
import AbsenModal from '../../apps/web/src/app/dashboard/akademik/_components/AbsenModal';
import InputNilaiModal from '../../apps/web/src/app/dashboard/akademik/_components/InputNilaiModal';
import { useWaliClasses } from '../../apps/web/src/app/dashboard/akademik/_components/use-wali-classes';
import { setMode, getSaves } from './workflow-gap-actions';

function WaliProbe({ context }: { context: string }) {
  const read = useWaliClasses(true, context);
  return (
    <section
      aria-label="Probe informasi wali kelas"
      className="rounded border border-slate-300 p-4"
    >
      <h2 className="font-bold">Rapor Kelas</h2>
      {read.status === 'loading' ? (
        <p role="status">Memeriksa kelas perwalian…</p>
      ) : read.status === 'error' ? (
        <div role="alert">
          <p>{read.error}</p>
          <button className="min-h-11 underline" onClick={read.retry}>
            Coba periksa wali kelas
          </button>
        </div>
      ) : (
        <p>
          {read.classes.length
            ? read.classes.map((item) => item.name).join(', ')
            : 'Tidak ada kelas perwalian.'}
        </p>
      )}
    </section>
  );
}
function App() {
  const [kind, setKind] = useState<'absen' | 'grade' | null>(null);
  const [classId, setClassId] = useState('class-a');
  const [context, setContext] = useState(0);
  const [mode, changeMode] = useState('success');
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 text-slate-950 dark:text-slate-100">
      <h1 className="text-xl font-bold">QA lokal alur guru — aksi sintetis</h1>
      <p>Komponen produksi, bukan login atau database sekolah.</p>
      <label>
        Skenario{' '}
        <select
          id="scenario"
          className="min-h-11 rounded border bg-white px-3 text-slate-950"
          value={mode}
          onChange={(event) => {
            changeMode(event.target.value);
            setMode(event.target.value);
            setContext((value) => value + 1);
          }}
        >
          {['success', 'error', 'denied', 'empty', 'slow', 'save-error', 'save-throw'].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <button className="min-h-11 rounded border px-3" onClick={() => setKind('absen')}>
          Buka Absensi
        </button>
        <button className="min-h-11 rounded border px-3" onClick={() => setKind('grade')}>
          Buka Input Nilai
        </button>
        <button
          id="switch-class"
          className="min-h-11 rounded border px-3"
          onClick={() => setClassId((value) => (value === 'class-a' ? 'class-b' : 'class-a'))}
        >
          Ganti kelas
        </button>
      </div>
      <AcademicRoleModeSwitcher
        operationsLabel="Kepemimpinan Sekolah"
        teachingWorkspace={
          <div>
            <h2>Pengajaran Pribadi Sintetis</h2>
            <label>
              Draft guru <input id="teacher-draft" className="min-h-11 border text-slate-950" />
            </label>
            <WaliProbe context={String(context)} />
          </div>
        }
        operationsWorkspace={<h2>Ruang jabatan sintetis — data terpisah</h2>}
      />
      {kind === 'absen' && (
        <AbsenModal classId={classId} className={classId} onClose={() => setKind(null)} />
      )}
      {kind === 'grade' && (
        <InputNilaiModal
          classId={classId}
          className={classId}
          subject="Mapel Sintetis"
          assignmentId="synthetic-assignment"
          academicYear="2026/2027"
          semester={1}
          onClose={() => setKind(null)}
        />
      )}
      <button
        className="min-h-11 underline"
        onClick={() => (document.getElementById('save-count')!.textContent = String(getSaves()))}
      >
        Baca jumlah simpan sintetis
      </button>
      <output id="save-count">0</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
