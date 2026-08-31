import {
  HelpArtifactSchema,
  HelpDeckSchema,
  HelpScreenshotSchema,
  type HelpArtifact,
  type HelpDeck,
  type HelpScreenshot,
} from './help-schema';
import generatedAssets from './help-generated-assets.json';
import { HELP_PERSONA_GUIDES } from './help-personas';

type GeneratedScreenshotAsset = Pick<HelpScreenshot,
  | 'fileName'
  | 'sha256'
  | 'sizeBytes'
  | 'width'
  | 'height'
  | 'candidateSha'
  | 'themeManifestSha256'
  | 'capturedAt'
  | 'privacyReview'
  | 'visualReview'
>;

type GeneratedArtifactAsset = Pick<HelpArtifact,
  | 'fileName'
  | 'sha256'
  | 'sizeBytes'
  | 'pageCount'
  | 'candidateSha'
  | 'generatedAt'
  | 'privacyReview'
  | 'visualReview'
>;

const GENERATED_SCREENSHOTS = generatedAssets.screenshots as Record<string, GeneratedScreenshotAsset>;
const GENERATED_ARTIFACTS = generatedAssets.artifacts as Record<string, GeneratedArtifactAsset>;

type ScreenshotAuthorityInput = Partial<Pick<HelpScreenshot,
  | 'primaryRoles'
  | 'positionCodes'
  | 'assignmentContexts'
  | 'permissionsAny'
  | 'permissionsAll'
  | 'selectedChildRequired'
  | 'allowSuperAdminRecovery'
>>;

const ALL_PRIMARY_ROLES: HelpScreenshot['primaryRoles'] = [
  'SUPER_ADMIN', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI',
];

const PERSONA_ARTIFACT_NAMES: Record<string, { id: string; fileName: string }> = {
  'persona.super-admin': { id: 'artifact.super-admin', fileName: 'panduan-super-admin.pdf' },
  'persona.administration': { id: 'artifact.administration', fileName: 'panduan-tata-usaha.pdf' },
  'persona.teacher': { id: 'artifact.teacher', fileName: 'panduan-guru.pdf' },
  'persona.principal': { id: 'artifact.principal', fileName: 'panduan-kepala-sekolah.pdf' },
  'persona.curriculum': { id: 'artifact.waka-kurikulum', fileName: 'panduan-waka-kurikulum.pdf' },
  'persona.student-affairs': { id: 'artifact.waka-kesiswaan', fileName: 'panduan-waka-kesiswaan.pdf' },
  'persona.public-relations': { id: 'artifact.waka-humas', fileName: 'panduan-waka-humas.pdf' },
  'persona.facilities': { id: 'artifact.waka-sarpras', fileName: 'panduan-waka-sarpras.pdf' },
  'persona.head-administration': { id: 'artifact.kepala-tu', fileName: 'panduan-kepala-tu.pdf' },
  'persona.kaprog': { id: 'artifact.kaprog', fileName: 'panduan-kaprog.pdf' },
  'persona.bkk': { id: 'artifact.koor-bkk', fileName: 'panduan-koordinator-bkk.pdf' },
  'persona.hubin': { id: 'artifact.koor-hubin', fileName: 'panduan-koordinator-hubin.pdf' },
  'persona.bkk-deputy': { id: 'artifact.wakil-bkk', fileName: 'panduan-wakil-koordinator-bkk.pdf' },
  'persona.hubin-deputy': { id: 'artifact.wakil-hubin', fileName: 'panduan-wakil-koordinator-hubin.pdf' },
  'persona.counselor': { id: 'artifact.guru-bk', fileName: 'panduan-guru-bk.pdf' },
  'persona.treasurer': { id: 'artifact.bendahara', fileName: 'panduan-bendahara.pdf' },
  'persona.hr': { id: 'artifact.staf-kepegawaian', fileName: 'panduan-staf-kepegawaian.pdf' },
  'persona.dapodik': { id: 'artifact.operator-dapodik', fileName: 'panduan-operator-dapodik.pdf' },
  'persona.wali': { id: 'artifact.wali-kelas', fileName: 'panduan-wali-kelas.pdf' },
  'persona.assigned-teacher': { id: 'artifact.guru-assigned', fileName: 'panduan-guru-pengampu.pdf' },
  'persona.student': { id: 'artifact.student', fileName: 'panduan-siswa.pdf' },
  'persona.parent': { id: 'artifact.parent', fileName: 'panduan-orang-tua.pdf' },
  'persona.industry': { id: 'artifact.industry', fileName: 'panduan-industri.pdf' },
};

// Screenshot authority is deliberately independent from topic authority. A shared
// Help topic can reference media captured for different personas.
const SCREENSHOT_AUTHORITIES: Record<string, ScreenshotAuthorityInput> = {
  'shot.start.desktop': { primaryRoles: ALL_PRIMARY_ROLES },
  'shot.login.desktop': { primaryRoles: ALL_PRIMARY_ROLES },
  'shot.academic.desktop': { primaryRoles: ['GURU'], permissionsAny: ['academic.teaching.read'] },
  'shot.academic.mobile': { primaryRoles: ['SISWA'], permissionsAny: ['lms.read'] },
  'shot.teacher.assignment.desktop': {
    primaryRoles: ['GURU'], assignmentContexts: ['teaching-assignment'], permissionsAny: ['academic.teaching.read'],
  },
  'shot.wali.report.desktop': {
    primaryRoles: ['GURU'], assignmentContexts: ['wali-kelas'], permissionsAny: ['report.read'],
  },
  'shot.schedule.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA', 'GURU'], permissionsAny: ['academic.schedule.read'],
  },
  'shot.module.desktop': {
    primaryRoles: ['GURU'], assignmentContexts: ['teaching-assignment'], permissionsAny: ['rpp.read'],
  },
  'shot.assessment.desktop': {
    primaryRoles: ['GURU'], assignmentContexts: ['teaching-assignment'], permissionsAny: ['lms.own.manage'],
  },
  'shot.assessment.mobile': { primaryRoles: ['SISWA'], permissionsAny: ['lms.read'] },
  'shot.remedial.desktop': {
    primaryRoles: ['GURU'], assignmentContexts: ['teaching-assignment'], permissionsAny: ['academic.remedial.read'],
  },
  'shot.remedial.student.mobile': { primaryRoles: ['SISWA'], permissionsAny: ['remedial.own.read'] },
  'shot.remedial.family.mobile': {
    primaryRoles: ['ORANG_TUA'], assignmentContexts: ['selected-child'], permissionsAny: ['remedial.child.read'],
    selectedChildRequired: true,
  },
  'shot.report.mobile': {
    primaryRoles: ['ORANG_TUA'], assignmentContexts: ['selected-child'], permissionsAny: ['report.read'],
    selectedChildRequired: true,
  },
  'shot.report.student.mobile': { primaryRoles: ['SISWA'], permissionsAny: ['report.read'] },
  'shot.report.oversight.desktop': {
    primaryRoles: ['SUPER_ADMIN'], positionCodes: ['KEPALA_SEKOLAH'], permissionsAny: ['report.read'],
  },
  'shot.closing.desktop': {
    positionCodes: ['KEPALA_SEKOLAH'], permissionsAny: ['academic.final-report.read'],
  },
  'shot.students.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], permissionsAny: ['student.read'],
  },
  'shot.ppdb.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], permissionsAny: ['ppdb.read'],
  },
  'shot.class-config.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], permissionsAny: ['academic.teaching.read'],
  },
  'shot.calendar.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['academic.period.read'],
  },
  'shot.finance.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH', 'BENDAHARA'],
    permissionsAny: ['finance.read'],
  },
  'shot.finance.mobile': {
    primaryRoles: ['ORANG_TUA'], assignmentContexts: ['selected-child'], permissionsAny: ['finance.child.read'],
    selectedChildRequired: true,
  },
  'shot.announcement.mobile': { primaryRoles: ['SISWA'], permissionsAny: ['announcement.read'] },
  'shot.announcement.staff.desktop': {
    positionCodes: ['WAKA_KESISWAAN', 'WAKA_HUMAS', 'WAKA_SARPRAS'],
    permissionsAny: ['announcement.read'],
  },
  'shot.industry.desktop': { primaryRoles: ['INDUSTRI'] },
  'shot.teacher-attendance.desktop': {
    primaryRoles: ['GURU'], permissionsAny: ['teacher.attendance.read'],
  },
  'shot.ai.desktop': { primaryRoles: ['GURU'], permissionsAny: ['ai.chat'] },
  'shot.monitoring.desktop': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['operational.monitoring.read'],
  },
  'shot.display.1920': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['operational.monitoring.read'],
  },
  'shot.display.1366': {
    primaryRoles: ['SUPER_ADMIN', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'],
    permissionsAny: ['operational.monitoring.read'],
  },
  'shot.executive.desktop': {
    positionCodes: ['KEPALA_SEKOLAH'], permissionsAny: ['finance.read'],
  },
  'shot.appointment.desktop': { primaryRoles: ['SUPER_ADMIN'] },
  'shot.appointment.self.desktop': {
    positionCodes: ['KOOR_BKK', 'KOOR_HUBIN', 'WAKIL_KOOR_BKK', 'WAKIL_KOOR_HUBIN'],
  },
  'shot.users.desktop': { primaryRoles: ['SUPER_ADMIN'], permissionsAny: ['user.read'] },
  'shot.users.hr.desktop': { positionCodes: ['STAF_KEPEGAWAIAN'], permissionsAny: ['user.read'] },
  'shot.students.student-affairs.desktop': {
    positionCodes: ['WAKA_KESISWAAN', 'GURU_BK'], permissionsAny: ['student.read'],
  },
  'shot.ppdb.public-relations.desktop': {
    positionCodes: ['WAKA_HUMAS'], permissionsAny: ['ppdb.read'],
  },
  'shot.class-config.leadership.desktop': {
    positionCodes: ['WAKA_KURIKULUM', 'KAPROG'], permissionsAny: ['academic.teaching.read'],
  },
  'shot.period.desktop': { primaryRoles: ['SUPER_ADMIN'], permissionsAny: ['academic.period.read'] },
};

const SCREENSHOT_CONSUMERS: Record<string, string[]> = {
  'shot.start.desktop': [
    'artifact.complete', ...Object.values(PERSONA_ARTIFACT_NAMES).map((item) => item.id),
    'deck.foundation', 'deck.internal', 'deck.student', 'deck.family',
  ],
  'shot.login.desktop': [
    'artifact.complete', ...Object.values(PERSONA_ARTIFACT_NAMES).map((item) => item.id),
    'deck.foundation', 'deck.internal', 'deck.student', 'deck.family',
  ],
  'shot.academic.desktop': ['artifact.complete', 'artifact.teacher', 'artifact.guru-assigned'],
  'shot.academic.mobile': ['artifact.complete', 'artifact.student', 'deck.student'],
  'shot.teacher.assignment.desktop': ['artifact.complete', 'artifact.guru-assigned'],
  'shot.wali.report.desktop': ['artifact.complete', 'artifact.wali-kelas'],
  'shot.schedule.desktop': ['artifact.complete', 'artifact.teacher', 'artifact.administration', 'deck.internal'],
  'shot.module.desktop': ['artifact.complete', 'artifact.guru-assigned'],
  'shot.assessment.desktop': ['artifact.complete', 'artifact.guru-assigned'],
  'shot.assessment.mobile': ['artifact.complete', 'artifact.student', 'deck.student'],
  'shot.remedial.desktop': ['artifact.complete', 'artifact.guru-assigned'],
  'shot.remedial.student.mobile': ['artifact.complete', 'artifact.student'],
  'shot.remedial.family.mobile': ['artifact.complete', 'artifact.parent', 'deck.family'],
  'shot.report.mobile': ['artifact.complete', 'artifact.parent', 'deck.family'],
  'shot.report.student.mobile': ['artifact.complete', 'artifact.student', 'deck.student'],
  'shot.report.oversight.desktop': ['artifact.complete', 'deck.foundation'],
  'shot.closing.desktop': ['artifact.complete', 'artifact.principal', 'deck.foundation'],
  'shot.students.desktop': ['artifact.complete', 'artifact.administration', 'artifact.operator-dapodik'],
  'shot.ppdb.desktop': ['artifact.complete', 'artifact.administration'],
  'shot.class-config.desktop': ['artifact.complete', 'artifact.administration'],
  'shot.calendar.desktop': ['artifact.complete', 'artifact.administration', 'artifact.principal'],
  'shot.finance.desktop': ['artifact.complete', 'artifact.administration', 'artifact.kepala-tu', 'artifact.bendahara', 'artifact.principal'],
  'shot.finance.mobile': ['artifact.complete', 'artifact.parent', 'deck.family'],
  'shot.announcement.mobile': ['artifact.complete', 'artifact.student'],
  'shot.announcement.staff.desktop': [
    'artifact.complete', 'artifact.waka-kesiswaan', 'artifact.waka-humas', 'artifact.waka-sarpras',
  ],
  'shot.industry.desktop': ['artifact.complete', 'artifact.industry', 'deck.family'],
  'shot.teacher-attendance.desktop': ['artifact.complete', 'artifact.teacher'],
  'shot.ai.desktop': ['artifact.complete', 'artifact.teacher'],
  'shot.monitoring.desktop': ['artifact.complete', 'artifact.administration', 'artifact.principal', 'deck.foundation'],
  'shot.display.1920': ['artifact.complete', 'artifact.administration', 'artifact.principal', 'deck.foundation'],
  'shot.display.1366': ['artifact.complete', 'artifact.administration', 'artifact.principal', 'deck.foundation'],
  'shot.executive.desktop': ['artifact.complete', 'artifact.principal', 'deck.foundation'],
  'shot.appointment.desktop': ['artifact.complete', 'artifact.super-admin'],
  'shot.appointment.self.desktop': [
    'artifact.complete', 'artifact.koor-bkk', 'artifact.koor-hubin', 'artifact.wakil-bkk', 'artifact.wakil-hubin',
  ],
  'shot.users.desktop': ['artifact.complete', 'artifact.super-admin'],
  'shot.users.hr.desktop': ['artifact.complete', 'artifact.staf-kepegawaian'],
  'shot.students.student-affairs.desktop': ['artifact.complete', 'artifact.waka-kesiswaan', 'artifact.guru-bk'],
  'shot.ppdb.public-relations.desktop': ['artifact.complete', 'artifact.waka-humas'],
  'shot.class-config.leadership.desktop': ['artifact.complete', 'artifact.waka-kurikulum', 'artifact.kaprog'],
  'shot.period.desktop': ['artifact.complete', 'artifact.super-admin'],
};

const screenshotInputs: Array<[
  string,
  string,
  string,
  string,
  HelpScreenshot['viewport'],
  string,
]> = [
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
  ['shot.report.student.mobile', 'topic.report-card', '/dashboard/rapor', 'student', 'mobile-390x844', 'official student report'],
  ['shot.report.oversight.desktop', 'topic.report-card-operations', '/dashboard/rapor', 'report oversight', 'desktop-1440x900', 'official report operations'],
  ['shot.closing.desktop', 'topic.semester-closing', '/dashboard/penutupan-semester', 'active principal', 'desktop-1440x900', 'readiness and history'],
  ['shot.students.desktop', 'topic.student-management', '/dashboard/siswa', 'administration', 'desktop-1440x900', 'student registry'],
  ['shot.ppdb.desktop', 'topic.ppdb', '/dashboard/ppdb', 'administration', 'desktop-1440x900', 'admission pipeline'],
  ['shot.class-config.desktop', 'topic.class-config', '/dashboard/kelas', 'administration', 'desktop-1440x900', 'class configuration'],
  ['shot.calendar.desktop', 'topic.calendar', '/dashboard/kalender', 'administration', 'desktop-1440x900', 'active-year calendar'],
  ['shot.finance.desktop', 'topic.finance', '/dashboard/keuangan', 'administration', 'desktop-1440x900', 'finance operations'],
  ['shot.finance.mobile', 'topic.finance', '/dashboard/keuangan', 'parent', 'mobile-390x844', 'family finance'],
  ['shot.announcement.mobile', 'topic.announcements', '/dashboard/akademik', 'learner', 'mobile-390x844', 'notification center'],
  ['shot.announcement.staff.desktop', 'topic.announcements', '/dashboard/pengumuman', 'appointment announcement manager', 'desktop-1440x900', 'announcement registry'],
  ['shot.industry.desktop', 'topic.career-industry', '/dashboard/lowongan', 'industry', 'desktop-1440x900', 'honest unavailable state'],
  ['shot.teacher-attendance.desktop', 'topic.teacher-attendance', '/dashboard/presensi-guru', 'teacher', 'desktop-1440x900', 'teacher attendance'],
  ['shot.ai.desktop', 'topic.ai-assistant', '/dashboard/ai', 'teacher', 'desktop-1440x900', 'AI assistant'],
  ['shot.monitoring.desktop', 'topic.monitoring', '/dashboard/monitoring', 'super admin', 'desktop-1440x900', 'operational monitoring'],
  ['shot.display.1920', 'topic.monitoring', '/display/room', 'authorized room display', 'display-1920x1080', 'room display on 43-inch screen'],
  ['shot.display.1366', 'topic.monitoring', '/display/room', 'authorized room display', 'display-1366x768', 'room display on compact screen'],
  ['shot.executive.desktop', 'topic.executive', '/dashboard/executive', 'active principal', 'desktop-1440x900', 'executive dashboard'],
  ['shot.appointment.desktop', 'topic.appointments', '/dashboard/struktur-organisasi', 'super admin', 'desktop-1440x900', 'appointment registry'],
  ['shot.appointment.self.desktop', 'topic.appointments', '/dashboard', 'appointment holder', 'desktop-1440x900', 'role-aware home with active appointment identity'],
  ['shot.users.desktop', 'topic.system-administration', '/dashboard/users', 'super admin', 'desktop-1440x900', 'user administration'],
  ['shot.users.hr.desktop', 'topic.system-administration', '/dashboard/users', 'staff administration', 'desktop-1440x900', 'user registry read view'],
  ['shot.students.student-affairs.desktop', 'topic.student-management', '/dashboard/siswa', 'student affairs', 'desktop-1440x900', 'student registry oversight'],
  ['shot.ppdb.public-relations.desktop', 'topic.ppdb', '/dashboard/ppdb', 'public relations', 'desktop-1440x900', 'admission pipeline oversight'],
  ['shot.class-config.leadership.desktop', 'topic.class-config', '/dashboard/kelas', 'academic leadership', 'desktop-1440x900', 'class configuration oversight'],
  ['shot.period.desktop', 'topic.school-period', '/dashboard/tahun-ajaran', 'super admin', 'desktop-1440x900', 'active period'],
];

export const HELP_SCREENSHOTS: HelpScreenshot[] = screenshotInputs.map(([id, topicId, route, persona, viewport, state]) => {
  const generated = GENERATED_SCREENSHOTS[id];
  return HelpScreenshotSchema.parse({
  id,
  topicId,
  route,
  persona,
  context: persona,
  viewport,
  state,
  caption: `${state} pada ${route}`,
  altText: state,
  ...SCREENSHOT_AUTHORITIES[id],
  allowSuperAdminRecovery: SCREENSHOT_AUTHORITIES[id]?.allowSuperAdminRecovery ?? true,
  consumers: SCREENSHOT_CONSUMERS[id] ?? ['artifact.complete'],
  redactionRules: [
    'Gunakan fixture sintetis tanpa PII.',
    'Jangan tangkap kata sandi, credential sementara, pairing code, token, cookie, atau secret.',
    'Jangan tangkap email, nomor telepon, alamat, NIS, NISN, data kesehatan, nilai individual, atau data keuangan individual.',
    'Hapus metadata gambar dan pastikan nama file tidak membawa identitas pengguna.',
  ],
  required: true,
  assetStatus: generated ? 'ready' : 'pending',
  fileName: generated?.fileName ?? null,
  sha256: generated?.sha256 ?? null,
  sizeBytes: generated?.sizeBytes ?? null,
  width: generated?.width ?? null,
  height: generated?.height ?? null,
  sourceKind: id === 'shot.login.desktop' ? 'shared-auth' : 'application',
  candidateSha: generated?.candidateSha ?? null,
  themeManifestSha256: generated?.themeManifestSha256 ?? null,
  capturedAt: generated?.capturedAt ?? null,
  privacyReview: generated?.privacyReview ?? 'pending',
  visualReview: generated?.visualReview ?? 'pending',
  });
});

const ARTIFACT_REQUIRED_PERMISSIONS: Record<string, string[]> = {
  'artifact.administration': [
    'academic.period.read', 'academic.schedule.read', 'academic.teaching.read', 'finance.read',
    'operational.monitoring.read', 'ppdb.read', 'student.read',
  ],
  'artifact.teacher': ['academic.schedule.read', 'academic.teaching.read', 'ai.chat', 'teacher.attendance.read'],
  'artifact.principal': [
    'academic.final-report.read', 'academic.period.read', 'finance.read', 'operational.monitoring.read',
  ],
  'artifact.waka-kurikulum': ['academic.teaching.read'],
  'artifact.waka-kesiswaan': ['announcement.read', 'student.read'],
  'artifact.waka-humas': ['announcement.read', 'ppdb.read'],
  'artifact.waka-sarpras': ['announcement.read'],
  'artifact.kaprog': ['academic.teaching.read'],
  'artifact.guru-bk': ['student.read'],
  'artifact.staf-kepegawaian': ['user.read'],
  'artifact.kepala-tu': ['finance.read'],
  'artifact.bendahara': ['finance.read'],
  'artifact.operator-dapodik': ['student.read'],
  'artifact.wali-kelas': ['report.read'],
  'artifact.guru-assigned': ['academic.remedial.read', 'academic.teaching.read', 'lms.own.manage', 'rpp.read'],
  'artifact.student': ['announcement.read', 'lms.read', 'remedial.own.read', 'report.read'],
  'artifact.parent': ['finance.child.read', 'remedial.child.read', 'report.read'],
};

const artifactInputs = [
  {
    id: 'artifact.complete', label: 'Panduan Lengkap DIIS', fileName: 'panduan-lengkap-diis.pdf',
    topicIds: Array.from(new Set([
      ...screenshotInputs.map(([, topicId]) => topicId),
      'topic.official-support',
    ])), primaryRoles: ['SUPER_ADMIN'], positionCodes: [],
    assignmentContexts: [], permissionsAny: [], permissionsAll: [],
    selectedChildRequired: false, allowSuperAdminRecovery: true,
  },
  ...HELP_PERSONA_GUIDES.map((persona) => {
    const names = PERSONA_ARTIFACT_NAMES[persona.id];
    if (!names) throw new Error(`Artifact persona belum dipetakan: ${persona.id}`);
    const positionBound = persona.positionCodes.length > 0;
    return {
      ...names,
      label: `Panduan ${persona.label}`,
      topicIds: persona.topicIds,
      primaryRoles: positionBound ? [] : persona.primaryRoles,
      positionCodes: persona.positionCodes,
      assignmentContexts: persona.context ? [persona.context] : [],
      permissionsAny: [],
      permissionsAll: ARTIFACT_REQUIRED_PERMISSIONS[names.id] ?? [],
      selectedChildRequired: persona.context === 'selected-child',
      allowSuperAdminRecovery: persona.id === 'persona.super-admin',
    };
  }),
];

export const HELP_ARTIFACTS: HelpArtifact[] = artifactInputs.map((input) => {
  const generated = GENERATED_ARTIFACTS[input.id];
  return HelpArtifactSchema.parse({
    ...input,
    fileName: generated?.fileName ?? input.fileName,
    contentType: 'application/pdf',
    status: generated ? 'ready' : 'pending',
    sha256: generated?.sha256 ?? null,
    sizeBytes: generated?.sizeBytes ?? null,
    pageCount: generated?.pageCount ?? null,
    language: 'id-ID',
    version: '2.0',
    candidateSha: generated?.candidateSha ?? null,
    generatedAt: generated?.generatedAt ?? null,
    privacyReview: generated?.privacyReview ?? 'pending',
    visualReview: generated?.visualReview ?? 'pending',
    assignmentContexts: input.assignmentContexts,
    permissionsAll: input.permissionsAll ?? [],
    selectedChildRequired: input.selectedChildRequired,
    allowSuperAdminRecovery: input.allowSuperAdminRecovery,
  });
});

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

export const HELP_DECK_CONTENT_MAP: HelpDeck[] = [
  {
    id: 'deck.foundation', audience: 'Yayasan, Komite, dan pimpinan sekolah',
    topicIds: ['topic.start', 'topic.executive', 'topic.report-card-operations', 'topic.semester-closing'],
    primaryRoles: ['SUPER_ADMIN'], positionCodes: ['KEPALA_SEKOLAH'], assignmentContexts: [],
    permissionsAny: [], permissionsAll: ['academic.final-report.read', 'finance.read', 'operational.monitoring.read', 'report.read'],
    selectedChildRequired: false, allowSuperAdminRecovery: true,
  },
  {
    id: 'deck.internal', audience: 'Kepala Sekolah, Tata Usaha, dan Guru',
    topicIds: ['topic.start', 'topic.schedule'],
    primaryRoles: ['GURU', 'TATA_USAHA'], positionCodes: ['KEPALA_SEKOLAH'], assignmentContexts: [],
    permissionsAny: [], permissionsAll: ['academic.schedule.read'],
    selectedChildRequired: false, allowSuperAdminRecovery: true,
  },
  {
    id: 'deck.student', audience: 'Siswa',
    topicIds: ['topic.start', 'topic.academic-workspace', 'topic.assessment-student', 'topic.report-card'],
    primaryRoles: ['SISWA'], positionCodes: [], assignmentContexts: [], permissionsAny: [],
    permissionsAll: ['lms.read', 'report.read'],
    selectedChildRequired: false, allowSuperAdminRecovery: true,
  },
  {
    id: 'deck.family', audience: 'Orang Tua dan Industri',
    topicIds: [
      'topic.start', 'topic.report-card', 'topic.finance', 'topic.remedial-family', 'topic.career-industry',
    ],
    // Deck eksternal dipresentasikan oleh fasilitator internal. Otorisasi ini mencegah
    // satu audience eksternal menerima screenshot workflow audience eksternal lainnya.
    primaryRoles: ['SUPER_ADMIN'], positionCodes: [], assignmentContexts: [],
    permissionsAny: [], permissionsAll: [],
    selectedChildRequired: false, allowSuperAdminRecovery: true,
  },
].map((deck) => HelpDeckSchema.parse(deck));
