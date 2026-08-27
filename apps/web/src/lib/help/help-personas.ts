import type { HelpPositionCode, HelpPrimaryRole } from './help-schema';

export interface HelpPersonaGuide {
  id: string;
  label: string;
  primaryRoles: HelpPrimaryRole[];
  positionCodes: HelpPositionCode[];
  context?: 'teaching-assignment' | 'wali-kelas' | 'selected-child';
  topicIds: string[];
}

const common = ['topic.start', 'topic.account-recovery', 'topic.official-support'];

export const HELP_PERSONA_GUIDES: HelpPersonaGuide[] = [
  { id: 'persona.super-admin', label: 'Super Admin', primaryRoles: ['SUPER_ADMIN'], positionCodes: [], topicIds: [...common, 'topic.system-administration', 'topic.appointments', 'topic.monitoring', 'topic.school-period'] },
  { id: 'persona.administration', label: 'Tata Usaha', primaryRoles: ['TATA_USAHA'], positionCodes: [], topicIds: [...common, 'topic.student-management', 'topic.ppdb', 'topic.class-config', 'topic.finance', 'topic.calendar'] },
  { id: 'persona.teacher', label: 'Guru', primaryRoles: ['GURU'], positionCodes: [], topicIds: [...common, 'topic.academic-workspace', 'topic.teacher-attendance'] },
  { id: 'persona.principal', label: 'Kepala Sekolah', primaryRoles: ['GURU'], positionCodes: ['KEPALA_SEKOLAH'], topicIds: [...common, 'topic.executive', 'topic.appointments', 'topic.semester-closing'] },
  { id: 'persona.curriculum', label: 'Waka Kurikulum', primaryRoles: ['GURU'], positionCodes: ['WAKA_KURIKULUM'], topicIds: [...common, 'topic.module-authoring', 'topic.assessment', 'topic.class-config', 'topic.semester-closing'] },
  { id: 'persona.student-affairs', label: 'Waka Kesiswaan', primaryRoles: ['GURU'], positionCodes: ['WAKA_KESISWAAN'], topicIds: [...common, 'topic.student-management', 'topic.announcements'] },
  { id: 'persona.public-relations', label: 'Waka Humas', primaryRoles: ['GURU'], positionCodes: ['WAKA_HUMAS'], topicIds: [...common, 'topic.ppdb', 'topic.announcements'] },
  { id: 'persona.facilities', label: 'Waka Sarpras', primaryRoles: ['GURU'], positionCodes: ['WAKA_SARPRAS'], topicIds: [...common, 'topic.announcements'] },
  { id: 'persona.head-administration', label: 'Kepala Tata Usaha', primaryRoles: ['TATA_USAHA'], positionCodes: ['KEPALA_TU'], topicIds: [...common, 'topic.finance', 'topic.system-administration'] },
  { id: 'persona.kaprog', label: 'Kepala Program Keahlian', primaryRoles: ['GURU'], positionCodes: ['KAPROG'], topicIds: [...common, 'topic.class-config', 'topic.semester-closing'] },
  { id: 'persona.bkk', label: 'Koordinator BKK', primaryRoles: ['GURU'], positionCodes: ['KOOR_BKK'], topicIds: [...common, 'topic.appointments'] },
  { id: 'persona.hubin', label: 'Koordinator Hubin', primaryRoles: ['GURU'], positionCodes: ['KOOR_HUBIN'], topicIds: [...common, 'topic.appointments'] },
  { id: 'persona.bkk-deputy', label: 'Wakil Koordinator BKK', primaryRoles: ['GURU'], positionCodes: ['WAKIL_KOOR_BKK'], topicIds: [...common, 'topic.appointments'] },
  { id: 'persona.hubin-deputy', label: 'Wakil Koordinator Hubin', primaryRoles: ['GURU'], positionCodes: ['WAKIL_KOOR_HUBIN'], topicIds: [...common, 'topic.ppdb', 'topic.appointments'] },
  { id: 'persona.counselor', label: 'Guru BK', primaryRoles: ['GURU'], positionCodes: ['GURU_BK'], topicIds: [...common, 'topic.student-management'] },
  { id: 'persona.treasurer', label: 'Bendahara', primaryRoles: ['TATA_USAHA'], positionCodes: ['BENDAHARA'], topicIds: [...common, 'topic.finance'] },
  { id: 'persona.hr', label: 'Staf Kepegawaian', primaryRoles: ['TATA_USAHA'], positionCodes: ['STAF_KEPEGAWAIAN'], topicIds: [...common, 'topic.system-administration'] },
  { id: 'persona.dapodik', label: 'Operator Dapodik', primaryRoles: ['TATA_USAHA'], positionCodes: ['OPERATOR_DAPODIK'], topicIds: [...common, 'topic.student-management'] },
  { id: 'persona.wali', label: 'Wali Kelas', primaryRoles: ['GURU'], positionCodes: [], context: 'wali-kelas', topicIds: [...common, 'topic.wali-class'] },
  { id: 'persona.assigned-teacher', label: 'Guru dengan Teaching Assignment', primaryRoles: ['GURU'], positionCodes: [], context: 'teaching-assignment', topicIds: [...common, 'topic.teaching-assignment', 'topic.module-authoring', 'topic.assessment'] },
  { id: 'persona.student', label: 'Siswa', primaryRoles: ['SISWA'], positionCodes: [], topicIds: [...common, 'topic.academic-workspace', 'topic.assessment-student', 'topic.remedial-student', 'topic.report-card'] },
  { id: 'persona.parent', label: 'Orang Tua', primaryRoles: ['ORANG_TUA'], positionCodes: [], context: 'selected-child', topicIds: [...common, 'topic.academic-workspace', 'topic.remedial-family', 'topic.report-card', 'topic.finance'] },
  { id: 'persona.industry', label: 'Industri', primaryRoles: ['INDUSTRI'], positionCodes: [], topicIds: [...common, 'topic.career-industry'] },
];
