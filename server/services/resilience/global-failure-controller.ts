import { EventEmitter } from "events";
import { failureDetector, ServiceName, ServiceStatus } from "./failure-detector";
import { getCircuitBreaker, CircuitBreaker } from "./circuit-breaker";
import { writeAheadLog } from "./write-ahead-log";
import { getQueueManager } from "./queue-provider";
import { AppError, ErrorCodes } from "./error-contract";

export interface SystemState {
  canGenerateAI: boolean;
  canSendEmails: boolean;
  canWriteToDatabase: boolean;
  canQueueJobs: boolean;
  isFullyOperational: boolean;
  degradedServices: ServiceName[];
  downServices: ServiceName[];
}

export interface OperationGuard {
  allowed: boolean;
  reason?: string;
  fallbackAvailable: boolean;
}

class GlobalFailureController extends EventEmitter {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    super();
    this.initializeCircuitBreakers();
    this.setupEventListeners();
  }

  private initializeCircuitBreakers(): void {
    this.circuitBreakers.set("ai", getCircuitBreaker("ai", {
      failureThreshold: 3,
      timeout: 12000,
      resetTimeout: 30000,
    }));

    this.circuitBreakers.set("email", getCircuitBreaker("email", {
      failureThreshold: 5,
      timeout: 15000,
      resetTimeout: 60000,
    }));

    this.circuitBreakers.set("database", getCircuitBreaker("database", {
      failureThreshold: 3,
      timeout: 10000,
      resetTimeout: 20000,
    }));

    this.circuitBreakers.set("queue", getCircuitBreaker("queue", {
      failureThreshold: 5,
      timeout: 5000,
      resetTimeout: 30000,
    }));
  }

  private setupEventListeners(): void {
    failureDetector.on("serviceDown", ({ service }) => {
      console.error(`[GlobalFailureController] Service DOWN: ${service}`);
      this.emit("serviceDown", service);
    });

    failureDetector.on("statusChange", ({ service, previousStatus, newStatus }) => {
      console.log(`[GlobalFailureController] Service ${service}: ${previousStatus} -> ${newStatus}`);
      this.emit("statusChange", { service, previousStatus, newStatus });
    });
  }

  getSystemState(): SystemState {
    const dbHealth = failureDetector.getServiceHealth("database");
    const aiHealth = failureDetector.getServiceHealth("ai");
    const emailHealth = failureDetector.getServiceHealth("email");
    const queueHealth = failureDetector.getServiceHealth("queue");

    const dbCircuit = this.circuitBreakers.get("database");
    const aiCircuit = this.circuitBreakers.get("ai");
    const emailCircuit = this.circuitBreakers.get("email");
    const queueCircuit = this.circuitBreakers.get("queue");

    const canWriteToDatabase =
      (dbHealth?.status !== "down") &&
      (dbCircuit?.currentState !== "open");

    const canGenerateAI =
      (aiHealth?.status !== "down") &&
      (aiCircuit?.currentState !== "open");

    const canSendEmails =
      (emailHealth?.status !== "down") &&
      (emailCircuit?.currentState !== "open");

    const canQueueJobs =
      (queueHealth?.status !== "down") &&
      (queueCircuit?.currentState !== "open");

    const allServices: ServiceName[] = ["database", "ai", "email", "queue"];
    const degradedServices = allServices.filter((s) => {
      const health = failureDetector.getServiceHealth(s);
      return health?.status === "degraded";
    });

    const downServices = allServices.filter((s) => {
      const health = failureDetector.getServiceHealth(s);
      return health?.status === "down";
    });

    return {
      canGenerateAI,
      canSendEmails,
      canWriteToDatabase,
      canQueueJobs,
      isFullyOperational: downServices.length === 0 && degradedServices.length === 0,
      degradedServices,
      downServices,
    };
  }

  guardAIGeneration(): OperationGuard {
    const state = this.getSystemState();

    if (!state.canWriteToDatabase) {
      return {
        allowed: false,
        reason: "Database unavailable - cannot persist AI results",
        fallbackAvailable: true,
      };
    }

    if (!state.canGenerateAI) {
      return {
        allowed: false,
        reason: "AI service unavailable",
        fallbackAvailable: true,
      };
    }

    return { allowed: true, fallbackAvailable: true };
  }

  guardEmailSend(): OperationGuard {
    const state = this.getSystemState();

    if (!state.canWriteToDatabase) {
      return {
        allowed: false,
        reason: "Database unavailable - cannot track email status",
        fallbackAvailable: true,
      };
    }

    if (!state.canQueueJobs) {
      return {
        allowed: false,
        reason: "Queue unavailable - using in-memory fallback",
        fallbackAvailable: true,
      };
    }

    if (!state.canSendEmails) {
      return {
        allowed: false,
        reason: "Email service unavailable",
        fallbackAvailable: true,
      };
    }

    return { allowed: true, fallbackAvailable: true };
  }

  guardDatabaseWrite(): OperationGuard {
    const state = this.getSystemState();

    if (!state.canWriteToDatabase) {
      return {
        allowed: false,
        reason: "Database unavailable",
        fallbackAvailable: true,
      };
    }

    return { allowed: true, fallbackAvailable: true };
  }

  guardQueueOperation(): OperationGuard {
    const state = this.getSystemState();

    if (!state.canQueueJobs) {
      return {
        allowed: false,
        reason: "Queue unavailable - using in-memory fallback",
        fallbackAvailable: true,
      };
    }

    return { allowed: true, fallbackAvailable: true };
  }

  assertCanGenerateAI(): void {
    const guard = this.guardAIGeneration();
    if (!guard.allowed && !guard.fallbackAvailable) {
      throw new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE, {
        message: guard.reason,
      });
    }
  }

  assertCanSendEmail(): void {
    const guard = this.guardEmailSend();
    if (!guard.allowed && !guard.fallbackAvailable) {
      throw new AppError(ErrorCodes.EMAIL_SERVICE_UNAVAILABLE, {
        message: guard.reason,
      });
    }
  }

  assertCanWriteToDatabase(): void {
    const guard = this.guardDatabaseWrite();
    if (!guard.allowed && !guard.fallbackAvailable) {
      throw new AppError(ErrorCodes.DATABASE_UNAVAILABLE, {
        message: guard.reason,
      });
    }
  }

  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  async executeWithResilience<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(serviceName);

    if (circuitBreaker) {
      return circuitBreaker.execute(operation, fallback);
    }

    try {
      return await operation();
    } catch (error) {
      if (fallback) {
        return await fallback();
      }
      throw error;
    }
  }

  getHealthReport(): {
    systemState: SystemState;
    circuitBreakers: Record<string, { state: string; failures: number }>;
    walStats: { pending: number; retrying: number; failed: number };
    queueStatus: { usingFallback: boolean };
  } {
    const circuitBreakerStatus: Record<string, { state: string; failures: number }> = {};

    this.circuitBreakers.forEach((cb, name) => {
      const metrics = cb.getMetrics();
      circuitBreakerStatus[name] = {
        state: metrics.state,
        failures: metrics.failures,
      };
    });

    const queueManager = getQueueManager();

    return {
      systemState: this.getSystemState(),
      circuitBreakers: circuitBreakerStatus,
      walStats: writeAheadLog.getStats(),
      queueStatus: {
        usingFallback: queueManager.isUsingFallback,
      },
    };
  }

  reportServiceSuccess(serviceName: ServiceName): void {
    failureDetector.reportSuccess(serviceName);
  }

  reportServiceFailure(serviceName: ServiceName, error: string): void {
    failureDetector.reportFailure(serviceName, error);
  }
}

export const globalFailureController = new GlobalFailureController();
