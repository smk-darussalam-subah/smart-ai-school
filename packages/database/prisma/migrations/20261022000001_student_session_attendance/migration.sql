-- Additive only: do not infer JP attendance from the legacy daily table.
CREATE TABLE academic.student_session_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  session_id UUID NOT NULL,
  jp INTEGER NOT NULL CHECK (jp BETWEEN 1 AND 40),
  status academic."AttendanceStatus" NOT NULL,
  notes VARCHAR(1000),
  recorded_by UUID NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT student_session_attendance_pkey PRIMARY KEY (id),
  CONSTRAINT student_session_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES student.students(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT student_session_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES academic.class_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT student_session_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX student_session_attendance_student_id_session_id_jp_key ON academic.student_session_attendance(student_id, session_id, jp);
CREATE INDEX student_session_attendance_session_id_idx ON academic.student_session_attendance(session_id);
