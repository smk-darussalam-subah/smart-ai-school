'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import LearnerGradeView from '../LearnerGradeView';
import type { SiswaNilai } from './siswa-types';
import type { LearnerGradeState } from '@/lib/learner-grades';

export default function NilaiSiswa({
  grades,
  gradeState = 'ready',
  initialFilter = 'all',
}: {
  grades: SiswaNilai[];
  gradeState?: LearnerGradeState;
  showToast: (message: string) => void;
  initialFilter?: 'all' | 'tuntas' | 'remedial';
}) {
  const router = useRouter();
  return (
    <LearnerGradeView
      grades={grades}
      state={gradeState}
      initialFilter={initialFilter}
      title="Nilai & Capaian"
      shell="siswa"
      onReport={() => router.push('/dashboard/rapor')}
    />
  );
}
