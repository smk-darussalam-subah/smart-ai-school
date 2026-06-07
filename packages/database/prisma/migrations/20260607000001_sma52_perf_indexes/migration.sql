-- SMA-52: Additive performance indexes
-- Data kecil (Tahap 1) → CREATE INDEX biasa.
-- Tahap 2 (data besar/live) → gunakan CREATE INDEX CONCURRENTLY di luar transaksi.
-- Semua index baru, tidak ada yang menduplikasi index/unique constraint existing.

-- Student.classId
-- Dipakai: StudentService.findAll(classId filter) + SISWA/ORANG_TUA ownership chain.
-- Unique constraint (userId) tidak cover classId.
CREATE INDEX "students_class_id_idx" ON "student"."students"("class_id");

-- Student.parentId
-- Dipakai: resolveChildStudentIds() — dipanggil setiap request ORANG_TUA
--   di Grade, Attendance, Finance, Schedule service.
CREATE INDEX "students_parent_id_idx" ON "student"."students"("parent_id");

-- TeachingAssignment.classId
-- Dipakai: TeachingAssignmentService.findAll() dengan filter classId tanpa teacherId (elevated user).
-- Unique constraint (teacherId, classId, subject, academicYear) cover WHERE teacherId & (teacherId+classId),
-- tapi TIDAK cover WHERE classId standalone.
CREATE INDEX "teaching_assignments_class_id_idx" ON "academic"."teaching_assignments"("class_id");

-- Grade.assignmentId
-- Dipakai: GradeService.findAll() filter assignmentId + create() DOBEL GUARD
--   WHERE (studentId, assignmentId, semester, type).
-- Existing index (studentId, academicYear, semester) tidak cover assignmentId.
CREATE INDEX "grades_assignment_id_idx" ON "academic"."grades"("assignment_id");

-- NotificationLog.(refType, refId)
-- Dipakai: NotificationService.notify() idempotensi check:
--   WHERE refType=? AND refId=? AND recipient=? AND channel=? AND status='sent'
-- (refType, refId) sangat selektif — mempercepat narrow-down sebelum cek status.
-- Existing indexes (recipient+createdAt) dan (status) tidak cover refType+refId.
CREATE INDEX "notification_logs_ref_type_ref_id_idx" ON "notification"."notification_logs"("ref_type", "ref_id");
