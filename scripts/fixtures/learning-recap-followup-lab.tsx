import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LearningRecap from '../../apps/web/src/app/dashboard/akademik/_components/LearningRecap';
import JurnalModal from '../../apps/web/src/app/dashboard/akademik/_components/JurnalModal';
import RekapPembelajaran from '../../apps/web/src/app/dashboard/akademik/_components/RekapPembelajaran';
import type { GradeItem } from '../../apps/web/src/lib/api';
import type { SummaryReadState } from '../../apps/web/src/lib/teacher-summary';
import type { TodayClass } from '../../apps/web/src/app/dashboard/akademik/_components/guru-types';
window.learningQa = { mode: 'ready', calls: [], mutations: 0, journals: 0, pending: [] };
const grade = (score: string, subject = 'Bahasa Indonesia', semester = 1): GradeItem => ({
  id: `${subject}-${semester}`,
  score,
  semester,
  academicYear: '2026/2027',
  type: 'uh',
  notes: null,
  studentId: 'synthetic',
  student: { id: 'synthetic', nis: 'synthetic', user: { fullName: 'Siswa sintetis' } },
  assignment: {
    subject,
    academicYear: '2026/2027',
    classId: 'class',
    class: { id: 'class', name: 'X AKL' },
  },
});
function Lab() {
  const [view, setView] = useState('own'),
    [revision, setRevision] = useState(0),
    [journal, setJournal] = useState<TodayClass | null>(null),
    [thresholdState, setThresholdState] = useState<SummaryReadState>('ready'),
    [kktp, setKktp] = useState(90),
    [semester, setSemester] = useState(1),
    [mixed, setMixed] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 md:p-8">
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-slate-900 dark:text-white">
        <b>DIIS · QA lokal sintetis · LR-01 / LR-02</b>
        <label>
          Tampilan{' '}
          <select
            aria-label="Tampilan QA"
            className="min-h-11 bg-white text-slate-900"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="own">Pembelajaran Saya</option>
            <option value="legacy">Rekap nilai</option>
            <option value="standalone">Jurnal langsung</option>
          </select>
        </label>
        {view === 'legacy' && (
          <>
            <label>
              KKTP resmi{' '}
              <select
                aria-label="KKTP QA"
                className="min-h-11 bg-white text-slate-900"
                value={kktp}
                onChange={(e) => setKktp(Number(e.target.value))}
              >
                {[90, 65, 75].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Status KKTP{' '}
              <select
                aria-label="Status KKTP QA"
                className="min-h-11 bg-white text-slate-900"
                value={thresholdState}
                onChange={(e) => setThresholdState(e.target.value as SummaryReadState)}
              >
                {['ready', 'denied', 'unavailable'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Semester{' '}
              <select
                aria-label="Semester QA"
                className="min-h-11 bg-white text-slate-900"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              >
                <option>1</option>
                <option>2</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />{' '}
              Dua mapel
            </label>
          </>
        )}
      </div>
      <main className="mx-auto max-w-7xl">
        {view === 'legacy' ? (
          <RekapPembelajaran
            subject="all"
            grades={[
              grade('80'),
              grade('70', 'Bahasa Indonesia', 2),
              ...(mixed ? [grade('70', 'Bahasa Inggris')] : []),
            ]}
            academicYear="2026/2027"
            semester={semester}
            dataState="ready"
            thresholds={[
              {
                mapel: 'Bahasa Indonesia',
                kktp,
                kktpProvenance: kktp === 75 ? 'system_default' : 'config',
              },
              { mapel: 'Bahasa Inggris', kktp: 65, kktpProvenance: 'config' },
            ]}
            thresholdState={thresholdState}
            attendances={[]}
            activities={[]}
            approvedRpp={[]}
            onBack={() => setView('own')}
          />
        ) : view === 'standalone' ? (
          <button
            className="min-h-11 rounded-lg border bg-white p-3 text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-600"
            data-standalone-journal
            onClick={() =>
              setJournal({
                classId: 'class',
                className: 'X AKL',
                subject: 'Bahasa Indonesia',
                jpStart: 1,
                jpEnd: 2,
                startLabel: '07.30',
                isNow: true,
                room: null,
              })
            }
          >
            Tulis jurnal langsung
          </button>
        ) : (
          <LearningRecap
            academicYear="2026/2027"
            semester={1}
            scope="own"
            canRead
            canOperate
            refreshToken={revision}
            onJournal={setJournal}
          />
        )}
        {journal && (
          <JurnalModal
            classId={journal.classId}
            className={journal.className}
            subject={journal.subject}
            startLabel={journal.startLabel}
            jpStart={journal.jpStart}
            activities={[]}
            approvedRpp={[]}
            onClose={() => {
              setJournal(null);
              setRevision((n) => n + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
