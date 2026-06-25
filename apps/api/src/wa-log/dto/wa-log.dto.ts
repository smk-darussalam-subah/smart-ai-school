import { z } from 'zod';

// WA Log DTO (P15 — W3-4). Audit log for WhatsApp notifications.

export const ListWaLogSchema = z.object({
  eventType: z.string().optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']).optional(),
  studentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListWaLogDto = z.infer<typeof ListWaLogSchema>;

export const LogWaNotificationSchema = z.object({
  studentId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  recipient: z.string().min(1).max(100),
  message: z.string().min(1),
  eventType: z.string().optional(),
  notificationLogId: z.string().uuid().optional(),
});
export type LogWaNotificationDto = z.infer<typeof LogWaNotificationSchema>;
