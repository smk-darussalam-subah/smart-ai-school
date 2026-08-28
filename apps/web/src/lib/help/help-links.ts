import {
  academicWorkflowHref,
  isAcademicWorkflowView,
  resolveAcademicWorkflowView,
  type AcademicWorkflowPersona,
  type AcademicWorkflowView,
} from '@/lib/academic-workflow-deep-link';

const HELP_ORIGIN = 'https://help.diis.invalid';
const SAFE_FRAGMENT = /^[a-zA-Z0-9._~-]+$/;
const SAFE_STUDENT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const SCREENSHOT_PATH = /^\/(?:dashboard(?:\/[a-z0-9-]+)*|login|display\/room)$/;
const WORKFLOW_PATH = /^\/(?:dashboard(?:\/[a-z0-9-]+)*|login|privacy|consent)$/;

interface ParsedHelpHref {
  pathname: string;
  searchParams: URLSearchParams;
  hash: string;
}

export type HelpWorkflowPersona = AcademicWorkflowPersona |
  'super-admin' |
  'waka-curriculum' |
  'kaprog' |
  'staff';

export function resolveHelpWorkflowPersona(authority: {
  identityRoles: readonly string[];
  positionCodes: readonly string[];
  contexts: readonly string[];
  viewAs?: string | null;
}): HelpWorkflowPersona {
  if (authority.identityRoles.includes('ORANG_TUA')) return 'parent';
  if (authority.identityRoles.includes('SISWA')) return 'student';
  if (authority.identityRoles.includes('SUPER_ADMIN')) return 'super-admin';
  const positions = new Set([
    ...authority.positionCodes,
    ...(authority.viewAs ? [authority.viewAs] : []),
  ]);
  if (positions.has('KEPALA_SEKOLAH')) return 'principal';
  if (positions.has('WAKA_KURIKULUM')) return 'waka-curriculum';
  if (positions.has('KAPROG')) return 'kaprog';
  if (authority.contexts.includes('teaching-assignment') || authority.identityRoles.includes('GURU')) {
    return 'teacher';
  }
  return 'staff';
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function containsDotSegment(value: string): boolean {
  const queryIndex = value.search(/[?#]/);
  let candidate = queryIndex === -1 ? value : value.slice(0, queryIndex);
  for (let pass = 0; pass < 4; pass += 1) {
    if (candidate.split('/').some((segment) => segment === '.' || segment === '..')) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return true;
    }
    if (decoded === candidate) return false;
    candidate = decoded;
  }
  return candidate.split('/').some((segment) => segment === '.' || segment === '..');
}

function hasValidQuery(parsed: URL): boolean {
  const entries = [...parsed.searchParams.entries()];
  const keys = entries.map(([key]) => key);
  if (new Set(keys).size !== keys.length) return false;
  if (entries.length > 2) return false;

  return entries.every(([key, value]) => {
    if (key === 'studentId') return SAFE_STUDENT_ID.test(value);
    return parsed.pathname === '/dashboard/akademik' &&
      key === 'view' &&
      isAcademicWorkflowView(value);
  });
}

function parseHelpHref(value: string, pathPattern: RegExp): ParsedHelpHref | null {
  if (
    value.length === 0 || value.length > 500 || !value.startsWith('/') || value.startsWith('//') ||
    value.includes('\\') || containsControlCharacter(value) || containsDotSegment(value)
  ) return null;

  try {
    const parsed = new URL(value, HELP_ORIGIN);
    if (parsed.origin !== HELP_ORIGIN || parsed.username || parsed.password || !pathPattern.test(parsed.pathname)) {
      return null;
    }
    if (parsed.hash && !SAFE_FRAGMENT.test(parsed.hash.slice(1))) return null;

    if (!hasValidQuery(parsed)) return null;
    return { pathname: parsed.pathname, searchParams: parsed.searchParams, hash: parsed.hash };
  } catch {
    return null;
  }
}

function serializeHelpHref(parsed: ParsedHelpHref): string {
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`;
}

export function isSafeHelpScreenshotRoute(value: string): boolean {
  const parsed = parseHelpHref(value, SCREENSHOT_PATH);
  if (!parsed) return false;
  if ([...parsed.searchParams.keys()].some((key) => key !== 'studentId')) return false;
  if (parsed.pathname === '/login' || parsed.pathname === '/display/room') {
    return parsed.searchParams.size === 0;
  }
  return true;
}

export function isSafeHelpWorkflowHref(value: string): boolean {
  return parseHelpHref(value, WORKFLOW_PATH) !== null;
}

export function buildHelpWorkflowHref(
  value: string,
  selectedChildId: string | null,
  preserveSelectedChild: boolean,
): string | null {
  const parsed = parseHelpHref(value, WORKFLOW_PATH);
  if (!parsed) return null;
  if (preserveSelectedChild) {
    if (!selectedChildId || !SAFE_STUDENT_ID.test(selectedChildId)) return null;
    parsed.searchParams.set('studentId', selectedChildId);
  } else {
    parsed.searchParams.delete('studentId');
  }
  return serializeHelpHref(parsed);
}

function principalTarget(
  view: AcademicWorkflowView,
  label: string,
): { href: string; label: string } | null {
  if (view === 'module-authoring') {
    return { href: '/dashboard/rpp', label: 'Buka Review Modul Ajar' };
  }
  if (view === 'question-bank' || view === 'remedial') {
    return {
      href: academicWorkflowHref('assessment-overview'),
      label: 'Buka Monitoring Asesmen',
    };
  }
  const allowed = resolveAcademicWorkflowView(view, 'principal');
  return allowed ? { href: academicWorkflowHref(allowed), label } : null;
}

function operationsTarget(persona: 'super-admin' | 'waka-curriculum'): { href: string; label: string } {
  return persona === 'super-admin'
    ? { href: '/dashboard/akademik', label: 'Buka Operasional Akademik' }
    : { href: '/dashboard/akademik', label: 'Buka Operasional Kurikulum' };
}

export function resolveHelpWorkflowTarget(input: {
  href: string;
  label: string;
  selectedChildId: string | null;
  preserveSelectedChild: boolean;
  persona: HelpWorkflowPersona;
}): { href: string; label: string } | null {
  const parsed = parseHelpHref(input.href, WORKFLOW_PATH);
  if (!parsed) return null;
  const rawView = parsed.searchParams.get('view');
  let target = { href: input.href, label: input.label };

  if (rawView) {
    if (!isAcademicWorkflowView(rawView) || input.persona === 'staff') return null;
    if (input.persona === 'principal') {
      const resolved = principalTarget(rawView, input.label);
      if (!resolved) return null;
      target = resolved;
    } else if (input.persona === 'super-admin' || input.persona === 'waka-curriculum') {
      target = operationsTarget(input.persona);
    } else if (input.persona === 'kaprog') {
      const resolved = resolveAcademicWorkflowView(rawView, 'teacher');
      if (!resolved) return null;
      target = { href: academicWorkflowHref(resolved), label: input.label };
    } else {
      const resolved = resolveAcademicWorkflowView(rawView, input.persona);
      if (!resolved) return null;
      target = { href: academicWorkflowHref(resolved), label: input.label };
    }
  }

  const href = buildHelpWorkflowHref(
    target.href,
    input.selectedChildId,
    input.preserveSelectedChild,
  );
  return href ? { href, label: target.label } : null;
}

export function buildVerifiedChildQuery(selectedChildId: string | null): string {
  if (!selectedChildId || !SAFE_STUDENT_ID.test(selectedChildId)) return '';
  return `?studentId=${encodeURIComponent(selectedChildId)}`;
}
