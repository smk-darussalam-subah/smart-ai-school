// Barrel komponen shared Dashboard Akademik (W0b).
// Dipakai bersama lintas peran (siswa/ortu/guru/KS). Lihat juga lib/academic.ts (W0a)
// untuk fungsi & tipe murni yang menggerakkan komponen ini.

export { CalendarHeatmap } from './CalendarHeatmap';
export { GradeRow } from './GradeRow';
export { GradeDetailModal } from './GradeDetailModal';
export { RaporModal, type RaporRow } from './RaporModal';
export { ScoreBar } from './ScoreBar';
export { ThemeToggle } from './ThemeToggle';

export {
  ATTENDANCE_LABELS,
  ATTENDANCE_CELL_CLASS,
  REAL_ATTENDANCE_STATUSES,
} from './attendance-status';
export {
  COMP_LABEL_SHORT,
  COMP_LABEL_FULL,
  STATUS_TEXT_CLASS,
  STATUS_LABEL,
  STATUS_PILL_CLASS,
} from './grade-meta';
