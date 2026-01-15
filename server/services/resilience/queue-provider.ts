import { EventEmitter } from "events";

export interface QueueJob<T = unknown> {
  id: string;
  type: string;
  data: T;
  priority: number;
  createdAt: Date;
  attempts: number;
  maxRetries: number;
  status: "pending" | "processing" | "completed" | "failed" | "dlq";
}

export interface QueueProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  enqueue<T>(type: string, data: T, priority?: number): Promise<string>;
  dequeue(): Promise<QueueJob | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  getQueueLength(): Promise<number>;
  getDeadLetterQueue(): Promise<QueueJob[]>;
}

export class InMemoryQueue implements QueueProvider {
  name = "in-memory";
  private queue: QueueJob[] = [];
  private dlq: QueueJob[] = [];
  private idCounter = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async enqueue<T>(type: string, data: T, priority = 0): Promise<string> {
    const id = `job_${++this.idCounter}_${Date.now()}`;
    const job: QueueJob<T> = {
      id,
      type,
      data,
      priority,
      createdAt: new Date(),
      attempts: 0,
      maxRetries: 3,
      status: "pending",
    };
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority);
    return id;
  }

  async dequeue(): Promise<QueueJob | null> {
    const job = this.queue.find((j) => j.status === "pending");
    if (job) {
      job.status = "processing";
      job.attempts++;
    }
    return job || null;
  }

  async complete(jobId: string): Promise<void> {
    this.queue = this.queue.filter((j) => j.id !== jobId);
  }

  async fail(jobId: string, error: string): Promise<void> {
    const job = this.queue.find((j) => j.id === jobId);
    if (job) {
      if (job.attempts >= job.maxRetries) {
        job.status = "dlq";
        this.dlq.push(job);
        this.queue = this.queue.filter((j) => j.id !== jobId);
      } else {
        job.status = "pending";
      }
    }
  }

  async getQueueLength(): Promise<number> {
    return this.queue.filter((j) => j.status === "pending").length;
  }

  async getDeadLetterQueue(): Promise<QueueJob[]> {
    return [...this.dlq];
  }

  clear(): void {
    this.queue = [];
    this.dlq = [];
  }
}

export class ResilientQueueManager extends EventEmitter {
  private primaryQueue: QueueProvider;
  private fallbackQueue: InMemoryQueue;
  private usingFallback = false;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(primaryQueue: QueueProvider) {
    super();
    this.primaryQueue = primaryQueue;
    this.fallbackQueue = new InMemoryQueue();
  }

  get isUsingFallback(): boolean {
    return this.usingFallback;
  }

  private async getActiveQueue(): Promise<QueueProvider> {
    try {
      const available = await this.primaryQueue.isAvailable();
      if (available) {
        if (this.usingFallback) {
          this.usingFallback = false;
          this.emit("primaryRestored");
          await this.syncFallbackToPrimary();
        }
        return this.primaryQueue;
      }
    } catch (error) {
      console.error("[QueueManager] Primary queue check failed:", error);
    }

    if (!this.usingFallback) {
      this.usingFallback = true;
      this.emit("fallbackActivated");
      console.warn("[QueueManager] Switching to fallback in-memory queue");
    }

    return this.fallbackQueue;
  }

  async enqueue<T>(type: string, data: T, priority = 0): Promise<string> {
    const queue = await this.getActiveQueue();
    const jobId = await queue.enqueue(type, data, priority);
    
    this.emit("enqueued", { jobId, type, usingFallback: this.usingFallback });
    
    return jobId;
  }

  async dequeue(): Promise<QueueJob | null> {
    const queue = await this.getActiveQueue();
    return queue.dequeue();
  }

  async complete(jobId: string): Promise<void> {
    const queue = await this.getActiveQueue();
    await queue.complete(jobId);
    this.emit("completed", { jobId });
  }

  async fail(jobId: string, error: string): Promise<void> {
    const queue = await this.getActiveQueue();
    await queue.fail(jobId, error);
    this.emit("failed", { jobId, error });
  }

  async getQueueLength(): Promise<number> {
    const queue = await this.getActiveQueue();
    return queue.getQueueLength();
  }

  async getDeadLetterQueue(): Promise<QueueJob[]> {
    const queue = await this.getActiveQueue();
    return queue.getDeadLetterQueue();
  }

  private async syncFallbackToPrimary(): Promise<void> {
    console.log("[QueueManager] Syncing fallback jobs to primary queue");
    const fallbackLength = await this.fallbackQueue.getQueueLength();
    
    let synced = 0;
    let job: QueueJob | null;
    while ((job = await this.fallbackQueue.dequeue()) !== null) {
      try {
        await this.primaryQueue.enqueue(job.type, job.data, job.priority);
        await this.fallbackQueue.complete(job.id);
        synced++;
      } catch (error) {
        console.error("[QueueManager] Failed to sync job:", error);
        break;
      }
    }

    console.log(`[QueueManager] Synced ${synced}/${fallbackLength} jobs to primary`);
    this.emit("syncComplete", { synced, total: fallbackLength });
  }

  getStatus(): {
    usingFallback: boolean;
    primaryQueue: string;
  } {
    return {
      usingFallback: this.usingFallback,
      primaryQueue: this.primaryQueue.name,
    };
  }
}

export const inMemoryQueue = new InMemoryQueue();
export let queueManager: ResilientQueueManager | null = null;

export function initializeQueueManager(primaryQueue?: QueueProvider): ResilientQueueManager {
  queueManager = new ResilientQueueManager(primaryQueue || inMemoryQueue);
  return queueManager;
}

export function getQueueManager(): ResilientQueueManager {
  if (!queueManager) {
    queueManager = initializeQueueManager();
  }
  return queueManager;
}
