import { z } from 'zod';

export const ChatSchema = z
  .object({
    message: z.string().min(1).max(2000),
    sessionId: z.string().uuid().optional(),
  })
  .strict();

export type ChatDto = z.infer<typeof ChatSchema>;
