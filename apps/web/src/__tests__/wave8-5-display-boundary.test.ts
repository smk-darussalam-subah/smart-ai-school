import { NextRequest } from 'next/server';
import { POST as activateDisplay } from '../app/api/display/activate/route';
import { legacyDisplayHandoff } from '../app/ruang-guru/[token]/legacy-handoff';
import {
  canRunDisplayAudioTest,
  chooseIndonesianVoice,
  configureIndonesianSpeech,
  INDONESIAN_SPEECH_RATE,
  neutralAlertSpeech,
  playClaimedDisplayAlert,
  processDisplayAudioQueue,
} from '../lib/display-alerts';
import { normalizeDisplaySnapshot } from '../lib/display-contract';
import {
  DISPLAY_SESSION_PAGE_SIZE,
  displaySessionPage,
  displaySessionPageCount,
  displaySessionRotationCopy,
  focusDisplaySessions,
  manuallyMoveDisplaySessionPage,
  moveDisplaySessionPage,
} from '../lib/display-session-focus';
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
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

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
      attendance: {
        students: { present: 19, recorded: 20, total: 20 },
        teachers: { present: 8, recorded: 8, total: 10 },
        trend: [
          {
            date: '2026-08-25',
            studentPresent: 19,
            studentRecorded: 20,
            studentTotal: 20,
            teacherPresent: 8,
            teacherRecorded: 8,
            teacherTotal: 10,
            studentName: 'Tidak boleh diproyeksikan',
          },
        ],
      },
      agenda: [
        {
          id: 'calendar-1',
          title: 'Rapat Evaluasi',
          startsAt: '2026-08-26T00:00:00.000Z',
          endsAt: '2026-08-26T00:00:00.000Z',
          kind: 'event',
          description: 'Tidak boleh diproyeksikan',
        },
      ],
      announcements: [
        {
          id: 'announcement-1',
          title: 'Pemeliharaan jaringan',
          publishedAt: '2026-08-25T02:00:00.000Z',
          priority: 'penting',
          pinned: true,
          content: 'Tidak boleh diproyeksikan',
          createdBy: 'internal-user-id',
        },
      ],
    };
    const result = normalizeDisplaySnapshot(payload, 'RUANG_GURU');
    expect(result?.device).toEqual({ label: 'TV Guru', audibleLeader: true });
    expect(result?.sessions[0]?.className).toBe('X TKJ 1');
    expect(result?.attendance).toEqual({
      students: { present: 19, recorded: 20, total: 20 },
      teachers: { present: 8, recorded: 8, total: 10 },
      trend: [
        {
          date: '2026-08-25',
          students: { present: 19, recorded: 20, total: 20 },
          teachers: { present: 8, recorded: 8, total: 10 },
        },
      ],
    });
    expect(result?.agenda[0]).toEqual({
      id: 'calendar-1',
      title: 'Rapat Evaluasi',
      startsAt: '2026-08-26T00:00:00.000Z',
      endsAt: '2026-08-26T00:00:00.000Z',
      kind: 'event',
    });
    expect(result?.announcements[0]).toEqual({
      id: 'announcement-1',
      title: 'Pemeliharaan jaringan',
      publishedAt: '2026-08-25T02:00:00.000Z',
      priority: 'penting',
      pinned: true,
    });
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

  it('uses only an Indonesian voice with a measured speaking profile', () => {
    const englishVoice = {
      name: 'Microsoft David',
      lang: 'en-US',
      default: true,
    } as SpeechSynthesisVoice;
    const systemIndonesian = {
      name: 'Microsoft Andika',
      lang: 'id-ID',
      default: true,
    } as SpeechSynthesisVoice;
    const googleIndonesian = {
      name: 'Google Bahasa Indonesia',
      lang: 'id-ID',
      default: false,
    } as SpeechSynthesisVoice;

    expect(chooseIndonesianVoice([englishVoice])).toBeNull();
    expect(chooseIndonesianVoice([englishVoice, systemIndonesian, googleIndonesian])).toBe(
      googleIndonesian,
    );

    const utterance = {} as SpeechSynthesisUtterance;
    configureIndonesianSpeech(utterance, googleIndonesian);
    expect(utterance).toMatchObject({
      lang: 'id-ID',
      voice: googleIndonesian,
      rate: INDONESIAN_SPEECH_RATE,
      pitch: 1,
      volume: 1,
    });
    expect(INDONESIAN_SPEECH_RATE).toBe(0.92);
  });

  it('does not let the test control interrupt claimed or active alert audio', () => {
    expect(
      canRunDisplayAudioTest({
        audioEnabled: true,
        muted: false,
        alertSpeaking: false,
        playbackInFlight: 0,
      }),
    ).toBe(true);
    expect(
      canRunDisplayAudioTest({
        audioEnabled: true,
        muted: false,
        alertSpeaking: true,
        playbackInFlight: 1,
      }),
    ).toBe(false);
    expect(
      canRunDisplayAudioTest({
        audioEnabled: true,
        muted: false,
        alertSpeaking: false,
        playbackInFlight: 1,
      }),
    ).toBe(false);
  });

  it('does not claim the next alert until the current speech has completed', async () => {
    const queue = ['alert-1', 'alert-2', 'alert-3'];
    const started: string[] = [];
    const claimTimes: number[] = [];
    const completed: string[] = [];
    let virtualNow = 0;
    let releaseFirst: (() => void) | undefined;

    const draining = processDisplayAudioQueue(
      () => queue.shift(),
      async (alert) => {
        started.push(alert);
        claimTimes.push(virtualNow);
        if (alert === 'alert-1') {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        virtualNow += 30_000;
        completed.push(alert);
      },
    );

    await Promise.resolve();
    expect(started).toEqual(['alert-1']);
    expect(completed).toEqual([]);
    releaseFirst?.();
    await draining;
    expect(started).toEqual(['alert-1', 'alert-2', 'alert-3']);
    expect(completed).toEqual(['alert-1', 'alert-2', 'alert-3']);
    expect(claimTimes).toEqual([0, 30_000, 60_000]);
    expect(virtualNow).toBeGreaterThan(45_000);
  });

  it('keeps an alert retryable when speech errors after onstart', async () => {
    const utterance = {} as SpeechSynthesisUtterance;
    const synthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
    };
    const markPlayed = jest.fn().mockResolvedValue(true);
    const releaseClaim = jest.fn().mockResolvedValue(true);
    const onFailure = jest.fn();

    const playback = playClaimedDisplayAlert({
      utterance,
      synthesis,
      markPlayed,
      releaseClaim,
      onFailure,
    });
    utterance.onstart?.({} as SpeechSynthesisEvent);
    expect(markPlayed).not.toHaveBeenCalled();
    utterance.onerror?.({} as SpeechSynthesisErrorEvent);

    await expect(playback).resolves.toEqual({ status: 'retryable', reason: 'speech-error' });
    expect(markPlayed).not.toHaveBeenCalled();
    expect(releaseClaim).toHaveBeenCalledTimes(1);
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith('speech-error');
  });

  it('leaves an aborted utterance retryable after the bounded timeout', async () => {
    jest.useFakeTimers();
    const utterance = {} as SpeechSynthesisUtterance;
    const synthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
    };
    const markPlayed = jest.fn().mockResolvedValue(true);
    const releaseClaim = jest.fn().mockResolvedValue(true);

    const playback = playClaimedDisplayAlert({
      utterance,
      synthesis,
      markPlayed,
      releaseClaim,
      timeoutMs: 1_000,
    });
    utterance.onstart?.({} as SpeechSynthesisEvent);
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(playback).resolves.toEqual({ status: 'retryable', reason: 'timeout' });
    expect(markPlayed).not.toHaveBeenCalled();
    expect(releaseClaim).toHaveBeenCalledTimes(1);
  });

  it('marks PLAYED only after successful onend and keeps an expired lease retryable', async () => {
    const successfulUtterance = {} as SpeechSynthesisUtterance;
    const successfulMark = jest.fn().mockResolvedValue(true);
    const successfulRelease = jest.fn().mockResolvedValue(true);
    const success = playClaimedDisplayAlert({
      utterance: successfulUtterance,
      synthesis: { speak: jest.fn(), cancel: jest.fn() },
      markPlayed: successfulMark,
      releaseClaim: successfulRelease,
    });
    successfulUtterance.onstart?.({} as SpeechSynthesisEvent);
    expect(successfulMark).not.toHaveBeenCalled();
    successfulUtterance.onend?.({} as SpeechSynthesisEvent);
    await expect(success).resolves.toEqual({ status: 'played' });
    expect(successfulMark).toHaveBeenCalledTimes(1);
    expect(successfulRelease).toHaveBeenCalledTimes(1);

    const expiredUtterance = {} as SpeechSynthesisUtterance;
    const expiredMark = jest.fn().mockResolvedValue(false);
    const expiredRelease = jest.fn().mockResolvedValue(false);
    const expired = playClaimedDisplayAlert({
      utterance: expiredUtterance,
      synthesis: { speak: jest.fn(), cancel: jest.fn() },
      markPlayed: expiredMark,
      releaseClaim: expiredRelease,
    });
    expiredUtterance.onend?.({} as SpeechSynthesisEvent);
    await expect(expired).resolves.toEqual({
      status: 'retryable',
      reason: 'confirmation-failed',
    });
    expect(expiredRelease).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled PLAYED confirmation without cancelling completed speech', async () => {
    jest.useFakeTimers();
    const utterance = {} as SpeechSynthesisUtterance;
    const synthesis = { speak: jest.fn(), cancel: jest.fn() };
    const releaseClaim = jest.fn().mockResolvedValue(true);
    const playback = playClaimedDisplayAlert({
      utterance,
      synthesis,
      markPlayed: () => new Promise<boolean>(() => undefined),
      releaseClaim,
      timeoutMs: 1_000,
    });
    utterance.onend?.({} as SpeechSynthesisEvent);
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(playback).resolves.toEqual({ status: 'retryable', reason: 'timeout' });
    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(releaseClaim).toHaveBeenCalledTimes(1);
  });

  it('focuses 15 classes on the active JP and paginates them as 6, 6, and 3', () => {
    const sessions = Array.from({ length: 10 }, (_, jpIndex) =>
      Array.from({ length: 15 }, (_, classIndex) => ({
        id: `jp-${jpIndex + 1}-class-${classIndex + 1}`,
        className: `Kelas ${String(classIndex + 1).padStart(2, '0')}`,
        subject: `Mapel JP ${jpIndex + 1}`,
        room: `Ruang ${classIndex + 1}`,
        teacherName: `Guru ${classIndex + 1}`,
        startsAt: new Date(Date.UTC(2026, 7, 25, jpIndex, 0)).toISOString(),
        endsAt: new Date(Date.UTC(2026, 7, 25, jpIndex, 40)).toISOString(),
        status: 'SCHEDULED' as const,
        lateByMinutes: null,
      })),
    ).flat();

    const focus = focusDisplaySessions(sessions, '2026-08-25T04:10:00.000Z');
    expect(focus.label).toBe('Sedang berlangsung');
    expect(focus.sessions).toHaveLength(15);
    expect(focus.sessions.every((session) => session.subject === 'Mapel JP 5')).toBe(true);
    expect(DISPLAY_SESSION_PAGE_SIZE).toBe(6);
    expect(displaySessionPageCount(focus.sessions.length)).toBe(3);
    expect(displaySessionPage(focus.sessions, 0)).toHaveLength(6);
    expect(displaySessionPage(focus.sessions, 1)).toHaveLength(6);
    expect(displaySessionPage(focus.sessions, 2)).toHaveLength(3);
    expect(moveDisplaySessionPage(0, 3, 1)).toBe(1);
    expect(moveDisplaySessionPage(2, 3, 1)).toBe(0);
    expect(moveDisplaySessionPage(0, 3, -1)).toBe(2);
    expect(displaySessionRotationCopy(true)).toEqual({
      actionLabel: 'Jeda rotasi otomatis',
      statusLabel: 'rotasi otomatis',
    });
    expect(displaySessionRotationCopy(false)).toEqual({
      actionLabel: 'Lanjutkan rotasi otomatis',
      statusLabel: 'rotasi dijeda',
    });
  });

  it('keeps a manual page selected when navigation occurs at t=11.9s', () => {
    jest.useFakeTimers();
    let page = 0;
    const rotationEnabledRef = { current: true };
    const timer = setInterval(() => {
      if (!rotationEnabledRef.current) return;
      page = moveDisplaySessionPage(page, 3, 1);
    }, 12_000);

    jest.advanceTimersByTime(11_900);
    const manualMove = manuallyMoveDisplaySessionPage(page, 3, 1);
    rotationEnabledRef.current = manualMove.rotationEnabled;
    page = manualMove.page;
    jest.advanceTimersByTime(100);

    expect(page).toBe(1);
    expect(rotationEnabledRef.current).toBe(false);

    rotationEnabledRef.current = true;
    jest.advanceTimersByTime(11_999);
    expect(page).toBe(1);
    jest.advanceTimersByTime(1);
    expect(page).toBe(2);
    clearInterval(timer);
  });

  it('uses the next JP cohort during a break instead of stale morning sessions', () => {
    const sessions = [
      {
        id: 'jp-1',
        className: 'X TJKT 1',
        subject: 'Dasar Jaringan',
        room: 'Lab 1',
        teacherName: 'Guru A',
        startsAt: '2026-08-25T01:00:00.000Z',
        endsAt: '2026-08-25T01:40:00.000Z',
        status: 'COMPLETED' as const,
        lateByMinutes: null,
      },
      {
        id: 'jp-2',
        className: 'X TJKT 1',
        subject: 'Informatika',
        room: 'Lab 1',
        teacherName: 'Guru B',
        startsAt: '2026-08-25T02:00:00.000Z',
        endsAt: '2026-08-25T02:40:00.000Z',
        status: 'SCHEDULED' as const,
        lateByMinutes: null,
      },
    ];
    expect(focusDisplaySessions(sessions, '2026-08-25T01:50:00.000Z')).toMatchObject({
      label: 'Sesi berikutnya',
      sessions: [expect.objectContaining({ id: 'jp-2' })],
    });
  });

  it('does not replay a delivery already marked played', () => {
    const payload = {
      profile: 'RUANG_GURU',
      generatedAt: '2026-08-25T08:00:00.000Z',
      device: { label: 'TV Guru', isAudibleLeader: true },
      alerts: [
        {
          deliveryId: 'delivery-played',
          stage: 'ROOM_T10',
          status: 'PLAYED',
          audible: true,
          dueAt: '2026-08-25T08:00:00.000Z',
          visual: { className: 'X TJKT QA', room: 'Lab QA' },
        },
      ],
    };

    expect(normalizeDisplaySnapshot(payload)?.alerts[0]?.audible).toBe(false);
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
