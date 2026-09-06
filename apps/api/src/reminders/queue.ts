/**
 * BullMQ Reminders Queue Configuration & Enqueueing Service.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 5, `PercriptionSetuMASTERPLAN.md` §18.6.
 */

import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';

export const REMINDERS_QUEUE_NAME = 'reminders';

export interface ReminderJobData {
  reminder_id: string;
}

/**
 * Creates an ioredis client instance configured for BullMQ.
 * Note: BullMQ requires `maxRetriesPerRequest: null`.
 */
export function createRedisConnection(url?: string): Redis {
  const redisUrl = url || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * Factory for creating the reminders BullMQ Queue.
 */
export function createReminderQueue(connectionOrUrl?: Redis | string): Queue<ReminderJobData> {
  const connection =
    connectionOrUrl instanceof Redis
      ? connectionOrUrl
      : createRedisConnection(typeof connectionOrUrl === 'string' ? connectionOrUrl : undefined);

  return new Queue<ReminderJobData>(REMINDERS_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute base exponential backoff
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

/**
 * Calculates delayed timing and enqueues a reminder job.
 * Enforces job deduplication using the reminder UUID as the BullMQ `jobId`.
 */
export async function enqueueReminder(
  queue: Queue<ReminderJobData>,
  reminder: { id: string; scheduled_time: Date | string },
): Promise<Job<ReminderJobData>> {
  const scheduledEpoch = new Date(reminder.scheduled_time).getTime();
  const delay = Math.max(0, scheduledEpoch - Date.now());

  return await queue.add(
    'dispatch_reminder',
    { reminder_id: reminder.id },
    {
      jobId: reminder.id,
      delay,
    },
  );
}
