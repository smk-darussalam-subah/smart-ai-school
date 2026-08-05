import { Queue, QueueOptions } from 'bullmq';

export const NOTIFICATION_QUEUE = 'notification';
const LOCAL_QUEUE_NAMESPACE = 'local';
const QUEUE_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export interface NotifJob {
  logId: string;
  channel: 'whatsapp' | 'email';
  to: string;
  body: string;
  subject?: string;
}

const RETRY_MAX = parseInt(process.env.NOTIF_RETRY_MAX || '5', 10);

export function resolveNotificationQueuePrefix(
  rawNamespace = process.env['REDIS_QUEUE_NAMESPACE'],
  nodeEnv = process.env['NODE_ENV'],
): string {
  const namespace = rawNamespace?.trim();
  if (!namespace) {
    if (nodeEnv === 'production') {
      throw new Error('REDIS_QUEUE_NAMESPACE wajib diset untuk BullMQ di deployment production/staging');
    }
    return `diis:${LOCAL_QUEUE_NAMESPACE}:bull`;
  }
  if (!QUEUE_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error('REDIS_QUEUE_NAMESPACE hanya boleh berisi huruf kecil, angka, underscore, atau dash');
  }
  return `diis:${namespace}:bull`;
}

export function buildNotificationQueueOptions(
  connection: Record<string, unknown>,
  prefix = resolveNotificationQueuePrefix(),
): QueueOptions {
  return {
    connection: connection as never,
    prefix,
    defaultJobOptions: {
      attempts: RETRY_MAX,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 3600 * 24 },
      removeOnFail: { age: 3600 * 24 * 7 },
    },
  };
}

export function createNotificationQueue(connection: Record<string, unknown>, prefix = resolveNotificationQueuePrefix()): Queue<NotifJob> {
  return new Queue<NotifJob>(NOTIFICATION_QUEUE, buildNotificationQueueOptions(connection, prefix));
}
