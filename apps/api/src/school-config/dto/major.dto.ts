import { z } from 'zod';

const MajorDescriptionSchema = z.string()
  .trim()
  .max(800)
  .transform((value) => value.length > 0 ? value : null);

export const CreateMajorSchema = z.object({
  code: z.string().trim().min(2).max(10).regex(/^[A-Z0-9_-]+$/i, 'Kode jurusan hanya boleh huruf, angka, garis bawah, atau tanda hubung').transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(100),
  description: MajorDescriptionSchema.optional().nullable(),
  isActive: z.boolean().default(true),
}).strict();

export type CreateMajorDto = z.infer<typeof CreateMajorSchema>;

export const UpdateMajorSchema = z.object({
  code: z.string().trim().min(2).max(10).regex(/^[A-Z0-9_-]+$/i, 'Kode jurusan hanya boleh huruf, angka, garis bawah, atau tanda hubung').transform((value) => value.toUpperCase()).optional(),
  name: z.string().trim().min(3).max(100).optional(),
  description: MajorDescriptionSchema.optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export type UpdateMajorDto = z.infer<typeof UpdateMajorSchema>;
