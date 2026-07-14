import { z } from 'zod';
import { UserRole } from '@smk/auth';

export const ListUsersQuerySchema = z.object({
  role: UserRole.optional(),
  search: z.string().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const GroupedUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type GroupedUsersQuery = z.infer<typeof GroupedUsersQuerySchema>;

// ── Consent status query (admin) ─────────────────────────────────────────────

export const ListConsentQuerySchema = z.object({
  role: UserRole.optional(),
  consentStatus: z.enum(['given', 'pending', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListConsentQuery = z.infer<typeof ListConsentQuerySchema>;

// ── Online users query (admin) ────────────────────────────────────────────────

export const OnlineUsersQuerySchema = z.object({
  threshold: z.coerce.number().int().positive().max(600).default(120), // seconds
  role: UserRole.optional(),
});

export type OnlineUsersQuery = z.infer<typeof OnlineUsersQuerySchema>;

// ── Login events query (admin) ────────────────────────────────────────────────

export const ListLoginEventsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.string().max(50).optional(),
  eventType: z.enum(['login', 'logout', 'failed']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListLoginEventsQuery = z.infer<typeof ListLoginEventsQuerySchema>;
