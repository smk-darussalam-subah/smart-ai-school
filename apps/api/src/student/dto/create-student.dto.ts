import { z } from 'zod';

export const CreateStudentSchema = z
  .object({
    userId: z.string().uuid(),
    nis: z.string().min(5).max(20),
    classId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
    status: z.enum(['active', 'inactive', 'graduated', 'dropped']).default('active'),
    joinedAt: z.coerce.date(),
  })
  .strict();

export type CreateStudentDto = z.infer<typeof CreateStudentSchema>;
