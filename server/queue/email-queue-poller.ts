import { EventEmitter } from 'events';

const INITIAL_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 5 * 60 * 1000;
const BACKOFF_MULTIPLIER = 2;

class EmailQueuePoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private currentIntervalMs = INITIAL_INTERVAL_MS;
  private consecutiveEmpty = 0;
  private isRunning = false;
  private processFn: (() => Promise<number>) | null = null;

  start(processFn: () => Promise<number>): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processFn = processFn;
    console.log(`📨 Email queue adaptive poller started (initial interval: ${INITIAL_INTERVAL_MS / 1000}s, max: ${MAX_INTERVAL_MS / 1000}s)`);
    this.schedule(processFn);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  resetBackoff(): void {
    if (!this.isRunning || !this.processFn) return;
    if (this.currentIntervalMs === INITIAL_INTERVAL_MS && this.timer) return;
    console.log(`⚡ Email poller: new job detected — resetting interval to ${INITIAL_INTERVAL_MS / 1000}s`);
    this.currentIntervalMs = INITIAL_INTERVAL_MS;
    this.consecutiveEmpty = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // BUG FIX: clearing the timer previously left the poller permanently
    // stalled — nothing ever called schedule() again, so the next run
    // never happened (queue would show "DELAYED" forever). Reschedule
    // immediately with the reset (short) interval.
    this.schedule(this.processFn);
  }

  getStatus(): { intervalMs: number; consecutiveEmpty: number } {
    return { intervalMs: this.currentIntervalMs, consecutiveEmpty: this.consecutiveEmpty };
  }

  private schedule(processFn: () => Promise<number>): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      let found = 0;
      try {
        found = await processFn();

        if (found === 0) {
          this.consecutiveEmpty++;
          if (this.currentIntervalMs < MAX_INTERVAL_MS) {
            const next = Math.min(this.currentIntervalMs * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
            if (next !== this.currentIntervalMs) {
              console.log(`📨 Email poller: queue empty (${this.consecutiveEmpty}× consecutive) — backing off to ${next / 1000}s`);
              this.currentIntervalMs = next;
            }
          }
        } else {
          this.consecutiveEmpty = 0;
          this.currentIntervalMs = INITIAL_INTERVAL_MS;
        }
      } catch (err: any) {
        console.error('[EmailPoller] Error:', err?.message || err);
      } finally {
        // Always reschedule, even if processFn or the backoff bookkeeping
        // above threw unexpectedly — otherwise the poller silently dies
        // and the queue shows DELAYED forever.
        this.schedule(processFn);
      }
    }, this.currentIntervalMs);
  }
}

export const emailQueuePoller = new EmailQueuePoller();
