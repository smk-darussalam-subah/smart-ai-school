import { z } from 'zod';

export const UpdateKnowledgeSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).optional(),
    category: z.string().min(1).max(100).optional(),
  })
  .strict();

export type UpdateKnowledgeDto = z.infer<typeof UpdateKnowledgeSchema>;
