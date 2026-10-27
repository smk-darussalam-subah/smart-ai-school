CREATE TABLE "academic"."class_session_activations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "semester_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "activated_at" TIMESTAMPTZ(3),
  "changed_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "class_session_activations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_session_activations_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "class_session_activations_enabled_timestamp" CHECK (NOT "enabled" OR "activated_at" IS NOT NULL),
  CONSTRAINT "class_session_activations_semester_id_fkey" FOREIGN KEY ("semester_id")
    REFERENCES "school"."semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "class_session_activations_semester_id_key"
  ON "academic"."class_session_activations"("semester_id");
