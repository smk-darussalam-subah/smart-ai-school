// =============================================================================
// Announcement DTOs — Zod schemas (konvensi proyek: ZodPipe + z.infer)
// =============================================================================

import { z } from 'zod';
import { UserRole } from '@smk/auth';

export const AnnouncementAudienceSchema = z
  .array(z.union([z.literal('ALL'), UserRole]))
  .nonempty('Audiens minimal satu')
  .max(8)
  .refine(
    (arr) => !(arr.includes('ALL') && arr.length > 1),
    'Audiens "ALL" tidak boleh dicampur dengan role spesifik',
  );

export const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(255),
  content: z.string().trim().min(1, 'Isi pengumuman wajib diisi').max(20_000),
  category: z.enum(['umum', 'akademik', 'keuangan', 'kegiatan', 'darurat']).default('umum'),
  priority: z.enum(['biasa', 'penting', 'urgent']).default('biasa'),
  audience: AnnouncementAudienceSchema.default(['ALL']),
  isPinned: z.boolean().default(false),
  status: z.enum(['draft', 'published']).default('draft'),
  scheduledAt: z.string().datetime({ offset: true }).nullish(),
});
export type CreateAnnouncementDto = z.infer<typeof CreateAnnouncementSchema>;

export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial();
export type UpdateAnnouncementDto = z.infer<typeof UpdateAnnouncementSchema>;

export const SetPinSchema = z.object({ isPinned: z.boolean() });
export type SetPinDto = z.infer<typeof SetPinSchema>;

export const ListAnnouncementsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  category: z.enum(['umum', 'akademik', 'keuangan', 'kegiatan', 'darurat']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAnnouncementsQueryDto = z.infer<typeof ListAnnouncementsQuerySchema>;
