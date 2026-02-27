import { Queue, Worker, Job } from 'bullmq';
import { redisConnection, isRedisConfigured } from './redis-connection';

const QUEUE_NAME = 'email-processing';

export interface EmailProcessingJobData {
  type: 'process_batch';
}

let emailProcessingQueue: Queue<EmailProcessingJobData> | null = null;
let emailProcessingWorker: Worker<EmailProcessingJobData> | null = null;
let bullMQActive = false;

export function isBullMQActive(): boolean {
  return bullMQActive;
}

export function getEmailProcessingQueue(): Queue<EmailProcessingJobData> | null {
  return emailProcessingQueue;
}

function isRateLimitError(err: Error): boolean {
  return err.message?.includes('max requests limit exceeded') || false;
}

export async function initEmailQueueWorker(): Promise<void> {
  if (!isRedisConfigured || !redisConnection) {
    console.warn('⚠️  Email BullMQ worker NOT started - Redis unavailable.');
    return;
  }

  try {
    emailProcessingQueue = new Queue<EmailProcessingJobData>(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    });

    emailProcessingWorker = new Worker<EmailProcessingJobData>(
      QUEUE_NAME,
      async (_job: Job<EmailProcessingJobData>) => {
        const { emailQueueService } = await import('../services/email-queue.service');
        await emailQueueService.processPendingEmails();
      },
      {
        connection: redisConnection,
        concurrency: 1,
      }
    );

    emailProcessingWorker.on('completed', () => {
      bullMQActive = true;
    });

    emailProcessingWorker.on('failed', (job, err) => {
      if (!isRateLimitError(err)) {
        console.error(`[EmailWorker] Job failed:`, err.message);
      }
    });

    emailProcessingWorker.on('error', (err) => {
      if (isRateLimitError(err)) {
        bullMQActive = false;
        console.warn('⚠️  [EmailWorker] Redis rate limit hit — adaptive poller will handle emails');
      } else if (!err.message?.includes('ECONNREFUSED')) {
        console.error('[EmailWorker] Worker error:', err.message);
      }
    });

    try {
      await emailProcessingQueue.upsertJobScheduler(
        'email-safety-net',
        { every: 5 * 60 * 1000 },
        {
          name: 'process_batch',
          data: { type: 'process_batch' },
          opts: { removeOnComplete: { count: 5 }, removeOnFail: { count: 5 } },
        }
      );
      bullMQActive = true;
      console.log('✅ Email BullMQ worker started (event-driven + 5-min safety net)');
    } catch (err: any) {
      if (isRateLimitError(err)) {
        console.warn('⚠️  [EmailWorker] Redis rate limit exceeded — falling back to adaptive poller only');
        bullMQActive = false;
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    if (isRateLimitError(err)) {
      console.warn('⚠️  [EmailWorker] Redis rate limit exceeded — falling back to adaptive poller only');
      bullMQActive = false;
      emailProcessingQueue = null;
      emailProcessingWorker = null;
    } else {
      console.error('[EmailWorker] Init failed:', err.message);
    }
  }
}

export async function triggerEmailProcessing(): Promise<void> {
  if (!emailProcessingQueue || !bullMQActive) return;
  try {
    await emailProcessingQueue.add('process_batch', { type: 'process_batch' }, {
      jobId: `trigger-${Date.now()}`,
      delay: 0,
    });
  } catch (err: any) {
    if (isRateLimitError(err)) {
      bullMQActive = false;
    }
  }
}

export { emailProcessingQueue, emailProcessingWorker };
