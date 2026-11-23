ALTER TABLE "academic"."exam_participants"
    ADD COLUMN "makeup_source_grade_id" UUID,
    ADD COLUMN "makeup_grade_snapshot" JSONB,
    ADD CONSTRAINT "exam_participants_makeup_snapshot_pair"
        CHECK (("makeup_source_grade_id" IS NULL AND "makeup_grade_snapshot" IS NULL)
            OR ("makeup_source_grade_id" IS NOT NULL AND "makeup_grade_snapshot" IS NOT NULL
                AND jsonb_typeof("makeup_grade_snapshot") = 'object')),
    ADD CONSTRAINT "exam_participants_makeup_source_grade_id_fkey"
        FOREIGN KEY ("makeup_source_grade_id") REFERENCES "academic"."grades"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "exam_participants_makeup_source_grade_id_idx"
    ON "academic"."exam_participants"("makeup_source_grade_id");
