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
