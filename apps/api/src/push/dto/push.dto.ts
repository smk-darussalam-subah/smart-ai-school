import { isIP } from 'node:net';
import { z } from 'zod';

// Push DTO (P16 — W3-6). PWA push notification subscriptions.

const PUSH_ENDPOINT_MAX_LENGTH = 2048;
const PUSH_ENDPOINT_HOST_ALLOWLIST = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'fcmregistrations.googleapis.com',
  'notify.windows.com',
  'push.apple.com',
  'updates.push.services.mozilla.com',
] as const;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isPrivateOrLocalIp(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [a = 0, b = 0] = normalized.split('.').map((part) => Number(part));
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (ipVersion === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('ff')
    );
  }
  return normalized === 'localhost' || normalized.endsWith('.localhost');
}

function isAllowedPushHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return PUSH_ENDPOINT_HOST_ALLOWLIST.some(
    (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
  );
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !isPrivateOrLocalIp(url.hostname) &&
      isAllowedPushHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export const PushEndpointSchema = z
  .string()
  .trim()
  .min(1)
  .max(PUSH_ENDPOINT_MAX_LENGTH)
  .url()
  .refine(
    isAllowedPushEndpoint,
    'Endpoint push harus HTTPS dan berasal dari provider Web Push tepercaya',
  );

export const SubscribeSchema = z
  .object({
    endpoint: PushEndpointSchema,
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(1024),
        auth: z.string().trim().min(1).max(1024),
      })
      .strict(),
  })
  .strict();
export type SubscribeDto = z.infer<typeof SubscribeSchema>;

export const UnsubscribeSchema = z
  .object({
    endpoint: PushEndpointSchema,
  })
  .strict();
export type UnsubscribeDto = z.infer<typeof UnsubscribeSchema>;

export const PushDeliveryMessageSchema = z
  .object({
    version: z.literal(2),
    messageId: z.string().uuid(),
    refType: z.string().max(100).nullable(),
    refId: z.string().max(512).nullable(),
    title: z.string().max(500),
    body: z.string().max(8192),
    url: z.string().max(2048),
    tag: z.string().max(64),
  })
  .strict();
export type PushDeliveryMessage = z.infer<typeof PushDeliveryMessageSchema>;

export const VerifyPushDeliverySchema = z
  .object({
    endpoint: PushEndpointSchema,
    proof: z.string().regex(/^[a-f0-9]{64}$/),
    message: PushDeliveryMessageSchema,
  })
  .strict();
export type VerifyPushDeliveryDto = z.infer<typeof VerifyPushDeliverySchema>;
