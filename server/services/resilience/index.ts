export * from "./circuit-breaker";
export * from "./retry-handler";
export * from "./failure-detector";
export * from "./write-ahead-log";
export * from "./queue-provider";
export * from "./error-contract";
export * from "./global-failure-controller";

import { initializeFailureDetector, failureDetector } from "./failure-detector";
import { initializeQueueManager, getQueueManager } from "./queue-provider";
import { globalFailureController } from "./global-failure-controller";
import { writeAheadLog } from "./write-ahead-log";

export function initializeResilienceInfrastructure(): void {
  console.log("[Resilience] Initializing resilience infrastructure...");
  
  initializeFailureDetector();
  initializeQueueManager();
  
  console.log("[Resilience] Infrastructure initialized");
}

export function getResilienceStatus(): {
  failureDetector: ReturnType<typeof failureDetector.getSystemStatus>;
  queueManager: ReturnType<ReturnType<typeof getQueueManager>["getStatus"]>;
  healthReport: ReturnType<typeof globalFailureController.getHealthReport>;
} {
  return {
    failureDetector: failureDetector.getSystemStatus(),
    queueManager: getQueueManager().getStatus(),
    healthReport: globalFailureController.getHealthReport(),
  };
}
