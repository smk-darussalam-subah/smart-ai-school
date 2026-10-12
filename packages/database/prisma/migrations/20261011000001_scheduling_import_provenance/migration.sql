-- Wave 1B: additive draft provenance only. No operational schedule or historical rewrite.
ALTER TABLE academic.scheduling_versions
  DROP CONSTRAINT scheduling_versions_source_type_check,
  ADD COLUMN import_provenance JSONB,
  ADD CONSTRAINT scheduling_versions_source_type_check CHECK (source_type IN ('MANUAL', 'IMPORT')),
  ADD CONSTRAINT scheduling_versions_import_provenance_check CHECK (COALESCE((
    (source_type = 'MANUAL' AND import_provenance IS NULL) OR
    (source_type = 'IMPORT' AND import_provenance IS NOT NULL
      AND jsonb_typeof(import_provenance) = 'object'
      AND import_provenance ?& ARRAY['fileSha256', 'format', 'parserVersion', 'rowCount', 'mappingDigest']
      AND import_provenance->>'format' IN ('CSV', 'XLSX')
      AND import_provenance->>'parserVersion' = '1'
      AND import_provenance->>'fileSha256' ~ '^[0-9a-f]{64}$'
      AND import_provenance->>'mappingDigest' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof(import_provenance->'rowCount') = 'number'
      AND import_provenance->>'rowCount' ~ '^[1-9][0-9]{0,3}$')
  ), false));

ALTER TABLE academic.scheduling_mutation_receipts
  DROP CONSTRAINT scheduling_mutation_receipts_operation_check,
  ADD CONSTRAINT scheduling_mutation_receipts_operation_check
    CHECK (operation IN ('CREATE', 'RENAME', 'REPLACE_SLOTS', 'ARCHIVE', 'IMPORT'));
