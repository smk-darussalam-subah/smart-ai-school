import { z } from 'zod';

const nullableText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .transform((value) => (value.length > 0 ? value : null))
  .optional()
  .nullable();

const safeHttpUrl = (field: string) => z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .superRefine((value, ctx) => {
    if (value === undefined || value === null || value === '') return;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} harus URL absolut http/https` });
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} hanya boleh http atau https` });
    }
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} tidak boleh memuat kredensial` });
    }
  })
  .transform((value) => {
    if (value === undefined || value === null || value === '') return value === undefined ? undefined : null;
    try {
      return new URL(value).toString();
    } catch {
      return value;
    }
  });

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(3).max(255).optional(),
  npsn: nullableText(20),
  address: nullableText(2000),
  phone: nullableText(20),
  email: z.string().trim().email().max(100).optional().nullable(),
  website: safeHttpUrl('Website'),
  headmasterName: nullableText(255),
  headmasterNip: nullableText(30),
  logoUrl: safeHttpUrl('Logo URL'),
  accreditation: nullableText(5),
  // 2F-2: geofence presensi guru (null = nonaktif)
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  geofenceRadiusM: z.coerce.number().int().min(20).max(5000).optional(),
}).strict();

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
