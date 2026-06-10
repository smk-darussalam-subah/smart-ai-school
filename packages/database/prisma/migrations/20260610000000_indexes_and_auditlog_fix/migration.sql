-- =============================================================================
-- Migration: Indexes + AuditLog ID fix
-- 
-- Changes:
-- 1. audit.audit_log: change id default from cuid() to gen_random_uuid()
-- 2. auth.users: add indexes on role, is_active, deleted_at
-- 3. ppdb.leads: add index on assigned_to
-- 4. academic.grades: add index on submitted_by
-- 5. notification.notification_logs: replace ref_type+ref_id index with compound
-- 6. ai_knowledge.chat_sessions: add updated_at column + index
-- 7. school.academic_calendar: add index on (start_date, end_date)
-- =============================================================================

-- 1. AuditLog — change ID default from cuid() to gen_random_uuid()
--    Existing rows keep their cuid() values; new rows get UUIDs
ALTER TABLE audit.audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. User indexes for common query filters
CREATE INDEX IF NOT EXISTS users_role_idx ON auth.users (role);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON auth.users (is_active);
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON auth.users (deleted_at);

-- 3. PpdbLead — index on assigned_to for staff filter queries
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON ppdb.leads (assigned_to);

-- 4. Grade — index on submitted_by for audit trail queries
CREATE INDEX IF NOT EXISTS grades_submitted_by_idx ON academic.grades (submitted_by);

-- 5. NotificationLog — replace (ref_type, ref_id) with compound index for idempotency check
--    The idempotency query uses: WHERE refType=? AND refId=? AND recipient=? AND channel=? AND status='sent'
DROP INDEX IF EXISTS notification.notification_logs_ref_type_ref_id_idx;
CREATE INDEX IF NOT EXISTS notification_logs_idempotency_idx
  ON notification.notification_logs (ref_type, ref_id, recipient, channel, status);

-- 6. ChatSession — add updated_at column for "recent sessions" queries
ALTER TABLE ai_knowledge.chat_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS chat_sessions_updated_at_idx
  ON ai_knowledge.chat_sessions (updated_at);

-- 7. AcademicCalendar — index for date range queries
CREATE INDEX IF NOT EXISTS academic_calendar_dates_idx
  ON school.academic_calendar (start_date, end_date);
