import { Queue } from 'bullmq';
import { redisConnection, isRedisConfigured } from './redis-connection';

export interface AutomationJobData {
  automationRunId: string;
  sequenceId: string;
  prospectSource: 'apollo' | 'existing';
  prospectCount: number;
  selectedProspectIds?: string[];
  aiPersonalizationEnabled: boolean;
  apolloFilters?: any;
  userId: string;
}

let automationQueue: Queue<AutomationJobData> | null = null;

if (isRedisConfigured && redisConnection) {
  automationQueue = new Queue<AutomationJobData>('automation', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5s delay
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
        count: 500, // Keep last 500 failed jobs
      },
    },
  });

  console.log('📋 Automation queue initialized');
} else {
  console.warn('⚠️  Automation queue NOT initialized - Redis unavailable');
}

export { automationQueue, isRedisConfigured };
export default automationQueue;
