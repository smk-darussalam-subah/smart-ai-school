import { HelpArtifactSchema, HelpScreenshotSchema, type HelpArtifact, type HelpScreenshot } from './help-schema';

export const HELP_SCREENSHOTS: HelpScreenshot[] = [
  ['shot.start.desktop', 'topic.start', '/dashboard', 'internal', 'desktop-1440x900', 'role-aware home'],
  ['shot.login.desktop', 'topic.account-recovery', '/login', 'public-safe', 'desktop-1440x900', 'login recovery'],
  ['shot.academic.desktop', 'topic.academic-workspace', '/dashboard/akademik', 'teacher', 'desktop-1440x900', 'academic workspace'],
  ['shot.academic.mobile', 'topic.academic-workspace', '/dashboard/akademik', 'student', 'mobile-390x844', 'learner workspace'],
  ['shot.teacher.assignment.desktop', 'topic.teaching-assignment', '/dashboard/akademik', 'assigned teacher', 'desktop-1440x900', 'teaching context'],
  ['shot.wali.report.desktop', 'topic.wali-class', '/dashboard/rapor', 'wali kelas', 'desktop-1440x900', 'class report'],
  ['shot.schedule.desktop', 'topic.schedule', '/dashboard/jadwal', 'internal', 'desktop-1440x900', 'active schedule'],
  ['shot.module.desktop', 'topic.module-authoring', '/dashboard/akademik', 'teacher', 'desktop-1440x900', 'module authoring'],
  ['shot.assessment.desktop', 'topic.assessment', '/dashboard/akademik', 'teacher', 'desktop-1440x900', 'question bank'],
  ['shot.assessment.mobile', 'topic.assessment-student', '/dashboard/akademik', 'student', 'mobile-390x844', 'assessment attempt'],
  ['shot.remedial.desktop', 'topic.remedial', '/dashboard/akademik', 'teacher', 'desktop-1440x900', 'remedial workflow'],
  ['shot.remedial.student.mobile', 'topic.remedial-student', '/dashboard/akademik', 'student', 'mobile-390x844', 'student remedial status'],
  ['shot.remedial.family.mobile', 'topic.remedial-family', '/dashboard/akademik', 'parent selected child', 'mobile-390x844', 'family remedial status'],
  ['shot.report.mobile', 'topic.report-card', '/dashboard/rapor', 'parent multi-child', 'mobile-390x844', 'official report'],
  ['shot.closing.desktop', 'topic.semester-closing', '/dashboard/penutupan-semester', 'active principal', 'desktop-1440x900', 'readiness and history'],
  ['shot.students.desktop', 'topic.student-management', '/dashboard/siswa', 'administration', 'desktop-1440x900', 'student registry'],
  ['shot.ppdb.desktop', 'topic.ppdb', '/dashboard/ppdb', 'administration', 'desktop-1440x900', 'admission pipeline'],
  ['shot.class-config.desktop', 'topic.class-config', '/dashboard/kelas', 'administration', 'desktop-1440x900', 'class configuration'],
  ['shot.calendar.desktop', 'topic.calendar', '/dashboard/kalender', 'administration', 'desktop-1440x900', 'active-year calendar'],
  ['shot.finance.desktop', 'topic.finance', '/dashboard/keuangan', 'administration', 'desktop-1440x900', 'finance operations'],
  ['shot.finance.mobile', 'topic.finance', '/dashboard/keuangan', 'parent', 'mobile-390x844', 'family finance'],
  ['shot.announcement.mobile', 'topic.announcements', '/dashboard/akademik', 'learner', 'mobile-390x844', 'notification center'],
  ['shot.industry.desktop', 'topic.career-industry', '/dashboard/lowongan', 'industry', 'desktop-1440x900', 'honest unavailable state'],
  ['shot.teacher-attendance.desktop', 'topic.teacher-attendance', '/dashboard/presensi-guru', 'teacher', 'desktop-1440x900', 'teacher attendance'],
  ['shot.ai.desktop', 'topic.ai-assistant', '/dashboard/ai', 'teacher', 'desktop-1440x900', 'AI assistant'],
  ['shot.monitoring.desktop', 'topic.monitoring', '/dashboard/monitoring', 'super admin', 'desktop-1440x900', 'operational monitoring'],
  ['shot.executive.desktop', 'topic.executive', '/dashboard/executive', 'active principal', 'desktop-1440x900', 'executive dashboard'],
  ['shot.appointment.desktop', 'topic.appointments', '/dashboard/struktur-organisasi', 'super admin', 'desktop-1440x900', 'appointment registry'],
  ['shot.users.desktop', 'topic.system-administration', '/dashboard/users', 'super admin', 'desktop-1440x900', 'user administration'],
  ['shot.period.desktop', 'topic.school-period', '/dashboard/tahun-ajaran', 'super admin', 'desktop-1440x900', 'active period'],
].map(([id, topicId, route, persona, viewport, state]) => HelpScreenshotSchema.parse({
  id,
  topicId,
  route,
  persona,
  context: persona,
  viewport,
  state,
  caption: `${state} pada ${route}`,
  consumers: ['artifact.complete'],
  redactionRules: [
    'Gunakan fixture sintetis tanpa PII.',
    'Jangan tangkap kata sandi, credential sementara, pairing code, token, cookie, atau secret.',
  ],
  required: true,
  assetStatus: 'pending',
  fileName: null,
  sha256: null,
  candidateSha: null,
  capturedAt: null,
}));

const artifactInputs = [
  {
    id: 'artifact.complete', label: 'Panduan Lengkap DIIS', fileName: 'panduan-lengkap-diis.pdf',
    topicIds: ['topic.system-administration'], primaryRoles: ['TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['student.read', 'academic.final-report.read'], allowSuperAdminRecovery: true,
  },
  {
    id: 'artifact.super-admin', label: 'Panduan Super Admin', fileName: 'panduan-super-admin.pdf',
    topicIds: ['topic.system-administration'], primaryRoles: ['SUPER_ADMIN'], positionCodes: [],
    permissionsAny: [], allowSuperAdminRecovery: true,
  },
  {
    id: 'artifact.administration', label: 'Panduan Tata Usaha', fileName: 'panduan-tata-usaha.pdf',
    topicIds: ['topic.class-config'], primaryRoles: ['TATA_USAHA'], positionCodes: [],
    permissionsAny: ['academic.teaching.read', 'student.read'],
  },
  {
    id: 'artifact.teacher', label: 'Panduan Guru', fileName: 'panduan-guru.pdf',
    topicIds: ['topic.teaching-assignment'], primaryRoles: ['GURU'], positionCodes: [],
    assignmentContexts: ['teaching-assignment'], permissionsAny: ['academic.teaching.read'],
  },
  {
    id: 'artifact.principal', label: 'Panduan Kepala Sekolah', fileName: 'panduan-kepala-sekolah.pdf',
    topicIds: ['topic.executive'], primaryRoles: [], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['academic.final-report.read', 'finance.read'],
  },
  {
    id: 'artifact.curriculum', label: 'Panduan Waka Kurikulum dan Kaprog', fileName: 'panduan-kurikulum-kaprog.pdf',
    topicIds: ['topic.semester-closing'], primaryRoles: [], positionCodes: ['WAKA_KURIKULUM', 'KAPROG'],
    permissionsAny: ['academic.final-report.read', 'rpp.read'],
  },
  {
    id: 'artifact.student-affairs', label: 'Panduan Kesiswaan, Humas, BKK, dan Hubin', fileName: 'panduan-kesiswaan-humas-bkk-hubin.pdf',
    topicIds: ['topic.student-management'], primaryRoles: [],
    positionCodes: ['WAKA_KESISWAAN', 'WAKA_HUMAS', 'KOOR_BKK', 'KOOR_HUBIN', 'WAKIL_KOOR_BKK', 'WAKIL_KOOR_HUBIN'],
    permissionsAny: ['student.read', 'announcement.read', 'ppdb.read'],
  },
  {
    id: 'artifact.student', label: 'Panduan Siswa', fileName: 'panduan-siswa.pdf',
    topicIds: ['topic.academic-workspace'], primaryRoles: ['SISWA'], positionCodes: [], permissionsAny: ['lms.read'],
  },
  {
    id: 'artifact.parent', label: 'Panduan Orang Tua', fileName: 'panduan-orang-tua.pdf',
    topicIds: ['topic.report-card'], primaryRoles: ['ORANG_TUA'], positionCodes: [], permissionsAny: ['report.read'],
    assignmentContexts: ['selected-child'], selectedChildRequired: true,
  },
  {
    id: 'artifact.industry', label: 'Panduan Industri', fileName: 'panduan-industri.pdf',
    topicIds: ['topic.career-industry'], primaryRoles: ['INDUSTRI'], positionCodes: [], permissionsAny: [],
  },
] as const;

export const HELP_ARTIFACTS: HelpArtifact[] = artifactInputs.map((input) => HelpArtifactSchema.parse({
  ...input,
  contentType: 'application/pdf',
  status: 'pending',
  assignmentContexts: 'assignmentContexts' in input ? input.assignmentContexts : [],
  permissionsAll: [],
  selectedChildRequired: 'selectedChildRequired' in input ? input.selectedChildRequired : false,
  allowSuperAdminRecovery: 'allowSuperAdminRecovery' in input ? input.allowSuperAdminRecovery : false,
}));

const WAVE9_REPORT = 'docs/audits/WAVE9-ADOPTION-UI-READINESS-HELP-IMPLEMENTATION-2026-08-26.md';
const WAVE3_REPORT = 'docs/audits/WAVE3-AI-FINAL-STAGING-EVIDENCE-2026-08-06.md';
const WAVE4_REPORT = 'docs/audits/WAVE4-PHASE3-ASSESSMENT-RUNTIME-QUESTION-BANK-REVIEW-2026-08-03.md';
const WAVE5_REPORT = 'docs/audits/WAVE5-PHASE4-CONTINUOUS-OPERATIONS-STAGING-QA-2026-08-15.md';
const WAVE6_REPORT = 'docs/audits/WAVE6-PHASE5-REPORT-CARD-COMPLETION-FINAL-STAGING-APPROVAL-2026-08-20.md';
const WAVE7_REPORT = 'docs/audits/WAVE7-PHASE6-SEMESTER-CLOSING-FINAL-STAGING-SIGNOFF-2026-08-22.md';
const WAVE8_REPORT = 'docs/audits/WAVE8-CROSS-PHASE-OPERATIONAL-TRUST-STAGING-REVIEW-2026-08-24.md';
const WAVE85_REPORT = 'docs/audits/WAVE8-5-ROLE-BASED-UIUX-MONITORING-SOURCE-REVIEW-2026-08-24.md';

export const HELP_CLAIM_SOURCE_LEDGER = [
  { claimId: 'claim.start', topicId: 'topic.start', claim: 'Navigasi mengikuti authority server dan fail-closed ketika izin tidak dapat diperiksa.', ui: 'AppShell dan Sidebar', actionApi: 'GET /auth/me dan GET /positions/my-positions', service: 'resolveDashboardAuthority', stateAudit: 'permissionCheckAvailable', source: 'apps/web/src/lib/dashboard-authority.ts', test: 'apps/web/src/__tests__/dashboard-authority.test.ts', report: WAVE8_REPORT },
  { claimId: 'claim.account-recovery', topicId: 'topic.account-recovery', claim: 'Pemulihan akun tidak meminta credential administrator atau secret aplikasi.', ui: 'Login dan Bantuan Masuk', actionApi: 'OIDC sign-in dan school profile', service: 'Keycloak login theme dan LoginHelpPage', stateAudit: 'session redirect reason', source: 'apps/web/src/app/login/page.tsx', test: 'apps/web/src/__tests__/keycloak-theme.test.ts', report: WAVE9_REPORT },
  { claimId: 'claim.academic-workspace', topicId: 'topic.academic-workspace', claim: 'Ruang Akademik memproyeksikan workspace sesuai persona dan resource ownership.', ui: 'Akademik role workspace', actionApi: 'GET /students/my-children dan endpoint akademik persona', service: 'Akademik page authority', stateAudit: 'selected child dan assignment context', source: 'apps/web/src/app/dashboard/akademik/page.tsx', test: 'apps/web/src/__tests__/academic-operational-ui.test.ts', report: WAVE5_REPORT },
  { claimId: 'claim.teaching-assignment', topicId: 'topic.teaching-assignment', claim: 'Guru dibatasi ke Teaching Assignment aktif miliknya.', ui: 'Akademik Pengajaran Saya', actionApi: 'GET /teaching-assignments', service: 'TeachingAssignmentService.findAll', stateAudit: 'teacherId dan academicYear aktif', source: 'apps/api/src/teaching-assignment/teaching-assignment.service.ts', test: 'apps/api/src/__tests__/teaching-assignment.spec.ts', report: WAVE4_REPORT },
  { claimId: 'claim.wali-class', topicId: 'topic.wali-class', claim: 'Operasional Rapor wali kelas dibatasi ke relasi kelas wali yang authoritative.', ui: 'Rapor kelas wali', actionApi: 'GET dan POST /report-cards', service: 'ReportCardsService', stateAudit: 'class teacher ownership dan snapshot', source: 'apps/api/src/report-cards/report-cards.service.ts', test: 'apps/api/src/__tests__/report-cards-activities.spec.ts', report: WAVE6_REPORT },
  { claimId: 'claim.schedule', topicId: 'topic.schedule', claim: 'Sesi kelas berasal dari jadwal authoritative dan memiliki lifecycle server.', ui: 'Jadwal dan sesi kelas', actionApi: 'class session endpoints', service: 'ClassSessionService', stateAudit: 'ClassSession status dan alert ledger', source: 'apps/api/src/class-sessions/class-session.service.ts', test: 'apps/api/src/__tests__/wave8-5-class-session.spec.ts', report: WAVE85_REPORT },
  { claimId: 'claim.module-authoring', topicId: 'topic.module-authoring', claim: 'AI Modul Ajar mempertahankan draft dan memvalidasi output terstruktur sebelum disimpan.', ui: 'Modul Ajar dan LMS', actionApi: 'POST /ai/generate-rpp-step', service: 'AiGenerateService', stateAudit: 'AiGeneration provider dan status', source: 'apps/api/src/ai/ai-generate.service.ts', test: 'apps/api/src/__tests__/ai-generate.spec.ts', report: WAVE3_REPORT },
  { claimId: 'claim.assessment', topicId: 'topic.assessment', claim: 'Guru meninjau draft soal sebelum canonical Question dibuat.', ui: 'Bank Soal dan Session Studio', actionApi: 'assessment authoring endpoints', service: 'AssessmentService', stateAudit: 'AI draft lease dan accepted item provenance', source: 'apps/api/src/assessment/assessment.service.ts', test: 'apps/api/src/__tests__/assessment-u2.spec.ts', report: WAVE4_REPORT },
  { claimId: 'claim.assessment-student', topicId: 'topic.assessment-student', claim: 'Siswa hanya mengerjakan sesi yang ditugaskan dan kunci jawaban tidak diproyeksikan.', ui: 'Assessment student workspace', actionApi: 'assessment submission endpoints', service: 'AssessmentService', stateAudit: 'AssessmentResponse dan timer state', source: 'apps/api/src/assessment/assessment.service.ts', test: 'apps/api/src/__tests__/assessment-u2.spec.ts', report: WAVE4_REPORT },
  { claimId: 'claim.remedial', topicId: 'topic.remedial', claim: 'Guru pemilik Teaching Assignment mengelola remedial dengan snapshot Grade dan KKTP.', ui: 'Remedial guru', actionApi: 'remedial endpoints', service: 'AssessmentService remedial lifecycle', stateAudit: 'RemedialParticipant dan source Grade snapshot', source: 'apps/api/src/assessment/assessment.service.ts', test: 'apps/api/src/__tests__/assessment-u2.spec.ts', report: WAVE5_REPORT },
  { claimId: 'claim.remedial-student', topicId: 'topic.remedial-student', claim: 'Siswa hanya melihat dan mengerjakan remedial miliknya.', ui: 'Remedial siswa', actionApi: 'own remedial endpoints', service: 'AssessmentService student projection', stateAudit: 'participant-bound response', source: 'apps/api/src/assessment/assessment.service.ts', test: 'apps/api/src/__tests__/assessment-u2.spec.ts', report: WAVE5_REPORT },
  { claimId: 'claim.remedial-family', topicId: 'topic.remedial-family', claim: 'Orang tua menerima status remedial anak terpilih tanpa materi soal atau nilai internal.', ui: 'OrtuWorkspace remedial', actionApi: 'family remedial endpoint', service: 'AssessmentService family projection', stateAudit: 'selected-child ownership', source: 'apps/web/src/app/dashboard/akademik/_components/ortu/RemedialOrtu.tsx', test: 'apps/web/src/__tests__/academic-operational-ui.test.ts', report: WAVE5_REPORT },
  { claimId: 'claim.report-card', topicId: 'topic.report-card', claim: 'Rapor resmi menggunakan snapshot distribusi dan relasi siswa atau anak yang sah.', ui: 'Rapor siswa dan orang tua', actionApi: 'GET /report-cards', service: 'ReportCardsService', stateAudit: 'ReportCard snapshot dan distribution state', source: 'apps/api/src/report-cards/report-cards.service.ts', test: 'apps/api/src/__tests__/report-cards-activities.spec.ts', report: WAVE6_REPORT },
  { claimId: 'claim.report-card-operations', topicId: 'topic.report-card-operations', claim: 'Distribusi Rapor menyimpan intent notifikasi durable dan status recovery yang jujur.', ui: 'Operasional Rapor', actionApi: 'report-card distribution endpoint', service: 'ReportCardsService', stateAudit: 'NotificationLog queued atau pending_recovery', source: 'apps/api/src/report-cards/report-cards.service.ts', test: 'apps/api/src/__tests__/report-cards-activities.spec.ts', report: WAVE6_REPORT },
  { claimId: 'claim.semester-closing', topicId: 'topic.semester-closing', claim: 'Penutupan menghasilkan snapshot immutable dan pergantian periode atomik.', ui: 'Penutupan Semester', actionApi: 'POST /semester-closing/close', service: 'SemesterClosingService.close', stateAudit: 'SemesterClosure readiness hash dan snapshot', source: 'apps/api/src/semester-closing/semester-closing.service.ts', test: 'apps/api/src/__tests__/semester-closing.spec.ts', report: WAVE7_REPORT },
  { claimId: 'claim.student-management', topicId: 'topic.student-management', claim: 'Registry siswa menjaga ownership keluarga, kelas, akun, dan status consent.', ui: 'Data Siswa', actionApi: 'student endpoints', service: 'StudentService', stateAudit: 'Student dan parent relation', source: 'apps/api/src/student/student.service.ts', test: 'apps/api/src/__tests__/student.spec.ts', report: WAVE5_REPORT },
  { claimId: 'claim.ppdb', topicId: 'topic.ppdb', claim: 'SPMB idempotent dan enrollment lead diterima tidak boleh digandakan.', ui: 'PPDB pipeline', actionApi: 'PPDB submit dan enrollment endpoints', service: 'PpdbService', stateAudit: 'fingerprint, lead status, dan student link', source: 'apps/api/src/ppdb/ppdb.service.ts', test: 'apps/api/src/__tests__/ppdb.spec.ts', report: 'docs/audits/PPDB-SPMB-2027-2028-V2-INTAKE-DOCUMENT-STORAGE-REMEDIATION-2026-07-19.md' },
  { claimId: 'claim.class-config', topicId: 'topic.class-config', claim: 'Kelas dan Teaching Assignment dibaca sesuai periode serta scope authority.', ui: 'Manajemen Kelas', actionApi: 'classes, majors, dan teaching assignments', service: 'TeachingAssignmentService', stateAudit: 'academic year dan major scope', source: 'apps/api/src/teaching-assignment/teaching-assignment.service.ts', test: 'apps/api/src/__tests__/teaching-assignment.spec.ts', report: WAVE8_REPORT },
  { claimId: 'claim.calendar', topicId: 'topic.calendar', claim: 'Agenda selalu dibaca dalam scope tahun ajaran aktif dan mutasi fail-closed saat periode gagal.', ui: 'Kalender dan Agenda', actionApi: 'school calendar endpoints', service: 'SchoolConfigService calendar', stateAudit: 'academicYearId pada CalendarEvent', source: 'apps/api/src/school-config/school-config.service.ts', test: 'apps/api/src/__tests__/school-config.spec.ts', report: WAVE8_REPORT },
  { claimId: 'claim.finance', topicId: 'topic.finance', claim: 'Pencatatan SPP memakai finance.create dan notifikasi menormalisasi penerima.', ui: 'Keuangan dan SPP', actionApi: 'finance endpoints', service: 'FinanceService', stateAudit: 'payment idempotency dan NotificationLog', source: 'apps/api/src/finance/finance.service.ts', test: 'apps/api/src/__tests__/finance.spec.ts', report: WAVE5_REPORT },
  { claimId: 'claim.announcements', topicId: 'topic.announcements', claim: 'Pengumuman terjadwal membuat notification intent durable untuk audience yang sah.', ui: 'Pengumuman dan pusat notifikasi', actionApi: 'announcement endpoints', service: 'AnnouncementsService', stateAudit: 'deliveryPreparedAt dan NotificationLog', source: 'apps/api/src/announcements/announcements.service.ts', test: 'apps/api/src/__tests__/announcements.spec.ts', report: WAVE5_REPORT },
  { claimId: 'claim.career-industry', topicId: 'topic.career-industry', claim: 'Modul karier ditandai belum tersedia dan tidak menampilkan data simulasi.', ui: 'Lowongan honest unavailable state', actionApi: 'tidak ada mutation operasional', service: 'Lowongan page unavailable state', stateAudit: 'featureStatus unavailable', source: 'apps/web/src/app/dashboard/lowongan/page.tsx', test: 'apps/web/src/__tests__/help-system.test.ts', report: WAVE9_REPORT },
  { claimId: 'claim.teacher-attendance', topicId: 'topic.teacher-attendance', claim: 'Presensi guru memvalidasi akun atau credential perangkat tanpa query token.', ui: 'Presensi Guru', actionApi: 'teacher attendance endpoints', service: 'TeacherAttendanceService', stateAudit: 'attendance record dan device credential', source: 'apps/api/src/teacher-attendance/teacher-attendance.service.ts', test: 'apps/api/src/__tests__/teacher-attendance.spec.ts', report: WAVE85_REPORT },
  { claimId: 'claim.ai-assistant', topicId: 'topic.ai-assistant', claim: 'AI memakai provider terkontrol, fallback tercatat, dan PII tetap local-only.', ui: 'Asisten AI', actionApi: 'AI chat dan generation endpoints', service: 'AiGenerateService', stateAudit: 'provider circuit dan generation ledger', source: 'apps/api/src/ai/ai-generate.service.ts', test: 'apps/api/src/__tests__/ai-generate.spec.ts', report: WAVE3_REPORT },
  { claimId: 'claim.monitoring', topicId: 'topic.monitoring', claim: 'Monitoring dan display mengelola pairing, rotasi, dan audio completion tanpa replay.', ui: 'Monitoring dan RoomDisplay', actionApi: 'pairing, summary, dan alert SSE', service: 'OperationalMonitoringService', stateAudit: 'display credential dan PLAYED setelah onend', source: 'apps/api/src/operational-monitoring/operational-monitoring.service.ts', test: 'apps/web/src/__tests__/wave8-5-monitoring.test.ts', report: WAVE85_REPORT },
  { claimId: 'claim.executive', topicId: 'topic.executive', claim: 'Dasbor eksekutif hanya menyajikan agregat dari sumber server yang berhasil dimuat.', ui: 'Dasbor Eksekutif', actionApi: 'executive summary endpoints', service: 'Executive dashboard server actions', stateAudit: 'loading, error, dan aggregate state', source: 'apps/web/src/app/dashboard/executive/page.tsx', test: 'apps/web/src/__tests__/wave8-5-monitoring.test.ts', report: WAVE85_REPORT },
  { claimId: 'claim.appointments', topicId: 'topic.appointments', claim: 'Enam identity role stabil dipisahkan dari Appointment period-bound.', ui: 'Struktur Organisasi', actionApi: 'appointment lifecycle endpoints', service: 'AppointmentsService', stateAudit: 'Appointment ACTIVE dan history', source: 'apps/api/src/appointments/appointments.service.ts', test: 'apps/api/src/__tests__/appointments.spec.ts', report: 'docs/audits/WAVE8-PRIMARY-ROLE-AUTH-MOCK-FOLLOWUP-REREVIEW-2026-08-24.md' },
  { claimId: 'claim.system-administration', topicId: 'topic.system-administration', claim: 'Administrasi akun hanya menerima enam primary role canonical.', ui: 'Manajemen Pengguna', actionApi: 'users dan provisioning endpoints', service: 'UsersService', stateAudit: 'stable role dan audit log', source: 'apps/api/src/users/users.service.ts', test: 'apps/api/src/__tests__/users.spec.ts', report: 'docs/audits/WAVE8-PRIMARY-ROLE-AUTH-MOCK-FOLLOWUP-REREVIEW-2026-08-24.md' },
  { claimId: 'claim.school-period', topicId: 'topic.school-period', claim: 'Tepat satu tahun dan semester aktif menjadi sumber periode aplikasi.', ui: 'Tahun Ajaran dan Profil Sekolah', actionApi: 'school configuration endpoints', service: 'SchoolConfigService', stateAudit: 'AcademicYear dan Semester active constraint', source: 'apps/api/src/school-config/school-config.service.ts', test: 'apps/api/src/__tests__/school-config.spec.ts', report: WAVE7_REPORT },
  { claimId: 'claim.official-support', topicId: 'topic.official-support', claim: 'Kontak bantuan hanya dibaca dari profil sekolah authoritative.', ui: 'Hubungi Bantuan Resmi', actionApi: 'GET /school/profile', service: 'SchoolConfigController.getProfile', stateAudit: 'SchoolProfile approved fields', source: 'apps/api/src/school-config/school-config.controller.ts', test: 'apps/api/src/__tests__/school-config.spec.ts', report: WAVE9_REPORT },
] as const;

export const HELP_GLOSSARY = [
  { term: 'Identity role', definition: 'Peran akun stabil: Super Admin, Tata Usaha, Guru, Siswa, Orang Tua, atau Industri.' },
  { term: 'Appointment', definition: 'Jabatan sekolah berbatas periode, scope, approval, dan lifecycle.' },
  { term: 'Teaching Assignment', definition: 'Penugasan exact guru, kelas, mata pelajaran, dan tahun ajaran.' },
  { term: 'Wali Kelas', definition: 'Guru yang terhubung resmi sebagai wali suatu kelas.' },
  { term: 'KKTP', definition: 'Kriteria ketercapaian tujuan pembelajaran beserta provenance yang digunakan.' },
  { term: 'Snapshot', definition: 'Salinan immutable dari keadaan final untuk pelaporan historis.' },
  { term: 'Mode tinjau', definition: 'Penyempitan tampilan ke persona yang dimiliki; authority API tetap akun asli.' },
  { term: 'PII', definition: 'Data pribadi yang harus dibatasi, disamarkan, dan tidak dikirim ke provider cloud tanpa dasar.' },
] as const;

export const HELP_DECK_CONTENT_MAP = [
  { id: 'deck.foundation', audience: 'Yayasan dan Komite', topicIds: ['topic.start', 'topic.executive', 'topic.report-card', 'topic.semester-closing'] },
  { id: 'deck.internal', audience: 'Kepala Sekolah, Tata Usaha, dan Guru', topicIds: ['topic.start', 'topic.appointments', 'topic.academic-workspace', 'topic.monitoring'] },
  { id: 'deck.student', audience: 'Siswa', topicIds: ['topic.start', 'topic.academic-workspace', 'topic.assessment-student', 'topic.report-card'] },
  { id: 'deck.family-industry', audience: 'Orang Tua dan Industri', topicIds: ['topic.start', 'topic.report-card', 'topic.finance', 'topic.career-industry'] },
] as const;
