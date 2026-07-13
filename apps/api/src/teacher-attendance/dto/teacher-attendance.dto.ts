import { z } from 'zod';

const Coord = z.coerce.number().min(-180).max(180);

export const CheckInSchema = z.object({
  lat: Coord.min(-90).max(90).nullish(),
  lng: Coord.nullish(),
  photoUrl: z.string().url().max(2000).nullish(),
  notes: z.string().trim().max(500).nullish(),
});
export type CheckInDto = z.infer<typeof CheckInSchema>;

export const CheckOutSchema = z.object({
  lat: Coord.min(-90).max(90).nullish(),
  lng: Coord.nullish(),
});
export type CheckOutDto = z.infer<typeof CheckOutSchema>;

// N2: z.coerce.boolean() parses "false" as true because Boolean("false") === true.
// Use preprocess to correctly handle string query params.
const stringToBool = z.preprocess((v) => v === 'true' || v === true, z.boolean());

export const ListTeacherAttendanceQuerySchema = z.object({
  teacherId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  outsideOnly: stringToBool.default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(31),
});
export type ListTeacherAttendanceQueryDto = z.infer<typeof ListTeacherAttendanceQuerySchema>;
