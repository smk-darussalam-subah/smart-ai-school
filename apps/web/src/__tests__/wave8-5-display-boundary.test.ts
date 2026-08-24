import { NextRequest } from 'next/server';
import { POST as activateDisplay } from '../app/api/display/activate/route';
import { legacyDisplayHandoff } from '../app/ruang-guru/[token]/legacy-handoff';
import { neutralAlertSpeech } from '../lib/display-alerts';
import { normalizeDisplaySnapshot } from '../lib/display-contract';
import {
  DISPLAY_CREDENTIAL_COOKIE,
  DISPLAY_COOKIE_OPTIONS,
  displayCookiePolicy,
  displayCredentialHeaders,
  isSameOriginMutation,
  safeDisplayResourceId,
} from '../lib/display-proxy';
import { isSnapshotStale, reconnectDelay } from '../lib/display-state';

describe('Wave 8.5 display credential and projection boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requires same-origin mutations and validates resource IDs', () => {
    expect(
      isSameOriginMutation(
        new Request('https://school.test/api/display/activate', {
          headers: { origin: 'https://school.test' },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        new Request('https://school.test/api/display/activate', {
          headers: { origin: 'https://evil.test' },
        }),
      ),
    ).toBe(false);
    expect(isSameOriginMutation(new Request('https://school.test/api/display/activate'))).toBe(
      false,
    );
    expect(
      isSameOriginMutation(
        new Request('http://localhost:3100/api/display/activate', {
          headers: { origin: 'http://127.0.0.1:3100' },
        }),
        'http://127.0.0.1:3100',
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        new Request('http://localhost:3100/api/display/activate', {
          headers: { origin: 'https://evil.test' },
        }),
        'http://127.0.0.1:3100',
      ),
    ).toBe(false);
    expect(safeDisplayResourceId('123e4567-e89b-42d3-a456-426614174000')).toBeTruthy();
    expect(safeDisplayResourceId('../auth/me')).toBeNull();
  });

  it('keeps the opaque credential in a secure HttpOnly cookie and out of response JSON', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          credential: 'opaque-secret-value',
          device: { profile: 'RUANG_GURU' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const request = new NextRequest('https://school.test/api/display/activate', {
      method: 'POST',
      headers: { origin: 'https://school.test', 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: '123e4567-e89b-42d3-a456-426614174000',
        pairingCode: 'Guru_7K4P9x',
      }),
    });

    const response = await activateDisplay(request);
    expect(await response.json()).toEqual({ profile: 'RUANG_GURU' });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${DISPLAY_CREDENTIAL_COOKIE}=opaque-secret-value`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie.includes('Secure')).toBe(DISPLAY_COOKIE_OPTIONS.secure);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin activation before contacting the API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const response = await activateDisplay(
      new NextRequest('https://school.test/api/display/activate', {
        method: 'POST',
        headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
        body: JSON.stringify({ pairingCode: 'GURU-7K4P' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('places the credential only in the server-side display header', () => {
    expect(displayCredentialHeaders('opaque')).toEqual({
      accept: 'application/json',
      'x-diis-display-credential': 'opaque',
    });
  });

  it('normalizes only allowlisted room fields and rejects profile mismatch', () => {
    const payload = {
      profile: 'RUANG_GURU',
      generatedAt: '2026-08-24T08:00:00.000Z',
      secret: 'must-not-project',
      device: { label: 'TV Guru', isAudibleLeader: true, credentialHash: 'hidden' },
      sessions: [
        {
          id: 'session-1',
          classNameSnapshot: 'X TKJ 1',
          subjectSnapshot: 'Jaringan',
          assignedTeacherName: 'Guru Sintetis',
          roomSnapshot: 'Lab 1',
          scheduledStartAt: '2026-08-24T01:00:00.000Z',
          scheduledEndAt: '2026-08-24T02:00:00.000Z',
          status: 'STARTED',
        },
      ],
    };
    const result = normalizeDisplaySnapshot(payload, 'RUANG_GURU');
    expect(result?.device).toEqual({ label: 'TV Guru', audibleLeader: true });
    expect(result?.sessions[0]?.className).toBe('X TKJ 1');
    expect(result).not.toHaveProperty('secret');
    expect(result?.device).not.toHaveProperty('credentialHash');
    expect(normalizeDisplaySnapshot(payload, 'RUANG_TU')).toBeNull();
  });

  it('keeps room-display speech neutral and free from teacher names', () => {
    const copy = neutralAlertSpeech({ className: 'X TKJ 1', room: 'Lab 1' });
    expect(copy).toContain('X TKJ 1');
    expect(copy).toContain('Lab 1');
    expect(copy).not.toContain('Guru Sintetis');
  });

  it('uses bounded reconnect and stale thresholds', () => {
    expect(reconnectDelay(0)).toBe(1_000);
    expect(reconnectDelay(9)).toBe(30_000);
    expect(
      isSnapshotStale('2026-08-24T08:00:00.000Z', 60, Date.parse('2026-08-24T08:02:00.000Z')),
    ).toBe(true);
    expect(
      isSnapshotStale('2026-08-24T08:00:00.000Z', 180, Date.parse('2026-08-24T08:02:00.000Z')),
    ).toBe(false);
  });

  it('moves every legacy bearer URL to pairing without consuming the token', () => {
    expect(legacyDisplayHandoff()).toBe('/display/pair?reason=legacy');
  });
});
it('uses a Host-only secure policy in production and a local-only development cookie', () => {
  expect(displayCookiePolicy(true)).toEqual({ name: '__Host-diis-display', secure: true });
  expect(displayCookiePolicy(false)).toEqual({ name: 'diis-display-local', secure: false });
});
