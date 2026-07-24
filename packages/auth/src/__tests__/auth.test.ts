// =============================================================================
// @smk/auth — Unit Tests (FIX-T10, SMA-28)
// Target: ≥70% coverage (lines, functions, statements)
//
// Cakupan:
//   - UserRole enum
//   - KeycloakTokenPayloadSchema validation
//   - extractAuthUser() — pure function
//   - hasRole() — pure function
//   - isAdmin() — pure function
//   - verifyKeycloakToken() — dengan mock jwks-rsa + jsonwebtoken
// =============================================================================

// ─── Mock declarations ───────────────────────────────────────────────────────
// Catatan: variabel dengan prefix 'mock' di-hoist oleh ts-jest bersama jest.mock(),
// sehingga bisa digunakan di dalam factory function jest.mock().

const mockGetSigningKey = jest.fn();
const mockGetPublicKey = jest.fn().mockReturnValue('mock-rsa-public-key');
const mockJwtDecode = jest.fn();
const mockJwtVerify = jest.fn();

// Mock jwks-rsa: factory mengembalikan object dengan getSigningKey
jest.mock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: mockGetSigningKey })));

// Mock jsonwebtoken: hanya decode dan verify yang dipakai
jest.mock('jsonwebtoken', () => ({
  decode: mockJwtDecode,
  verify: mockJwtVerify,
}));

// ─── Imports (setelah mock) ───────────────────────────────────────────────────
import {
  UserRole,
  PRIMARY_ROLES,
  KeycloakTokenPayloadSchema,
  verifyKeycloakToken,
  extractAuthUser,
  hasRole,
  isAdmin,
  isPrimaryRole,
  type KeycloakTokenPayload,
  type AuthUser,
} from '../index';

// =============================================================================
// HELPERS
// =============================================================================

/** Membuat KeycloakTokenPayload lengkap dengan nilai default yang valid */
function makePayload(overrides?: Partial<KeycloakTokenPayload>): KeycloakTokenPayload {
  return {
    sub: 'user-uuid-abc123',
    email: 'guru@smkdarussalam.sch.id',
    email_verified: true,
    preferred_username: 'guru_budi',
    given_name: 'Budi',
    family_name: 'Santoso',
    realm_access: { roles: ['GURU', 'default-roles-diis'] },
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'http://localhost:8080/realms/diis',
    ...overrides,
  };
}

/** Membuat AuthUser dengan nilai default */
function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    keycloakId: 'user-uuid-abc123',
    email: 'guru@smkdarussalam.sch.id',
    username: 'guru_budi',
    roles: ['GURU'],
    fullName: 'Budi Santoso',
    ...overrides,
  };
}

// =============================================================================
// UserRole
// =============================================================================

describe('UserRole', () => {
  describe('struktur enum', () => {
    // 6 base roles + 13 position codes = 19 total
    // (KEPALA_SEKOLAH is a position code, not a base role)
    it('memiliki tepat 19 role (6 base + 13 position codes)', () => {
      expect(UserRole.options).toHaveLength(19);
    });

    it('mengandung semua role yang diharapkan', () => {
      const expected: string[] = [
        // Base roles
        'SUPER_ADMIN',
        'TATA_USAHA',
        'GURU',
        'SISWA',
        'ORANG_TUA',
        'INDUSTRI',
        // Position codes
        'KEPALA_SEKOLAH',
        'WAKA_KURIKULUM',
        'WAKA_KESISWAAN',
        'WAKA_HUMAS',
        'WAKA_SARPRAS',
        'KEPALA_TU',
        'KAPROG',
        'KOOR_BKK',
        'KOOR_HUBIN',
        'GURU_BK',
        'BENDAHARA',
        'STAF_KEPEGAWAIAN',
        'OPERATOR_DAPODIK',
      ];
      expect(UserRole.options).toEqual(expect.arrayContaining(expected));
    });

    it('PRIMARY_ROLES hanya berisi 6 role identitas stabil', () => {
      expect(PRIMARY_ROLES).toEqual([
        'SUPER_ADMIN',
        'TATA_USAHA',
        'GURU',
        'SISWA',
        'ORANG_TUA',
        'INDUSTRI',
      ]);
      expect(isPrimaryRole('KEPALA_SEKOLAH')).toBe(false);
      expect(isPrimaryRole('WAKA_KURIKULUM')).toBe(false);
    });
  });

  describe('validasi', () => {
    it('parse role valid → berhasil', () => {
      expect(UserRole.parse('GURU')).toBe('GURU');
      expect(UserRole.parse('SUPER_ADMIN')).toBe('SUPER_ADMIN');
      expect(UserRole.parse('TATA_USAHA')).toBe('TATA_USAHA');
      expect(UserRole.parse('INDUSTRI')).toBe('INDUSTRI');
    });

    it('parse role tidak dikenal → melempar ZodError', () => {
      expect(() => UserRole.parse('DEKAN')).toThrow();
      expect(() => UserRole.parse('admin')).toThrow(); // case-sensitive
      expect(() => UserRole.parse('')).toThrow();
    });

    it('safeParse role valid → success: true', () => {
      const result = UserRole.safeParse('SISWA');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('SISWA');
    });

    it('safeParse role tidak valid → success: false', () => {
      const result = UserRole.safeParse('INVALID_ROLE');
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// KeycloakTokenPayloadSchema
// =============================================================================

describe('KeycloakTokenPayloadSchema', () => {
  describe('payload valid', () => {
    it('parse payload lengkap → berhasil', () => {
      const raw = makePayload();
      const result = KeycloakTokenPayloadSchema.parse(raw);

      expect(result.sub).toBe('user-uuid-abc123');
      expect(result.email).toBe('guru@smkdarussalam.sch.id');
      expect(result.realm_access?.roles).toContain('GURU');
    });

    it('payload minimal (hanya field required) → berhasil', () => {
      const minimal = {
        sub: 'user-123',
        iat: 1000000,
        exp: 9999999999,
        iss: 'http://localhost:8080/realms/diis',
      };
      const result = KeycloakTokenPayloadSchema.parse(minimal);
      expect(result.sub).toBe('user-123');
      expect(result.email).toBeUndefined();
      expect(result.realm_access).toBeUndefined();
    });

    it('aud sebagai string tunggal → berhasil', () => {
      const payload = makePayload({ aud: 'diis-api' });
      const result = KeycloakTokenPayloadSchema.parse(payload);
      expect(result.aud).toBe('diis-api');
    });

    it('aud sebagai array → berhasil', () => {
      const payload = makePayload({ aud: ['diis-api', 'diis-web'] });
      const result = KeycloakTokenPayloadSchema.parse(payload);
      expect(Array.isArray(result.aud)).toBe(true);
    });
  });

  describe('payload tidak valid', () => {
    it('tanpa sub → melempar ZodError', () => {
      const { sub: _sub, ...withoutSub } = makePayload();
      expect(() => KeycloakTokenPayloadSchema.parse(withoutSub)).toThrow();
    });

    it('tanpa iat → melempar ZodError', () => {
      const { iat: _iat, ...withoutIat } = makePayload();
      expect(() => KeycloakTokenPayloadSchema.parse(withoutIat)).toThrow();
    });

    it('tanpa exp → melempar ZodError', () => {
      const { exp: _exp, ...withoutExp } = makePayload();
      expect(() => KeycloakTokenPayloadSchema.parse(withoutExp)).toThrow();
    });

    it('tanpa iss → melempar ZodError', () => {
      const { iss: _iss, ...withoutIss } = makePayload();
      expect(() => KeycloakTokenPayloadSchema.parse(withoutIss)).toThrow();
    });

    it('email tidak valid (bukan format email) → melempar ZodError', () => {
      const payload = makePayload({ email: 'bukan-email-valid' });
      expect(() => KeycloakTokenPayloadSchema.parse(payload)).toThrow();
    });
  });
});

// =============================================================================
// extractAuthUser()
// =============================================================================

describe('extractAuthUser()', () => {
  describe('happy path', () => {
    it('mengekstrak semua field dari payload lengkap', () => {
      const payload = makePayload();
      const user = extractAuthUser(payload);

      expect(user.keycloakId).toBe('user-uuid-abc123');
      expect(user.email).toBe('guru@smkdarussalam.sch.id');
      expect(user.username).toBe('guru_budi');
      expect(user.fullName).toBe('Budi Santoso');
      expect(user.roles).toEqual(['GURU']);
    });

    it('full name digabung dari given_name + family_name', () => {
      const payload = makePayload({ given_name: 'Ahmad', family_name: 'Fauzi' });
      const user = extractAuthUser(payload);
      expect(user.fullName).toBe('Ahmad Fauzi');
    });

    it('hanya given_name (tanpa family_name) → fullName hanya first name', () => {
      const payload = makePayload({ given_name: 'Sari', family_name: undefined });
      const user = extractAuthUser(payload);
      expect(user.fullName).toBe('Sari');
    });
  });

  describe('filter roles', () => {
    it('menghapus role default Keycloak (default-roles-*)', () => {
      const payload = makePayload({
        realm_access: { roles: ['GURU', 'default-roles-diis'] },
      });
      const user = extractAuthUser(payload);
      expect(user.roles).toEqual(['GURU']);
      expect(user.roles).not.toContain('default-roles-diis');
    });

    it('menghapus role Keycloak internal (offline_access, uma_authorization)', () => {
      const payload = makePayload({
        realm_access: { roles: ['SISWA', 'offline_access', 'uma_authorization'] },
      });
      const user = extractAuthUser(payload);
      expect(user.roles).toEqual(['SISWA']);
    });

    it('multiple valid roles — semua disertakan', () => {
      const payload = makePayload({
        realm_access: {
          roles: ['GURU', 'TATA_USAHA', 'default-roles-diis', 'nonexistent-role'],
        },
      });
      const user = extractAuthUser(payload);
      expect(user.roles).toContain('GURU');
      expect(user.roles).toContain('TATA_USAHA');
      expect(user.roles).not.toContain('nonexistent-role');
    });

    it('menghapus position code historis dari JWT Keycloak', () => {
      const payload = makePayload({
        realm_access: {
          roles: ['GURU', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM'],
        },
      });
      const user = extractAuthUser(payload);
      expect(user.roles).toEqual(['GURU']);
    });
  });

  describe('fallback values', () => {
    it('tanpa realm_access → roles array kosong', () => {
      const payload = makePayload({ realm_access: undefined });
      const user = extractAuthUser(payload);
      expect(user.roles).toEqual([]);
    });

    it('tanpa email → email string kosong', () => {
      const payload = makePayload({ email: undefined });
      const user = extractAuthUser(payload);
      expect(user.email).toBe('');
    });

    it('tanpa preferred_username → username dari sub', () => {
      const payload = makePayload({ preferred_username: undefined });
      const user = extractAuthUser(payload);
      expect(user.username).toBe('user-uuid-abc123'); // fallback ke sub
    });

    it('tanpa given/family name → fullName dari preferred_username', () => {
      const payload = makePayload({ given_name: undefined, family_name: undefined });
      const user = extractAuthUser(payload);
      expect(user.fullName).toBe('guru_budi'); // fallback ke preferred_username
    });

    it('tanpa nama dan username → fullName dan username dari sub', () => {
      const payload = makePayload({
        given_name: undefined,
        family_name: undefined,
        preferred_username: undefined,
      });
      const user = extractAuthUser(payload);
      expect(user.username).toBe('user-uuid-abc123');
      // fullName: [undefined, undefined].filter(Boolean) = '' → preferred_username undefined → ''
      expect(user.fullName).toBe('');
    });
  });
});

// =============================================================================
// hasRole()
// =============================================================================

describe('hasRole()', () => {
  it('user memiliki role yang dicek → true', () => {
    const user = makeUser({ roles: ['GURU'] });
    expect(hasRole(user, 'GURU')).toBe(true);
  });

  it('user tidak memiliki role yang dicek → false', () => {
    const user = makeUser({ roles: ['GURU'] });
    expect(hasRole(user, 'SISWA')).toBe(false);
  });

  it('cek multiple roles: cukup salah satu cocok → true', () => {
    const user = makeUser({ roles: ['GURU'] });
    expect(hasRole(user, 'SISWA', 'GURU', 'ORANG_TUA')).toBe(true);
  });

  it('cek multiple roles: tidak ada yang cocok → false', () => {
    const user = makeUser({ roles: ['GURU'] });
    expect(hasRole(user, 'SISWA', 'ORANG_TUA', 'INDUSTRI')).toBe(false);
  });

  it('user dengan multiple roles: role pertama cocok → true', () => {
    const user = makeUser({ roles: ['SUPER_ADMIN', 'GURU'] });
    expect(hasRole(user, 'SUPER_ADMIN')).toBe(true);
  });

  it('user dengan multiple roles: role kedua cocok → true', () => {
    const user = makeUser({ roles: ['SUPER_ADMIN', 'GURU'] });
    expect(hasRole(user, 'GURU')).toBe(true);
  });

  it('user tanpa roles → selalu false', () => {
    const user = makeUser({ roles: [] });
    expect(hasRole(user, 'GURU')).toBe(false);
    expect(hasRole(user, 'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'SISWA')).toBe(false);
  });
});

// =============================================================================
// isAdmin()
// =============================================================================

describe('isAdmin()', () => {
  it('SUPER_ADMIN → true', () => {
    expect(isAdmin(makeUser({ roles: ['SUPER_ADMIN'] }))).toBe(true);
  });

  it('KEPALA_SEKOLAH -> false karena jabatan bukan admin identity role', () => {
    expect(isAdmin(makeUser({ roles: ['KEPALA_SEKOLAH'] }))).toBe(false);
  });

  it('GURU → false', () => {
    expect(isAdmin(makeUser({ roles: ['GURU'] }))).toBe(false);
  });

  it('TATA_USAHA → false', () => {
    expect(isAdmin(makeUser({ roles: ['TATA_USAHA'] }))).toBe(false);
  });

  it('SISWA → false', () => {
    expect(isAdmin(makeUser({ roles: ['SISWA'] }))).toBe(false);
  });

  it('ORANG_TUA → false', () => {
    expect(isAdmin(makeUser({ roles: ['ORANG_TUA'] }))).toBe(false);
  });

  it('INDUSTRI → false', () => {
    expect(isAdmin(makeUser({ roles: ['INDUSTRI'] }))).toBe(false);
  });

  it('user tanpa role → false', () => {
    expect(isAdmin(makeUser({ roles: [] }))).toBe(false);
  });

  it('SUPER_ADMIN + role lain → true', () => {
    expect(isAdmin(makeUser({ roles: ['SUPER_ADMIN', 'GURU'] }))).toBe(true);
  });
});

// =============================================================================
// verifyKeycloakToken() — dengan mock jwks-rsa + jsonwebtoken
// =============================================================================

describe('verifyKeycloakToken()', () => {
  const validPayload = makePayload();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: decode berhasil dengan kid di header
    mockJwtDecode.mockReturnValue({
      header: { kid: 'rsa-key-id-1', alg: 'RS256' },
      payload: validPayload,
    });

    // Default: getSigningKey berhasil mengembalikan kunci publik
    mockGetSigningKey.mockResolvedValue({ getPublicKey: mockGetPublicKey });

    // Default: verify berhasil mengembalikan payload valid
    mockJwtVerify.mockReturnValue(validPayload);
  });

  it('token valid → mengembalikan KeycloakTokenPayload', async () => {
    const result = await verifyKeycloakToken('eyJ.valid.token');

    expect(result.sub).toBe('user-uuid-abc123');
    expect(result.email).toBe('guru@smkdarussalam.sch.id');
    expect(mockJwtDecode).toHaveBeenCalledWith('eyJ.valid.token', { complete: true });
    expect(mockGetSigningKey).toHaveBeenCalledWith('rsa-key-id-1');
    expect(mockJwtVerify).toHaveBeenCalledWith(
      'eyJ.valid.token',
      'mock-rsa-public-key',
      expect.objectContaining({ algorithms: ['RS256'] }),
    );
  });

  it('jwt.decode mengembalikan null (token malformed) → melempar Error', async () => {
    mockJwtDecode.mockReturnValue(null);

    await expect(verifyKeycloakToken('malformed-token')).rejects.toThrow(
      'Token tidak valid: tidak bisa di-decode',
    );
  });

  it('token tanpa field kid di header → melempar Error', async () => {
    mockJwtDecode.mockReturnValue({
      header: { alg: 'RS256' }, // tidak ada kid
      payload: validPayload,
    });

    await expect(verifyKeycloakToken('no-kid-token')).rejects.toThrow(
      'Token tidak valid: tidak bisa di-decode',
    );
  });

  it('JWKS getSigningKey gagal (Keycloak down) → melempar Error', async () => {
    mockGetSigningKey.mockRejectedValueOnce(
      new Error('Koneksi ke JWKS endpoint gagal'),
    );

    await expect(verifyKeycloakToken('eyJ.valid.header')).rejects.toThrow(
      'Koneksi ke JWKS endpoint gagal',
    );
  });

  it('jwt.verify gagal (token expired) → melempar Error dengan pesan asli', async () => {
    mockJwtVerify.mockImplementationOnce(() => {
      throw new Error('jwt expired');
    });

    await expect(verifyKeycloakToken('expired.token')).rejects.toThrow('jwt expired');
  });

  it('jwt.verify gagal (invalid signature) → melempar Error', async () => {
    mockJwtVerify.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });

    await expect(verifyKeycloakToken('tampered.token')).rejects.toThrow('invalid signature');
  });

  it('payload valid tetapi tidak cocok schema Zod → melempar ZodError', async () => {
    // verify mengembalikan payload yang melewatkan validasi runtime
    mockJwtVerify.mockReturnValueOnce({
      // missing required fields: sub, iat, exp, iss
      email: 'someone@example.com',
    });

    await expect(verifyKeycloakToken('eyJ.valid.but.bad.claims')).rejects.toThrow();
  });

  it('memanggil getPublicKey dari signing key yang diterima', async () => {
    await verifyKeycloakToken('eyJ.token');

    expect(mockGetPublicKey).toHaveBeenCalled();
    expect(mockJwtVerify).toHaveBeenCalledWith(
      expect.any(String),
      'mock-rsa-public-key',
      expect.any(Object),
    );
  });
});
