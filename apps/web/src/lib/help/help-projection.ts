import type { HelpArtifact, HelpContentBlock, HelpScreenshot, HelpTopic } from './help-schema';
import {
  canAccessHelpEvidenceAuthority,
  type HelpAuthoritySnapshot,
} from './help-evidence-authority';
import { HELP_CATALOG, HELP_TOPIC_BY_ID } from './help-catalog';
import { HELP_ARTIFACTS, HELP_SCREENSHOTS } from './help-evidence';
import { isHelpArtifactReady } from './help-artifacts';
import { isHelpScreenshotReady } from './help-screenshots';
import type { HelpTopicSummary } from './help-search';

export type { HelpTopicSummary } from './help-search';

export type { HelpAuthoritySnapshot } from './help-evidence-authority';

export interface HelpTopicProjection extends HelpTopicSummary {
  version: string;
  featureStatus: HelpTopic['featureStatus'];
  updatedAt: string;
  contentOwner: HelpTopic['contentOwner'];
  blocks: HelpContentBlock[];
  relatedTopics: Array<{ id: string; slug: string; title: string }>;
  artifacts: HelpArtifactProjection[];
}

export type HelpArtifactProjection = Pick<HelpArtifact, 'id' | 'label' | 'status'>;

function intersects(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

export function canProjectHelpTopic(topic: HelpTopic, authority: HelpAuthoritySnapshot): boolean {
  const isSuperAdmin = authority.identityRoles.includes('SUPER_ADMIN') && !authority.viewAs;
  const audienceRestricted = topic.primaryRoles.length > 0 || topic.positionCodes.length > 0;
  const audienceMatch = !audienceRestricted ||
    intersects(topic.primaryRoles, authority.identityRoles) ||
    intersects(topic.positionCodes, authority.positionCodes);
  if (!isSuperAdmin && !audienceMatch) return false;

  if (
    authority.identityRoles.includes('ORANG_TUA') &&
    topic.primaryRoles.includes('ORANG_TUA') &&
    !authority.selectedChildVerified
  ) return false;

  if (
    !authority.permissionCheckAvailable &&
    (topic.permissionsAny.length > 0 || topic.permissionsAll.length > 0)
  ) return false;

  if (!isSuperAdmin && topic.permissionsAny.length > 0) {
    const allowed = authority.permissions.includes('*') || intersects(topic.permissionsAny, authority.permissions);
    if (!allowed) return false;
  }

  if (!isSuperAdmin && topic.permissionsAll.length > 0) {
    const allowed = authority.permissions.includes('*') ||
      topic.permissionsAll.every((permission) => authority.permissions.includes(permission));
    if (!allowed) return false;
  }

  return topic.assignmentContexts.every((context) => authority.contexts.includes(context));
}

export function canAccessHelpArtifact(
  artifact: HelpArtifact,
  authority: HelpAuthoritySnapshot,
): boolean {
  return canAccessHelpEvidence(artifact, authority);
}

export function canAccessHelpScreenshot(
  screenshot: HelpScreenshot,
  authority: HelpAuthoritySnapshot,
): boolean {
  return canAccessHelpEvidence(screenshot, authority);
}

export function hasReadyHelpArtifact(authority: HelpAuthoritySnapshot): boolean {
  return HELP_ARTIFACTS.some((artifact) => (
    isHelpArtifactReady(artifact) && canAccessHelpArtifact(artifact, authority)
  ));
}

function canAccessHelpEvidence(
  evidence: HelpArtifact | HelpScreenshot,
  authority: HelpAuthoritySnapshot,
): boolean {
  return canAccessHelpEvidenceAuthority(evidence, authority);
}

export function projectHelpSummaries(authority: HelpAuthoritySnapshot): HelpTopicSummary[] {
  return HELP_CATALOG
    .filter((topic) => canProjectHelpTopic(topic, authority))
    .map(({ id, slug, title, summary, route, category, keywords }) => ({
      id,
      slug,
      title,
      summary,
      route,
      category,
      keywords,
    }));
}

export function projectHelpTopic(topic: HelpTopic, authority: HelpAuthoritySnapshot): HelpTopicProjection | null {
  if (!canProjectHelpTopic(topic, authority)) return null;
  const screenshotById = new Map(HELP_SCREENSHOTS.map((item) => [item.id, item]));
  const projectedScreenshotIds = new Set<string>();
  const blocks = topic.blocks.filter((block) => {
    if (block.kind !== 'screenshot') return true;
    const screenshot = screenshotById.get(block.screenshotId);
    const allowed = Boolean(
      screenshot && isHelpScreenshotReady(screenshot) && canAccessHelpScreenshot(screenshot, authority),
    );
    if (allowed) projectedScreenshotIds.add(block.screenshotId);
    return allowed;
  });
  for (const screenshotId of topic.screenshotIds) {
    if (projectedScreenshotIds.has(screenshotId)) continue;
    const screenshot = screenshotById.get(screenshotId);
    if (!screenshot || !isHelpScreenshotReady(screenshot) || !canAccessHelpScreenshot(screenshot, authority)) continue;
    blocks.push({
      kind: 'screenshot',
      screenshotId: screenshot.id,
      caption: screenshot.caption,
      altText: screenshot.altText,
      viewport: screenshot.viewport,
      width: screenshot.width,
      height: screenshot.height,
    });
  }
  const relatedTopics = topic.relatedTopicIds
    .map((id) => HELP_TOPIC_BY_ID.get(id))
    .filter((related): related is HelpTopic => Boolean(related && canProjectHelpTopic(related, authority)))
    .map(({ id, slug, title }) => ({ id, slug, title }));
  const artifacts = HELP_ARTIFACTS
    .filter((artifact) => artifact.topicIds.includes(topic.id) && canAccessHelpArtifact(artifact, authority))
    .map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      status: artifact.status === 'ready' && !isHelpArtifactReady(artifact) ? 'pending' as const : artifact.status,
    }));
  const { id, slug, title, summary, route, category, keywords, version, featureStatus, updatedAt, contentOwner } = topic;
  return {
    id,
    slug,
    title,
    summary,
    route,
    category,
    keywords,
    version,
    featureStatus,
    updatedAt,
    contentOwner,
    blocks,
    relatedTopics,
    artifacts,
  };
}

export function serializedProjectionContainsOnly(topics: HelpTopicSummary[], allowedIds: Set<string>): boolean {
  return topics.every((topic) => allowedIds.has(topic.id));
}
