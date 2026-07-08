// =============================================================================
// events.types.ts — Payload types + konstanta nama event
//
// Semua event dideklarasikan di sini agar producer dan konsumer
// mengacu ke definisi yang sama (type-safe, tidak typo nama event).
//
// Guardrail §5: producer emit via EventEmitter2.emit();
//               konsumer @OnEvent() di NotificationListener.
// =============================================================================

export const EVENTS = {
  STUDENT_ENROLLED:       'student.enrolled',
  STUDENT_STATUS_CHANGED: 'student.statusChanged',
  GRADE_SUBMITTED:        'grade.submitted',
  ATTENDANCE_RECORDED:    'attendance.recorded',
  PAYMENT_RECEIVED:       'payment.received',
  RPP_REVIEWED:           'rpp.reviewed',
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',
  REPORT_DISTRIBUTED:     'report.distributed',
  BADGE_AWARDED:           'badge.awarded',
  XP_AWARDED:              'xp.awarded',
  ASSESSMENT_COMPLETED:    'assessment.completed',
} as const;

// ── Producer payloads ─────────────────────────────────────────────────────────

export interface StudentEnrolledPayload {
  studentId: string;
  nis:       string;
  fullName:  string;
  /** null jika orang tua belum terdaftar */
  parentId:  string | null;
}

export interface StudentStatusChangedPayload {
  studentId: string;
  nis:       string;
  fullName:  string;
  /** auth.users.id siswa — untuk resolve nomor WA siswa */
  userId:    string;
  /** null jika orang tua belum terdaftar */
  parentId:  string | null;
  oldStatus: string;
  newStatus: string;
}

export interface GradeSubmittedPayload {
  gradeId:      string;
  studentId:    string;
  subject:      string;
  score:        string;   // Decimal.toString()
  type:         string;
  semester:     number;
  academicYear: string;
}

/** Hanya di-emit untuk status 'alpha' | 'sakit' */
export interface AttendanceRecordedPayload {
  attendanceId: string;
  studentId:    string;
  classId:      string;
  date:         string;   // 'YYYY-MM-DD'
  status:       'alpha' | 'sakit';
}

export interface PaymentReceivedPayload {
  paymentId:  string;
  studentId:  string;
  month:      number;
  year:       number;
  amount:     string;   // Decimal.toString()
  receiptNo:  string | null;
}

export interface RppReviewedPayload {
  rppId:         string;
  teacherId:     string;
  title:         string;
  decision:      'approved' | 'revision';
  note:          string | null;
  /** ISO reviewedAt — bagian refId idempotensi (unik per aksi review) */
  reviewedAtIso: string;
}

export interface AnnouncementPublishedPayload {
  announcementId: string;
  title:          string;
  category:       string;
  priority:       string;
  /** ["ALL"] atau daftar role */
  audience:       string[];
}

export interface ReportDistributedPayload {
  reportCardId: string;
  studentId:    string;
  academicYear: string;
  semester:     number;
}

export interface BadgeAwardedPayload {
  badgeId:   string;
  studentId: string;
  badgeName: string;
  badgeIcon: string;
  /** null = auto-awarded by system; userId = manually awarded by teacher/KS */
  awardedBy: string | null;
}

export interface XpAwardedPayload {
  studentId: string;
  amount:    number;
  newTotal:  number;
  newLevel:  number;
  source:    string;
}

export interface AssessmentCompletedPayload {
  sessionId:    string;
  title:        string;
  type:         string;   // 'diagnostik' | 'formatif' | 'sumatif'
  teacherId:    string;
  classId:      string | null;
  moduleId:     string;
  subject:      string;
  academicYear: string;
  semester:     number;
  /** Count of auto-graded responses that generated Grade records */
  gradedCount:  number;
  /** Count of responses without auto-gradeable questions (essay-only) */
  skippedCount: number;
}
