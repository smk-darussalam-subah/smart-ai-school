CREATE TABLE academic.exam_agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  semester INTEGER NOT NULL,
  opens_at TIMESTAMPTZ(3) NOT NULL,
  closes_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT exam_agenda_period CHECK (semester IN (1,2) AND opens_at < closes_at)
);
CREATE INDEX exam_agendas_opens_at_closes_at_idx ON academic.exam_agendas (opens_at, closes_at);

CREATE TABLE academic.exam_cohort_proctors (
  agenda_id UUID NOT NULL REFERENCES academic.exam_agendas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  grade INTEGER NOT NULL CHECK (grade IN (10,11,12)),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  can_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (agenda_id, grade)
);
CREATE UNIQUE INDEX exam_cohort_proctors_agenda_id_user_id_key ON academic.exam_cohort_proctors (agenda_id, user_id);
CREATE INDEX exam_cohort_proctors_user_id_agenda_id_idx ON academic.exam_cohort_proctors (user_id, agenda_id);

CREATE TABLE academic.exam_room_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES academic.exam_agendas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  room VARCHAR(80) NOT NULL,
  room_key VARCHAR(80) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  opens_at TIMESTAMPTZ(3) NOT NULL,
  closes_at TIMESTAMPTZ(3) NOT NULL,
  supervisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ready_at TIMESTAMPTZ(3),
  CONSTRAINT exam_slot_bounds CHECK (opens_at < closes_at AND length(room_key) > 0),
  CONSTRAINT exam_slot_exclusive_room EXCLUDE USING gist
    (room_key WITH =, tstzrange(opens_at, closes_at, '[)') WITH &&),
  CONSTRAINT exam_slot_exclusive_supervisor EXCLUDE USING gist
    (supervisor_id WITH =, tstzrange(opens_at, closes_at, '[)') WITH &&)
);
CREATE INDEX exam_room_slots_agenda_id_opens_at_closes_at_idx ON academic.exam_room_slots (agenda_id, opens_at, closes_at);
CREATE INDEX exam_room_slots_supervisor_id_opens_at_idx ON academic.exam_room_slots (supervisor_id, opens_at);

CREATE TABLE academic.exam_room_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES academic.exam_room_slots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  intent_id UUID NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  decision VARCHAR(24),
  decision_note VARCHAR(500),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX exam_room_incidents_slot_id_created_by_intent_id_key
  ON academic.exam_room_incidents (slot_id, created_by, intent_id);
CREATE UNIQUE INDEX exam_room_one_open_incident ON academic.exam_room_incidents (slot_id) WHERE resolved_at IS NULL;
CREATE INDEX exam_room_incidents_slot_id_created_at_idx ON academic.exam_room_incidents (slot_id, created_at);

ALTER TABLE academic.exam_schedules
  ADD COLUMN agenda_id UUID REFERENCES academic.exam_agendas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN cohort_grade INTEGER,
  ADD CONSTRAINT exam_schedule_cohort_pair CHECK (
    (agenda_id IS NULL AND cohort_grade IS NULL) OR
    (agenda_id IS NOT NULL AND cohort_grade IS NOT NULL AND cohort_grade IN (10,11,12))
  );
CREATE INDEX exam_schedules_agenda_id_cohort_grade_idx ON academic.exam_schedules (agenda_id, cohort_grade);

ALTER TABLE academic.exam_participants
  ADD COLUMN room_slot_id UUID REFERENCES academic.exam_room_slots(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX exam_participants_room_slot_id_session_id_idx ON academic.exam_participants (room_slot_id, session_id);
