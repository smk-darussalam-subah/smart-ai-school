// Label & kelas warna komponen nilai (W0b) — dipakai GradeRow & GradeDetailModal.

import type { GradeComponentKey, GradeNaStatus } from '@/lib/academic';

export const COMP_LABEL_SHORT: Record<GradeComponentKey, string> = {
  uh: 'UH',
  praktik: 'Praktik',
  sikap: 'Sikap',
  uts: 'UTS',
  uas: 'UAS',
};

export const COMP_LABEL_FULL: Record<GradeComponentKey, string> = {
  uh: 'Ulangan Harian',
  praktik: 'Praktik',
  sikap: 'Sikap',
  uts: 'Penilaian Tengah Semester',
  uas: 'Penilaian Akhir Semester',
};

/** Warna teks nilai per status ketuntasan (selaras pewarnaan Gradebook). */
export const STATUS_TEXT_CLASS: Record<GradeNaStatus, string> = {
  tuntas: 'text-emerald-600',
  mid: 'text-amber-600',
  remedial: 'text-rose-600',
};

export const STATUS_LABEL: Record<GradeNaStatus, string> = {
  tuntas: 'Tuntas',
  mid: 'Mendekati KKTP',
  remedial: 'Remedial',
};

/** Pil status (bg translucent + teks) — tema-agnostik. */
export const STATUS_PILL_CLASS: Record<GradeNaStatus, string> = {
  tuntas: 'bg-emerald-500/10 text-emerald-600',
  mid: 'bg-amber-500/10 text-amber-600',
  remedial: 'bg-rose-500/10 text-rose-600',
};
