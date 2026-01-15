import { EventEmitter } from "events";

export type ServiceName = "database" | "redis" | "ai" | "email" | "queue";
export type ServiceStatus = "healthy" | "degraded" | "down";

export interface ServiceHealth {
  name: ServiceName;
  status: ServiceStatus;
  lastCheck: Date;
  lastHealthy: Date | null;
  consecutiveFailures: number;
  errorMessage?: string;
}

export interface FailureDetectorOptions {
  checkIntervalMs: number;
  degradedThreshold: number;
  downThreshold: number;
}

const DEFAULT_OPTIONS: FailureDetectorOptions = {
  checkIntervalMs: 5000,
  degradedThreshold: 2,
  downThreshold: 5,
};

class FailureDetector extends EventEmitter {
  private services = new Map<ServiceName, ServiceHealth>();
  private healthChecks = new Map<ServiceName, () => Promise<boolean>>();
  private checkInterval: NodeJS.Timeout | null = null;
  private options: FailureDetectorOptions;

  constructor(options: Partial<FailureDetectorOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  registerService(name: ServiceName, healthCheck: () => Promise<boolean>): void {
    this.services.set(name, {
      name,
      status: "healthy",
      lastCheck: new Date(),
      lastHealthy: new Date(),
      consecutiveFailures: 0,
    });
    this.healthChecks.set(name, healthCheck);
  }

  getServiceHealth(name: ServiceName): ServiceHealth | undefined {
    return this.services.get(name);
  }

  getAllServicesHealth(): ServiceHealth[] {
    return Array.from(this.services.values());
  }

  isServiceHealthy(name: ServiceName): boolean {
    const health = this.services.get(name);
    return health?.status === "healthy";
  }

  isServiceAvailable(name: ServiceName): boolean {
    const health = this.services.get(name);
    return health?.status !== "down";
  }

  async checkService(name: ServiceName): Promise<ServiceHealth> {
    const healthCheck = this.healthChecks.get(name);
    const currentHealth = this.services.get(name);

    if (!healthCheck || !currentHealth) {
      throw new Error(`Service ${name} not registered`);
    }

    try {
      const isHealthy = await healthCheck();
      
      if (isHealthy) {
        currentHealth.status = "healthy";
        currentHealth.consecutiveFailures = 0;
        currentHealth.lastHealthy = new Date();
        currentHealth.errorMessage = undefined;
      } else {
        this.handleFailure(currentHealth, "Health check returned false");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.handleFailure(currentHealth, errorMsg);
    }

    currentHealth.lastCheck = new Date();
    this.services.set(name, currentHealth);
    
    return currentHealth;
  }

  private handleFailure(health: ServiceHealth, errorMessage: string): void {
    health.consecutiveFailures++;
    health.errorMessage = errorMessage;

    const previousStatus = health.status;

    if (health.consecutiveFailures >= this.options.downThreshold) {
      health.status = "down";
    } else if (health.consecutiveFailures >= this.options.degradedThreshold) {
      health.status = "degraded";
    }

    if (previousStatus !== health.status) {
      this.emit("statusChange", {
        service: health.name,
        previousStatus,
        newStatus: health.status,
        errorMessage,
      });

      if (health.status === "down") {
        this.emit("serviceDown", { service: health.name, errorMessage });
      }
    }
  }

  reportSuccess(name: ServiceName): void {
    const health = this.services.get(name);
    if (health) {
      health.consecutiveFailures = 0;
      health.status = "healthy";
      health.lastHealthy = new Date();
      health.errorMessage = undefined;
    }
  }

  reportFailure(name: ServiceName, errorMessage: string): void {
    const health = this.services.get(name);
    if (health) {
      this.handleFailure(health, errorMessage);
      health.lastCheck = new Date();
    }
  }

  startMonitoring(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(async () => {
      const serviceNames = Array.from(this.services.keys());
      for (const name of serviceNames) {
        try {
          await this.checkService(name);
        } catch (error) {
          console.error(`[FailureDetector] Error checking ${name}:`, error);
        }
      }
    }, this.options.checkIntervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getSystemStatus(): { overall: ServiceStatus; services: ServiceHealth[] } {
    const services = this.getAllServicesHealth();
    
    if (services.some((s) => s.status === "down")) {
      return { overall: "down", services };
    }
    if (services.some((s) => s.status === "degraded")) {
      return { overall: "degraded", services };
    }
    return { overall: "healthy", services };
  }
}

export const failureDetector = new FailureDetector();

export function initializeFailureDetector(): void {
  failureDetector.registerService("database", async () => {
    return true;
  });

  failureDetector.registerService("redis", async () => {
    return true;
  });

  failureDetector.registerService("ai", async () => {
    return true;
  });

  failureDetector.registerService("email", async () => {
    return true;
  });

  failureDetector.registerService("queue", async () => {
    return true;
  });
}
