'use client';
import React from 'react';
import LearnerGradeView from '../LearnerGradeView';
import type { OrtuNilai } from './ortu-types';
import type { ModalState } from './OrtuWorkspace';
import type { LearnerGradeState } from '@/lib/learner-grades';

export default function NilaiOrtu({
  setModal,
  grades = [],
  gradeState = 'ready',
  onOpenOfficialReport,
}: {
  setModal: (modal: ModalState) => void;
  grades?: OrtuNilai[];
  gradeState?: LearnerGradeState;
  onOpenOfficialReport: () => void;
}) {
  return (
    <LearnerGradeView
      grades={grades}
      state={gradeState}
      title="Nilai Akademik"
      shell="ortu"
      onReport={onOpenOfficialReport}
      onDetail={(nilai) => setModal({ type: 'grade', data: { nilai } })}
    />
  );
}
