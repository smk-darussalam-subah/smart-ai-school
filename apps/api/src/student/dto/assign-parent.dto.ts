import { z } from 'zod';
import { phoneE164 } from '../../common/helpers/phone';

export const AssignParentSchema = z
  .object({
    ortu: z.object({
      name: z.string().min(1, 'nama ortu wajib diisi'),
      phone: phoneE164,
      email: z.string().email().optional(),
    }),
    reuseParentByPhone: z.boolean().optional(),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'consent harus bernilai true — operator wajib konfirmasi persetujuan data' }),
    }),
  })
  .strict();

export type AssignParentDto = z.infer<typeof AssignParentSchema>;
