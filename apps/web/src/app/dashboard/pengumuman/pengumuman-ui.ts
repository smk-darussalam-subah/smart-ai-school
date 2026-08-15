type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface AnnouncementStatusInput {
  status: 'draft' | 'published' | 'archived';
  scheduledAt?: string | null;
  deliveryPreparedAt?: string | null;
}

export type AnnouncementAudienceInput =
  | string[]
  | string
  | { roles?: unknown; audience?: unknown; all?: unknown }
  | null
  | undefined;

const STATUS_BADGE: Record<AnnouncementStatusInput['status'], { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Draft', variant: 'outline' },
  published: { label: 'Terbit', variant: 'default' },
  archived: { label: 'Arsip', variant: 'secondary' },
};

export function getAnnouncementDisplayStatus(
  announcement: AnnouncementStatusInput,
  now = new Date(),
): { label: string; variant: BadgeVariant } {
  if (
    announcement.status === 'published' &&
    announcement.scheduledAt &&
    !announcement.deliveryPreparedAt &&
    new Date(announcement.scheduledAt) > now
  ) {
    return { label: 'Terjadwal', variant: 'outline' };
  }
  return STATUS_BADGE[announcement.status];
}

export function normalizeAnnouncementAudience(audience: AnnouncementAudienceInput): string[] {
  if (Array.isArray(audience)) return audience.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof audience === 'string' && audience.trim()) return [audience.trim()];
  if (!audience || typeof audience !== 'object') return [];
  if (audience.all === true) return ['ALL'];
  if (Array.isArray(audience.roles)) return normalizeAnnouncementAudience(audience.roles);
  if (Array.isArray(audience.audience)) return normalizeAnnouncementAudience(audience.audience);
  return [];
}
