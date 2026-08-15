import { z } from 'zod';

// amount diinput manual per transaksi (D-3: tanpa tabel tarif master)
// recordedBy TIDAK ada di body — diambil dari JWT (auth.users.id)
export const CreateSppSchema = z
  .object({
    studentId: z.string().uuid(),
    month:     z.number().int().min(1).max(12),
    year:      z.number().int().min(2020).max(2100),
    amount:    z.number().positive(),
  })
  .strict();

export type CreateSppDto = z.infer<typeof CreateSppSchema>;
