-- 2K-4: Tabel referensi mapel (additive)
-- Tidak mengubah teaching_assignments.subject (tetap VARCHAR bebas).
-- Soft-disable via is_active; tanpa DELETE di API.

CREATE TABLE academic.subjects (
  id         UUID         NOT NULL DEFAULT gen_random_uuid(),
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(100) NOT NULL,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT subjects_pkey       PRIMARY KEY (id)
);

CREATE UNIQUE INDEX subjects_code_key ON academic.subjects(code);
CREATE UNIQUE INDEX subjects_name_key ON academic.subjects(name);
