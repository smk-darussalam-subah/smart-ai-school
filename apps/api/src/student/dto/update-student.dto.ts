import { z } from 'zod';

export const UpdateStudentSchema = z
  .object({
    nis: z.string().min(5).max(20).optional(),
    classId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    status: z.enum(['active', 'inactive', 'graduated', 'dropped']).optional(),
    joinedAt: z.coerce.date().optional(),
  })
  .strict();

export type UpdateStudentDto = z.infer<typeof UpdateStudentSchema>;
