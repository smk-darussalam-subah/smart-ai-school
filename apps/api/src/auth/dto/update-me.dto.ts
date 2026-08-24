import { z } from 'zod';

const SafeAvatarUrlSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .superRefine((value, ctx) => {
    if (value === undefined || value === null || value === '') return;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Avatar harus URL absolut http/https' });
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Avatar hanya boleh http atau https' });
    }
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Avatar tidak boleh memuat kredensial' });
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

/**
 * DTO update profil diri sendiri.
 * Hanya phone dan avatarUrl — tidak ada field lain yang bisa diubah via endpoint ini.
 * strict() memastikan field di luar schema (mis. role, email) langsung ditolak 400.
 */
export const UpdateMeSchema = z
  .object({
    phone: z.string().max(20).optional(),
    avatarUrl: SafeAvatarUrlSchema,
  })
  .strict();

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
