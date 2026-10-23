import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LearningRecap from '../../apps/web/src/app/dashboard/akademik/_components/LearningRecap';
import JurnalModal from '../../apps/web/src/app/dashboard/akademik/_components/JurnalModal';
import SessionFlowModal from '../../apps/web/src/app/dashboard/akademik/_components/SessionFlowModal';
import type { TodayClass } from '../../apps/web/src/app/dashboard/akademik/_components/guru-types';
window.learningQa = { mode: 'ready', calls: [], mutations: 0, journals: 0, pending: [] };
function Lab() {
  const [scope, setScope] = useState<'own' | 'operations'>('operations'),
    [revision, setRevision] = useState(0),
    [journal, setJournal] = useState<TodayClass | null>(null),
    [guide, setGuide] = useState<TodayClass | null>(null);
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 md:p-8">
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-slate-900 dark:text-white">
        <b>DIIS · QA lokal sintetis</b>
        <select
          aria-label="Role QA"
          className="min-h-11 bg-white text-slate-900"
          onChange={(e) => setScope(e.target.value as 'own' | 'operations')}
        >
          <option value="operations">Kepala Sekolah</option>
          <option value="own">Guru</option>
        </select>
        <select
          aria-label="Skenario QA"
          className="min-h-11 bg-white text-slate-900"
          onChange={(e) => {
            window.learningQa.mode = e.target.value;
            setRevision((x) => x + 1);
          }}
        >
          {[
            'ready',
            'error',
            'denied',
            'empty',
            'detail-error',
            'support-error',
            'save-error',
            'slow',
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button
          type="button"
          className="min-h-11"
          onClick={() => document.documentElement.classList.toggle('dark')}
        >
          Tema
        </button>
      </div>
      <main className="mx-auto max-w-7xl">
        <LearningRecap
          key={scope}
          refreshToken={revision}
          academicYear="2026/2027"
          semester={1}
          scope={scope}
          canRead
          canOperate={scope === 'own'}
          onGuide={setGuide}
          onJournal={setJournal}
          onModule={() => {
            window.learningQa.calls.push('open-module');
          }}
          onAttendance={() => {
            window.learningQa.calls.push('open-attendance');
          }}
          onAssessment={() => {
            window.learningQa.calls.push('open-assessment');
          }}
        />
        {journal && (
          <JurnalModal
            classId={journal.classId}
            className={journal.className}
            subject={journal.subject}
            startLabel={journal.startLabel}
            jpStart={journal.jpStart}
            approvedRpp={[]}
            activities={[]}
            onClose={() => {
              setJournal(null);
              setRevision((x) => x + 1);
            }}
          />
        )}
        {guide && (
          <SessionFlowModal
            session={guide}
            onAbsen={() => {
              window.learningQa.calls.push('guide-attendance');
            }}
            onJurnal={() => setJournal(guide)}
            onOpenPenilaian={() => {
              window.learningQa.calls.push('guide-assessment');
            }}
            onClose={() => setGuide(null)}
          />
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
