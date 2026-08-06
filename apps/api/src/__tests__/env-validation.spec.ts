// =============================================================================
// env-validation.spec.ts — Unit tests untuk validateEnv() (Item 12)
// W3-03 Security Hardening: fail-fast startup validation
// =============================================================================

import { validateEnv } from '../config/env.validation';

jest.mock('@smk/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  auditLog: jest.fn(),
  logError: jest.fn(),
}));

import { logger } from '@smk/logger';

// Valid env values yang dipakai sebagai baseline di setiap test
const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/smk_db',
  REDIS_URL: 'redis://localhost:6379',
  KEYCLOAK_URL: 'http://localhost:8080',
  KEYCLOAK_REALM: 'diis',
  KEYCLOAK_CLIENT_ID: 'diis-api',
  KEYCLOAK_CLIENT_SECRET: 'super-secret-client-secret',
  OPENAI_API_KEY: 'test-openai-key',
};

const ENV_KEYS = [...Object.keys(VALID_ENV), 'APPOINTMENT_AUTOMATION_TOKEN', 'AI_PROVIDER', 'REDIS_QUEUE_NAMESPACE'];

describe('validateEnv() — Environment Variable Validation at Startup (Item 12)', () => {
  let savedEnv: Record<string, string | undefined>;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    savedEnv = {};
    ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });

    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${code}) called`);
      });

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars
    ENV_KEYS.forEach((key) => {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key] as string;
      } else {
        delete process.env[key];
      }
    });
    exitSpy.mockRestore();
  });

  // ── VALID CASES ─────────────────────────────────────────────────────────────

  it('semua env valid → mengembalikan object yang sudah di-parse dengan tipe benar', () => {
    Object.assign(process.env, VALID_ENV);

    const env = validateEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe('3001');
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/smk_db');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.KEYCLOAK_URL).toBe('http://localhost:8080');
    expect(env.KEYCLOAK_REALM).toBe('diis');
    expect(env.KEYCLOAK_CLIENT_ID).toBe('diis-api');
    expect(env.KEYCLOAK_CLIENT_SECRET).toBe('super-secret-client-secret');
    expect(env.AI_PROVIDER).toBe('openai');
    expect(env.OPENAI_API_KEY).toBe('test-openai-key');
  });

  it('NODE_ENV tidak diset → default ke "development"', () => {
    const { NODE_ENV: _unused, ...envWithoutNodeEnv } = VALID_ENV;
    Object.assign(process.env, envWithoutNodeEnv);

    const env = validateEnv();

    expect(env.NODE_ENV).toBe('development');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('API_PORT tidak diset → default ke "3001"', () => {
    const { API_PORT: _unused, ...envWithoutPort } = VALID_ENV;
    Object.assign(process.env, envWithoutPort);

    const env = validateEnv();

    expect(env.API_PORT).toBe('3001');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER tidak diset → default ke OpenAI dengan key yang tervalidasi', () => {
    Object.assign(process.env, VALID_ENV);

    const env = validateEnv();

    expect(env.AI_PROVIDER).toBe('openai');
    expect(env.OPENAI_API_KEY).toBe('test-openai-key');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER=openai tanpa key → fail-fast', () => {
    const { OPENAI_API_KEY: _unused, ...envWithoutOpenAiKey } = VALID_ENV;
    Object.assign(process.env, { ...envWithoutOpenAiKey, AI_PROVIDER: 'openai' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('AI_PROVIDER=openai dengan key whitespace → fail-fast', () => {
    Object.assign(process.env, { ...VALID_ENV, AI_PROVIDER: 'openai', OPENAI_API_KEY: '   ' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('AI_PROVIDER=ollama tanpa OpenAI key → valid untuk mode local/embedding', () => {
    const { OPENAI_API_KEY: _unused, ...envWithoutOpenAiKey } = VALID_ENV;
    Object.assign(process.env, { ...envWithoutOpenAiKey, AI_PROVIDER: 'ollama' });

    const env = validateEnv();

    expect(env.AI_PROVIDER).toBe('ollama');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER=ollama dengan key whitespace → key dianggap tidak dikonfigurasi dan tetap valid', () => {
    Object.assign(process.env, { ...VALID_ENV, AI_PROVIDER: 'ollama', OPENAI_API_KEY: '   ' });

    const env = validateEnv();

    expect(env.AI_PROVIDER).toBe('ollama');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('NODE_ENV = "production" dengan REDIS_QUEUE_NAMESPACE → valid', () => {
    Object.assign(process.env, { ...VALID_ENV, NODE_ENV: 'production', REDIS_QUEUE_NAMESPACE: 'production' });

    const env = validateEnv();

    expect(env.NODE_ENV).toBe('production');
    expect(env.REDIS_QUEUE_NAMESPACE).toBe('production');
  });

  it('NODE_ENV = "production" tanpa REDIS_QUEUE_NAMESPACE → fail-fast', () => {
    Object.assign(process.env, { ...VALID_ENV, NODE_ENV: 'production' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('REDIS_QUEUE_NAMESPACE invalid → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, REDIS_QUEUE_NAMESPACE: 'Staging Prod' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('APPOINTMENT_AUTOMATION_TOKEN kosong dari compose dianggap tidak dikonfigurasi', () => {
    Object.assign(process.env, { ...VALID_ENV, APPOINTMENT_AUTOMATION_TOKEN: '' });

    const env = validateEnv();

    expect(env.APPOINTMENT_AUTOMATION_TOKEN).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('APPOINTMENT_AUTOMATION_TOKEN terlalu pendek memicu process.exit(1)', () => {
    Object.assign(process.env, { ...VALID_ENV, APPOINTMENT_AUTOMATION_TOKEN: 'short' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── INVALID CASES — process.exit(1) WAJIB DIPANGGIL ──────────────────────

  it('DATABASE_URL kosong → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, DATABASE_URL: '' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('DATABASE_URL bukan URL valid → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, DATABASE_URL: 'tidak-valid' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('REDIS_URL kosong → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, REDIS_URL: '' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('NODE_ENV invalid (misal: "staging") → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, NODE_ENV: 'staging' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('KEYCLOAK_CLIENT_SECRET tidak ada → process.exit(1) dipanggil', () => {
    const { KEYCLOAK_CLIENT_SECRET: _unused, ...envWithoutSecret } = VALID_ENV;
    Object.assign(process.env, envWithoutSecret);

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('KEYCLOAK_REALM kosong string → process.exit(1) dipanggil', () => {
    Object.assign(process.env, { ...VALID_ENV, KEYCLOAK_REALM: '' });

    expect(() => validateEnv()).toThrow('process.exit(1) called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('saat exit, logger.error dipanggil dengan field errors', () => {
    Object.assign(process.env, { ...VALID_ENV, DATABASE_URL: '' });

    expect(() => validateEnv()).toThrow();
    expect(logger.error).toHaveBeenCalledWith('Invalid environment variables', expect.objectContaining({ errors: expect.any(Object) }));
  });
});
