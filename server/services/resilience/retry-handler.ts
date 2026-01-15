export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempts = 0;
  let totalDelayMs = 0;
  let lastError: Error | undefined;

  while (attempts <= opts.maxRetries) {
    try {
      const result = await operation();
      return {
        success: true,
        result,
        attempts: attempts + 1,
        totalDelayMs,
      };
    } catch (error) {
      attempts++;
      lastError = error instanceof Error ? error : new Error(String(error));

      if (opts.retryableErrors && opts.retryableErrors.length > 0) {
        const isRetryable = opts.retryableErrors.some(
          (msg) => lastError!.message.includes(msg)
        );
        if (!isRetryable) {
          break;
        }
      }

      if (attempts <= opts.maxRetries) {
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempts - 1),
          opts.maxDelayMs
        );
        totalDelayMs += delay;
        console.log(
          `[Retry] Attempt ${attempts}/${opts.maxRetries + 1} failed, retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
    totalDelayMs,
  };
}

export async function withIdempotentRetry<T>(
  idempotencyKey: string,
  operation: () => Promise<T>,
  checkExisting: (key: string) => Promise<T | null>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const existing = await checkExisting(idempotencyKey);
  if (existing !== null) {
    return {
      success: true,
      result: existing,
      attempts: 0,
      totalDelayMs: 0,
    };
  }

  return withRetry(operation, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryQueue<T> {
  private queue: Array<{
    id: string;
    operation: () => Promise<T>;
    attempts: number;
    nextRetryAt: Date;
    maxRetries: number;
  }> = [];
  private processing = false;

  constructor(private options: Partial<RetryOptions> = {}) {}

  enqueue(id: string, operation: () => Promise<T>, maxRetries?: number): void {
    this.queue.push({
      id,
      operation,
      attempts: 0,
      nextRetryAt: new Date(),
      maxRetries: maxRetries ?? this.options.maxRetries ?? 3,
    });
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = new Date();
      const ready = this.queue.filter((item) => item.nextRetryAt <= now);

      for (const item of ready) {
        try {
          await item.operation();
          this.queue = this.queue.filter((q) => q.id !== item.id);
        } catch (error) {
          item.attempts++;
          if (item.attempts >= item.maxRetries) {
            console.error(`[RetryQueue] ${item.id} exceeded max retries, moving to DLQ`);
            this.queue = this.queue.filter((q) => q.id !== item.id);
          } else {
            const delay =
              (this.options.initialDelayMs ?? 1000) *
              Math.pow(this.options.backoffMultiplier ?? 2, item.attempts);
            item.nextRetryAt = new Date(Date.now() + delay);
          }
        }
      }

      await sleep(100);
    }

    this.processing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
