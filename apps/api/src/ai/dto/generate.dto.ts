import { z } from 'zod';

// AI Generate DTO (P16 — W3-5). AI-powered content generation.

export const GenerateQuestionsSchema = z.object({
  rppBody: z.string().min(10).max(10000),
  subject: z.string().min(1).max(100),
  count: z.number().int().min(1).max(20).default(5),
  type: z.enum(['multiple_choice', 'essay', 'true_false']).default('multiple_choice'),
});
export type GenerateQuestionsDto = z.infer<typeof GenerateQuestionsSchema>;

export const GenerateMaterialSchema = z.object({
  rppBody: z.string().min(10).max(10000),
  subject: z.string().min(1).max(100),
});
export type GenerateMaterialDto = z.infer<typeof GenerateMaterialSchema>;

export const GenerateAtpSchema = z.object({
  cp: z.string().min(10).max(5000), // Capaian Pembelajaran
  tp: z.array(z.string().min(5).max(500)).min(1).max(10), // Tujuan Pembelajaran
  subject: z.string().min(1).max(100),
});
export type GenerateAtpDto = z.infer<typeof GenerateAtpSchema>;

// P4 (S-12): Generic RPP step generation
export const GenerateRppStepSchema = z.object({
  step: z.enum(['cp_tp', 'profil', 'sarana', 'kegiatan', 'asesmen', 'remedial', 'refleksi', 'lampiran']),
  subject: z.string().min(1).max(100),
  context: z.string().min(5).max(5000), // Prior step content for context
});
export type GenerateRppStepDto = z.infer<typeof GenerateRppStepSchema>;
