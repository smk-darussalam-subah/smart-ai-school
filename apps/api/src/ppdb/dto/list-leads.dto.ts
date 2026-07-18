import { z } from 'zod';

export const ListLeadsQuerySchema = z.object({
  status: z
    .enum(['new', 'contacted', 'interested', 'registered', 'paid', 'accepted', 'rejected', 'cold'])
    .optional(),
  source: z
    .enum(['chatbot_wa', 'website', 'referral', 'instagram', 'tiktok', 'event', 'walk_in', 'other'])
    .optional(),
  search: z.string().trim().max(100).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListLeadsQuery = z.infer<typeof ListLeadsQuerySchema>;
