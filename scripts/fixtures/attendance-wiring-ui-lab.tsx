import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AttendanceJpSummary from '../../apps/web/src/app/dashboard/akademik/_components/AttendanceJpSummary';
import RingkasanGuru from '../../apps/web/src/app/dashboard/akademik/_components/RingkasanGuru';
import ExecutiveDashboard from '../../apps/web/src/app/dashboard/executive/_components/ExecutiveDashboard';
import { lab, executiveSample } from './attendance-wiring-ui-actions';
import { wibTodayISO } from '../../apps/web/src/lib/bell-times';
import type { ActivityItem } from '../../apps/web/src/app/dashboard/akademik/_components/guru-types';

Object.assign(window, { attendanceWiringLab: lab });
const executiveInitial = executiveSample({
  academicYear: '2026/2027',
  semester: 1,
  majorCode: 'AKL',
});
const selectClass = 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100';
function App() {
  const [role, setRole] = useState('Guru'),
    [mode, setMode] = useState('complete');
  const [major, setMajor] = useState('AKL'),
    [semester, setSemester] = useState(1);
  const [revision, setRevision] = useState(0);
  const [teacherData, setTeacherData] = useState('filled');
  const query = {
    academicYear: '2026/2027',
    semester,
    majorCode: major,
    ...(role === 'Guru' ? { scope: 'own' as const } : {}),
  };
  const activities: ActivityItem[] = [
    {
      id: 'journal-fixture',
      teacherId: 'teacher-fixture',
      classId: 'class-fixture',
      subject: 'Akuntansi',
      date: '2026-10-20',
      topic: 'Jurnal sintetis',
      notes: '',
      duration: 2,
      rppId: null,
    } as ActivityItem,
  ];
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-xl font-bold">DIIS · Lab lokal kehadiran dan jurnal</h1>
      <p className="text-sm">
        Data sintetis. Server action diganti adapter; bukan autentikasi atau QA staging.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Role{' '}
          <select
            className={selectClass}
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {['Guru', 'Kepala Sekolah', 'Super Admin'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Jurusan{' '}
          <select
            className={selectClass}
            aria-label="Jurusan lab"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
          >
            {['AKL', 'TKJ', 'TKR'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Semester{' '}
          <select
            className={selectClass}
            aria-label="Semester lab"
            value={semester}
            onChange={(e) => setSemester(Number(e.target.value))}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        <label>
          Kondisi{' '}
          <select
            className={selectClass}
            aria-label="Kondisi"
            value={mode}
            onChange={(e) => {
              lab.mode = e.target.value;
              setMode(e.target.value);
              setRevision((x) => x + 1);
            }}
          >
            {['complete', 'unknown', 'zero', 'empty', 'error', 'denied', 'large'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Data guru{' '}
          <select
            className={selectClass}
            aria-label="Data guru"
            value={teacherData}
            onChange={(e) => setTeacherData(e.target.value)}
          >
            {['filled', 'empty', 'denied', 'unavailable', 'mixed'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="min-h-11 rounded border px-3"
          onClick={() => {
            document.documentElement.classList.toggle('dark');
          }}
        >
          Tema
        </button>
        <button
          type="button"
          className="min-h-11 rounded border px-3"
          onClick={() => setRevision((x) => x + 1)}
        >
          Perbarui
        </button>
      </div>
      <div data-testid="scope">
        {role} · {major} · S{semester}
      </div>
      {role !== 'Guru' ? (
        <div data-testid="executive">
          <ExecutiveDashboard initial={executiveInitial} years={['2026/2027', '2025/2026']} />
        </div>
      ) : role === 'Guru' ? (
        <div data-testid="teacherSurface">
          <div data-testid="summary">
            <AttendanceJpSummary query={query} refreshToken={revision} />
          </div>
          <RingkasanGuru
            grades={[]}
            attendances={[]}
            activities={activities}
            rpp={[]}
            todayClasses={
              teacherData === 'empty'
                ? []
                : [
                    {
                      classId: 'class-fixture',
                      className: 'X AKL',
                      subject: 'Dasar Akuntansi dan Keuangan Lembaga',
                      jpStart: 1,
                      jpEnd: 2,
                      startLabel: '07.30',
                      room: 'Laboratorium Akuntansi',
                      isNow: true,
                    },
                  ]
            }
            availability={{
              grades:
                teacherData === 'denied' || teacherData === 'mixed'
                  ? 'denied'
                  : teacherData === 'unavailable'
                    ? 'unavailable'
                    : 'ready',
              attendance: 'ready',
              journal: 'ready',
              rpp: teacherData === 'mixed' ? 'unavailable' : 'ready',
              assessments: 'ready',
              kktp: 'ready',
              today: 'ready',
            }}
            todayDate={wibTodayISO()}
            onAbsen={() => {}}
            onJurnal={() => {}}
          />
        </div>
      ) : null}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
