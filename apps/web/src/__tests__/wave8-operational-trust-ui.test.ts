import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { apiFetchResult } from '@/lib/api';
import { redirect } from 'next/navigation';
import { USER_IDENTITY_ROLE_OPTIONS, USERS_SEARCH_DEBOUNCE_MS, isUserIdentityRoleOption } from '@/app/dashboard/users/users-ui';
import { calendarEmptyStateMessage, canMutateCalendar, resolveCalendarScope } from '@/app/dashboard/kalender/kalender-ui';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    const error = new Error('NEXT_REDIRECT') as Error & { digest?: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  }),
}));

const fetchMock = jest.fn();

function response(status: number, body: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === '__tests__' || entry === '.next') continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

describe('Wave 8 API fetch result helper', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (redirect as unknown as jest.Mock).mockClear();
    global.fetch = fetchMock;
  });

  it('returns success only for valid JSON success responses', async () => {
    fetchMock.mockResolvedValue(response(200, '{"data":[{"id":"1"}]}'));

    await expect(apiFetchResult<{ data: Array<{ id: string }> }>('/users', 'token')).resolves.toEqual({
      status: 'success',
      httpStatus: 200,
      data: { data: [{ id: '1' }] },
    });
  });

  it('keeps an empty successful payload distinct from request failure', async () => {
    fetchMock.mockResolvedValue(response(200, '[]'));

    await expect(apiFetchResult<unknown[]>('/calendar', 'token')).resolves.toEqual({
      status: 'success',
      httpStatus: 200,
      data: [],
    });
  });

  it('fails closed on empty 2xx responses', async () => {
    fetchMock.mockResolvedValue(response(200, ''));

    await expect(apiFetchResult('/users', 'token')).resolves.toEqual({
      status: 'unavailable',
      httpStatus: 200,
      message: 'Respons server tidak valid. Coba lagi.',
    });
  });

  it('maps forbidden, not-found, server, and request errors without collapsing to empty data', async () => {
    fetchMock
      .mockResolvedValueOnce(response(403, '{"message":"Tidak berwenang"}'))
      .mockResolvedValueOnce(response(404, '{"message":"Tidak ditemukan"}'))
      .mockResolvedValueOnce(response(500, '{"message":"Server gagal"}'))
      .mockResolvedValueOnce(response(400, '{"message":[{"field":"role","message":"invalid"}]}'));

    await expect(apiFetchResult('/users', 'token')).resolves.toMatchObject({ status: 'forbidden', message: 'Tidak berwenang' });
    await expect(apiFetchResult('/users/missing', 'token')).resolves.toMatchObject({ status: 'notFound', message: 'Tidak ditemukan' });
    await expect(apiFetchResult('/users', 'token')).resolves.toMatchObject({ status: 'unavailable', message: 'Server gagal' });
    await expect(apiFetchResult('/users', 'token')).resolves.toMatchObject({ status: 'requestError', message: 'role: invalid' });
  });

  it('fails closed on malformed JSON success responses', async () => {
    fetchMock.mockResolvedValue(response(200, '<html>bad gateway</html>'));

    await expect(apiFetchResult('/users', 'token')).resolves.toMatchObject({
      status: 'unavailable',
      message: 'Respons server tidak valid. Coba lagi.',
    });
  });

  it('maps network failures to unavailable without leaking transport details', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3001'));

    await expect(apiFetchResult('/users', 'token')).resolves.toEqual({
      status: 'unavailable',
      message: 'Koneksi ke server gagal. Coba lagi.',
    });
  });

  it('preserves the Next redirect boundary for expired sessions', async () => {
    fetchMock.mockResolvedValue(response(401, '{"message":"expired"}'));

    await expect(apiFetchResult('/users', 'token')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?reason=session');
  });
});

describe('Wave 8 operational UI guardrails', () => {
  it('offers only six primary identity roles in Users management', () => {
    expect(USER_IDENTITY_ROLE_OPTIONS).toEqual([
      'SUPER_ADMIN',
      'TATA_USAHA',
      'GURU',
      'SISWA',
      'ORANG_TUA',
      'INDUSTRI',
    ]);
    expect(isUserIdentityRoleOption('KEPALA_SEKOLAH')).toBe(false);
    expect(isUserIdentityRoleOption('WAKA_KURIKULUM')).toBe(false);
  });

  it('uses an explicit debounce budget for Users search navigation', () => {
    expect(USERS_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(USERS_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(600);
  });

  it('locks calendar mutations when the active period status is unavailable', () => {
    const activeYear = { id: 'ay-1', code: '2026/2027' };

    expect(canMutateCalendar(activeYear, null)).toBe(true);
    expect(canMutateCalendar(activeYear, 'Status tahun ajaran aktif belum dapat dimuat.')).toBe(false);
    expect(canMutateCalendar(null, null)).toBe(false);
  });

  it('uses actionable calendar empty-state copy only when add agenda is enabled', () => {
    expect(calendarEmptyStateMessage(true)).toBe('Belum ada agenda. Klik Tambah Agenda.');
    expect(calendarEmptyStateMessage(false)).toBe('Belum ada agenda yang dapat ditampilkan karena tahun ajaran aktif belum tersedia.');
    expect(calendarEmptyStateMessage(false)).not.toContain('Klik Tambah Agenda');
  });

  it('scopes calendar fetches to the exact active academic year and never falls back unscoped', () => {
    expect(resolveCalendarScope({
      status: 'success',
      data: { id: 'ay-2026', code: '2026/2027' },
    })).toMatchObject({
      academicYear: { id: 'ay-2026', code: '2026/2027' },
      query: { academicYearId: 'ay-2026' },
      periodWarning: null,
    });

    expect(resolveCalendarScope({
      status: 'success',
      data: { id: 'ay-2027', code: '2027/2028' },
    })).toMatchObject({
      academicYear: { id: 'ay-2027', code: '2027/2028' },
      query: { academicYearId: 'ay-2027' },
      periodWarning: null,
    });

    expect(resolveCalendarScope({ status: 'notFound' })).toMatchObject({
      academicYear: null,
      query: null,
    });
    expect(resolveCalendarScope({ status: 'unavailable' })).toMatchObject({
      academicYear: null,
      query: null,
    });
  });

  it('does not ship native browser confirm, alert, or prompt in dashboard source', () => {
    const srcRoot = path.join(__dirname, '..');
    const offenders = collectSourceFiles(srcRoot).flatMap((file) => {
      const rel = path.relative(srcRoot, file);
      const source = readFileSync(file, 'utf8');
      return /window\.(confirm|alert|prompt)|\b(confirm|alert|prompt)\(/.test(source) ? [rel] : [];
    });

    expect(offenders).toEqual([]);
  });
});
