import { z } from 'zod';

export const HeatmapQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(31).default(10),
});
export type HeatmapQueryDto = z.infer<typeof HeatmapQuerySchema>;
