import { z } from 'zod';
import { CreateDraftSchema } from './scheduling-draft.dto';

export const IMPORT_MAX_BYTES = 512 * 1024;
export const IMPORT_MAX_ROWS = 1000;
export const ImportFileSchema = z.object({
  format: z.enum(['CSV', 'XLSX']),
  // Base64 keeps the existing JSON transport/body ceiling; no global parser change.
  contentBase64: z.string().min(4).max(Math.ceil(IMPORT_MAX_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine((v) => Buffer.byteLength(v, 'base64') <= IMPORT_MAX_BYTES, 'File melebihi 512 KB'),
  sheet: z.number().int().min(1).max(10).default(1),
  headerRow: z.number().int().min(1).max(20).default(1),
  delimiter: z.enum([',', ';', '\t']).default(','),
}).strict();
const column = z.number().int().min(0).max(31);
export const ImportMappingSchema = z.object({
  columns: z.object({ assignment: column, day: column, jpStart: column, jpEnd: column,
    sessionIndex: column.optional(), room: column.optional(), concurrencyGroup: column.optional() }).strict()
    .refine((v) => new Set(Object.values(v)).size === Object.values(v).length, 'Kolom tidak boleh dipakai dua kali'),
  // No name-based guessing. An alias maps to one real teaching-assignment component.
  assignments: z.array(z.object({ source: z.string().trim().min(1).max(200), assignmentId: z.string().uuid() }).strict())
    .max(1000).refine((v) => new Set(v.map((r) => r.source)).size === v.length, 'Alias penugasan duplikat'),
}).strict();
export const ImportPreviewSchema = z.object({
  draft: CreateDraftSchema, file: ImportFileSchema, mapping: ImportMappingSchema,
}).strict();
export const ImportCommitSchema = ImportPreviewSchema.extend({
  expectedPreviewDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type ImportFile = z.infer<typeof ImportFileSchema>;
export type ImportMapping = z.infer<typeof ImportMappingSchema>;
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;
