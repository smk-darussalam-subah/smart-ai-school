import type { HelpArtifact, HelpContentBlock, HelpContext, HelpTopic } from './help-schema';
import { HELP_CATALOG, HELP_TOPIC_BY_ID } from './help-catalog';
import { HELP_ARTIFACTS, HELP_SCREENSHOTS } from './help-evidence';
import type { HelpTopicSummary } from './help-search';

export type { HelpTopicSummary } from './help-search';

export interface HelpAuthoritySnapshot {
  identityRoles: string[];
  positionCodes: string[];
  permissions: string[];
  contexts: HelpContext[];
  viewAs: string | null;
  permissionCheckAvailable: boolean;
  selectedChildVerified: boolean;
  childCount: number;
}

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

  if (!isSuperAdmin && topic.permissionsAny.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
    const allowed = authority.permissions.includes('*') || intersects(topic.permissionsAny, authority.permissions);
    if (!allowed) return false;
  }

  if (!isSuperAdmin && topic.permissionsAll.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
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
  const isSuperAdmin = authority.identityRoles.includes('SUPER_ADMIN') && !authority.viewAs;
  if (isSuperAdmin && artifact.allowSuperAdminRecovery) return true;

  const audienceRestricted = artifact.primaryRoles.length > 0 || artifact.positionCodes.length > 0;
  const audienceMatch = !audienceRestricted ||
    intersects(artifact.primaryRoles, authority.identityRoles) ||
    intersects(artifact.positionCodes, authority.positionCodes);
  if (!audienceMatch) return false;
  if (artifact.selectedChildRequired && !authority.selectedChildVerified) return false;
  if (!artifact.assignmentContexts.every((context) => authority.contexts.includes(context))) return false;

  if (artifact.permissionsAny.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
    const allowed = authority.permissions.includes('*') ||
      intersects(artifact.permissionsAny, authority.permissions);
    if (!allowed) return false;
  }
  if (artifact.permissionsAll.length > 0) {
    if (!authority.permissionCheckAvailable) return false;
    const allowed = authority.permissions.includes('*') ||
      artifact.permissionsAll.every((permission) => authority.permissions.includes(permission));
    if (!allowed) return false;
  }
  return true;
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
  const readyScreenshots = new Set(
    HELP_SCREENSHOTS.filter((item) => item.assetStatus === 'ready').map((item) => item.id),
  );
  const blocks = topic.blocks.filter((block) => block.kind !== 'screenshot' || readyScreenshots.has(block.screenshotId));
  const relatedTopics = topic.relatedTopicIds
    .map((id) => HELP_TOPIC_BY_ID.get(id))
    .filter((related): related is HelpTopic => Boolean(related && canProjectHelpTopic(related, authority)))
    .map(({ id, slug, title }) => ({ id, slug, title }));
  const artifacts = HELP_ARTIFACTS
    .filter((artifact) => artifact.topicIds.includes(topic.id) && canAccessHelpArtifact(artifact, authority))
    .map(({ id, label, status }) => ({ id, label, status }));
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
