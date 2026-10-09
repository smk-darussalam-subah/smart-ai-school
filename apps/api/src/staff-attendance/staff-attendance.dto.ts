import { z } from 'zod';

export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Tanggal tidak valid');
export const AttendanceLocationSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90).nullish(),
    lng: z.number().finite().min(-180).max(180).nullish(),
    accuracyM: z.number().finite().min(0).max(100000).nullish(),
    capturedAt: z.string().datetime().nullish(),
    locationFailure: z
      .enum(['PERMISSION_DENIED', 'POLICY_BLOCKED', 'UNAVAILABLE', 'TIMEOUT', 'INSECURE_CONTEXT'])
      .nullish(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.lat == null) !== (value.lng == null))
      context.addIssue({ code: 'custom', message: 'Koordinat harus lengkap' });
    if (value.locationFailure && value.lat != null)
      context.addIssue({ code: 'custom', message: 'Lokasi gagal tidak boleh disertai koordinat' });
  });
export type AttendanceLocation = z.infer<typeof AttendanceLocationSchema>;
export const AttendanceQuerySchema = z
  .object({
    from: DateOnly,
    to: DateOnly,
    search: z.string().trim().max(100).default(''),
    status: z.enum(['ALL', 'PRESENT', 'LATE', 'ABSENT', 'NOT_DUE', 'NOT_SCHEDULED', 'NOT_REQUIRED', 'UNKNOWN', 'REVIEW', 'NO_CHECKOUT']).default('ALL'),
    location: z.enum(['ALL', 'INSIDE', 'OUTSIDE', 'UNVERIFIED', 'DISABLED']).default('ALL'),
    unit: z.enum(['ALL', 'TEACHER', 'STAFF']).default('ALL'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (value) =>
      value.to >= value.from &&
      (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86400000 <= 90,
    'Rentang maksimum 91 hari',
  );
export type AttendanceQuery = z.infer<typeof AttendanceQuerySchema>;
export const AttendanceCorrectionSchema = z
  .object({
    checkInAt: z.string().datetime({ offset: true }).optional(),
    checkOutAt: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .refine(
    (value) => value.checkInAt !== undefined || value.checkOutAt !== undefined,
    'Isi waktu koreksi',
  );
export const AttendanceNoteSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export const AttendancePolicySchema = z
  .object({
    attendanceMode: z.enum(['REVIEW', 'STRICT']),
    attendanceAccuracyM: z.number().int().min(5).max(500),
    attendanceStartMinute: z.number().int().min(0).max(1439),
    attendanceTeacherLeadMin: z.number().int().min(0).max(120),
    attendanceTeacherLeadTarget: z.number().int().min(0).max(180),
    attendanceEndMinute: z.number().int().min(1).max(1440),
    attendanceWorkingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    attendancePromptCooldown: z.number().int().min(5).max(240),
  })
  .strict()
  .refine(
    (value) =>
      value.attendanceEndMinute > value.attendanceStartMinute &&
      value.attendanceTeacherLeadTarget >= value.attendanceTeacherLeadMin &&
      new Set(value.attendanceWorkingDays).size === value.attendanceWorkingDays.length,
    'Jam atau hari kerja tidak valid',
  );
