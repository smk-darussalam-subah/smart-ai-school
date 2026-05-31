import { z } from 'zod';

export const UpdateStatusSchema = z
  .object({
    status: z.enum([
      'new', 'contacted', 'interested', 'registered',
      'paid', 'accepted', 'rejected', 'cold',
    ]),
    notes: z.string().max(1000).optional(),
    followUpAt: z.coerce.date().optional(),
  })
  .strict();

export type UpdateStatusDto = z.infer<typeof UpdateStatusSchema>;
