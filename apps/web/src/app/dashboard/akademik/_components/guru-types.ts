// Tipe bersama Dashboard Akademik Guru.

export interface ScheduleItem {
  id: string;
  classId: string;
  dayOfWeek: number; // 1=Senin … 6=Sabtu
  jpStart: number;
  jpEnd: number;
  room?: string | null;
  class: { id: string; name: string; grade: number; majorCode: string };
  teachingAssignment: { subject: string; teacher?: { user?: { fullName?: string } } };
}

export interface ActivityItem {
  id: string;
  classId: string;
  date: string;
  title: string;
  description?: string | null;
  category: string;
  class?: { name: string };
}

export interface RppItem {
  id: string;
  subject: string;
  title: string;
  status: string;
}

export interface ClassRef {
  id: string;
  name: string;
}

export interface GradeRow {
  id: string;
  score: string;
  type: string;
  student: { nis: string; user: { fullName: string } };
  assignment: { subject: string; class: { name: string } };
}

export interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  student: { nis: string; user: { fullName: string } };
  class: { name: string };
}

/** Satu blok mengajar hari ini (gabungan JP berurutan satu kelas+mapel). */
export interface TodayClass {
  classId: string;
  className: string;
  subject: string;
  room: string | null;
  jpStart: number;
  jpEnd: number;
  startLabel: string;
  isNow: boolean;
}

export const KKTP_DEFAULT = 75;
