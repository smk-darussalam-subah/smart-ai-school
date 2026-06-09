import { z } from 'zod';

export const CreateMajorSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(3).max(100),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
}).strict();

export type CreateMajorDto = z.infer<typeof CreateMajorSchema>;

export const UpdateMajorSchema = CreateMajorSchema.partial();

export type UpdateMajorDto = z.infer<typeof UpdateMajorSchema>;
