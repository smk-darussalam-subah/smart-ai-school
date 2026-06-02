import { z } from 'zod';

export const CreateKnowledgeSchema = z
  .object({
    title: z.string().min(1).max(500),
    content: z.string().min(1),
    category: z.string().min(1).max(100),
    source: z.string().max(255).optional(),
  })
  .strict();

export type CreateKnowledgeDto = z.infer<typeof CreateKnowledgeSchema>;
