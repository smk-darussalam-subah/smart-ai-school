import { HelpCatalogSchema, type HelpContentBlock, type HelpTopic } from './help-schema';
import { academicWorkflowHref } from '@/lib/academic-workflow-deep-link';

type TopicInput = Omit<HelpTopic, 'blocks' | 'version' | 'permissionsAll' | 'featureStatus' | 'updatedAt'> & {
  intro: string;
  steps: string[];
  checks: string[];
  authority: string;
  recovery: string;
  faq?: { question: string; answer: string };
  permissionsAll?: HelpTopic['permissionsAll'];
  featureStatus?: HelpTopic['featureStatus'];
  includeCta?: boolean;
};

const WORKFLOW_CTA_LABELS: Record<string, string> = {
  'topic.start': 'Buka Beranda',
  'topic.account-recovery': 'Buka Halaman Masuk',
  'topic.academic-workspace': 'Buka Ruang Akademik',
  'topic.teaching-assignment': 'Buka Pengajaran Saya',
  'topic.wali-class': 'Buka Rapor Kelas',
  'topic.schedule': 'Buka Jadwal',
  'topic.module-authoring': 'Buka Modul Ajar',
  'topic.assessment': 'Buka Bank Soal',
  'topic.assessment-student': 'Buka Asesmen',
  'topic.remedial': 'Buka Remedial',
  'topic.remedial-student': 'Buka Remedial Saya',
  'topic.remedial-family': 'Buka Status Remedial Anak',
  'topic.report-card': 'Buka Rapor Resmi',
  'topic.report-card-operations': 'Buka Operasional Rapor',
  'topic.semester-closing': 'Buka Penutupan Semester',
  'topic.student-management': 'Buka Data Siswa',
  'topic.ppdb': 'Buka PPDB',
  'topic.class-config': 'Buka Kelas dan Penugasan',
  'topic.calendar': 'Buka Kalender Sekolah',
  'topic.finance': 'Buka Keuangan',
  'topic.announcements': 'Buka Pengumuman',
  'topic.career-industry': 'Buka Lowongan',
  'topic.teacher-attendance': 'Buka Presensi Guru',
  'topic.ai-assistant': 'Buka Asisten AI',
  'topic.monitoring': 'Buka Monitoring',
  'topic.executive': 'Buka Dasbor Eksekutif',
  'topic.appointments': 'Buka Struktur Organisasi',
  'topic.system-administration': 'Buka Manajemen Pengguna',
  'topic.school-period': 'Buka Tahun Ajaran',
};

const WORKFLOW_CTA_HREFS: Partial<Record<string, string>> = {
  'topic.academic-workspace': academicWorkflowHref('overview'),
  'topic.teaching-assignment': academicWorkflowHref('teaching'),
  'topic.module-authoring': academicWorkflowHref('module-authoring'),
  'topic.assessment': academicWorkflowHref('question-bank'),
  'topic.assessment-student': academicWorkflowHref('assessment'),
  'topic.remedial': academicWorkflowHref('remedial'),
  'topic.remedial-student': academicWorkflowHref('remedial-status'),
  'topic.remedial-family': academicWorkflowHref('remedial-status'),
};

function workflowTopic(input: TopicInput): HelpTopic {
  const { intro, steps, checks, authority, recovery, faq, includeCta = true, ...topic } = input;
  const blocks: HelpContentBlock[] = [
    { kind: 'heading', level: 2, text: 'Tujuan' },
    { kind: 'paragraph', text: intro },
  ];
  if (includeCta) {
    const label = WORKFLOW_CTA_LABELS[topic.id];
    if (!label) throw new Error(`Label CTA workflow belum dipetakan: ${topic.id}`);
    blocks.push({
      kind: 'cta',
      label,
      href: WORKFLOW_CTA_HREFS[topic.id] ?? topic.route,
      preserveSelectedChild: topic.primaryRoles.includes('ORANG_TUA') ||
        topic.assignmentContexts.includes('selected-child'),
    });
  }
  blocks.push(
    { kind: 'heading', level: 2, text: 'Langkah utama' },
    { kind: 'steps', items: steps },
    { kind: 'authority-note', text: authority },
    { kind: 'heading', level: 2, text: 'Sebelum selesai' },
    { kind: 'checklist', items: checks },
    {
      kind: 'callout',
      tone: 'warning',
      title: 'Jika proses tidak berjalan',
      text: recovery,
    },
  );
  if (faq) blocks.push({ kind: 'faq', ...faq });
  return {
    ...topic,
    permissionsAll: topic.permissionsAll ?? [],
    featureStatus: topic.featureStatus ?? 'available',
    updatedAt: '2026-08-26',
    version: '1.1',
    blocks,
  };
}

const topics: HelpTopic[] = [
  workflowTopic({
    id: 'topic.start', slug: 'mulai-di-sini', title: 'Mulai di sini',
    summary: 'Kenali konteks aktif, menu, status data, dan cara bekerja aman di DIIS.',
    route: '/dashboard', category: 'start', primaryRoles: [], positionCodes: [], permissionsAny: [], assignmentContexts: [],
    keywords: ['mulai', 'beranda', 'menu', 'konteks', 'bantuan'], screenshotIds: ['shot.start.desktop'],
    relatedTopicIds: ['topic.account-recovery'], contentOwner: 'product',
    intro: 'DIIS menyesuaikan menu dengan identitas, Appointment aktif, penugasan akademik, dan konteks keluarga Anda.',
    steps: ['Periksa label konteks aktif pada bagian atas layar.', 'Pilih tugas dari menu, bukan dari tautan yang dibagikan orang lain.', 'Baca status loading, kosong, gagal, atau berhasil sebelum melanjutkan.', 'Gunakan Bantuan kontekstual bila alur tidak sesuai harapan.'],
    checks: ['Nama dan konteks aktif sesuai.', 'Data yang terlihat sesuai tanggung jawab Anda.', 'Tidak membagikan kata sandi, kode masuk, atau data pribadi.'],
    authority: 'Mode tinjau hanya mengubah tampilan. Akses API tetap mengikuti akun asli dan selalu diperiksa server.',
    recovery: 'Muat ulang satu kali. Jika izin tetap tidak sesuai, kembali ke peran asli lalu hubungi pengelola melalui kanal resmi sekolah.',
  }),
  workflowTopic({
    id: 'topic.account-recovery', slug: 'akun-privasi-dan-pemulihan', title: 'Akun, privasi, dan pemulihan',
    summary: 'Cara masuk, menyetujui pemrosesan data, menjaga akun, dan memulihkan gangguan akses.',
    route: '/login', category: 'recovery', primaryRoles: [], positionCodes: [], permissionsAny: [], assignmentContexts: [],
    keywords: ['login', 'akun', 'password', 'consent', 'privasi', 'offline'], screenshotIds: ['shot.login.desktop'],
    relatedTopicIds: [], contentOwner: 'security',
    intro: 'Akun sekolah dan persetujuan privasi melindungi data serta menentukan ruang kerja yang dapat digunakan.',
    steps: ['Masuk melalui tombol akun sekolah.', 'Selesaikan perubahan kata sandi bila diminta layanan akun.', 'Baca dan setujui kebijakan privasi hanya untuk diri sendiri.', 'Keluar dari akun pada perangkat bersama setelah selesai.'],
    checks: ['Alamat situs resmi sekolah.', 'Tidak ada kata sandi atau kode yang dibagikan.', 'Persetujuan diberikan oleh pemilik akun yang sah.'],
    authority: 'DIIS tidak meminta pengguna memasukkan secret layanan, API key, atau credential administrator pada form biasa.',
    recovery: 'Periksa koneksi dan coba kembali. Untuk akun terkunci atau identitas keliru, gunakan kanal bantuan resmi Tata Usaha.',
    faq: { question: 'Mengapa menu saya berbeda?', answer: 'Menu mengikuti identitas stabil, Appointment aktif, penugasan, serta data yang benar-benar terhubung ke akun.' },
  }),
  workflowTopic({
    id: 'topic.academic-workspace', slug: 'ruang-akademik', title: 'Ruang Akademik',
    summary: 'Panduan mengajar, belajar, melihat perkembangan, dan menjalankan tugas akademik sesuai konteks.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['GURU', 'SISWA', 'ORANG_TUA'],
    positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'], permissionsAny: ['academic.teaching.read', 'grade.own.read', 'grade.child.read'], assignmentContexts: [],
    keywords: ['akademik', 'guru', 'siswa', 'orang tua', 'mengajar', 'belajar'], screenshotIds: ['shot.academic.desktop', 'shot.academic.mobile'],
    relatedTopicIds: ['topic.schedule', 'topic.report-card'], contentOwner: 'academic',
    intro: 'Ruang Akademik menyatukan alur pengajaran, materi, asesmen, nilai, dan perkembangan peserta didik tanpa mencampur kepemilikan data.',
    steps: ['Pastikan konteks pengajaran, siswa, atau anak yang aktif sudah benar.', 'Pilih tab tugas yang akan dilakukan.', 'Selesaikan tindakan dan tunggu konfirmasi dari server.', 'Periksa hasil terbaru sebelum menutup halaman.'],
    checks: ['Kelas, mata pelajaran, atau anak yang dipilih benar.', 'Tidak ada data milik konteks lain.', 'Status proses telah berubah sesuai tindakan.'],
    authority: 'Guru hanya mengelola penugasan sendiri. Orang tua hanya melihat anak yang terhubung. Appointment memberi jalur oversight, bukan kepemilikan pedagogis.',
    recovery: 'Ganti kembali ke konteks yang benar dan gunakan Coba lagi. Jangan mengulang submit cepat ketika status masih memproses.',
  }),
  workflowTopic({
    id: 'topic.teaching-assignment', slug: 'pengajaran-saya', title: 'Pengajaran Saya',
    summary: 'Alur khusus guru yang memiliki Teaching Assignment aktif, termasuk kelas, materi, dan penilaian.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['GURU'], positionCodes: [], permissionsAny: ['academic.teaching.read'], assignmentContexts: ['teaching-assignment'],
    keywords: ['teaching assignment', 'kelas ampuan', 'mata pelajaran', 'guru'], screenshotIds: ['shot.teacher.assignment.desktop'],
    relatedTopicIds: ['topic.module-authoring', 'topic.assessment'], contentOwner: 'academic',
    intro: 'Teaching Assignment adalah sumber authoritative untuk kelas dan mata pelajaran yang boleh dikelola guru.',
    steps: ['Buka Ruang Akademik.', 'Pilih mata pelajaran dan kelas yang tercantum pada Pengajaran Saya.', 'Gunakan data pada konteks tersebut untuk materi, kegiatan, asesmen, dan nilai.', 'Kembali ke daftar sebelum berpindah kelas.'],
    checks: ['Tahun ajaran aktif sesuai.', 'Kelas dan mata pelajaran berasal dari penugasan.', 'Perubahan tampil setelah penyimpanan berhasil.'],
    authority: 'Menerima tautan atau ID tidak memperluas akses. Server tetap mencocokkan guru dengan Teaching Assignment aktif.',
    recovery: 'Jika penugasan yang sah tidak muncul, jangan memilih kelas lain. Minta Tata Usaha memeriksa penugasan aktif.',
  }),
  workflowTopic({
    id: 'topic.wali-class', slug: 'wali-kelas-dan-rapor-kelas', title: 'Wali Kelas dan Rapor Kelas',
    summary: 'Panduan khusus wali kelas untuk memeriksa kelengkapan dan mendistribusikan Rapor.',
    route: '/dashboard/rapor', category: 'task', primaryRoles: ['GURU'], positionCodes: [], permissionsAny: ['report.read'], assignmentContexts: ['wali-kelas'],
    keywords: ['wali kelas', 'rapor kelas', 'distribusi', 'kelengkapan'], screenshotIds: ['shot.wali.report.desktop'],
    relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Wali kelas bekerja pada kelas yang terhubung secara resmi, memeriksa snapshot Rapor, lalu mendistribusikannya ketika lengkap.',
    steps: ['Pilih kelas wali yang tersedia.', 'Periksa kelengkapan nilai dan catatan.', 'Tinjau snapshot sebelum distribusi.', 'Distribusikan dan baca status handoff notifikasi.'],
    checks: ['Kelas wali benar.', 'Periode aktif benar.', 'Snapshot lengkap dan status distribusi tercatat.'],
    authority: 'Status Guru saja tidak cukup; kelas harus tercatat sebagai kelas wali pengguna aktif.',
    recovery: 'Jika kelas wali tidak tampil, jangan menggunakan filter kelas lain. Minta pemeriksaan relasi wali kelas.',
  }),
  workflowTopic({
    id: 'topic.schedule', slug: 'jadwal-dan-sesi-kelas', title: 'Jadwal dan Sesi Kelas',
    summary: 'Membaca jadwal authoritative serta menjalankan sesi kelas sesuai waktu dan penugasan.',
    route: '/dashboard/jadwal', category: 'feature', primaryRoles: ['GURU', 'SISWA', 'ORANG_TUA', 'TATA_USAHA'],
    positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'], permissionsAny: ['academic.schedule.read'], assignmentContexts: [],
    keywords: ['jadwal', 'sesi kelas', 'jp', 'ruang', 'guru'], screenshotIds: ['shot.schedule.desktop'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Jadwal menampilkan periode aktif dan menjadi sumber waktu untuk sesi kelas operasional.',
    steps: ['Pilih hari atau filter yang diizinkan.', 'Periksa kelas, guru, mata pelajaran, ruang, dan jam pelajaran.', 'Mulai atau kelola sesi hanya dari jadwal yang menjadi tanggung jawab Anda.', 'Pastikan status sesi berubah sebelum meninggalkan halaman.'],
    checks: ['Periode dan hari sesuai.', 'Tidak ada bentrok yang belum diselesaikan.', 'Status sesi berasal dari server.'],
    authority: 'Penjadwalan dan sesi mengikuti permission serta Teaching Assignment; filter tidak boleh memperluas scope.',
    recovery: 'Jika periode aktif tidak tersedia, halaman harus tetap read-only. Hubungi pengelola periode sebelum membuat jadwal.',
  }),
  workflowTopic({
    id: 'topic.module-authoring', slug: 'modul-ajar-dan-lms', title: 'Modul Ajar dan LMS',
    summary: 'Membuat draft, memakai bantuan AI secara terstruktur, mereview, menerbitkan, dan memantau modul.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['GURU'], positionCodes: ['WAKA_KURIKULUM', 'KEPALA_SEKOLAH', 'KAPROG'],
    permissionsAny: ['rpp.own.manage', 'rpp.curriculum.review', 'rpp.final.approve', 'rpp.read'], assignmentContexts: [],
    keywords: ['modul ajar', 'rpp', 'lms', 'ai', 'publish', 'review'], screenshotIds: ['shot.module.desktop'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Modul Ajar dimulai sebagai draft guru. AI hanya mengusulkan bagian terstruktur; guru tetap memeriksa dan menyimpan hasil.',
    steps: ['Pilih penugasan dan sumber TP yang benar.', 'Buat atau buka kembali draft yang sama.', 'Tinjau seluruh usulan AI sebelum menerima.', 'Simpan, kirim review, lalu terbitkan LMS melalui alur yang tersedia.'],
    checks: ['CP tetap authoritative.', 'Tidak ada data pribadi pada prompt AI.', 'Status draft/review/publish sesuai.', 'Daftar LMS segera mencerminkan tindakan.'],
    authority: 'Guru mengelola miliknya; reviewer Appointment mengikuti jalur approval tanpa mengambil alih kepemilikan draft.',
    recovery: 'Jika provider gagal, draft tersimpan harus tetap utuh. Coba lagi setelah status provider pulih; jangan membuat draft duplikat.',
  }),
  workflowTopic({
    id: 'topic.assessment', slug: 'bank-soal-dan-asesmen', title: 'Bank Soal dan Asesmen',
    summary: 'Membuat soal, meninjau draft AI, menyusun sesi, dan melakukan koreksi sebagai guru.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['GURU'], positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'],
    permissionsAny: ['lms.own.manage', 'lms.progress.manage'], assignmentContexts: [],
    keywords: ['bank soal', 'asesmen', 'koreksi', 'ai', 'gradebook'], screenshotIds: ['shot.assessment.desktop'], relatedTopicIds: ['topic.remedial'], contentOwner: 'academic',
    intro: 'Bank Soal memisahkan draft AI dari soal canonical. Sesi asesmen memakai konteks authoritative dan respons yang dapat dilanjutkan.',
    steps: ['Pilih Teaching Assignment dan TP authoritative.', 'Tinjau, edit, terima, atau tolak draft soal.', 'Susun sesi dan peserta yang benar.', 'Pantau pengiriman respons.', 'Nilai bagian manual lalu periksa Gradebook.'],
    checks: ['Soal diterima guru sebelum canonical.', 'Peserta dan tenggat benar.', 'Sesi dan nilai tidak terduplikasi.'],
    authority: 'Akses berbasis resource tetap dicek server; ID sesi atau soal dari guru lain tidak dapat digunakan.',
    recovery: 'Bila provider gagal, jumlah soal canonical tidak berubah. Pulihkan provider lalu ulangi dari draft yang teridentifikasi.',
  }),
  workflowTopic({
    id: 'topic.assessment-student', slug: 'mengerjakan-asesmen', title: 'Mengerjakan Asesmen',
    summary: 'Membuka sesi yang ditugaskan, melanjutkan respons, dan mengirim jawaban secara aman.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['SISWA'], positionCodes: [],
    permissionsAny: ['lms.read'], assignmentContexts: [],
    keywords: ['asesmen', 'ujian', 'jawaban', 'kirim', 'lanjutkan'], screenshotIds: ['shot.assessment.mobile'], relatedTopicIds: ['topic.remedial-student'], contentOwner: 'academic',
    intro: 'Siswa hanya melihat sesi yang ditugaskan kepadanya. Jawaban tersimpan pada respons sendiri dan dapat dilanjutkan selama sesi masih tersedia.',
    steps: ['Buka Ruang Akademik dan pilih asesmen yang tersedia.', 'Periksa mata pelajaran, tenggat, serta petunjuk.', 'Jawab setiap soal dan periksa kembali.', 'Kirim satu kali lalu tunggu konfirmasi selesai.'],
    checks: ['Nama asesmen dan tenggat benar.', 'Semua jawaban yang diwajibkan sudah terisi.', 'Status menunjukkan respons telah dikirim.'],
    authority: 'Siswa tidak dapat melihat kunci, rubrik internal, respons peserta lain, atau sesi yang tidak ditugaskan kepadanya.',
    recovery: 'Jika koneksi terputus, kembali ke sesi yang sama. Jangan membuka banyak tab atau menekan Kirim berulang kali ketika proses masih berjalan.',
  }),
  workflowTopic({
    id: 'topic.remedial', slug: 'remedial', title: 'Remedial',
    summary: 'Menetapkan peserta, memantau sesi, dan memfinalisasi hasil remedial sebagai guru pemilik.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['GURU'], positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM'],
    permissionsAny: ['academic.remedial.manage', 'academic.remedial.read'], assignmentContexts: [],
    keywords: ['remedial', 'kktp', 'perbaikan nilai', 'finalisasi'], screenshotIds: ['shot.remedial.desktop'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Remedial memakai nilai sumber, snapshot KKTP, peserta, dan lineage retry yang tersimpan agar hasil tidak menimpa data baru secara diam-diam.',
    steps: ['Pilih kandidat dari Teaching Assignment aktif.', 'Periksa nilai sumber dan KKTP authoritative.', 'Aktifkan sesi yang sudah siap.', 'Periksa hasil lalu finalisasi keputusan guru.'],
    checks: ['Nilai sumber belum berubah sejak penugasan.', 'Nilai tidak diturunkan.', 'Status peserta dan retry lineage benar.'],
    authority: 'Keputusan pedagogis tetap milik guru pemilik. Appointment dan Super Admin hanya memiliki oversight baca.',
    recovery: 'Jika nilai sumber berubah, proses berhenti dengan konflik. Tinjau nilai terbaru lalu buat keputusan baru.',
  }),
  workflowTopic({
    id: 'topic.remedial-student', slug: 'remedial-siswa', title: 'Remedial Siswa',
    summary: 'Melihat penugasan remedial sendiri, mengikuti sesi, dan memeriksa status hasil.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['SISWA'], positionCodes: [],
    permissionsAny: ['remedial.own.read'], assignmentContexts: [],
    keywords: ['remedial siswa', 'kktp', 'perbaikan nilai', 'hasil'], screenshotIds: ['shot.remedial.student.mobile'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Penugasan remedial menampilkan sesi milik siswa dan status proses tanpa membuka kunci atau rubrik internal.',
    steps: ['Buka bagian Remedial di Ruang Akademik.', 'Periksa mata pelajaran, tenggat, dan petunjuk.', 'Kerjakan sesi yang tersedia.', 'Kembali untuk membaca status hasil setelah guru memfinalisasi.'],
    checks: ['Penugasan adalah milik Anda.', 'Tenggat belum lewat.', 'Status pengiriman atau hasil sudah diperbarui.'],
    authority: 'Siswa hanya dapat membaca dan mengerjakan remedial yang ditugaskan kepadanya.',
    recovery: 'Jika sesi tidak tersedia, periksa status dan tenggat. Hubungi guru mata pelajaran tanpa membagikan credential akun.',
  }),
  workflowTopic({
    id: 'topic.remedial-family', slug: 'status-remedial-anak', title: 'Status Remedial Anak',
    summary: 'Memeriksa status remedial anak terpilih tanpa melihat materi soal atau data anak lain.',
    route: '/dashboard/akademik', category: 'task', primaryRoles: ['ORANG_TUA'], positionCodes: [],
    permissionsAny: ['remedial.child.read'], assignmentContexts: ['selected-child'],
    keywords: ['remedial anak', 'orang tua', 'status', 'kktp'], screenshotIds: ['shot.remedial.family.mobile'], relatedTopicIds: ['topic.report-card'], contentOwner: 'academic',
    intro: 'Orang tua menerima proyeksi status yang aman untuk anak yang sedang dipilih, tanpa soal, jawaban, rubrik, atau nilai internal.',
    steps: ['Pilih anak pada pemilih konteks.', 'Buka bagian Remedial.', 'Periksa mata pelajaran, tenggat, dan status.', 'Ganti anak melalui pemilih konteks sebelum membaca data anak lain.'],
    checks: ['Nama anak yang dipilih benar.', 'Tidak ada materi soal atau metadata internal.', 'Status sesuai proses terbaru.'],
    authority: 'Hubungan keluarga diverifikasi server. Mengubah parameter anak tidak memperluas akses.',
    recovery: 'Jika status tidak tampil, periksa anak yang dipilih lalu gunakan Coba lagi. Hubungi sekolah bila relasi keluarga belum benar.',
  }),
  workflowTopic({
    id: 'topic.report-card', slug: 'rapor-resmi', title: 'Rapor Resmi',
    summary: 'Membaca snapshot Rapor resmi, status distribusi, dan notifikasi untuk siswa atau keluarga.',
    route: '/dashboard/rapor', category: 'task', primaryRoles: ['SISWA', 'ORANG_TUA'],
    positionCodes: [], permissionsAny: ['report.read'], assignmentContexts: [],
    keywords: ['rapor', 'nilai akhir', 'distribusi', 'notifikasi', 'orang tua'], screenshotIds: ['shot.report.mobile'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Rapor resmi membaca snapshot semester yang didistribusikan, bukan menyusun dokumen semu dari nilai yang masih berubah.',
    steps: ['Buka Rapor dari menu atau notifikasi.', 'Orang tua memastikan anak yang dituju sesuai.', 'Periksa periode, status, nilai, dan catatan.', 'Gunakan tampilan cetak bila tersedia.'],
    checks: ['Periode dan pemilik Rapor benar.', 'Status menunjukkan sudah didistribusikan.', 'Tidak ada data anak lain.'],
    authority: 'Siswa hanya membaca miliknya; orang tua hanya anak terhubung; jalur internal mengikuti kelas, Appointment, dan permission.',
    recovery: 'Jika Rapor belum tersedia, periksa status distribusi. Jangan memakai tangkapan layar nilai hidup sebagai pengganti Rapor resmi.',
  }),
  workflowTopic({
    id: 'topic.report-card-operations', slug: 'operasional-rapor', title: 'Operasional Rapor',
    summary: 'Menyiapkan, meninjau, menerbitkan, dan mendistribusikan Rapor sesuai authority sekolah.',
    route: '/dashboard/rapor', category: 'governance', primaryRoles: ['GURU', 'TATA_USAHA'],
    positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'], permissionsAny: ['report.read', 'report.wali.manage', 'report.review', 'report.publish', 'report.distribute'], assignmentContexts: [],
    keywords: ['rapor kelas', 'review', 'terbitkan', 'distribusi', 'wali kelas'], screenshotIds: ['shot.wali.report.desktop'], relatedTopicIds: ['topic.wali-class'], contentOwner: 'academic',
    intro: 'Operasional Rapor menggunakan snapshot resmi dan memisahkan preparation, review, publication, serta distribution berdasarkan authority.',
    steps: ['Pilih periode dan kelas yang berada dalam scope.', 'Periksa kelengkapan snapshot.', 'Jalankan tindakan yang tersedia untuk authority Anda.', 'Baca status handoff notifikasi setelah distribusi.'],
    checks: ['Periode dan kelas benar.', 'Tidak ada blocker yang diabaikan.', 'Status terbaru berasal dari server.'],
    authority: 'Wali kelas, reviewer Appointment, Tata Usaha, dan Kepala Sekolah memperoleh tindakan yang berbeda. Oversight tidak otomatis memberi kepemilikan kelas.',
    recovery: 'Jika tindakan tidak tersedia, periksa konteks kelas dan Appointment aktif. Jangan menggunakan filter atau ID untuk memperluas scope.',
  }),
  workflowTopic({
    id: 'topic.semester-closing', slug: 'penutupan-semester', title: 'Penutupan Semester',
    summary: 'Memeriksa readiness, menutup periode secara atomik, dan membaca laporan snapshot historis.',
    route: '/dashboard/penutupan-semester', category: 'governance', primaryRoles: ['SUPER_ADMIN'], positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'],
    permissionsAny: ['academic.semester.close', 'academic.final-report.read'], assignmentContexts: [],
    keywords: ['penutupan semester', 'readiness', 'snapshot', 'csv', 'cetak'], screenshotIds: ['shot.closing.desktop'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Penutupan Semester memeriksa blocker, membuat snapshot immutable, dan berpindah periode melalui transaksi yang terkunci.',
    steps: ['Pilih periode dan baca seluruh readiness.', 'Selesaikan blocker tanpa memanipulasi data.', 'Kepala Sekolah berwenang melakukan penutupan final.', 'Buka laporan historis untuk detail, CSV, atau cetak.'],
    checks: ['Readiness hash terbaru.', 'Tidak ada blocker.', 'Periode berikutnya valid.', 'Riwayat menampilkan snapshot yang baru dibuat.'],
    authority: 'KAPROG melihat jurusan sendiri. Waka/KS mengikuti Appointment aktif. Form close hanya tampil untuk authority final yang sah.',
    recovery: 'Jika data berubah setelah readiness, sistem menolak stale hash. Muat ulang readiness dan periksa perubahan sebelum mencoba lagi.',
  }),
  workflowTopic({
    id: 'topic.student-management', slug: 'data-siswa-dan-enrollment', title: 'Data Siswa dan Enrollment',
    summary: 'Mencari siswa, memproses calon yang diterima, dan menjaga data enrollment tetap lengkap.',
    route: '/dashboard/siswa', category: 'task', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA', 'GURU'],
    positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KESISWAAN', 'KAPROG', 'GURU_BK', 'OPERATOR_DAPODIK'], permissionsAny: ['student.read'], assignmentContexts: [],
    keywords: ['siswa', 'enrollment', 'nis', 'kelas', 'orang tua', 'edit'], screenshotIds: ['shot.students.desktop'], relatedTopicIds: ['topic.ppdb'], contentOwner: 'student-affairs',
    intro: 'Data Siswa menghubungkan identitas, kelas, wali, status akun, consent, dan data operasional sesuai authority.',
    steps: ['Cari siswa dengan nama atau NIS.', 'Periksa identitas dan kelas sebelum mengubah.', 'Gunakan enrollment dari lead diterima bila relevan.', 'Simpan dan pastikan tabel menampilkan data terbaru.'],
    checks: ['NIS unik.', 'Kelas dan wali benar.', 'Akun serta consent ditampilkan jujur.', 'Tidak ada field lama yang hilang saat edit.'],
    authority: 'Akses baca/tulis mengikuti permission dan scope. Pihak industri tidak memperoleh akses ke registry siswa.',
    recovery: 'Jika data tidak terisi saat edit, batalkan penyimpanan dan muat ulang. Jangan menimpa record dengan form kosong.',
  }),
  workflowTopic({
    id: 'topic.ppdb', slug: 'ppdb-dan-spmb', title: 'PPDB dan SPMB',
    summary: 'Menerima pendaftaran, memproses pipeline, dan mendaftarkan calon sebagai siswa tanpa duplikasi.',
    route: '/dashboard/ppdb', category: 'task', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH', 'KEPALA_TU', 'WAKA_HUMAS', 'KOOR_BKK', 'KOOR_HUBIN', 'WAKIL_KOOR_HUBIN'],
    permissionsAny: ['ppdb.read'], assignmentContexts: [], keywords: ['ppdb', 'spmb', 'lead', 'diterima', 'siswa baru'],
    screenshotIds: ['shot.ppdb.desktop'], relatedTopicIds: [], contentOwner: 'student-affairs',
    intro: 'SPMB menyimpan pendaftaran publik secara idempotent; dashboard memproses status hingga enrollment siswa.',
    steps: ['Cari lead dan periksa data pendaftaran.', 'Ubah status sesuai tindak lanjut nyata.', 'Saat diterima, buka enrollment dan verifikasi NIS, kelas, wali, serta consent.', 'Pastikan lead terhubung ke siswa yang dibuat.'],
    checks: ['Tidak ada lead duplikat.', 'Kelas wajib atau status penempatan eksplisit.', 'Data kontak ternormalisasi.', 'Enrollment tidak dapat diulang dari lead sama.'],
    authority: 'Pendaftaran publik tidak menandakan siswa sudah diterima. Keputusan dan enrollment berada pada petugas yang berwenang.',
    recovery: 'Untuk konflik idempotency, mulai pendaftaran baru melalui aksi resmi. Jangan mengubah key di penyimpanan browser secara manual.',
  }),
  workflowTopic({
    id: 'topic.class-config', slug: 'kelas-mapel-dan-penugasan', title: 'Kelas, Mata Pelajaran, dan Penugasan',
    summary: 'Menyiapkan struktur akademik yang menjadi dasar jadwal, pengajaran, asesmen, dan Rapor.',
    route: '/dashboard/kelas', category: 'governance', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'],
    permissionsAny: ['academic.class.read', 'academic.teaching.read'], assignmentContexts: [], keywords: ['kelas', 'mapel', 'penugasan', 'guru'],
    screenshotIds: ['shot.class-config.desktop'], relatedTopicIds: [], contentOwner: 'academic',
    intro: 'Kelas, mata pelajaran, dan Teaching Assignment harus konsisten sebelum workflow akademik lain digunakan.',
    steps: ['Periksa tahun ajaran aktif.', 'Kelola mata pelajaran dan kelas sesuai struktur sekolah.', 'Tetapkan Teaching Assignment exact untuk guru, kelas, dan mapel.', 'Verifikasi hasil melalui ruang akademik guru.'],
    checks: ['Tidak ada kode duplikat.', 'Jurusan dan tingkat kelas tepat.', 'Penugasan berada pada tahun aktif.'],
    authority: 'KAPROG hanya membaca atau mengelola scope jurusannya sesuai permission; filter lintas jurusan tidak memperluas akses.',
    recovery: 'Jika kombinasi sudah ada, gunakan record existing. Jangan membuat duplikat untuk melewati konflik.',
  }),
  workflowTopic({
    id: 'topic.calendar', slug: 'kalender-dan-agenda', title: 'Kalender dan Agenda Sekolah',
    summary: 'Mengelola agenda yang selalu terikat tahun ajaran aktif dan tetap fail-closed saat periode bermasalah.',
    route: '/dashboard/kalender', category: 'feature', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['academic.period.read', 'academic.period.manage'], assignmentContexts: [], keywords: ['kalender', 'agenda', 'tahun ajaran', 'libur'],
    screenshotIds: ['shot.calendar.desktop'], relatedTopicIds: [], contentOwner: 'administration',
    intro: 'Agenda sekolah selalu dibaca dalam scope tahun ajaran aktif agar data antarperiode tidak tercampur.',
    steps: ['Pastikan label tahun ajaran aktif tersedia.', 'Cari atau pilih agenda pada tahun tersebut.', 'Tambah, ubah, atau hapus hanya ketika mode kelola tersedia.', 'Periksa hasil pada kalender.'],
    checks: ['Scope tahun terlihat.', 'Tanggal mulai dan selesai valid.', 'State read-only tidak menawarkan aksi mutasi.'],
    authority: 'Jika tahun aktif tidak dapat diperoleh, kalender tidak mengambil agenda tanpa scope dan seluruh mutasi dikunci.',
    recovery: 'Gunakan Coba lagi pada error periode. Jangan menambah agenda sampai status tahun aktif pulih.',
  }),
  workflowTopic({
    id: 'topic.finance', slug: 'keuangan-dan-spp', title: 'Keuangan dan SPP',
    summary: 'Mencatat pembayaran, membaca status keluarga, dan mengirim bukti tanpa mencampur kewenangan.',
    route: '/dashboard/keuangan', category: 'task', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA', 'SISWA', 'ORANG_TUA'], positionCodes: ['KEPALA_SEKOLAH', 'KEPALA_TU', 'BENDAHARA'],
    permissionsAny: ['finance.read', 'finance.create', 'finance.own.read', 'finance.child.read'], assignmentContexts: [], keywords: ['keuangan', 'spp', 'pembayaran', 'bukti'],
    screenshotIds: ['shot.finance.desktop', 'shot.finance.mobile'], relatedTopicIds: [], contentOwner: 'finance',
    intro: 'Keuangan memisahkan pencatatan petugas, oversight Appointment, serta tampilan milik siswa atau anak.',
    steps: ['Pilih kelas atau siswa sesuai kewenangan.', 'Periksa periode dan jumlah.', 'Catat pembayaran sekali dan tunggu konfirmasi.', 'Periksa status bukti serta notifikasi.'],
    checks: ['Nomor penerima ternormalisasi.', 'Pencatatan tidak terduplikasi.', 'Konteks anak benar.'],
    authority: 'Bendahara dan Kepala TU berasal dari Appointment aktif. Permission pencatatan resmi adalah finance.create.',
    recovery: 'Jika handoff notifikasi tertunda, pembayaran tetap mengikuti state server. Jangan mencatat ulang transaksi yang sudah berhasil.',
  }),
  workflowTopic({
    id: 'topic.announcements', slug: 'pengumuman-dan-notifikasi', title: 'Pengumuman dan Notifikasi',
    summary: 'Membuat pengumuman terjadwal serta menerima notifikasi in-app, push, dan kanal tambahan secara jujur.',
    route: '/dashboard/pengumuman', category: 'feature', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA', 'SISWA', 'ORANG_TUA', 'INDUSTRI'],
    positionCodes: ['KEPALA_SEKOLAH', 'WAKA_KESISWAAN', 'WAKA_HUMAS', 'WAKA_SARPRAS', 'KOOR_BKK', 'KOOR_HUBIN'], permissionsAny: ['announcement.read', 'announcement.manage'], assignmentContexts: [],
    keywords: ['pengumuman', 'notifikasi', 'push', 'jadwal'], screenshotIds: ['shot.announcement.mobile'], relatedTopicIds: [], contentOwner: 'administration',
    intro: 'Pengumuman memiliki audience dan jadwal yang disiapkan secara durable; notifikasi menunjukkan status handoff sebenarnya.',
    steps: ['Pilih audience yang sah.', 'Isi konten dan jadwal.', 'Tinjau sebelum publikasi.', 'Penerima membuka pusat notifikasi dan mengikuti tautan yang aman.'],
    checks: ['Audience benar.', 'Konten final tidak berubah setelah prepared.', 'Tautan tetap same-origin.', 'Permission browser dijelaskan jujur.'],
    authority: 'Kepala Sekolah ditentukan dari Appointment aktif, bukan role identitas lama. Penerima hanya melihat informasi yang ditujukan kepadanya.',
    recovery: 'Jika push gagal, periksa pusat notifikasi in-app. Pengiriman pending_recovery tidak boleh ditampilkan sebagai sudah terkirim.',
  }),
  workflowTopic({
    id: 'topic.career-industry', slug: 'karier-industri-dan-lowongan', title: 'Karier, Industri, dan Lowongan',
    summary: 'Status jujur modul karier yang masih disiapkan serta batas data bagi siswa dan mitra industri.',
    route: '/dashboard/lowongan', category: 'feature', primaryRoles: ['SISWA', 'INDUSTRI'], positionCodes: [],
    permissionsAny: [], assignmentContexts: [], featureStatus: 'unavailable', keywords: ['industri', 'lowongan', 'bkk', 'hubin', 'karier'], screenshotIds: ['shot.industry.desktop'], relatedTopicIds: [], contentOwner: 'student-affairs',
    intro: 'Modul karier, BKK, dan PKL belum memiliki workflow operasional lengkap pada baseline ini. Halaman hanya menunjukkan status pengembangan.',
    steps: ['Buka halaman untuk melihat status ketersediaan.', 'Jangan mengirim data pribadi melalui jalur di luar DIIS.', 'Gunakan kanal sekolah resmi untuk kebutuhan yang belum tersedia di aplikasi.'],
    checks: ['Tidak ada CTA yang menjanjikan workflow belum tersedia.', 'Industri tidak memperoleh akses Data Siswa.', 'Tidak ada data atau peluang simulasi.'],
    authority: 'Siswa dan industri hanya melihat status modul. Appointment BKK/Hubin tidak dianggap memiliki workflow digital sebelum source benar-benar tersedia.',
    recovery: 'Bila membutuhkan layanan sebelum modul tersedia, gunakan prosedur operasional sekolah yang telah disahkan.',
  }),
  workflowTopic({
    id: 'topic.teacher-attendance', slug: 'presensi-guru', title: 'Presensi Guru',
    summary: 'Mencatat dan membaca kehadiran guru melalui perangkat serta jalur operasional yang resmi.',
    route: '/dashboard/presensi-guru', category: 'task', primaryRoles: ['GURU', 'SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['teacher.attendance.read'], assignmentContexts: [], keywords: ['presensi guru', 'kehadiran', 'kiosk'], screenshotIds: ['shot.teacher-attendance.desktop'], relatedTopicIds: [], contentOwner: 'administration',
    intro: 'Presensi Guru memisahkan pencatatan personal, oversight, dan perangkat kiosk yang memiliki credential terkelola.',
    steps: ['Buka halaman dari akun sendiri atau perangkat resmi.', 'Periksa tanggal dan status.', 'Lakukan pencatatan satu kali.', 'Pastikan status terbaru terlihat.'],
    checks: ['Tanggal WIB benar.', 'Credential perangkat masih berlaku.', 'Tidak memakai token dari query string.'],
    authority: 'Akun dan perangkat diverifikasi server. Kode atau tautan saja tidak cukup untuk memperoleh akses.',
    recovery: 'Jika perangkat tidak aktif, gunakan perangkat resmi lain atau minta operator merotasi credential.',
  }),
  workflowTopic({
    id: 'topic.ai-assistant', slug: 'asisten-ai-dan-pengetahuan', title: 'Asisten AI dan Basis Pengetahuan',
    summary: 'Menggunakan AI dengan konteks terkontrol, menjaga PII lokal, dan memahami status provider.',
    route: '/dashboard/ai', category: 'feature', primaryRoles: ['GURU', 'SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['ai.chat', 'ai.knowledge.read'], assignmentContexts: [], keywords: ['ai', 'chat', 'openai', 'ollama', 'knowledge'], screenshotIds: ['shot.ai.desktop'], relatedTopicIds: [], contentOwner: 'product',
    intro: 'Asisten AI memakai OpenAI sebagai provider utama dan Ollama sebagai fallback terkontrol; PII tetap diproses lokal.',
    steps: ['Pilih konteks yang diperlukan saja.', 'Tulis pertanyaan tanpa data pribadi.', 'Periksa jawaban dan sumber yang tersedia.', 'Gunakan hasil sebagai bantuan, bukan keputusan final.'],
    checks: ['Tidak ada PII pada prompt cloud.', 'Jawaban relevan dengan konteks.', 'Status provider dan retry jujur.'],
    authority: 'AI tidak memperluas akses data. Konten dan sumber tetap mengikuti permission pengguna.',
    recovery: 'Jika provider fallback aktif, pekerjaan dapat dilanjutkan dengan kualitas yang tetap perlu ditinjau. Administrator memeriksa billing melalui prosedur secret-management.',
  }),
  workflowTopic({
    id: 'topic.monitoring', slug: 'monitoring-dan-display-sekolah', title: 'Monitoring dan Display Sekolah',
    summary: 'Memantau sesi, memasangkan display, membaca alert, dan menjaga audio serta rotasi layar tetap terpercaya.',
    route: '/dashboard/monitoring', category: 'governance', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['operational.monitoring.read'], assignmentContexts: [], keywords: ['monitoring', 'display', 'pairing', 'alert', 'audio'], screenshotIds: ['shot.monitoring.desktop', 'shot.display.1920', 'shot.display.1366'], relatedTopicIds: [], contentOwner: 'administration',
    intro: 'Monitoring menggabungkan data operasional nyata; display perangkat menggunakan pairing dan credential HttpOnly.',
    steps: ['Periksa ringkasan sesi dan alert.', 'Pasangkan display melalui kode resmi.', 'Verifikasi perangkat aktif dan data agregat.', 'Gunakan kontrol pause/play dan tes audio sebelum penggunaan ruang.'],
    checks: ['Satu tab menjadi audible leader.', 'Alert tidak replay setelah sukses.', 'Credential kedaluwarsa tidak tampil aktif.', 'Tidak ada overlap pada viewport target.'],
    authority: 'Pairing dan operasi perangkat dibatasi permission. Credential tidak boleh ditampilkan atau disalin ke dokumentasi.',
    recovery: 'Jika audio gagal, status tetap retryable. Periksa speaker, permission browser, dan leader tab sebelum mencoba lagi.',
  }),
  workflowTopic({
    id: 'topic.executive', slug: 'dasbor-eksekutif', title: 'Dasbor Eksekutif',
    summary: 'Membaca indikator sekolah sebagai oversight tanpa mengubah data sumber.',
    route: '/dashboard/executive', category: 'feature', primaryRoles: ['SUPER_ADMIN'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['finance.read'], assignmentContexts: [], keywords: ['eksekutif', 'indikator', 'tren', 'sekolah'], screenshotIds: ['shot.executive.desktop'], relatedTopicIds: [], contentOwner: 'product',
    intro: 'Dasbor Eksekutif merangkum data nyata untuk pemantauan, bukan menggantikan pemeriksaan workflow sumber.',
    steps: ['Periksa periode dan waktu pembaruan.', 'Baca indikator dan tren.', 'Buka workflow sumber untuk menindaklanjuti.', 'Catat keputusan melalui proses resmi.'],
    checks: ['Periode sesuai.', 'Data bukan simulasi.', 'Tidak menarik kesimpulan dari state kosong atau gagal.'],
    authority: 'Kepala Sekolah memperoleh akses melalui Appointment aktif; Super Admin melalui wildcard existing.',
    recovery: 'Jika indikator tidak tersedia, periksa status data sumber. Jangan menganggap nol sebagai nilai aktual ketika API gagal.',
  }),
  workflowTopic({
    id: 'topic.appointments', slug: 'appointment-dan-struktur-organisasi', title: 'Appointment dan Struktur Organisasi',
    summary: 'Memahami identitas stabil, jabatan periode, approval, lifecycle, dan batas kewenangan.',
    route: '/dashboard/struktur-organisasi', category: 'governance', primaryRoles: ['SUPER_ADMIN', 'GURU', 'TATA_USAHA'], positionCodes: [
      'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'WAKA_KESISWAAN', 'WAKA_HUMAS', 'WAKA_SARPRAS', 'KEPALA_TU', 'KAPROG', 'KOOR_BKK', 'KOOR_HUBIN', 'WAKIL_KOOR_BKK', 'WAKIL_KOOR_HUBIN', 'GURU_BK', 'BENDAHARA', 'STAF_KEPEGAWAIAN', 'OPERATOR_DAPODIK',
    ], permissionsAny: [], assignmentContexts: [], keywords: ['appointment', 'jabatan', 'struktur organisasi', 'plt', 'approval'], screenshotIds: ['shot.appointment.desktop'], relatedTopicIds: [], contentOwner: 'security',
    intro: 'Identitas akun tetap enam role. Jabatan sekolah bersifat periode dan berasal dari Appointment aktif, bukan role Keycloak.',
    steps: ['Buka registry Appointment bila berwenang.', 'Pilih tahun, posisi, kandidat, dan scope.', 'Ajukan serta setujui melalui lifecycle.', 'Aktifkan, suspend, resume, end, atau supersede sesuai kondisi.'],
    checks: ['Kandidat memiliki identitas stabil sah.', 'Scope dan tahun benar.', 'History menampilkan actor serta event yang tepat.'],
    authority: 'Kepala Sekolah tidak boleh menetapkan dirinya sendiri. Keputusan tertentu tetap Super Admin atau authority lain sesuai kontrak.',
    recovery: 'Konflik kapasitas harus diselesaikan dari state server terbaru; jangan menghapus history atau mengubah role Keycloak. Automation aktivasi Appointment harian di production belum aktif dan tetap menjadi prasyarat go-live, sehingga operator wajib mengikuti prosedur aktivasi yang disahkan sampai gate operasional tersebut ditutup.',
  }),
  workflowTopic({
    id: 'topic.system-administration', slug: 'pengguna-audit-dan-kesehatan-sistem', title: 'Pengguna, Audit, dan Kesehatan Sistem',
    summary: 'Mengelola akun stabil, consent, audit, status layanan, dan pemulihan operasional.',
    route: '/dashboard/users', category: 'governance', primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH', 'KEPALA_TU', 'STAF_KEPEGAWAIAN'],
    permissionsAny: ['user.read', 'audit.read'], assignmentContexts: [], keywords: ['pengguna', 'audit', 'consent', 'health', 'login event'], screenshotIds: ['shot.users.desktop'], relatedTopicIds: [], contentOwner: 'security',
    intro: 'Administrasi sistem menjaga identitas stabil, consent, jejak audit, dan kesehatan layanan tanpa menggunakan jabatan sebagai role akun.',
    steps: ['Cari akun dengan input yang dibatasi.', 'Pilih salah satu dari enam identitas stabil.', 'Periksa consent, login event, atau status layanan sesuai kebutuhan.', 'Lakukan koreksi melalui aksi resmi dan baca hasilnya.'],
    checks: ['Tidak memilih kode jabatan sebagai identitas.', 'Data sensitif tidak masuk log atau laporan.', 'Error API dibedakan dari data kosong.'],
    authority: 'Appointment tidak dibuat melalui halaman Users. Pengelolaan jabatan berada pada registry Appointment.',
    recovery: 'Jika layanan identitas gagal, hentikan mutasi dan periksa status. Jangan membuat schema role kedua atau mengubah realm secara manual.',
  }),
  workflowTopic({
    id: 'topic.school-period', slug: 'tahun-ajaran-dan-profil-sekolah', title: 'Tahun Ajaran dan Profil Sekolah',
    summary: 'Menjaga satu periode aktif, profil authoritative, serta konfigurasi yang dipakai seluruh workflow.',
    route: '/dashboard/tahun-ajaran', category: 'governance', primaryRoles: ['SUPER_ADMIN'], positionCodes: ['KEPALA_SEKOLAH'], permissionsAny: ['academic.period.read'], assignmentContexts: [],
    keywords: ['tahun ajaran', 'semester', 'profil sekolah', 'periode aktif'], screenshotIds: ['shot.period.desktop'], relatedTopicIds: [], contentOwner: 'administration',
    intro: 'Tahun ajaran, semester, dan profil sekolah adalah konfigurasi authoritative untuk seluruh fitur akademik dan bantuan.',
    steps: ['Periksa periode aktif sebelum mengubah konfigurasi.', 'Gunakan workflow penutupan untuk menonaktifkan semester berjalan.', 'Perbarui profil hanya melalui form resmi.', 'Verifikasi dampak pada halaman terkait.'],
    checks: ['Tepat satu tahun dan semester aktif.', 'Tanggal tidak overlap.', 'Kontak resmi tidak berupa placeholder.'],
    authority: 'Endpoint generic tidak boleh melewati workflow penutupan. Help tidak mengarang kontak jika profil belum menyediakan kanal yang disetujui.',
    recovery: 'Jika periode ambigu, hentikan operasi dan lakukan koreksi data terkontrol sebelum melanjutkan.',
  }),
  workflowTopic({
    id: 'topic.official-support', slug: 'hubungi-bantuan-resmi', title: 'Hubungi Bantuan Resmi',
    summary: 'Temukan kanal bantuan sekolah yang terverifikasi tanpa memakai nomor pribadi atau kontak placeholder.',
    route: '/dashboard/panduan', category: 'contact', primaryRoles: [], positionCodes: [], permissionsAny: [], assignmentContexts: [],
    keywords: ['bantuan', 'kontak', 'telepon', 'email', 'dukungan'], screenshotIds: [], relatedTopicIds: ['topic.account-recovery'], contentOwner: 'administration',
    intro: 'Kanal bantuan pada halaman ini dibaca langsung dari profil sekolah authoritative dan tidak disalin ke katalog statis.',
    steps: ['Periksa nama sekolah dan kanal yang tampil pada bagian Kontak resmi.', 'Sampaikan jenis kendala tanpa membagikan kata sandi, token, atau data pribadi yang tidak diperlukan.', 'Simpan nomor tiket atau waktu pelaporan bila petugas memberikannya.'],
    checks: ['Kontak berasal dari profil sekolah.', 'Tidak ada kata sandi, kode masuk, atau secret yang dibagikan.', 'Konteks masalah dijelaskan tanpa membuka data peserta didik lain.'],
    authority: 'Kanal bantuan tidak dapat mengubah izin. Perubahan akun, Appointment, penugasan, atau relasi anak tetap melalui petugas dan workflow resmi.',
    recovery: 'Jika profil belum memiliki kontak yang disetujui atau gagal dimuat, halaman berhenti secara fail-closed dan tidak menampilkan nomor alternatif yang tidak terverifikasi.',
    includeCta: false,
  }),
];

export const HELP_CATALOG = HelpCatalogSchema.parse(topics);

export const HELP_TOPIC_BY_ID = new Map(HELP_CATALOG.map((topic) => [topic.id, topic]));
export const HELP_TOPIC_BY_SLUG = new Map(HELP_CATALOG.map((topic) => [topic.slug, topic]));

export const ROUTE_TOPIC_MAP = {
  '/dashboard': 'topic.start',
  '/dashboard/ai': 'topic.ai-assistant',
  '/dashboard/akademik': 'topic.academic-workspace',
  '/dashboard/audit': 'topic.system-administration',
  '/dashboard/audit/consent': 'topic.system-administration',
  '/dashboard/audit/login-events': 'topic.system-administration',
  '/dashboard/audit/online-users': 'topic.system-administration',
  '/dashboard/executive': 'topic.executive',
  '/dashboard/health': 'topic.system-administration',
  '/dashboard/jadwal': 'topic.schedule',
  '/dashboard/kalender': 'topic.calendar',
  '/dashboard/kegiatan': 'topic.academic-workspace',
  '/dashboard/kelas': 'topic.class-config',
  '/dashboard/keuangan': 'topic.finance',
  '/dashboard/knowledge': 'topic.ai-assistant',
  '/dashboard/lowongan': 'topic.career-industry',
  '/dashboard/mapel': 'topic.class-config',
  '/dashboard/monitoring': 'topic.monitoring',
  '/dashboard/nilai': 'topic.academic-workspace',
  '/dashboard/pengumuman': 'topic.announcements',
  '/dashboard/penutupan-semester': 'topic.semester-closing',
  '/dashboard/ppdb': 'topic.ppdb',
  '/dashboard/presensi-guru': 'topic.teacher-attendance',
  '/dashboard/profil': 'topic.school-period',
  '/dashboard/rapor': 'topic.report-card',
  '/dashboard/rpp': 'topic.module-authoring',
  '/dashboard/siswa': 'topic.student-management',
  '/dashboard/struktur-organisasi': 'topic.appointments',
  '/dashboard/tahun-ajaran': 'topic.school-period',
  '/dashboard/users': 'topic.system-administration',
  '/dashboard/wa-log': 'topic.announcements',
  '/login': 'topic.account-recovery',
} as const;

export type HelpRoute = keyof typeof ROUTE_TOPIC_MAP;

export const PRIMARY_WORKFLOW_ROUTES: HelpRoute[] = Object.keys(ROUTE_TOPIC_MAP) as HelpRoute[];

export function normalizeHelpSourceRoute(value: string | null | undefined): HelpRoute | null {
  if (!value || !value.startsWith('/')) return null;
  const route = value.split(/[?#]/, 1)[0]?.replace(/\/$/, '') || '/';
  return route in ROUTE_TOPIC_MAP ? route as HelpRoute : null;
}

function assertCatalogBuildContract(): void {
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) throw new Error(`${label} Help harus unik.`);
  };
  unique(HELP_CATALOG.map((topic) => topic.id), 'ID topik');
  unique(HELP_CATALOG.map((topic) => topic.slug), 'Slug topik');

  const ids = new Set(HELP_CATALOG.map((topic) => topic.id));
  for (const topic of HELP_CATALOG) {
    for (const related of topic.relatedTopicIds) {
      if (related === topic.id || !ids.has(related)) {
        throw new Error(`Referensi topik Help tidak valid: ${topic.id} -> ${related}`);
      }
    }
    for (const block of topic.blocks) {
      if (block.kind === 'related-topic' && !ids.has(block.topicId)) {
        throw new Error(`Blok topik Help tidak valid: ${topic.id} -> ${block.topicId}`);
      }
    }
  }
  for (const [route, topicId] of Object.entries(ROUTE_TOPIC_MAP)) {
    if (!ids.has(topicId)) throw new Error(`Route Help tidak valid: ${route} -> ${topicId}`);
  }
}

assertCatalogBuildContract();
