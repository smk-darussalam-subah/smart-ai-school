// =============================================================================
// env-validation.spec.ts — Unit tests untuk validateEnv() (Item 12)
// W3-03 Security Hardening: fail-fast startup validation
// =============================================================================

import { validateEnv } from '../config/env.validation';

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
};

const ENV_KEYS = Object.keys(VALID_ENV);

describe('validateEnv() — Environment Variable Validation at Startup (Item 12)', () => {
  let savedEnv: Record<string, string | undefined>;
  let exitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Simpan state env sebelum test
    savedEnv = {};
    ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });

    // Mock process.exit agar tidak benar-benar terminate process
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${code}) called`);
      });

    // Suppress console.error output agar test output bersih
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
    consoleErrorSpy.mockRestore();
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

  it('NODE_ENV = "production" → valid (enum production diizinkan)', () => {
    Object.assign(process.env, { ...VALID_ENV, NODE_ENV: 'production' });

    const env = validateEnv();

    expect(env.NODE_ENV).toBe('production');
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

  it('saat exit, console.error menampilkan field errors (tidak silent)', () => {
    Object.assign(process.env, { ...VALID_ENV, DATABASE_URL: '' });

    expect(() => validateEnv()).toThrow();
    // console.error harus dipanggil 2x: untuk pesan + untuk field errors
    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Invalid environment variables:');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });
});
