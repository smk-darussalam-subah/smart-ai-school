-- T3-02 (B5): KKTP config per-subject per-academic-year per-semester.
-- KS/Wakakur sets custom KKTP threshold per mapel. Default 75 bila tidak ada entry.

CREATE TABLE "academic"."kktp_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject" VARCHAR(100) NOT NULL,
    "kktp" INTEGER NOT NULL,
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kktp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kktp_configs_subject_academic_year_semester_key" ON "academic"."kktp_configs"("subject", "academic_year", "semester");
