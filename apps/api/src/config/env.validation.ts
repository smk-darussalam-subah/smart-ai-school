// =============================================================================
// env.validation.ts — Validasi environment variables di startup
// Fail-fast: jika ada env var wajib yang kosong/invalid, API langsung exit(1)
// sehingga error terdeteksi saat deploy, bukan saat first request.
// =============================================================================

import { z } from 'zod';

/**
 * Schema untuk semua environment variable yang dibutuhkan API.
 * Jalankan di awal bootstrap() sebelum NestFactory.create().
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.string().default('3001'),
  DATABASE_URL: z.string().url('DATABASE_URL harus berupa URL valid (postgresql://...)'),
  REDIS_URL: z.string().url('REDIS_URL harus berupa URL valid (redis://...)'),
  KEYCLOAK_URL: z.string().url('KEYCLOAK_URL harus berupa URL valid (http://...)'),
  KEYCLOAK_REALM: z.string().min(1, 'KEYCLOAK_REALM tidak boleh kosong'),
  KEYCLOAK_CLIENT_ID: z.string().min(1, 'KEYCLOAK_CLIENT_ID tidak boleh kosong'),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1, 'KEYCLOAK_CLIENT_SECRET tidak boleh kosong'),
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
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}
