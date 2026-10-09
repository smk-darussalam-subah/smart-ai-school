-- Additive, draft-only. No operational backfill, grants, or publication pointer.
CREATE TABLE academic.scheduling_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL,
  semester_number INTEGER NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ARCHIVED')),
  source_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source_type = 'MANUAL'),
  name VARCHAR(120) NOT NULL CHECK (length(trim(name)) > 0),
  effective_from DATE NOT NULL,
  effective_until DATE NOT NULL,
  scope_json JSONB NOT NULL,
  input_snapshot_json JSONB NOT NULL,
  input_digest VARCHAR(64) NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  archived_at TIMESTAMP(3),
  CONSTRAINT scheduling_versions_effective_range CHECK (effective_from <= effective_until),
  CONSTRAINT scheduling_versions_archive_state CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL)),
  CONSTRAINT scheduling_versions_period_fk FOREIGN KEY (academic_year_id,semester_number)
    REFERENCES school.semesters(academic_year_id,number) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX scheduling_versions_period_version_key
  ON academic.scheduling_versions(academic_year_id,semester_number,version_number);
CREATE INDEX scheduling_versions_academic_year_id_semester_number_status_idx
  ON academic.scheduling_versions(academic_year_id,semester_number,status);

CREATE TABLE academic.scheduling_version_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES academic.scheduling_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  assignment_id UUID NOT NULL,
  session_index INTEGER NOT NULL CHECK (session_index >= 0),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  jp_start INTEGER NOT NULL CHECK (jp_start > 0),
  jp_end INTEGER NOT NULL CHECK (jp_end >= jp_start),
  room_label VARCHAR(50),
  concurrency_group_id UUID,
  locked BOOLEAN NOT NULL DEFAULT false CHECK (locked = false)
);
CREATE UNIQUE INDEX scheduling_version_slots_assignment_session_key
  ON academic.scheduling_version_slots(version_id,assignment_id,session_index);

CREATE TABLE academic.scheduling_mutation_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES academic.scheduling_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id UUID NOT NULL,
  operation VARCHAR(30) NOT NULL CHECK (operation IN ('CREATE','RENAME','REPLACE_SLOTS','ARCHIVE')),
  key_hash VARCHAR(64) NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  request_hash VARCHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_json JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX scheduling_mutation_receipts_actor_id_operation_key_hash_key
  ON academic.scheduling_mutation_receipts(actor_id,operation,key_hash);
