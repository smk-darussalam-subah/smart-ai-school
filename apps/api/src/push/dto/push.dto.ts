import { z } from 'zod';

// Push DTO (P16 — W3-6). PWA push notification subscriptions.

export const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});
export type SubscribeDto = z.infer<typeof SubscribeSchema>;

export const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
export type UnsubscribeDto = z.infer<typeof UnsubscribeSchema>;
