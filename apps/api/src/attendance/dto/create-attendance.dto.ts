import { z } from 'zod';

// Satu item absensi dalam bulk array
export const AttendanceItemSchema = z.object({
  studentId: z.string().uuid(),
  status:    z.enum(['hadir', 'izin', 'sakit', 'alpha']),
  notes:     z.string().max(500).optional(),
});

// Body POST /attendance: satu classId+date, banyak siswa
export const CreateAttendanceSchema = z
  .object({
    classId: z.string().uuid(),
    date:    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date: YYYY-MM-DD'),
    records: z.array(AttendanceItemSchema).min(1).max(200),
  })
  .strict();

export type AttendanceItemDto = z.infer<typeof AttendanceItemSchema>;
export type CreateAttendanceDto = z.infer<typeof CreateAttendanceSchema>;
