import { z } from 'zod';

export const SummarySppQuerySchema = z.object({
  year:  z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type SummarySppQuery = z.infer<typeof SummarySppQuerySchema>;
