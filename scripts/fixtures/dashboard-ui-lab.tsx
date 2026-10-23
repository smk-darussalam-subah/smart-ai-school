import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SessionPreparationPanel from '../../apps/web/src/app/dashboard/jadwal/_components/SessionActivationPanel';
import TodayClassSessions from '../../apps/web/src/app/dashboard/jadwal/_components/TodayClassSessions';
import ScheduleBoard, {
  ScheduleReadProvider,
} from '../../apps/web/src/app/dashboard/akademik/_components/ks/ScheduleBoard';
import { BellPatternProvider } from '../../apps/web/src/components/providers/BellPatternProvider';
import { LearnerGradeDetail } from '../../apps/web/src/app/dashboard/akademik/_components/LearnerGradeView';
import { setLabMode, commitCount } from './dashboard-ui-actions';
import type { BellProfile } from '../../apps/web/src/lib/bell-patterns';
import type { LearnerGrade } from '../../apps/web/src/lib/learner-grades';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const period = {
  number: 1,
  startDate: '2026-07-01',
  endDate: '2026-12-31',
  academicYear: { code: '2026/2027' },
};
const profile: BellProfile = {
  id: 'synthetic',
  code: 'SYN',
  name: 'Synthetic',
  kind: 'NORMAL',
  effectiveFrom: '2026-07-01',
  effectiveUntil: '2026-12-31',
  revokedAt: null,
  provenance: 'synthetic',
  segments: Array.from({ length: 10 }, (_, index) => ({
    type: 'INSTRUCTION',
    dayOfWeek: 0,
    jpNumber: index + 1,
    label: `JP ${index + 1}`,
    startMinute: 420 + index * 40,
    endMinute: 460 + index * 40,
    sortOrder: index,
  })),
};
const klass = { id: 'synthetic-class', name: 'X AKL Sintetis', grade: 10, majorCode: 'AKL' };
const schedules = [
  {
    id: 'synthetic-schedule',
    classId: klass.id,
    dayOfWeek: new Date(today).getUTCDay() || 7,
    jpStart: 1,
    jpEnd: 10,
    academicYear: '2026/2027',
    semester: 1,
    class: klass,
    teachingAssignment: {
      subject: 'Dasar Program Keahlian Sintetis',
      teacher: { user: { fullName: 'Guru Sintetis' } },
    },
  },
];
const grade: LearnerGrade = {
  studentId: 'synthetic',
  mp: 'Mapel Sintetis',
  na: 85,
  kktp: 75,
  kktpProvenance: 'config',
  status: 'tuntas',
  components: { uh: 85, praktik: 85, sikap: 85, uts: null, uas: null },
};
function Lab() {
  const [mode, setMode] = useState('success');
  const [detail, setDetail] = useState(false);
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <h1 className="text-xl font-bold">QA komponen DIIS lokal (sintetis)</h1>
      <label>
        Respons fixture{' '}
        <select
          aria-label="Respons fixture"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
            setLabMode(event.target.value);
          }}
        >
          <option value="success">Berhasil</option>
          <option value="preview-error">Preview gagal</option>
          <option value="status-error">Status gagal</option>
          <option value="empty">Tidak ada sesi baru</option>
          <option value="conflict">Konflik jadwal</option>
          <option value="network">Jaringan putus</option>
        </select>
      </label>
      <p className="text-sm">Tema mengikuti pengaturan terang/gelap browser.</p>
      <button className="m-2 min-h-11 border px-3" onClick={() => setDetail(true)}>
        Rincian nilai orang tua
      </button>
      <SessionPreparationPanel today={today} />
      <button
        className="min-h-11 border px-3"
        onClick={(event) => {
          event.currentTarget.textContent = `Jumlah commit sintetis: ${commitCount()}`;
        }}
      >
        Periksa jumlah commit
      </button>
      <TodayClassSessions
        canOperateSessions
        sessions={[
          {
            id: 'owned',
            classNameSnapshot: 'Kelas Milik Guru',
            subjectSnapshot: 'Sintetis',
            roomSnapshot: null,
            scheduledStartAt: `${today}T03:00:00Z`,
            scheduledEndAt: `${today}T04:00:00Z`,
            status: 'SCHEDULED',
            canOperate: true,
          },
          {
            id: 'foreign',
            classNameSnapshot: 'Kelas Guru Lain',
            subjectSnapshot: 'Sintetis',
            roomSnapshot: null,
            scheduledStartAt: `${today}T03:00:00Z`,
            scheduledEndAt: `${today}T04:00:00Z`,
            status: 'SCHEDULED',
            canOperate: false,
          },
        ]}
        loadError={null}
      />
      <BellPatternProvider profiles={[profile]} periods={[period]}>
        <ScheduleReadProvider
          value={{
            academicYear: '2026/2027',
            semester: 1,
            teacherId: '',
            subject: '',
            available: true,
            subjects: [
              { name: 'Dasar Program Keahlian Sintetis', code: 'DDPKTKJ-SINTETIS-PANJANG' },
            ],
          }}
        >
          <ScheduleBoard schedules={schedules} classes={[klass]} />
        </ScheduleReadProvider>
      </BellPatternProvider>
      {detail && <LearnerGradeDetail grade={grade} shell="ortu" onClose={() => setDetail(false)} />}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
