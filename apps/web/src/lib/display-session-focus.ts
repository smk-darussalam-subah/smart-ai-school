import type { DisplaySession } from './display-contract';

export const DISPLAY_SESSION_PAGE_SIZE = 6;
export const DISPLAY_SESSION_PAGE_INTERVAL_MS = 12_000;

export type DisplaySessionFocus = {
  key: string;
  label: string;
  sessions: DisplaySession[];
};

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function focusDisplaySessions(
  sessions: DisplaySession[],
  generatedAt: string,
): DisplaySessionFocus {
  const now = timestamp(generatedAt) ?? Date.now();
  const eligible = sessions
    .filter((session) => !['CANCELLED', 'SUPERSEDED'].includes(session.status))
    .map((session) => ({
      session,
      startsAt: timestamp(session.startsAt),
      endsAt: timestamp(session.endsAt),
    }))
    .filter(
      (item): item is { session: DisplaySession; startsAt: number; endsAt: number } =>
        item.startsAt !== null && item.endsAt !== null,
    )
    .sort(
      (left, right) =>
        left.startsAt - right.startsAt ||
        left.session.className.localeCompare(right.session.className),
    );

  const active = eligible.filter((item) => item.startsAt <= now && now < item.endsAt);
  if (active.length > 0) {
    return {
      key: `active:${Math.min(...active.map((item) => item.startsAt))}`,
      label: 'Sedang berlangsung',
      sessions: active.map((item) => item.session),
    };
  }

  const nextStart = eligible.find((item) => item.startsAt > now)?.startsAt;
  if (nextStart !== undefined) {
    return {
      key: `next:${nextStart}`,
      label: 'Sesi berikutnya',
      sessions: eligible.filter((item) => item.startsAt === nextStart).map((item) => item.session),
    };
  }

  const previousStart = eligible.at(-1)?.startsAt;
  if (previousStart !== undefined) {
    return {
      key: `previous:${previousStart}`,
      label: 'Sesi terakhir hari ini',
      sessions: eligible
        .filter((item) => item.startsAt === previousStart)
        .map((item) => item.session),
    };
  }

  return { key: 'empty', label: 'Belum ada sesi', sessions: [] };
}

export function displaySessionPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / DISPLAY_SESSION_PAGE_SIZE));
}

export function moveDisplaySessionPage(
  currentPage: number,
  pageCount: number,
  direction: -1 | 1,
): number {
  if (pageCount <= 1) return 0;
  return (currentPage + direction + pageCount) % pageCount;
}

export function manuallyMoveDisplaySessionPage(
  currentPage: number,
  pageCount: number,
  direction: -1 | 1,
): { page: number; rotationEnabled: false } {
  return {
    page: moveDisplaySessionPage(currentPage, pageCount, direction),
    rotationEnabled: false,
  };
}

export function displaySessionRotationCopy(enabled: boolean): {
  actionLabel: string;
  statusLabel: string;
} {
  return enabled
    ? { actionLabel: 'Jeda rotasi otomatis', statusLabel: 'rotasi otomatis' }
    : { actionLabel: 'Lanjutkan rotasi otomatis', statusLabel: 'rotasi dijeda' };
}

export function displaySessionPage(sessions: DisplaySession[], page: number): DisplaySession[] {
  const pageCount = displaySessionPageCount(sessions.length);
  const safePage = Math.min(Math.max(Math.floor(page), 0), pageCount - 1);
  const start = safePage * DISPLAY_SESSION_PAGE_SIZE;
  return sessions.slice(start, start + DISPLAY_SESSION_PAGE_SIZE);
}
