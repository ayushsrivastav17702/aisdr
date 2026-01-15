import { EventEmitter } from "events";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(private options: CircuitBreakerOptions) {
    super();
  }

  get name(): string {
    return this.options.name;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === "open") {
      console.log(`[CircuitBreaker:${this.options.name}] Circuit OPEN - using fallback`);
      if (fallback) {
        return await fallback();
      }
      throw new Error(`Circuit breaker ${this.options.name} is OPEN`);
    }

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
    });

    try {
      const result = await Promise.race([operation(), timeout]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      
      if (fallback) {
        console.log(`[CircuitBreaker:${this.options.name}] Using fallback after failure`);
        return await fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.lastSuccess = new Date();
    this.failures = 0;

    if (this.state === "half-open") {
      if (this.successes >= this.options.successThreshold) {
        this.close();
      }
    }

    this.emit("success", { name: this.options.name, metrics: this.getMetrics() });
  }

  private onFailure(error: unknown): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = new Date();
    this.successes = 0;

    if (this.failures >= this.options.failureThreshold) {
      this.open();
    }

    this.emit("failure", { name: this.options.name, error, metrics: this.getMetrics() });
  }

  private open(): void {
    if (this.state !== "open") {
      this.state = "open";
      console.log(`[CircuitBreaker:${this.options.name}] Circuit OPENED`);
      this.emit("open", { name: this.options.name, metrics: this.getMetrics() });

      this.resetTimer = setTimeout(() => {
        this.halfOpen();
      }, this.options.resetTimeout);
    }
  }

  private halfOpen(): void {
    this.state = "half-open";
    this.failures = 0;
    this.successes = 0;
    console.log(`[CircuitBreaker:${this.options.name}] Circuit HALF-OPEN`);
    this.emit("half-open", { name: this.options.name, metrics: this.getMetrics() });
  }

  private close(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    console.log(`[CircuitBreaker:${this.options.name}] Circuit CLOSED`);
    this.emit("close", { name: this.options.name, metrics: this.getMetrics() });
  }

  forceOpen(): void {
    this.open();
  }

  forceClose(): void {
    this.close();
  }

  reset(): void {
    this.close();
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({
      name,
      failureThreshold: options?.failureThreshold ?? 5,
      successThreshold: options?.successThreshold ?? 2,
      timeout: options?.timeout ?? 12000,
      resetTimeout: options?.resetTimeout ?? 30000,
      ...options,
    }));
  }
  return circuitBreakers.get(name)!;
}

export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return circuitBreakers;
}

export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach(cb => cb.reset());
}
