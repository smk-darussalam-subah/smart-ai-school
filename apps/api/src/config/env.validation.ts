// =============================================================================
// env.validation.ts — Validasi environment variables di startup
// Fail-fast: jika ada env var wajib yang kosong/invalid, API langsung exit(1)
// sehingga error terdeteksi saat deploy, bukan saat first request.
// =============================================================================

import { z } from 'zod';
import { logger } from '@smk/logger';
import { DEFAULT_AI_PROVIDER } from './ai.config';

const blankStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Schema untuk semua environment variable yang dibutuhkan API.
 * Jalankan di awal bootstrap() sebelum NestFactory.create().
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url('DATABASE_URL harus berupa URL valid (postgresql://...)'),
  REDIS_URL: z.string().url('REDIS_URL harus berupa URL valid (redis://...)'),
  REDIS_QUEUE_NAMESPACE: z.preprocess(
    blankStringToUndefined,
    z.string()
      .regex(/^[a-z0-9][a-z0-9_-]{1,31}$/, 'REDIS_QUEUE_NAMESPACE hanya boleh huruf kecil, angka, underscore, atau dash')
      .optional(),
  ),
  KEYCLOAK_URL: z.string().url('KEYCLOAK_URL harus berupa URL valid (http://...)'),
  KEYCLOAK_REALM: z.string().min(1, 'KEYCLOAK_REALM tidak boleh kosong'),
  KEYCLOAK_CLIENT_ID: z.string().min(1, 'KEYCLOAK_CLIENT_ID tidak boleh kosong'),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1, 'KEYCLOAK_CLIENT_SECRET tidak boleh kosong'),

  // ── Notification (semua opsional — CI tetap boot tanpa key, pakai LogAdapter) ──
  // NOTIF_PROVIDER: 'fonnte' | 'smtp' | 'log' (default: 'log')
  NOTIF_PROVIDER: z.enum(['fonnte', 'smtp', 'log']).default('log'),
  FONNTE_API_KEY: z.string().optional(),
  ADMIN_PHONE_NUMBER: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  APPOINTMENT_AUTOMATION_TOKEN: z.preprocess(
    blankStringToUndefined,
    z.string().min(32).optional(),
  ),

  // ── AI / Ollama + Claude + OpenAI (SMA-48, R-28) ────────────────────────────
  // AI_PROVIDER: 'openai' (default) | 'ollama' (local) | 'claude' (legacy)
  // ANTHROPIC_API_KEY: opsional — provider Claude hanya aktif jika key tersedia
  // OPENAI_API_KEY: wajib saat provider efektif OpenAI; fail-fast mencegah fallback diam-diam
  // OLLAMA_EMBED_DIMENSIONS: HARUS cocok dengan output model (gate §2.1)
  // R-28: Hybrid strategy — Ollama (embed only) + OpenAI gpt-4.1-mini (chat/generate)
  AI_PROVIDER: z.enum(['ollama', 'claude', 'openai']).default(DEFAULT_AI_PROVIDER),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.preprocess(blankStringToUndefined, z.string().min(1).optional()),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-mini'),
  OLLAMA_URL: z.string().url('OLLAMA_URL harus berupa URL valid').default('http://ollama:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('qwen2.5:7b'),
  OLLAMA_CHAT_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(180_000).default(180_000),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_EMBED_DIMENSIONS: z.coerce.number().int().positive().default(768),

  // ── RAG retrieval (SMA-46 chatbot) ───────────────────────────────────────────
  AI_RAG_TOP_K: z.coerce.number().int().positive().default(4),
  AI_RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.3),

  // ── Sentry observability (OBS-1) — semua opsional, boot tanpa DSN = no-op ───
  // SENTRY_DSN         : Data Source Name dari Sentry project (https://xxx@sentry.io/yyy)
  // SENTRY_RELEASE     : Identifikasi release, biasanya git SHA (di-set deploy.yml)
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),

  // ── PWA Push Notifications (P16 — W3-6) — all optional, boot without = push disabled ──
  // Generate: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@smkdarussalamsubah.sch.id'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.REDIS_QUEUE_NAMESPACE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_QUEUE_NAMESPACE'],
      message: 'REDIS_QUEUE_NAMESPACE wajib diset saat NODE_ENV=production',
    });
  }
  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY wajib diisi saat AI_PROVIDER=openai',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validasi environment variables saat startup.
 * Jika ada yang tidak valid, print error dan exit(1).
 *
 * @returns Parsed environment object dengan tipe yang benar
 * @example
 * // Di main.ts, sebelum NestFactory.create():
 * const env = validateEnv();
 */
export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    logger.error('Invalid environment variables', { errors: result.error.flatten().fieldErrors });
    process.exit(1);
  }

  return result.data;
}
