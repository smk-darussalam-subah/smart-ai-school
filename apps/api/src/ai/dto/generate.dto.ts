import { z } from 'zod';

// AI-0A containment: Modul Ajar generation is ID-based. The browser may only
// request a saved RPP id and one target section; authoritative context is loaded
// server-side from academic.rpp.

export const AiRppSectionSchema = z.enum([
  'cp_tp',
  'atp',
  'profil',
  'sarana',
  'kegiatan',
  'asesmen',
  'remedial',
  'refleksi',
  'lampiran',
]);
export type AiRppSection = z.infer<typeof AiRppSectionSchema>;

export const GenerateRppStepSchema = z.object({
  rppId: z.string().uuid(),
  section: AiRppSectionSchema,
}).strict();
export type GenerateRppStepDto = z.infer<typeof GenerateRppStepSchema>;
