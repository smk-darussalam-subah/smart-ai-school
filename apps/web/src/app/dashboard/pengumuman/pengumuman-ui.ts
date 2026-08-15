type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface AnnouncementStatusInput {
  status: 'draft' | 'published' | 'archived';
  scheduledAt?: string | null;
  deliveryPreparedAt?: string | null;
}

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
