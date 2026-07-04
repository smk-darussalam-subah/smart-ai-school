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

export interface AtpItem { tpRef?: string; indikator?: string }

/** Kegiatan per pertemuan — timeline Pendahuluan/Inti/Penutup (sesuai mockup). */
export interface KegiatanItem {
  pertemuan?: string;
  deskripsi?: string;          // legacy: deskripsi bebas
  pendahuluan?: string;         // kegiatan pendahuluan (15 menit)
  inti?: string;                // kegiatan inti (60 menit)
  penutup?: string;             // kegiatan penutup (15 menit)
  diferensiasi?: string;        // strategi diferensiasi (opsional)
}

/** Modul Ajar terstruktur (Kurikulum Merdeka) — disimpan di Rpp.body. */
export interface ModulAjarBody {
  fase?: string;
  pengembang?: string;
  jpAllocation?: number | null;
  kktp?: number | null;
  cp?: string;
  kompetensiAwal?: string;
  tp?: string[];
  atpUraian?: string;
  atp?: AtpItem[];
  profilDimensi?: string[];
  profilUraian?: string;
  sarana?: string;
  target?: string;
  model?: string;
  kegiatan?: KegiatanItem[];
  asesmen?: string;               // legacy: rencana asesmen bebas
  asesmenDiagnostik?: string;      // jenis + deskripsi asesmen diagnostik
  asesmenFormatif?: string;        // jenis + deskripsi asesmen formatif
  asesmenSumatif?: string;         // jenis + deskripsi asesmen sumatif
  pengayaan?: string;
  remedial?: string;
  refleksi?: string;               // legacy: refleksi gabungan
  refleksiGuru?: string;           // pertanyaan refleksi guru
  refleksiSiswa?: string;          // pertanyaan refleksi siswa
  lampiran?: string;               // catatan lampiran (teks)
  lampiranUrl?: string;            // URL eksternal (video/drive)
  durasiMenit?: number | null;     // durasi per JP (menit)
}

export interface RppItem {
  id: string;
  subject: string;
  title: string;
  content: string | null;
  body: ModulAjarBody | null;
  fileUrl: string | null;
  classId: string | null;
  class: { id: string; name: string } | null;
  status: string; // draft | submitted | approved | revision
  reviewNote: string | null;
  academicYear: string;
  semester: number;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface ClassRef {
  id: string;
  name: string;
}

export interface LmsProgressRow {
  name: string;
  nis: string;
  progress: number; // 0–100
  status: string; // locked | active | completed
  startedAt: string | null;
  completedAt: string | null;
}

export interface LmsProgressResponse {
  progress: LmsProgressRow[];
  classStudentCount: number | null;
}

export interface LmsModuleItem {
  id: string;
  rppId: string | null;
  classId: string | null;
  subject: string;
  title: string;
  tp: string | null;
  jpAllocation: number | null;
  kktp: number;
  content: string | null;
  orderIndex: number;
  status: string; // draft | published | archived
  academicYear: string;
  semester: number;
  class: { id: string; name: string } | null;
  _count?: { progress: number };
  myProgress?: { progress: number; status: string; startedAt: string | null; completedAt: string | null } | null; // T3-06: from /lms/modules/my-learning
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
  /** U2 Wave 3: assessment session ID for analisis hasil (optional, populated when session exists). */
  assessmentSessionId?: string;
}

// Sumber tunggal KKTP ada di lib/academic (fondasi W0). Re-export agar konsumen
// guru lama (Ringkasan/Rekap) tetap impor dari sini tanpa perubahan.
export { KKTP_DEFAULT } from '@/lib/academic';
