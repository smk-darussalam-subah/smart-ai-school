import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HELP_CATALOG, PRIMARY_WORKFLOW_ROUTES, ROUTE_TOPIC_MAP } from '@/lib/help/help-catalog';
import {
  HELP_ARTIFACTS,
  HELP_CLAIM_SOURCE_LEDGER,
  HELP_DECK_CONTENT_MAP,
  HELP_SCREENSHOTS,
} from '@/lib/help/help-evidence';
import {
  canAccessHelpArtifact,
  canAccessHelpScreenshot,
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
  inspectHelpPdf,
  inspectHelpPdfFileSync,
  isSafeHelpArtifactPath,
  resolvePrivateArtifactRoot,
  streamHelpArtifact,
} from '@/lib/help/help-artifacts';
import {
  findHelpScreenshot,
  inspectHelpScreenshotFile,
  inspectHelpScreenshotFileSync,
  isSafeHelpScreenshotPath,
  resolvePrivateScreenshotRoot,
  streamHelpScreenshot,
} from '@/lib/help/help-screenshots';
import { isHelpEvidenceConsumerCompatible } from '@/lib/help/help-evidence-authority';
import { parentHelpContextWarning } from '@/lib/help/help-authority';
import {
  buildHelpWorkflowHref,
  isSafeHelpScreenshotRoute,
  isSafeHelpWorkflowHref,
  resolveHelpWorkflowPersona,
  resolveHelpWorkflowTarget,
} from '@/lib/help/help-links';
import {
  academicWorkflowPresentation,
  filterStudentTasksForWorkflow,
  resolveAcademicWorkflowView,
} from '@/lib/academic-workflow-deep-link';
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
import {
  HELP_VIEWPORT_DIMENSIONS,
  HelpScreenshotSchema,
  type HelpClaimSource,
  type HelpTopic,
} from '@/lib/help/help-schema';

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

function syntheticPng(width: number, height: number): Buffer {
  const payload = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(payload, 0);
  payload.writeUInt32BE(13, 8);
  payload.write('IHDR', 12, 'ascii');
  payload.writeUInt32BE(width, 16);
  payload.writeUInt32BE(height, 20);
  return payload;
}

function syntheticPdf(pageCount = 1, catalogMarkerOffset?: number): Buffer {
  const pageObjectIds = Array.from({ length: pageCount }, (_, index) => index + 3);
  const objects = [
    '/Type /Catalog /Pages 2 0 R >>',
    `/Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...pageObjectIds.map(() => '/Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'),
  ];
  let content = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content, 'latin1'));
    const objectPrefix = `${index + 1} 0 obj\n<< `;
    const padding = index === 0 && catalogMarkerOffset
      ? ' '.repeat(Math.max(0, catalogMarkerOffset - Buffer.byteLength(content + objectPrefix, 'latin1')))
      : '';
    content += `${objectPrefix}${padding}${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(content, 'latin1');
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content, 'latin1');
}

describe('Wave 9 role-aware Help contract', () => {
  it('validates the catalog in Checkpoint A and fails final mode for pending assets', () => {
    expect(validateHelpSystem()).toEqual([]);
    expect(validateHelpSystem({ finalMode: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'freeze.missing-application-sha' }),
      expect.objectContaining({ code: 'freeze.missing-shared-auth-sha' }),
      expect.objectContaining({ code: 'freeze.missing-theme-manifest' }),
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

  it('projects ready screenshot blocks only for their own persona contract', () => {
    const source = HELP_CATALOG.find((topic) => topic.id === 'topic.academic-workspace')!;
    const teacher = HELP_SCREENSHOTS.find((item) => item.id === 'shot.academic.desktop')!;
    const student = HELP_SCREENSHOTS.find((item) => item.id === 'shot.academic.mobile')!;
    const originals = [teacher, student].map((item) => ({ ...item }));
    try {
      Object.assign(teacher, {
        assetStatus: 'ready', fileName: 'teacher.png', sha256: 'a'.repeat(64), sizeBytes: 10,
        width: 1440, height: 900, candidateSha: 'b'.repeat(40), capturedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass', visualReview: 'pass',
      });
      Object.assign(student, {
        assetStatus: 'ready', fileName: 'student.png', sha256: 'c'.repeat(64), sizeBytes: 10,
        width: 390, height: 844, candidateSha: 'b'.repeat(40), capturedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass', visualReview: 'pass',
      });

      const teacherProjection = projectHelpTopic(source, authority({
        identityRoles: ['GURU'], permissions: ['academic.teaching.read'], contexts: [],
      }));
      const studentProjection = projectHelpTopic(source, authority({
        identityRoles: ['SISWA'], permissions: ['lms.read', 'grade.own.read'], contexts: [],
      }));
      expect(teacherProjection?.blocks.filter((block) => block.kind === 'screenshot').map((block) => block.screenshotId))
        .toEqual(['shot.academic.desktop']);
      expect(studentProjection?.blocks.filter((block) => block.kind === 'screenshot').map((block) => block.screenshotId))
        .toEqual(['shot.academic.mobile']);
    } finally {
      Object.assign(teacher, originals[0]);
      Object.assign(student, originals[1]);
    }
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

  it('rejects malformed PDFs and reports the structural page count', () => {
    expect(inspectHelpPdf(syntheticPdf(2))).toEqual({ pageCount: 2 });
    expect(inspectHelpPdf(Buffer.from('%PDF-1.7 fake header only'))).toBeNull();
    expect(inspectHelpPdf(syntheticPdf(1).subarray(0, -6))).toBeNull();
  });

  it('streams a ready artifact from the traced standalone container layout', async () => {
    const suppliedStandaloneRoot = process.env.WAVE9_STANDALONE_ROOT;
    const containerCwd = suppliedStandaloneRoot
      ? resolve(suppliedStandaloneRoot)
      : await mkdtemp(join(tmpdir(), 'diis-help-container-'));
    const tracedRoot = join(containerCwd, 'apps', 'web', 'private', 'help-artifacts');
    const syntheticFile = join(tracedRoot, 'panduan-guru.pdf');
    // Catalog dimulai sebelum cutoff 64 KiB dan selesai di carry, sehingga
    // regression ini membuktikan marker lintas batas tidak hilang.
    const payload = syntheticPdf(1, 64 * 1024 - 256 - 5);
    try {
      if (suppliedStandaloneRoot) {
        await access(join(tracedRoot, 'README.md'));
      } else {
        await mkdir(tracedRoot, { recursive: true });
      }
      await writeFile(syntheticFile, payload);
      const readyArtifact = {
        ...HELP_ARTIFACTS.find((item) => item.id === 'artifact.teacher')!,
        status: 'ready' as const,
        sha256: createHash('sha256').update(payload).digest('hex'),
        sizeBytes: payload.byteLength,
        pageCount: 1,
        candidateSha: 'a'.repeat(40),
        generatedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass' as const,
        visualReview: 'pass' as const,
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
      expect(response?.headers.get('content-length')).toBe(String(payload.byteLength));
      expect(Buffer.from(await response!.arrayBuffer())).toEqual(payload);
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
      permissions: ['finance.child.read', 'remedial.child.read', 'report.read'],
      contexts: ['selected-child'],
      selectedChildVerified: true,
    }))).toBe(true);
    expect(canAccessHelpArtifact(completeArtifact, authority({ identityRoles: ['SUPER_ADMIN'], permissions: ['*'] }))).toBe(true);
    expect(canAccessHelpArtifact(completeArtifact, authority({ identityRoles: ['GURU'], permissions: ['*'], viewAs: 'GURU' }))).toBe(false);
  });

  it('registers one complete guide and one independently authorized PDF per persona', () => {
    expect(HELP_ARTIFACTS).toHaveLength(HELP_PERSONA_GUIDES.length + 1);
    expect(new Set(HELP_ARTIFACTS.map((item) => item.id)).size).toBe(HELP_ARTIFACTS.length);
    expect(HELP_ARTIFACTS.filter((item) => item.id !== 'artifact.complete')).toHaveLength(23);
  });

  it('locks canonical screenshot/deck cardinality and reverse consumer coverage', () => {
    expect(HELP_SCREENSHOTS).toHaveLength(40);
    expect(HELP_DECK_CONTENT_MAP).toHaveLength(4);
    const consumerIds = [
      ...HELP_ARTIFACTS.map((item) => item.id),
      ...HELP_DECK_CONTENT_MAP.map((item) => item.id),
    ];
    for (const consumerId of consumerIds) {
      expect(HELP_SCREENSHOTS.some((item) => item.consumers.includes(consumerId))).toBe(true);
    }
    const genericTopics = new Set(['topic.start', 'topic.account-recovery', 'topic.official-support']);
    for (const artifact of HELP_ARTIFACTS) {
      expect(HELP_SCREENSHOTS.some((item) =>
        item.consumers.includes(artifact.id) &&
        !genericTopics.has(item.topicId) &&
        artifact.topicIds.includes(item.topicId),
      )).toBe(true);
    }
    for (const deck of HELP_DECK_CONTENT_MAP) {
      for (const topicId of deck.topicIds.filter((id) => !genericTopics.has(id))) {
        expect(HELP_SCREENSHOTS.some((item) =>
          item.consumers.includes(deck.id) && item.topicId === topicId,
        )).toBe(true);
      }
    }
    expect(new Set(HELP_SCREENSHOTS.map((item) => item.viewport))).toEqual(new Set([
      'desktop-1440x900', 'display-1366x768', 'display-1920x1080', 'mobile-390x844',
    ]));
    for (const [viewport, dimensions] of Object.entries(HELP_VIEWPORT_DIMENSIONS)) {
      const sample = HELP_SCREENSHOTS.find((item) => item.viewport === viewport)!;
      expect(HelpScreenshotSchema.safeParse({
        ...sample,
        assetStatus: 'ready',
        fileName: 'sample.png',
        sha256: 'a'.repeat(64),
        sizeBytes: 24,
        width: dimensions.width,
        height: dimensions.height,
        candidateSha: 'b'.repeat(40),
        themeManifestSha256: sample.sourceKind === 'shared-auth' ? 'c'.repeat(64) : null,
        capturedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass',
        visualReview: 'pass',
      }).success).toBe(true);
      expect(HelpScreenshotSchema.safeParse({
        ...sample,
        width: 100,
        height: 100,
      }).success).toBe(false);
    }
  });

  it('rejects nested redirects, arbitrary query keys, and external screenshot routes', () => {
    const sample = HELP_SCREENSHOTS[0]!;
    const rejected = [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      '/admin',
      '/dashboard/<script>',
      '/login?callbackUrl=https://evil.example',
      '/dashboard?next=//evil.example',
      '/dashboard?next=%2F%2Fevil.example',
      '/dashboard?next=https%3A%2F%2Fevil.example',
      '/dashboard?studentId=fixture-1&studentId=fixture-2',
      '/dashboard?studentId=fixture%2Fone',
      '/dashboard/../login',
      '/dashboard/%2e%2e/login',
      '/dashboard/%2E./login',
      '/dashboard/%252e%252e/login',
      '/dashboard/%2e%2e%2flogin',
    ];
    for (const route of rejected) {
      expect(HelpScreenshotSchema.safeParse({ ...sample, route }).success).toBe(false);
      expect(isSafeHelpScreenshotRoute(route)).toBe(false);
    }
    for (const route of ['/dashboard', '/dashboard/akademik?studentId=fixture-1', '/login#form', '/display/room']) {
      expect(HelpScreenshotSchema.safeParse({ ...sample, route }).success).toBe(true);
      expect(isSafeHelpScreenshotRoute(route)).toBe(true);
    }
    expect(isSafeHelpWorkflowHref('/dashboard/rapor?studentId=child-owned')).toBe(true);
    expect(isSafeHelpWorkflowHref('/dashboard/../login')).toBe(false);
    expect(isSafeHelpWorkflowHref('/dashboard/%2e%2e/login')).toBe(false);
    expect(isSafeHelpWorkflowHref('/dashboard/akademik?view=question-bank')).toBe(true);
    expect(isSafeHelpWorkflowHref('/dashboard/akademik?view=unknown')).toBe(false);
    expect(isSafeHelpWorkflowHref('/dashboard/rapor?view=question-bank')).toBe(false);
    expect(isSafeHelpScreenshotRoute('/dashboard/akademik?view=question-bank')).toBe(false);
    expect(isSafeHelpWorkflowHref('/dashboard?callbackUrl=https://evil.example')).toBe(false);
    expect(buildHelpWorkflowHref('/dashboard/rapor', 'child-A', true)).toBe('/dashboard/rapor?studentId=child-A');
    expect(buildHelpWorkflowHref('/dashboard/rapor?studentId=stale', 'child-B', true))
      .toBe('/dashboard/rapor?studentId=child-B');
    expect(buildHelpWorkflowHref('/dashboard/rapor', null, true)).toBeNull();
    expect(buildHelpWorkflowHref('/dashboard?next=%2F%2Fevil.example', 'child-A', false)).toBeNull();
  });

  it('binds academic Help deep links to an allowlisted persona and visible subfeature state', () => {
    expect(resolveAcademicWorkflowView('question-bank', 'teacher')).toBe('question-bank');
    expect(resolveAcademicWorkflowView('question-bank', 'student')).toBeNull();
    expect(resolveAcademicWorkflowView(['question-bank', 'remedial'], 'teacher')).toBeNull();
    expect(academicWorkflowPresentation('module-authoring')).toMatchObject({
      teacherScreen: 'pembelajaran',
      leadershipScreen: 'modul',
    });
    expect(academicWorkflowPresentation('question-bank')).toMatchObject({
      teacherScreen: 'penilaian',
      teacherAssessmentPanel: 'bank',
    });
    expect(academicWorkflowPresentation('remedial')).toMatchObject({
      teacherScreen: 'penilaian',
      teacherAssessmentPanel: 'remedial',
    });
    expect(academicWorkflowPresentation('assessment')).toMatchObject({
      studentScreen: 'tugas',
      studentTaskFilter: 'assessment',
    });
    const studentTasks = [
      { id: 'lms-1' },
      { id: 'assessment-1', assessmentSessionId: 'session-1', purpose: 'regular' as const },
      { id: 'remedial-1', assessmentSessionId: 'session-2', purpose: 'remedial' as const },
    ];
    expect(filterStudentTasksForWorkflow(studentTasks, 'assessment')).toEqual([
      { id: 'assessment-1', assessmentSessionId: 'session-1', purpose: 'regular' },
    ]);
    expect(filterStudentTasksForWorkflow(studentTasks, 'remedial')).toEqual([
      { id: 'remedial-1', assessmentSessionId: 'session-2', purpose: 'remedial' },
    ]);
    expect(filterStudentTasksForWorkflow(studentTasks, 'all')).toEqual(studentTasks);
    expect(academicWorkflowPresentation('remedial-status')).toMatchObject({
      studentScreen: 'tugas',
      studentTaskFilter: 'remedial',
      parentFocus: 'remedial',
    });

    expect(resolveHelpWorkflowPersona({
      identityRoles: ['SUPER_ADMIN'], positionCodes: [], contexts: [],
    })).toBe('super-admin');
    expect(resolveHelpWorkflowPersona({
      identityRoles: ['GURU'], positionCodes: ['KEPALA_SEKOLAH'], contexts: ['teaching-assignment'],
    })).toBe('principal');
    expect(resolveHelpWorkflowPersona({
      identityRoles: ['GURU'], positionCodes: ['WAKA_KURIKULUM'], contexts: ['teaching-assignment'],
    })).toBe('waka-curriculum');
    expect(resolveHelpWorkflowPersona({
      identityRoles: ['GURU'], positionCodes: ['KAPROG'], contexts: [],
    })).toBe('kaprog');

    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=question-bank',
      label: 'Buka Bank Soal',
      selectedChildId: null,
      preserveSelectedChild: false,
      persona: 'teacher',
    })).toEqual({ href: '/dashboard/akademik?view=question-bank', label: 'Buka Bank Soal' });
    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=question-bank',
      label: 'Buka Bank Soal',
      selectedChildId: null,
      preserveSelectedChild: false,
      persona: 'principal',
    })).toEqual({
      href: '/dashboard/akademik?view=assessment-overview',
      label: 'Buka Monitoring Asesmen',
    });
    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=question-bank',
      label: 'Buka Bank Soal',
      selectedChildId: null,
      preserveSelectedChild: false,
      persona: 'waka-curriculum',
    })).toEqual({ href: '/dashboard/akademik', label: 'Buka Operasional Kurikulum' });
    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=question-bank',
      label: 'Buka Bank Soal',
      selectedChildId: null,
      preserveSelectedChild: false,
      persona: 'super-admin',
    })).toEqual({ href: '/dashboard/akademik', label: 'Buka Operasional Akademik' });
    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=question-bank',
      label: 'Buka Bank Soal',
      selectedChildId: null,
      preserveSelectedChild: false,
      persona: 'kaprog',
    })).toEqual({ href: '/dashboard/akademik?view=question-bank', label: 'Buka Bank Soal' });
    expect(resolveHelpWorkflowTarget({
      href: '/dashboard/akademik?view=remedial-status',
      label: 'Buka Status Remedial Anak',
      selectedChildId: 'child-A',
      preserveSelectedChild: true,
      persona: 'parent',
    })).toEqual({
      href: '/dashboard/akademik?view=remedial-status&studentId=child-A',
      label: 'Buka Status Remedial Anak',
    });
  });

  it('fails validation when generic screenshots are the only evidence for an artifact or deck topic', () => {
    const sarprasEvidence = HELP_SCREENSHOTS
      .filter((item) => item.consumers.includes('artifact.waka-sarpras'))
      .map((item) => ({ item, consumers: [...item.consumers] }));
    const schedule = findHelpScreenshot('shot.schedule.desktop')!;
    const scheduleConsumers = [...schedule.consumers];
    try {
      for (const { item } of sarprasEvidence) {
        if (!['topic.start', 'topic.account-recovery'].includes(item.topicId)) {
          item.consumers = item.consumers.filter((id) => id !== 'artifact.waka-sarpras');
        }
      }
      schedule.consumers = schedule.consumers.filter((id) => id !== 'deck.internal');
      expect(validateHelpSystem()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'evidence.missing-workflow-screenshot' }),
        expect.objectContaining({ code: 'deck.missing-topic-screenshot' }),
      ]));
    } finally {
      for (const { item, consumers } of sarprasEvidence) item.consumers = consumers;
      schedule.consumers = scheduleConsumers;
    }
  });

  it('requires every artifact and deck consumer authority to access its screenshots', () => {
    for (const screenshot of HELP_SCREENSHOTS) {
      for (const consumerId of screenshot.consumers) {
        const consumer = HELP_ARTIFACTS.find((item) => item.id === consumerId) ??
          HELP_DECK_CONTENT_MAP.find((item) => item.id === consumerId);
        expect(consumer).toBeDefined();
        expect(isHelpEvidenceConsumerCompatible(screenshot, consumer!)).toBe(true);
      }
    }
    expect(validateHelpSystem().filter((issue) => issue.code === 'screenshot.consumer-authority')).toEqual([]);

    const appointment = findHelpScreenshot('shot.appointment.desktop')!;
    const teaching = findHelpScreenshot('shot.teacher.assignment.desktop')!;
    const student = findHelpScreenshot('shot.academic.mobile')!;
    expect(isHelpEvidenceConsumerCompatible(
      appointment,
      HELP_ARTIFACTS.find((item) => item.id === 'artifact.principal')!,
    )).toBe(false);
    expect(isHelpEvidenceConsumerCompatible(
      teaching,
      HELP_ARTIFACTS.find((item) => item.id === 'artifact.waka-kurikulum')!,
    )).toBe(false);
    expect(isHelpEvidenceConsumerCompatible(
      student,
      HELP_ARTIFACTS.find((item) => item.id === 'artifact.parent')!,
    )).toBe(false);
    expect(isHelpEvidenceConsumerCompatible(
      appointment,
      HELP_DECK_CONTENT_MAP.find((item) => item.id === 'deck.foundation')!,
    )).toBe(false);
  });

  it('authorizes screenshots independently for cross-persona and selected-child contexts', () => {
    const teacherScreenshot = findHelpScreenshot('shot.academic.desktop')!;
    const studentScreenshot = findHelpScreenshot('shot.academic.mobile')!;
    const parentScreenshot = findHelpScreenshot('shot.report.mobile')!;

    expect(canAccessHelpScreenshot(teacherScreenshot, authority({
      identityRoles: ['SISWA'], permissions: ['lms.read'], contexts: [],
    }))).toBe(false);
    expect(canAccessHelpScreenshot(studentScreenshot, authority({
      identityRoles: ['SISWA'], permissions: ['lms.read'], contexts: [],
    }))).toBe(true);
    expect(canAccessHelpScreenshot(parentScreenshot, authority({
      identityRoles: ['ORANG_TUA'], permissions: ['report.read'], contexts: ['multi-child'], childCount: 2,
    }))).toBe(false);
    expect(canAccessHelpScreenshot(parentScreenshot, authority({
      identityRoles: ['ORANG_TUA'], permissions: ['report.read'],
      contexts: ['selected-child', 'multi-child'], selectedChildVerified: true, childCount: 2,
    }))).toBe(true);
  });

  it('streams only hash-matching screenshot bytes from the traced standalone layout', async () => {
    const suppliedStandaloneRoot = process.env.WAVE9_STANDALONE_ROOT;
    const containerCwd = suppliedStandaloneRoot
      ? resolve(suppliedStandaloneRoot)
      : await mkdtemp(join(tmpdir(), 'diis-help-screenshot-container-'));
    const tracedRoot = join(containerCwd, 'apps', 'web', 'private', 'help-screenshots');
    const fileName = 'shot-academic-mobile.png';
    const filePath = join(tracedRoot, fileName);
    const payload = syntheticPng(390, 844);
    try {
      if (suppliedStandaloneRoot) {
        await access(join(tracedRoot, 'README.md'));
      } else {
        await mkdir(tracedRoot, { recursive: true });
      }
      await writeFile(filePath, payload);
      const readyScreenshot = {
        ...findHelpScreenshot('shot.academic.mobile')!,
        assetStatus: 'ready' as const,
        fileName,
        sha256: createHash('sha256').update(payload).digest('hex'),
        sizeBytes: payload.byteLength,
        width: 390,
        height: 844,
        candidateSha: 'a'.repeat(40),
        capturedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass' as const,
        visualReview: 'pass' as const,
      };

      expect(resolvePrivateScreenshotRoot(containerCwd)).toBe(tracedRoot);
      expect(isSafeHelpScreenshotPath(fileName, containerCwd)).toBe(true);
      expect(isSafeHelpScreenshotPath('../public/leak.png', containerCwd)).toBe(false);

      const response = await streamHelpScreenshot(
        readyScreenshot,
        new AbortController().signal,
        containerCwd,
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await response!.arrayBuffer())).toEqual(payload);

      expect(await streamHelpScreenshot(
        { ...readyScreenshot, sha256: 'f'.repeat(64) },
        new AbortController().signal,
        containerCwd,
      )).toBeNull();
      expect(await streamHelpScreenshot(
        { ...readyScreenshot, width: 391 },
        new AbortController().signal,
        containerCwd,
      )).toBeNull();
    } finally {
      if (suppliedStandaloneRoot) {
        await rm(filePath, { force: true });
      } else {
        await rm(containerCwd, { recursive: true, force: true });
      }
    }
  });

  it('inspects screenshot and PDF files incrementally and honors cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diis-help-bounded-inspection-'));
    const screenshotPath = join(root, 'large.png');
    const pdfPath = join(root, 'guide.pdf');
    const screenshotPayload = Buffer.concat([syntheticPng(1440, 900), Buffer.alloc(2 * 1024 * 1024)]);
    const pdfPayload = syntheticPdf(2, 128 * 1024);
    try {
      await Promise.all([writeFile(screenshotPath, screenshotPayload), writeFile(pdfPath, pdfPayload)]);
      expect(inspectHelpScreenshotFileSync(screenshotPath, 'large.png')).toEqual({
        sha256: createHash('sha256').update(screenshotPayload).digest('hex'),
        sizeBytes: screenshotPayload.byteLength,
        width: 1440,
        height: 900,
      });
      expect(inspectHelpPdfFileSync(pdfPath)).toEqual({
        sha256: createHash('sha256').update(pdfPayload).digest('hex'),
        sizeBytes: pdfPayload.byteLength,
        pageCount: 2,
      });

      const cancelled = new AbortController();
      cancelled.abort();
      expect(await inspectHelpScreenshotFile(screenshotPath, 'large.png', cancelled.signal)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('executes final-mode byte and frozen-SHA validation for ready private media', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'diis-help-final-gate-'));
    const screenshotRoot = join(projectRoot, 'apps', 'web', 'private', 'help-screenshots');
    const artifactRoot = join(projectRoot, 'apps', 'web', 'private', 'help-artifacts');
    const screenshotRecord = HELP_SCREENSHOTS.find((item) => item.id === 'shot.academic.mobile')!;
    const artifactRecord = HELP_ARTIFACTS.find((item) => item.id === 'artifact.student')!;
    const screenshotOriginal = { ...screenshotRecord };
    const artifactOriginal = { ...artifactRecord };
    const screenshotPayload = syntheticPng(390, 844);
    const artifactPayload = syntheticPdf(1);
    const frozenSha = 'b'.repeat(40);
    try {
      await Promise.all([mkdir(screenshotRoot, { recursive: true }), mkdir(artifactRoot, { recursive: true })]);
      await Promise.all([
        writeFile(join(screenshotRoot, 'student.png'), screenshotPayload),
        writeFile(join(artifactRoot, artifactRecord.fileName), artifactPayload),
      ]);
      Object.assign(screenshotRecord, {
        assetStatus: 'ready', fileName: 'student.png',
        sha256: createHash('sha256').update(screenshotPayload).digest('hex'),
        sizeBytes: screenshotPayload.byteLength, width: 390, height: 844,
        candidateSha: frozenSha, capturedAt: '2026-08-28T10:00:00+07:00',
        privacyReview: 'pass', visualReview: 'pass',
      });
      Object.assign(artifactRecord, {
        status: 'ready', sha256: createHash('sha256').update(artifactPayload).digest('hex'),
        sizeBytes: artifactPayload.byteLength, pageCount: 1, candidateSha: frozenSha,
        generatedAt: '2026-08-28T10:00:00+07:00', privacyReview: 'pass', visualReview: 'pass',
      });

      const freezeOptions = {
        finalMode: true,
        projectRoot,
        expectedApplicationSha: frozenSha,
        expectedSharedAuthSha: 'c'.repeat(40),
        expectedThemeManifestSha256: 'd'.repeat(64),
      } as const;
      const valid = validateHelpSystem(freezeOptions);
      expect(valid.some((issue) => issue.code.startsWith('screenshot.shot.academic.mobile.'))).toBe(false);
      expect(valid.some((issue) => issue.code.startsWith('artifact.artifact.student.'))).toBe(false);

      Object.assign(artifactRecord, { pageCount: 2 });
      expect(validateHelpSystem(freezeOptions)).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'artifact.artifact.student.page-count' }),
      ]));
      Object.assign(artifactRecord, { pageCount: 1 });

      await writeFile(join(screenshotRoot, 'student.png'), Buffer.from('corrupt'));
      const corrupt = validateHelpSystem(freezeOptions);
      expect(corrupt).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'screenshot.shot.academic.mobile.size' }),
      ]));
    } finally {
      Object.assign(screenshotRecord, screenshotOriginal);
      Object.assign(artifactRecord, artifactOriginal);
      await rm(projectRoot, { recursive: true, force: true });
    }
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

  it('reproduces the source ledger and aggregate digest with the checked-in helper', () => {
    const scriptPath = resolve(__dirname, '../../scripts/help-source-manifest.mjs');
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: resolve(__dirname, '../../../..'),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const manifest = JSON.parse(result.stdout) as {
      fileCount: number;
      digest: string;
      serialized: string;
      files: Array<{ path: string; sha256: string; sizeBytes: number }>;
    };
    expect(manifest.fileCount).toBe(34);
    expect(manifest.files).toHaveLength(34);
    expect(manifest.serialized.endsWith('\n')).toBe(false);
    expect(manifest.files.map((file) => file.path)).toEqual(
      [...manifest.files.map((file) => file.path)].sort((left, right) =>
        Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8')),
      ),
    );
    const serialized = manifest.files.map((file) => `${file.path}\t${file.sha256}`).join('\n');
    expect(manifest.serialized).toBe(serialized);
    expect(createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'))
      .toBe(manifest.digest);
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

  it('provides exactly one specific primary CTA for every operational workflow', () => {
    const operationalTopics = HELP_CATALOG.filter((topic) => topic.id !== 'topic.official-support');
    expect(operationalTopics).toHaveLength(29);
    for (const topic of operationalTopics) {
      const ctas = topic.blocks.filter((block) => block.kind === 'cta');
      expect(ctas).toHaveLength(1);
      if (ctas[0]?.kind === 'cta') {
        expect(isSafeHelpWorkflowHref(ctas[0].href)).toBe(true);
        expect(ctas[0].label).toMatch(/^Buka /);
        expect(ctas[0].label).not.toBe('Buka fitur');
      }
    }
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.official-support')?.blocks)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'cta' })]));
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.module-authoring')?.blocks)
      .toEqual(expect.arrayContaining([expect.objectContaining({ href: '/dashboard/akademik?view=module-authoring' })]));
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.assessment')?.blocks)
      .toEqual(expect.arrayContaining([expect.objectContaining({ href: '/dashboard/akademik?view=question-bank' })]));
    expect(HELP_CATALOG.find((topic) => topic.id === 'topic.remedial-family')?.blocks)
      .toEqual(expect.arrayContaining([expect.objectContaining({ href: '/dashboard/akademik?view=remedial-status' })]));
  });

  it('gives multi-child parents an actionable fail-closed context warning', () => {
    expect(parentHelpContextWarning(true, true, 2, false)).toContain('Pilih anak terlebih dahulu');
    expect(parentHelpContextWarning(true, true, 2, true)).toBeNull();
    expect(parentHelpContextWarning(true, false, 2, false)).toBeNull();
  });
});
