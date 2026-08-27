import { existsSync, statSync } from 'node:fs';
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
import {
  HelpArtifactSchema,
  HelpCatalogSchema,
  HelpClaimSourceSchema,
  HelpScreenshotSchema,
  type HelpClaimSource,
} from './help-schema';

export interface HelpValidationIssue {
  code: string;
  message: string;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
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

export function validateHelpSystem(options: {
  finalMode?: boolean;
  projectRoot?: string;
  metadataAsOf?: string;
  maxMetadataAgeDays?: number;
} = {}): HelpValidationIssue[] {
  const issues: HelpValidationIssue[] = [];
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

  const topicIds = new Set(HELP_CATALOG.map((topic) => topic.id));
  const screenshotIds = new Set(HELP_SCREENSHOTS.map((item) => item.id));
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
    if (options.finalMode && screenshot.required && screenshot.assetStatus !== 'ready') {
      issues.push({ code: 'screenshot.pending-final', message: `${screenshot.id} masih pending.` });
    }
    if (screenshot.assetStatus === 'ready' && (!screenshot.fileName || !screenshot.sha256 || !screenshot.candidateSha || !screenshot.capturedAt)) {
      issues.push({ code: 'screenshot.ready-metadata', message: `${screenshot.id} tidak memiliki file/hash.` });
    }
  }

  for (const artifact of HELP_ARTIFACTS) {
    for (const topicId of artifact.topicIds) {
      if (!topicIds.has(topicId)) issues.push({ code: 'artifact.broken-topic', message: `${artifact.id} merujuk ${topicId}.` });
    }
    if (options.finalMode && artifact.status !== 'ready') {
      issues.push({ code: 'artifact.pending-final', message: `${artifact.id} masih pending.` });
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

export function assertHelpSystemValid(options: { finalMode?: boolean } = {}): void {
  const issues = validateHelpSystem(options);
  if (issues.length > 0) {
    throw new Error(`Help system tidak valid:\n${issues.map((item) => `${item.code}: ${item.message}`).join('\n')}`);
  }
}
