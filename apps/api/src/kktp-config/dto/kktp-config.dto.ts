import { z } from 'zod';

// T3-02 (B5): KKTP config DTOs.

export const UpsertKktpSchema = z.object({
  subject: z.string().min(1).max(100),
  kktp: z.coerce.number().int().min(0).max(100),
  academicYear: z.string().min(1).max(9),
  semester: z.coerce.number().int().min(1).max(2),
});
export type UpsertKktpDto = z.infer<typeof UpsertKktpSchema>;

export const ListKktpQuerySchema = z.object({
  academicYear: z.string().optional(),
  semester: z.coerce.number().optional(),
});
export type ListKktpQuery = z.infer<typeof ListKktpQuerySchema>;
