'use client';
import React from 'react';
import { LearnerGradeDetail } from '../LearnerGradeView';
import type { OrtuNilai } from './ortu-types';

export default function GradeDetailModal({
  nilai,
  onClose,
}: {
  nilai: OrtuNilai;
  onClose: () => void;
}) {
  return <LearnerGradeDetail grade={nilai} shell="ortu" onClose={onClose} />;
}
