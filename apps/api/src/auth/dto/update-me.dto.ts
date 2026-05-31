import { z } from 'zod';

/**
 * DTO update profil diri sendiri.
 * Hanya phone dan avatarUrl — tidak ada field lain yang bisa diubah via endpoint ini.
 * strict() memastikan field di luar schema (mis. role, email) langsung ditolak 400.
 */
export const UpdateMeSchema = z
  .object({
    phone: z.string().max(20).optional(),
    avatarUrl: z.string().url().max(500).nullable().optional(),
  })
  .strict();

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
