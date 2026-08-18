import { z } from 'zod';

export const GenerateReportsSchema = z.object({
  classId: z.string().uuid(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY'),
  semester: z.coerce.number().int().min(1).max(2),
});
export type GenerateReportsDto = z.infer<typeof GenerateReportsSchema>;

export const TransitionSchema = z.object({
  action: z.enum(['check', 'return', 'publish', 'distribute']),
  reason: z.string().trim().min(3).max(5000).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'return' && !value.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'Alasan pengembalian wajib diisi',
    });
  }
});
export type TransitionDto = z.infer<typeof TransitionSchema>;

export const RecoverReportSchema = z.object({
  reason: z.string().trim().min(10, 'Alasan pemulihan minimal 10 karakter').max(2000),
  incidentReference: z.string().trim().min(3, 'Referensi insiden minimal 3 karakter').max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Referensi insiden mengandung karakter tidak valid'),
});
export type RecoverReportDto = z.infer<typeof RecoverReportSchema>;

export const UpdateNotesSchema = z.object({
  notes: z.string().trim().max(5000).nullable(),
  expectedUpdatedAt: z.string().datetime().transform((value) => new Date(value)),
});
export type UpdateNotesDto = z.infer<typeof UpdateNotesSchema>;

export const ListReportsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  status: z.enum(['draft', 'checked', 'published', 'distributed']).optional(),
  search: z.string().trim().max(100).optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListReportsQueryDto = z.infer<typeof ListReportsQuerySchema>;
