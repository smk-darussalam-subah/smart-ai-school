import { z } from 'zod';

export const CreateSubjectSchema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  name: z.string().min(2).max(100),
}).strict();

export const UpdateSubjectSchema = z.object({
  code:     z.string().min(2).max(20).toUpperCase().optional(),
  name:     z.string().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Minimal satu field wajib diisi' });

export const ListSubjectsQuerySchema = z.object({
  isActive:  z.enum(['true', 'false']).optional(),
  search:    z.string().max(100).optional(),
  limit:     z.coerce.number().int().min(1).max(200).default(100),
  offset:    z.coerce.number().int().min(0).default(0),
}).strict();

export type CreateSubjectDto   = z.infer<typeof CreateSubjectSchema>;
export type UpdateSubjectDto   = z.infer<typeof UpdateSubjectSchema>;
export type ListSubjectsQuery  = z.infer<typeof ListSubjectsQuerySchema>;
