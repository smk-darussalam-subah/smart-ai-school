import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { POSITION_CODES, PRIMARY_ROLES } from '@smk/auth';
import { HELP_CATALOG, PRIMARY_WORKFLOW_ROUTES, ROUTE_TOPIC_MAP } from './help-catalog';
import {
  HELP_ARTIFACTS,
  HELP_CLAIM_SOURCE_LEDGER,
  HELP_DECK_CONTENT_MAP,
  HELP_SCREENSHOTS,
} from './help-evidence';
import { HELP_PERSONA_GUIDES } from './help-personas';
import { isHelpEvidenceConsumerCompatible } from './help-evidence-authority';
import { inspectHelpPdfFileSync, isHelpArtifactReady, resolvePrivateArtifactRoot } from './help-artifacts';
import {
  inspectHelpScreenshotFileSync,
  isHelpScreenshotReady,
  resolvePrivateScreenshotRoot,
} from './help-screenshots';
import {
  HelpArtifactSchema,
  HelpCatalogSchema,
  HelpClaimSourceSchema,
  HelpDeckSchema,
  HelpScreenshotSchema,
  type HelpClaimSource,
} from './help-schema';

export interface HelpValidationIssue {
  code: string;
  message: string;
}

export interface HelpValidationOptions {
  finalMode?: boolean;
  projectRoot?: string;
  expectedApplicationSha?: string;
  expectedSharedAuthSha?: string;
  expectedThemeManifestSha256?: string;
  metadataAsOf?: string;
  maxMetadataAgeDays?: number;
}

const GENERIC_EVIDENCE_TOPIC_IDS = new Set([
  'topic.start',
  'topic.account-recovery',
  'topic.official-support',
]);

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

function validateReadyFileMetadata(
  filePath: string,
  expectedSize: number,
  codePrefix: string,
): HelpValidationIssue[] {
  if (!existsSync(filePath)) {
    return [{ code: `${codePrefix}.missing`, message: `${filePath} tidak ditemukan.` }];
  }
  try {
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      return [{ code: `${codePrefix}.unsafe-type`, message: `${filePath} bukan file reguler.` }];
    }
    realpathSync(filePath);
    if (metadata.size !== expectedSize) {
      return [{ code: `${codePrefix}.size`, message: `${filePath} memiliki ukuran berbeda.` }];
    }
    return [];
  } catch {
    return [{ code: `${codePrefix}.read`, message: `${filePath} tidak dapat diverifikasi.` }];
  }
}

function findRelationCycles(relations: Map<string, string[]>): string[][] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];

  function visit(id: string, path: string[]) {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycles.push([...path.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of relations.get(id) ?? []) visit(next, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of relations.keys()) visit(id, []);
  return cycles;
}

function projectRootFromCwd(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  return candidates.find((candidate) => existsSync(resolve(candidate, 'apps', 'web', 'package.json'))) ?? process.cwd();
}

function isProjectFile(projectRoot: string, relativePath: string): boolean {
  if (!relativePath || relativePath.includes('\0')) return false;
  const absoluteRoot = resolve(projectRoot);
  const absolutePath = resolve(absoluteRoot, relativePath);
  if (!absolutePath.startsWith(`${absoluteRoot}${sep}`)) return false;
  try {
    return statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

export function isHelpTopicMetadataStale(
  updatedAt: string,
  asOf: string,
  maxAgeDays = 180,
): boolean {
  const updated = Date.parse(`${updatedAt}T00:00:00Z`);
  const reviewed = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(updated) || !Number.isFinite(reviewed) || reviewed < updated) return true;
  return (reviewed - updated) / 86_400_000 > maxAgeDays;
}

export function validateHelpClaimSourceLedger(
  topicIds: Set<string>,
  claims: readonly HelpClaimSource[],
  projectRoot = projectRootFromCwd(),
): HelpValidationIssue[] {
  const issues: HelpValidationIssue[] = [];
  for (const claimId of duplicates(claims.map((claim) => claim.claimId))) {
    issues.push({ code: 'claim.duplicate-id', message: claimId });
  }
  const coveredTopicIds = new Set<string>();
  for (const [index, item] of claims.entries()) {
    const parsed = HelpClaimSourceSchema.safeParse(item);
    if (!parsed.success) {
      issues.push({ code: 'claim.schema', message: `Claim ${index} tidak valid.` });
      continue;
    }
    if (!topicIds.has(item.topicId)) issues.push({ code: 'claim.broken-topic', message: item.claimId });
    else coveredTopicIds.add(item.topicId);
    for (const field of ['source', 'test', 'report'] as const) {
      if (!isProjectFile(projectRoot, item[field])) {
        issues.push({ code: `claim.missing-${field}`, message: `${item.claimId}: ${item[field]}` });
      }
    }
  }
  for (const topicId of topicIds) {
    if (!coveredTopicIds.has(topicId)) issues.push({ code: 'claim.missing-topic-trace', message: topicId });
  }
  return issues;
}

export function validateHelpSystem(options: HelpValidationOptions = {}): HelpValidationIssue[] {
  const issues: HelpValidationIssue[] = [];
  if (options.finalMode) {
    if (!options.expectedApplicationSha) {
      issues.push({ code: 'freeze.missing-application-sha', message: 'Final mode wajib mengikat application SHA.' });
    }
    if (!options.expectedSharedAuthSha) {
      issues.push({ code: 'freeze.missing-shared-auth-sha', message: 'Final mode wajib mengikat shared-auth SHA.' });
    }
    if (!options.expectedThemeManifestSha256) {
      issues.push({ code: 'freeze.missing-theme-manifest', message: 'Final mode wajib mengikat theme manifest SHA-256.' });
    }
  }
  const catalog = HelpCatalogSchema.safeParse(HELP_CATALOG);
  if (!catalog.success) {
    return catalog.error.issues.map((issue) => ({ code: 'catalog.schema', message: issue.message }));
  }

  for (const [index, screenshot] of HELP_SCREENSHOTS.entries()) {
    const result = HelpScreenshotSchema.safeParse(screenshot);
    if (!result.success) issues.push({ code: 'screenshot.schema', message: `Screenshot ${index} tidak valid.` });
  }
  for (const [index, artifact] of HELP_ARTIFACTS.entries()) {
    const result = HelpArtifactSchema.safeParse(artifact);
    if (!result.success) issues.push({ code: 'artifact.schema', message: `Artifact ${index} tidak valid.` });
  }
  for (const [index, deck] of HELP_DECK_CONTENT_MAP.entries()) {
    const result = HelpDeckSchema.safeParse(deck);
    if (!result.success) issues.push({ code: 'deck.schema', message: `Deck ${index} tidak valid.` });
  }

  for (const id of duplicates(HELP_CATALOG.map((topic) => topic.id))) {
    issues.push({ code: 'topic.duplicate-id', message: `Topic ID duplikat: ${id}` });
  }
  for (const slug of duplicates(HELP_CATALOG.map((topic) => topic.slug))) {
    issues.push({ code: 'topic.duplicate-slug', message: `Topic slug duplikat: ${slug}` });
  }
  for (const id of duplicates(HELP_SCREENSHOTS.map((item) => item.id))) {
    issues.push({ code: 'screenshot.duplicate-id', message: `Screenshot ID duplikat: ${id}` });
  }
  for (const id of duplicates(HELP_ARTIFACTS.map((item) => item.id))) {
    issues.push({ code: 'artifact.duplicate-id', message: `Artifact ID duplikat: ${id}` });
  }
  if (HELP_SCREENSHOTS.length !== 40) {
    issues.push({ code: 'screenshot.canonical-count', message: `Registry screenshot berisi ${HELP_SCREENSHOTS.length}, wajib 40.` });
  }
  if (HELP_ARTIFACTS.length !== 24) {
    issues.push({ code: 'artifact.canonical-count', message: `Registry PDF berisi ${HELP_ARTIFACTS.length}, wajib 24.` });
  }
  if (HELP_DECK_CONTENT_MAP.length !== 4) {
    issues.push({ code: 'deck.canonical-count', message: `Registry deck berisi ${HELP_DECK_CONTENT_MAP.length}, wajib 4.` });
  }

  const topicIds = new Set(HELP_CATALOG.map((topic) => topic.id));
  const screenshotIds = new Set(HELP_SCREENSHOTS.map((item) => item.id));
  const evidenceConsumerIds = new Set([
    ...HELP_ARTIFACTS.map((artifact) => artifact.id),
    ...HELP_DECK_CONTENT_MAP.map((deck) => deck.id),
  ]);
  for (const consumerId of evidenceConsumerIds) {
    if (!HELP_SCREENSHOTS.some((screenshot) => screenshot.consumers.includes(consumerId))) {
      issues.push({ code: 'evidence.missing-screenshot-consumer', message: `${consumerId} belum memiliki screenshot.` });
    }
  }
  for (const artifact of HELP_ARTIFACTS) {
    const hasWorkflowEvidence = HELP_SCREENSHOTS.some((screenshot) =>
      screenshot.consumers.includes(artifact.id) &&
      !GENERIC_EVIDENCE_TOPIC_IDS.has(screenshot.topicId) &&
      artifact.topicIds.includes(screenshot.topicId),
    );
    if (!hasWorkflowEvidence) {
      issues.push({
        code: 'evidence.missing-workflow-screenshot',
        message: `${artifact.id} belum memiliki screenshot workflow yang relevan.`,
      });
    }
  }
  for (const deck of HELP_DECK_CONTENT_MAP) {
    for (const topicId of deck.topicIds.filter((id) => !GENERIC_EVIDENCE_TOPIC_IDS.has(id))) {
      const hasTopicEvidence = HELP_SCREENSHOTS.some((screenshot) =>
        screenshot.topicId === topicId && screenshot.consumers.includes(deck.id),
      );
      if (!hasTopicEvidence) {
        issues.push({
          code: 'deck.missing-topic-screenshot',
          message: `${deck.id} belum memiliki screenshot untuk ${topicId}.`,
        });
      }
    }
  }
  for (const topic of HELP_CATALOG) {
    if (isHelpTopicMetadataStale(
      topic.updatedAt,
      options.metadataAsOf ?? '2026-08-26',
      options.maxMetadataAgeDays ?? 180,
    )) {
      issues.push({ code: 'topic.stale-metadata', message: `${topic.id}: ${topic.updatedAt}` });
    }
    for (const id of topic.relatedTopicIds) {
      if (!topicIds.has(id)) issues.push({ code: 'topic.broken-related', message: `${topic.id} merujuk ${id}.` });
      if (id === topic.id) issues.push({ code: 'topic.self-related', message: `${topic.id} merujuk dirinya sendiri.` });
    }
    for (const id of topic.screenshotIds) {
      if (!screenshotIds.has(id)) issues.push({ code: 'topic.broken-screenshot', message: `${topic.id} merujuk ${id}.` });
    }
    for (const block of topic.blocks) {
      if (block.kind === 'related-topic' && !topicIds.has(block.topicId)) {
        issues.push({ code: 'topic.block-related', message: `${topic.id} memiliki related block rusak.` });
      }
      if (block.kind === 'screenshot' && !screenshotIds.has(block.screenshotId)) {
        issues.push({ code: 'topic.block-screenshot', message: `${topic.id} memiliki screenshot block rusak.` });
      }
    }
  }

  const cycles = findRelationCycles(new Map(HELP_CATALOG.map((topic) => [topic.id, topic.relatedTopicIds])));
  for (const cycle of cycles) issues.push({ code: 'topic.circular-related', message: cycle.join(' -> ') });

  for (const route of PRIMARY_WORKFLOW_ROUTES) {
    const topicId = ROUTE_TOPIC_MAP[route];
    if (!topicIds.has(topicId)) issues.push({ code: 'route.broken-topic', message: `${route} merujuk ${topicId}.` });
  }

  for (const screenshot of HELP_SCREENSHOTS) {
    if (!topicIds.has(screenshot.topicId)) issues.push({ code: 'screenshot.orphan-topic', message: screenshot.id });
    for (const consumer of screenshot.consumers) {
      if (!evidenceConsumerIds.has(consumer)) {
        issues.push({ code: 'screenshot.broken-consumer', message: `${screenshot.id} merujuk ${consumer}.` });
        continue;
      }
      const contract = HELP_ARTIFACTS.find((artifact) => artifact.id === consumer) ??
        HELP_DECK_CONTENT_MAP.find((deck) => deck.id === consumer);
      if (contract && !isHelpEvidenceConsumerCompatible(screenshot, contract)) {
        issues.push({
          code: 'screenshot.consumer-authority',
          message: `${screenshot.id} tidak aman untuk authority ${consumer}.`,
        });
      }
    }
    if (options.finalMode && screenshot.required && screenshot.assetStatus !== 'ready') {
      issues.push({ code: 'screenshot.pending-final', message: `${screenshot.id} masih pending.` });
    }
    if (screenshot.assetStatus === 'ready' && !isHelpScreenshotReady(screenshot)) {
      issues.push({ code: 'screenshot.ready-metadata', message: `${screenshot.id} tidak memiliki file/hash.` });
    }
    const expectedSourceSha = screenshot.sourceKind === 'shared-auth'
      ? options.expectedSharedAuthSha
      : options.expectedApplicationSha;
    if (expectedSourceSha && screenshot.assetStatus === 'ready' && screenshot.candidateSha !== expectedSourceSha) {
      issues.push({ code: 'screenshot.wrong-candidate', message: `${screenshot.id} tidak berasal dari SHA beku.` });
    }
    if (
      screenshot.sourceKind === 'shared-auth' && options.expectedThemeManifestSha256 &&
      screenshot.assetStatus === 'ready' && screenshot.themeManifestSha256 !== options.expectedThemeManifestSha256
    ) {
      issues.push({ code: 'screenshot.wrong-theme-manifest', message: `${screenshot.id} tidak berasal dari bundle tema beku.` });
    }
  }

  for (const artifact of HELP_ARTIFACTS) {
    for (const topicId of artifact.topicIds) {
      if (!topicIds.has(topicId)) issues.push({ code: 'artifact.broken-topic', message: `${artifact.id} merujuk ${topicId}.` });
    }
    if (options.finalMode && artifact.status !== 'ready') {
      issues.push({ code: 'artifact.pending-final', message: `${artifact.id} masih pending.` });
    }
    if (artifact.status === 'ready' && !isHelpArtifactReady(artifact)) {
      issues.push({ code: 'artifact.ready-metadata', message: `${artifact.id} tidak memiliki hash/ukuran/SHA.` });
    }
    if (options.expectedApplicationSha && artifact.status === 'ready' && artifact.candidateSha !== options.expectedApplicationSha) {
      issues.push({ code: 'artifact.wrong-candidate', message: `${artifact.id} tidak berasal dari SHA beku.` });
    }
  }

  if (options.finalMode) {
    const projectRoot = options.projectRoot ?? projectRootFromCwd();
    for (const screenshot of HELP_SCREENSHOTS) {
      if (!isHelpScreenshotReady(screenshot)) continue;
      const screenshotPath = resolve(resolvePrivateScreenshotRoot(projectRoot), screenshot.fileName);
      const fileIssues = validateReadyFileMetadata(
        screenshotPath,
        screenshot.sizeBytes,
        `screenshot.${screenshot.id}`,
      );
      issues.push(...fileIssues);
      if (fileIssues.length === 0) {
        const inspection = inspectHelpScreenshotFileSync(screenshotPath, screenshot.fileName);
        if (!inspection) {
          issues.push({ code: `screenshot.${screenshot.id}.invalid-image`, message: `${screenshotPath} bukan gambar yang valid.` });
        } else {
          if (inspection.sha256 !== screenshot.sha256) {
            issues.push({ code: `screenshot.${screenshot.id}.hash`, message: `${screenshotPath} memiliki SHA-256 berbeda.` });
          }
          if (inspection.sizeBytes !== screenshot.sizeBytes) {
            issues.push({ code: `screenshot.${screenshot.id}.size`, message: `${screenshotPath} memiliki ukuran berbeda.` });
          }
          if (inspection.width !== screenshot.width || inspection.height !== screenshot.height) {
            issues.push({ code: `screenshot.${screenshot.id}.dimensions`, message: `${screenshotPath} memiliki dimensi berbeda.` });
          }
        }
      }
    }
    for (const artifact of HELP_ARTIFACTS) {
      if (!isHelpArtifactReady(artifact)) continue;
      const artifactPath = resolve(resolvePrivateArtifactRoot(projectRoot), artifact.fileName);
      const fileIssues = validateReadyFileMetadata(
        artifactPath,
        artifact.sizeBytes,
        `artifact.${artifact.id}`,
      );
      issues.push(...fileIssues);
      if (fileIssues.length === 0) {
        const inspection = inspectHelpPdfFileSync(artifactPath);
        if (!inspection) {
          issues.push({ code: `artifact.${artifact.id}.invalid-pdf`, message: `${artifactPath} bukan PDF struktural yang valid.` });
        } else {
          if (inspection.sha256 !== artifact.sha256) {
            issues.push({ code: `artifact.${artifact.id}.hash`, message: `${artifactPath} memiliki SHA-256 berbeda.` });
          }
          if (inspection.sizeBytes !== artifact.sizeBytes) {
            issues.push({ code: `artifact.${artifact.id}.size`, message: `${artifactPath} memiliki ukuran berbeda.` });
          }
          if (inspection.pageCount !== artifact.pageCount) {
            issues.push({ code: `artifact.${artifact.id}.page-count`, message: `${artifactPath} memiliki jumlah halaman berbeda.` });
          }
        }
      }
    }
  }

  issues.push(...validateHelpClaimSourceLedger(
    topicIds,
    HELP_CLAIM_SOURCE_LEDGER,
    options.projectRoot ?? projectRootFromCwd(),
  ));
  for (const deck of HELP_DECK_CONTENT_MAP) {
    for (const topicId of deck.topicIds) {
      if (!topicIds.has(topicId)) issues.push({ code: 'deck.broken-topic', message: `${deck.id} merujuk ${topicId}.` });
    }
  }
  for (const persona of HELP_PERSONA_GUIDES) {
    for (const role of persona.primaryRoles) {
      if (!(PRIMARY_ROLES as readonly string[]).includes(role)) issues.push({ code: 'persona.invalid-role', message: `${persona.id}: ${role}` });
    }
    for (const code of persona.positionCodes) {
      if (!(POSITION_CODES as readonly string[]).includes(code)) issues.push({ code: 'persona.invalid-position', message: `${persona.id}: ${code}` });
    }
    for (const topicId of persona.topicIds) {
      if (!topicIds.has(topicId)) issues.push({ code: 'persona.broken-topic', message: `${persona.id}: ${topicId}` });
    }
  }

  return issues;
}

export function assertHelpSystemValid(options: HelpValidationOptions = {}): void {
  const issues = validateHelpSystem(options);
  if (issues.length > 0) {
    throw new Error(`Help system tidak valid:\n${issues.map((item) => `${item.code}: ${item.message}`).join('\n')}`);
  }
}
