import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HELP_CATALOG, PRIMARY_WORKFLOW_ROUTES, ROUTE_TOPIC_MAP } from '@/lib/help/help-catalog';
import { HELP_ARTIFACTS, HELP_CLAIM_SOURCE_LEDGER, HELP_SCREENSHOTS } from '@/lib/help/help-evidence';
import {
  canAccessHelpArtifact,
  canProjectHelpTopic,
  projectHelpSummaries,
  projectHelpTopic,
  serializedProjectionContainsOnly,
  type HelpAuthoritySnapshot,
} from '@/lib/help/help-projection';
import { normalizeHelpSearch, searchProjectedHelp } from '@/lib/help/help-search';
import {
  findHelpArtifact,
  helpArtifactHeaders,
  isSafeHelpArtifactPath,
  resolvePrivateArtifactRoot,
  streamHelpArtifact,
} from '@/lib/help/help-artifacts';
import { parentHelpContextWarning } from '@/lib/help/help-authority';
import {
  isHelpTopicMetadataStale,
  validateHelpClaimSourceLedger,
  validateHelpSystem,
} from '@/lib/help/help-validation';
import {
  CLASS_CONFIG_DISCOVERABILITY_RULE,
  isNavigationItemVisible,
  PPDB_DISCOVERABILITY_RULE,
} from '@/lib/navigation-authority';
import { HELP_PERSONA_GUIDES } from '@/lib/help/help-personas';
import { buildHelpTableOfContents } from '@/lib/help/help-toc';
import type { HelpClaimSource, HelpTopic } from '@/lib/help/help-schema';

const authority = (patch: Partial<HelpAuthoritySnapshot> = {}): HelpAuthoritySnapshot => ({
  identityRoles: ['GURU'],
  positionCodes: [],
  permissions: ['academic.teaching.read'],
  contexts: [],
  viewAs: null,
  permissionCheckAvailable: true,
  selectedChildVerified: false,
  childCount: 0,
  ...patch,
});

describe('Wave 9 role-aware Help contract', () => {
  it('validates the catalog in Checkpoint A and fails final mode for pending assets', () => {
    expect(validateHelpSystem()).toEqual([]);
    expect(validateHelpSystem({ finalMode: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'screenshot.pending-final' }),
      expect.objectContaining({ code: 'artifact.pending-final' }),
    ]));
  });

  it('enforces canonical V2 authority metadata and freshness', () => {
    expect(HELP_CATALOG.every((topic) => (
      Array.isArray(topic.assignmentContexts) &&
      Array.isArray(topic.permissionsAny) &&
      Array.isArray(topic.permissionsAll) &&
      Boolean(topic.featureStatus) &&
      topic.updatedAt === '2026-08-26'
    ))).toBe(true);
    expect(isHelpTopicMetadataStale('2026-08-26', '2026-08-26')).toBe(false);
    expect(isHelpTopicMetadataStale('2026-01-01', '2026-08-26')).toBe(true);
    expect(validateHelpSystem({ metadataAsOf: '2027-08-26' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'topic.stale-metadata' }),
    ]));

    const source = HELP_CATALOG.find((topic) => topic.id === 'topic.start')!;
    const allPermissionTopic: HelpTopic = {
      ...source,
      permissionsAll: ['academic.teaching.read', 'report.read'],
    };
    expect(canProjectHelpTopic(allPermissionTopic, authority({ permissions: ['academic.teaching.read'] }))).toBe(false);
    expect(canProjectHelpTopic(allPermissionTopic, authority({ permissions: ['academic.teaching.read', 'report.read'] }))).toBe(true);

    const unavailable = projectHelpTopic(
      HELP_CATALOG.find((topic) => topic.id === 'topic.career-industry')!,
      authority({ identityRoles: ['INDUSTRI'], permissions: [] }),
    );
    expect(unavailable?.featureStatus).toBe('unavailable');
  });

  it('covers every primary workflow route with a stable topic', () => {
    const ids = new Set(HELP_CATALOG.map((topic) => topic.id));
    expect(PRIMARY_WORKFLOW_ROUTES.length).toBe(Object.keys(ROUTE_TOPIC_MAP).length);
    for (const route of PRIMARY_WORKFLOW_ROUTES) expect(ids.has(ROUTE_TOPIC_MAP[route])).toBe(true);
  });

  it('projects Appointment and assignment topics without exposing them to ordinary Guru', () => {
    const ordinaryGuru = projectHelpSummaries(authority());
    expect(ordinaryGuru.map((topic) => topic.id)).not.toContain('topic.semester-closing');
    expect(ordinaryGuru.map((topic) => topic.id)).not.toContain('topic.teaching-assignment');

    const assignedGuru = projectHelpSummaries(authority({ contexts: ['teaching-assignment'] }));
    expect(assignedGuru.map((topic) => topic.id)).toContain('topic.teaching-assignment');

    const principal = projectHelpSummaries(authority({
      positionCodes: ['KEPALA_SEKOLAH'],
      permissions: ['academic.final-report.read', 'academic.semester.close'],
    }));
    expect(principal.map((topic) => topic.id)).toContain('topic.semester-closing');
  });

  it('keeps representative identity, Appointment, wali, and view-as projections distinct', () => {
    const superAdmin = projectHelpSummaries(authority({
      identityRoles: ['SUPER_ADMIN'],
      permissions: ['*'],
    })).map((topic) => topic.id);
    expect(superAdmin).toEqual(expect.arrayContaining([
      'topic.system-administration',
      'topic.semester-closing',
      'topic.monitoring',
    ]));

    const tataUsaha = projectHelpSummaries(authority({
      identityRoles: ['TATA_USAHA'],
      permissions: ['student.read', 'ppdb.read', 'academic.teaching.read', 'finance.read'],
    })).map((topic) => topic.id);
    expect(tataUsaha).toEqual(expect.arrayContaining([
      'topic.student-management',
      'topic.ppdb',
      'topic.class-config',
      'topic.finance',
    ]));
    expect(tataUsaha).not.toContain('topic.semester-closing');

    const wali = projectHelpSummaries(authority({
      contexts: ['wali-kelas'],
      permissions: ['report.read', 'report.wali.manage'],
    })).map((topic) => topic.id);
    expect(wali).toContain('topic.wali-class');

    const curriculumAppointment = projectHelpSummaries(authority({
      identityRoles: ['GURU'],
      positionCodes: ['WAKA_KURIKULUM'],
      permissions: ['academic.final-report.read', 'rpp.read', 'report.review'],
    })).map((topic) => topic.id);
    expect(curriculumAppointment).toEqual(expect.arrayContaining([
      'topic.semester-closing',
      'topic.module-authoring',
      'topic.report-card-operations',
    ]));

    const viewedAsGuru = projectHelpSummaries(authority({
      identityRoles: ['GURU'],
      permissions: ['*'],
      viewAs: 'GURU',
    })).map((topic) => topic.id);
    expect(viewedAsGuru).not.toContain('topic.system-administration');
    expect(viewedAsGuru).not.toContain('topic.semester-closing');
  });

  it('fails closed for industry student registry and unverified parent context', () => {
    const studentManagement = HELP_CATALOG.find((topic) => topic.id === 'topic.student-management');
    expect(studentManagement).toBeDefined();
    expect(canProjectHelpTopic(studentManagement!, authority({
      identityRoles: ['INDUSTRI'],
      permissions: ['student.read'],
    }))).toBe(false);

    const parentWithoutChild = projectHelpSummaries(authority({
      identityRoles: ['ORANG_TUA'],
      permissions: ['report.read', 'remedial.child.read', 'finance.child.read'],
      childCount: 2,
    }));
    expect(parentWithoutChild.map((topic) => topic.id)).not.toContain('topic.report-card');

    const verifiedParent = projectHelpSummaries(authority({
      identityRoles: ['ORANG_TUA'],
      permissions: ['report.read', 'remedial.child.read', 'finance.child.read'],
      contexts: ['selected-child', 'multi-child'],
      selectedChildVerified: true,
      childCount: 2,
    }));
    expect(verifiedParent.map((topic) => topic.id)).toContain('topic.report-card');
    expect(verifiedParent.map((topic) => topic.id)).toContain('topic.remedial-family');
    expect(verifiedParent.map((topic) => topic.id)).not.toContain('topic.remedial');

    const student = projectHelpSummaries(authority({
      identityRoles: ['SISWA'],
      permissions: ['lms.read', 'remedial.own.read', 'report.read'],
    }));
    expect(student.map((topic) => topic.id)).toEqual(expect.arrayContaining([
      'topic.assessment-student',
      'topic.remedial-student',
      'topic.report-card',
    ]));
    expect(student.map((topic) => topic.id)).not.toContain('topic.assessment');
    expect(student.map((topic) => topic.id)).not.toContain('topic.remedial');
  });

  it('serializes only projected summaries and removes pending screenshot blocks', () => {
    const projected = projectHelpSummaries(authority({ contexts: ['teaching-assignment'] }));
    const allowedIds = new Set(projected.map((topic) => topic.id));
    expect(serializedProjectionContainsOnly(projected, allowedIds)).toBe(true);
    expect(JSON.stringify(projected)).not.toContain('permissionsAny');
    expect(JSON.stringify(projected)).not.toContain('positionCodes');

    const source = HELP_CATALOG.find((topic) => topic.id === 'topic.teaching-assignment')!;
    const topic = projectHelpTopic(source, authority({ contexts: ['teaching-assignment'] }));
    expect(topic?.blocks.some((block) => block.kind === 'screenshot')).toBe(false);
    expect(HELP_SCREENSHOTS.every((item) => item.assetStatus === 'pending')).toBe(true);
  });

  it('keeps client search accent-tolerant and isolated from the server catalog', () => {
    const topics = projectHelpSummaries(authority({ contexts: ['teaching-assignment'] }));
    expect(normalizeHelpSearch('Penilaian Ketercapaian')).toBe('penilaian ketercapaian');
    expect(searchProjectedHelp(topics, 'PENGAJARAN', 3)[0]?.id).toBe('topic.teaching-assignment');

    const explorer = readFileSync(resolve(__dirname, '../app/dashboard/panduan/_components/HelpExplorer.tsx'), 'utf8');
    const clientSearch = readFileSync(resolve(__dirname, '../lib/help/help-search.ts'), 'utf8');
    expect(explorer).toContain("from '@/lib/help/help-search'");
    expect(explorer).not.toContain("from '@/lib/help/help-projection'");
    expect(clientSearch).not.toContain('help-catalog');
    expect(clientSearch).not.toContain('help-evidence');
  });

  it('keeps semester closing hidden for ordinary Guru navigation', () => {
    const rule = {
      roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG'],
      permissions: ['academic.final-report.read', 'academic.semester.close'],
    };
    expect(isNavigationItemVisible(rule, ['GURU'], ['academic.teaching.read'], false)).toBe(false);
    expect(isNavigationItemVisible(rule, ['GURU', 'KEPALA_SEKOLAH'], ['academic.final-report.read'], false)).toBe(true);
    expect(isNavigationItemVisible(rule, ['GURU', 'KEPALA_SEKOLAH'], [], true)).toBe(false);
  });

  it('keeps private artifacts allowlisted, contained, and non-cacheable', () => {
    expect(findHelpArtifact('../panduan-guru')).toBeNull();
    expect(isSafeHelpArtifactPath('../public/panduan.pdf')).toBe(false);
    const artifact = findHelpArtifact('artifact.teacher');
    expect(artifact).not.toBeNull();
    const headers = helpArtifactHeaders(artifact!, 128);
    expect(headers).toMatchObject({
      'Cache-Control': 'private, no-store, max-age=0, no-transform',
      'Content-Length': '128',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('streams a ready artifact from the traced standalone container layout', async () => {
    const suppliedStandaloneRoot = process.env.WAVE9_STANDALONE_ROOT;
    const containerCwd = suppliedStandaloneRoot
      ? resolve(suppliedStandaloneRoot)
      : await mkdtemp(join(tmpdir(), 'diis-help-container-'));
    const tracedRoot = join(containerCwd, 'apps', 'web', 'private', 'help-artifacts');
    const syntheticFile = join(tracedRoot, 'panduan-guru.pdf');
    const payload = '%PDF-1.7 synthetic standalone artifact';
    try {
      if (suppliedStandaloneRoot) {
        await access(join(tracedRoot, 'README.md'));
      } else {
        await mkdir(tracedRoot, { recursive: true });
      }
      await writeFile(syntheticFile, payload, 'utf8');
      const readyArtifact = {
        ...HELP_ARTIFACTS.find((item) => item.id === 'artifact.teacher')!,
        status: 'ready' as const,
      };

      expect(resolvePrivateArtifactRoot(containerCwd)).toBe(tracedRoot);
      expect(isSafeHelpArtifactPath(readyArtifact.fileName, containerCwd)).toBe(true);
      expect(isSafeHelpArtifactPath('../private/panduan-guru.pdf', containerCwd)).toBe(false);

      const response = await streamHelpArtifact(
        readyArtifact,
        new AbortController().signal,
        containerCwd,
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get('content-length')).toBe(String(Buffer.byteLength(payload)));
      expect(await response?.text()).toBe(payload);
    } finally {
      if (suppliedStandaloneRoot) {
        await rm(syntheticFile, { force: true });
      } else {
        await rm(containerCwd, { recursive: true, force: true });
      }
    }
  });

  it('authorizes artifacts from their own persona contract, not shared topic visibility', () => {
    const studentArtifact = HELP_ARTIFACTS.find((item) => item.id === 'artifact.student')!;
    const parentArtifact = HELP_ARTIFACTS.find((item) => item.id === 'artifact.parent')!;
    const completeArtifact = HELP_ARTIFACTS.find((item) => item.id === 'artifact.complete')!;
    expect(canAccessHelpArtifact(studentArtifact, authority({ contexts: ['teaching-assignment'] }))).toBe(false);
    expect(canAccessHelpArtifact(parentArtifact, authority({ identityRoles: ['SISWA'], permissions: ['report.read'] }))).toBe(false);
    expect(canAccessHelpArtifact(parentArtifact, authority({
      identityRoles: ['ORANG_TUA'],
      permissions: ['report.read'],
      contexts: ['selected-child'],
      selectedChildVerified: true,
    }))).toBe(true);
    expect(canAccessHelpArtifact(completeArtifact, authority({ identityRoles: ['SUPER_ADMIN'], permissions: ['*'] }))).toBe(true);
    expect(canAccessHelpArtifact(completeArtifact, authority({ identityRoles: ['GURU'], permissions: ['*'], viewAs: 'GURU' }))).toBe(false);
  });

  it('requires one existing source, test, and report trace for every topic', () => {
    const topicIds = new Set(HELP_CATALOG.map((topic) => topic.id));
    expect(validateHelpClaimSourceLedger(topicIds, HELP_CLAIM_SOURCE_LEDGER)).toEqual([]);
    expect(new Set(HELP_CLAIM_SOURCE_LEDGER.map((claim) => claim.topicId))).toEqual(topicIds);

    const missingPath = HELP_CLAIM_SOURCE_LEDGER.map((item) => ({ ...item })) as HelpClaimSource[];
    missingPath[0] = { ...missingPath[0]!, source: 'apps/web/src/does-not-exist.ts' };
    expect(validateHelpClaimSourceLedger(topicIds, missingPath)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'claim.missing-source' }),
    ]));

    const orphan = HELP_CLAIM_SOURCE_LEDGER.map((item) => ({ ...item })) as HelpClaimSource[];
    orphan[0] = { ...orphan[0]!, topicId: 'topic.orphan' };
    const orphanIssues = validateHelpClaimSourceLedger(topicIds, orphan);
    expect(orphanIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'claim.broken-topic' }),
      expect.objectContaining({ code: 'claim.missing-topic-trace', message: 'topic.start' }),
    ]));
  });

  it('keeps discoverability parity for PPDB, class configuration, persona Help, and mobile Sidebar', () => {
    expect(PPDB_DISCOVERABILITY_RULE.roles).toContain('WAKIL_KOOR_HUBIN');
    expect(CLASS_CONFIG_DISCOVERABILITY_RULE.roles).toEqual(expect.arrayContaining(['WAKA_KURIKULUM', 'KAPROG']));
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.ppdb')?.positionCodes).toContain('WAKIL_KOOR_HUBIN');
    expect(HELP_PERSONA_GUIDES.find((persona) => persona.id === 'persona.hubin-deputy')?.topicIds).toContain('topic.ppdb');
    expect(HELP_PERSONA_GUIDES.find((persona) => persona.id === 'persona.curriculum')?.topicIds).toContain('topic.class-config');
    expect(isNavigationItemVisible(PPDB_DISCOVERABILITY_RULE, ['GURU', 'WAKIL_KOOR_HUBIN'], ['ppdb.read'], false)).toBe(true);
    expect(isNavigationItemVisible(CLASS_CONFIG_DISCOVERABILITY_RULE, ['GURU', 'KAPROG'], ['academic.teaching.read'], false)).toBe(true);
  });

  it('provides contact information architecture and deterministic duplicate-safe TOC anchors', () => {
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.official-support')?.category).toBe('contact');
    const toc = buildHelpTableOfContents([
      { kind: 'heading', level: 2, text: 'Langkah Utama' },
      { kind: 'paragraph', text: 'Isi.' },
      { kind: 'heading', level: 3, text: 'Langkah Utama' },
    ]);
    expect(toc).toEqual([
      { blockIndex: 0, id: 'langkah-utama', level: 2, text: 'Langkah Utama' },
      { blockIndex: 2, id: 'langkah-utama-2', level: 3, text: 'Langkah Utama' },
    ]);
  });

  it('gives multi-child parents an actionable fail-closed context warning', () => {
    expect(parentHelpContextWarning(true, true, 2, false)).toContain('Pilih anak terlebih dahulu');
    expect(parentHelpContextWarning(true, true, 2, true)).toBeNull();
    expect(parentHelpContextWarning(true, false, 2, false)).toBeNull();
  });
});
