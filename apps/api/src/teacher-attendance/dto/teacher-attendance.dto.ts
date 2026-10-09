import { z } from 'zod';
import { AttendanceLocationSchema, DateOnly } from '../../staff-attendance/staff-attendance.dto';

export const CheckInSchema = AttendanceLocationSchema.innerType().extend({
  photoUrl: z.string().url().max(2000).nullish(),
  notes: z.string().trim().max(500).nullish(),
}).superRefine((value, context) => {
  const { notes: _notes, photoUrl: _photo, ...location } = value;
  const result = AttendanceLocationSchema.safeParse(location);
  if (!result.success) result.error.issues.forEach((issue) => context.addIssue(issue));
});
export type CheckInDto = z.infer<typeof CheckInSchema>;

export const CheckOutSchema = AttendanceLocationSchema;
export type CheckOutDto = z.infer<typeof CheckOutSchema>;

// N2: z.coerce.boolean() parses "false" as true because Boolean("false") === true.
// Use preprocess to correctly handle string query params.
const stringToBool = z.preprocess((v) => v === 'true' || v === true, z.boolean());

export const ListTeacherAttendanceQuerySchema = z.object({
  teacherId: z.string().uuid().optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  outsideOnly: stringToBool.default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(31),
});
export type ListTeacherAttendanceQueryDto = z.infer<typeof ListTeacherAttendanceQuerySchema>;
