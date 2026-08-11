import { z } from 'zod';

const MajorDescriptionSchema = z.string()
  .trim()
  .max(800)
  .transform((value) => value.length > 0 ? value : null);

export const CreateMajorSchema = z.object({
  code: z.string().trim().min(2).max(10),
  name: z.string().trim().min(3).max(100),
  description: MajorDescriptionSchema.optional().nullable(),
  isActive: z.boolean().default(true),
}).strict();

export type CreateMajorDto = z.infer<typeof CreateMajorSchema>;

export const UpdateMajorSchema = CreateMajorSchema.partial();

export type UpdateMajorDto = z.infer<typeof UpdateMajorSchema>;
