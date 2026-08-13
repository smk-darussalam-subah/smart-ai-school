-- Two-stage Modul Ajar governance and auditable report-card transitions.
ALTER TYPE academic."RppStatus" ADD VALUE IF NOT EXISTS 'curriculum_reviewed';

ALTER TABLE academic.rpp
  ADD COLUMN IF NOT EXISTS curriculum_reviewer_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS curriculum_reviewer_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS curriculum_review_note TEXT,
  ADD COLUMN IF NOT EXISTS curriculum_reviewed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS final_reviewer_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS final_reviewer_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS final_review_note TEXT,
  ADD COLUMN IF NOT EXISTS final_approved_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(64);

-- Existing approvals predate the two-step workflow. Preserve their audit data
-- as final approval evidence rather than forcing them back into review.
UPDATE academic.rpp
SET final_reviewer_id = COALESCE(final_reviewer_id, reviewer_id),
    final_reviewer_name = COALESCE(final_reviewer_name, reviewer_name),
    final_review_note = COALESCE(final_review_note, review_note),
    final_approved_at = COALESCE(final_approved_at, reviewed_at)
WHERE status = 'approved'::academic."RppStatus";

CREATE INDEX IF NOT EXISTS rpp_active_review_queue_idx
ON academic.rpp (status, submitted_at DESC)
WHERE archived_at IS NULL;

ALTER TABLE academic.report_cards
  ADD COLUMN IF NOT EXISTS checked_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS checked_by_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS returned_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS returned_by_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS published_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS published_by_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS distributed_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS distributed_by_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS student_name_snapshot VARCHAR(255),
  ADD COLUMN IF NOT EXISTS student_nis_snapshot VARCHAR(50),
  ADD COLUMN IF NOT EXISTS class_name_snapshot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS homeroom_teacher_name_snapshot VARCHAR(255);

UPDATE academic.report_cards rc
SET student_name_snapshot = COALESCE(rc.student_name_snapshot, student_user.full_name),
    student_nis_snapshot = COALESCE(rc.student_nis_snapshot, student_row.nis),
    class_name_snapshot = COALESCE(rc.class_name_snapshot, class_row.name),
    homeroom_teacher_name_snapshot = COALESCE(
      rc.homeroom_teacher_name_snapshot,
      homeroom_user.full_name
    )
FROM student.students student_row
JOIN auth.users student_user ON student_user.id = student_row.user_id
JOIN academic.classes class_row ON TRUE
LEFT JOIN teacher.teachers homeroom_teacher ON homeroom_teacher.id = class_row.teacher_id
LEFT JOIN auth.users homeroom_user ON homeroom_user.id = homeroom_teacher.user_id
WHERE student_row.id = rc.student_id
  AND class_row.id = rc.class_id;

CREATE TABLE IF NOT EXISTS academic.report_card_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id UUID NOT NULL REFERENCES academic.report_cards(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  from_status academic."ReportStatus" NOT NULL,
  to_status academic."ReportStatus" NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_name VARCHAR(100) NOT NULL,
  reason TEXT,
  incident_reference VARCHAR(100),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE academic.report_card_status_events
  ADD COLUMN IF NOT EXISTS incident_reference VARCHAR(100);

CREATE INDEX IF NOT EXISTS report_card_status_events_report_card_id_created_at_idx
ON academic.report_card_status_events (report_card_id, created_at);

INSERT INTO auth.permissions (code, description, module)
VALUES
  ('rpp.curriculum.review', 'Review kurikulum dan rekomendasi Modul Ajar', 'academic'),
  ('rpp.final.approve', 'Persetujuan final Modul Ajar', 'academic'),
  ('report.publish', 'Persetujuan final dan penerbitan rapor', 'academic'),
  ('report.distribute', 'Distribusi rapor yang telah diterbitkan', 'academic'),
  ('report.recover', 'Pemulihan administratif rapor dengan referensi insiden', 'academic')
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

-- TU operates distribution, but does not own pedagogical notes or snapshots.
DELETE FROM auth.role_permissions rp
USING auth.permissions p
WHERE rp.permission_id = p.id
  AND rp.role = 'TATA_USAHA'::auth."UserRole"
  AND p.code = 'report.manage';

-- Appointment holders now use the explicit stage permissions below. Remove
-- broad legacy grants so a future endpoint cannot accidentally revive the
-- former one-step authority contract.
DELETE FROM school.position_permissions pp
USING school.positions pos, auth.permissions perm
WHERE pp.position_id = pos.id
  AND pp.permission_id = perm.id
  AND (
    (pos.code::text = 'WAKA_KURIKULUM' AND perm.code IN ('report.manage', 'rpp.review'))
    OR (pos.code::text = 'KEPALA_SEKOLAH' AND perm.code IN ('report.manage', 'report.review', 'rpp.review'))
  );

INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'TATA_USAHA'::auth."UserRole", p.id
FROM auth.permissions p
WHERE p.code = 'report.distribute'
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO school.position_permissions (position_id, permission_id)
SELECT pos.id, perm.id
FROM (VALUES
  ('WAKA_KURIKULUM', 'rpp.curriculum.review'),
  ('WAKA_KURIKULUM', 'report.review'),
  ('KEPALA_SEKOLAH', 'rpp.final.approve'),
  ('KEPALA_SEKOLAH', 'report.publish'),
  ('KEPALA_SEKOLAH', 'report.distribute'),
  ('KAPROG', 'academic.teaching.read'),
  ('KAPROG', 'academic.schedule.read'),
  ('KAPROG', 'report.read'),
  ('KAPROG', 'activity.read'),
  ('KAPROG', 'rpp.read'),
  ('KAPROG', 'rpp.curriculum.review')
) AS requested(position_code, permission_code)
JOIN school.positions pos ON pos.code::text = requested.position_code
JOIN auth.permissions perm ON perm.code = requested.permission_code
ON CONFLICT (position_id, permission_id) DO NOTHING;

-- Serialize assignment-backed authoring with assignment update/delete. The
-- FOR KEY SHARE lock closes the validate-then-insert race without adding
-- nullable provenance columns to historical academic tables.
CREATE OR REPLACE FUNCTION academic.assert_teaching_assignment_context()
RETURNS TRIGGER AS $$
DECLARE
  matched_id UUID;
  context_subject VARCHAR(100);
BEGIN
  IF NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'assessment_sessions' THEN
    SELECT lm.subject INTO context_subject
    FROM academic.lms_modules lm
    WHERE lm.id = NEW.module_id;
  ELSE
    context_subject := NEW.subject;
  END IF;

  SELECT ta.id INTO matched_id
  FROM academic.teaching_assignments ta
  WHERE ta.teacher_id = NEW.teacher_id
    AND ta.class_id = NEW.class_id
    AND lower(ta.subject) = lower(context_subject)
    AND ta.academic_year = NEW.academic_year
  FOR KEY SHARE;

  IF matched_id IS NULL THEN
    RAISE EXCEPTION 'TeachingAssignment context is required for %', TG_TABLE_NAME
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rpp_assignment_context_guard ON academic.rpp;
CREATE TRIGGER rpp_assignment_context_guard
BEFORE INSERT OR UPDATE OF teacher_id, class_id, subject, academic_year
ON academic.rpp FOR EACH ROW
EXECUTE FUNCTION academic.assert_teaching_assignment_context();

DROP TRIGGER IF EXISTS lms_assignment_context_guard ON academic.lms_modules;
CREATE TRIGGER lms_assignment_context_guard
BEFORE INSERT OR UPDATE OF teacher_id, class_id, subject, academic_year
ON academic.lms_modules FOR EACH ROW
EXECUTE FUNCTION academic.assert_teaching_assignment_context();

DROP TRIGGER IF EXISTS assessment_assignment_context_guard ON academic.assessment_sessions;
CREATE TRIGGER assessment_assignment_context_guard
BEFORE INSERT OR UPDATE OF teacher_id, class_id, module_id, academic_year
ON academic.assessment_sessions FOR EACH ROW
EXECUTE FUNCTION academic.assert_teaching_assignment_context();
