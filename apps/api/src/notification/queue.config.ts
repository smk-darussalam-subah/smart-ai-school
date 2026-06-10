import { Queue, QueueOptions } from 'bullmq';

export const NOTIFICATION_QUEUE = 'notification';

export interface NotifJob {
  logId: string;
  channel: 'whatsapp' | 'email';
  to: string;
  body: string;
  subject?: string;
}

const RETRY_MAX = parseInt(process.env.NOTIF_RETRY_MAX || '5', 10);

export function createNotificationQueue(connection: Record<string, unknown>): Queue<NotifJob> {
  const opts: QueueOptions = {
    connection: connection as never,
    defaultJobOptions: {
      attempts: RETRY_MAX,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 3600 * 24 },
      removeOnFail: { age: 3600 * 24 * 7 },
    },
  };

  return new Queue<NotifJob>(NOTIFICATION_QUEUE, opts);
}
