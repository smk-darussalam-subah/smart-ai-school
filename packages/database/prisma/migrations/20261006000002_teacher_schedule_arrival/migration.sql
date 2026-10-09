-- Private-school teachers follow their first teaching session, not a blanket 07:00.
ALTER TABLE school.school_profile
  ADD COLUMN attendance_teacher_lead_min INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN attendance_teacher_lead_target INTEGER NOT NULL DEFAULT 30,
  ADD CONSTRAINT staff_teacher_arrival_lead_valid CHECK (
    attendance_teacher_lead_min BETWEEN 0 AND 120 AND
    attendance_teacher_lead_target BETWEEN attendance_teacher_lead_min AND 180
  );
-- Snapshot the actual expectation at check-in. Never infer past lateness from today's policy.
ALTER TABLE school.staff_attendance
  ADD COLUMN arrival_basis VARCHAR(20),
  ADD COLUMN expected_arrival_at TIMESTAMP(3),
  ADD COLUMN recommended_arrival_at TIMESTAMP(3),
  ADD COLUMN first_teaching_at TIMESTAMP(3),
  ADD CONSTRAINT staff_arrival_basis_valid CHECK (
    arrival_basis IS NULL OR arrival_basis IN ('TEACHING','WORKDAY','NONE','UNAVAILABLE')
  );
