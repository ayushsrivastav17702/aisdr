import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { 
  CircuitBreaker, 
  getCircuitBreaker, 
  resetAllCircuitBreakers 
} from "../../server/services/resilience/circuit-breaker";

import { 
  withRetry, 
  RetryQueue 
} from "../../server/services/resilience/retry-handler";

import { 
  writeAheadLog, 
  withWriteAheadLog 
} from "../../server/services/resilience/write-ahead-log";

import { 
  InMemoryQueue, 
  ResilientQueueManager 
} from "../../server/services/resilience/queue-provider";

import { 
  AppError, 
  ErrorCodes, 
  createApiError, 
  createValidationError, 
  toApiErrorResponse 
} from "../../server/services/resilience/error-contract";

import {
  globalFailureController
} from "../../server/services/resilience/global-failure-controller";

describe("RESILIENCE INFRASTRUCTURE TESTS", () => {
  
  describe("Circuit Breaker", () => {
    let circuitBreaker: CircuitBreaker;
    
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        name: "test-circuit",
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,
        resetTimeout: 1000,
      });
    });
    
    afterEach(() => {
      resetAllCircuitBreakers();
    });
    
    it("should start in closed state", () => {
      expect(circuitBreaker.currentState).toBe("closed");
    });
    
    it("should execute successful operations", async () => {
      const result = await circuitBreaker.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
      expect(circuitBreaker.currentState).toBe("closed");
    });
    
    it("should open after threshold failures", async () => {
      const failingOperation = () => Promise.reject(new Error("failure"));
      const fallback = () => "fallback";
      
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(failingOperation, fallback);
      }
      
      expect(circuitBreaker.currentState).toBe("open");
    });
    
    it("should use fallback when circuit is open", async () => {
      const failingOperation = () => Promise.reject(new Error("failure"));
      const fallback = () => "fallback-used";
      
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(failingOperation, fallback);
      }
      
      expect(circuitBreaker.currentState).toBe("open");
      
      const result = await circuitBreaker.execute(
        () => Promise.resolve("success"),
        fallback
      );
      
      expect(result).toBe("fallback-used");
    });
    
    it("should throw when circuit is open and no fallback", async () => {
      const failingOperation = () => Promise.reject(new Error("failure"));
      
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (e) {}
      }
      
      expect(circuitBreaker.currentState).toBe("open");
      
      await expect(
        circuitBreaker.execute(() => Promise.resolve("success"))
      ).rejects.toThrow("Circuit breaker");
    });
    
    it("should track metrics correctly", async () => {
      await circuitBreaker.execute(() => Promise.resolve("success"));
      await circuitBreaker.execute(() => Promise.resolve("success"));
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.state).toBe("closed");
    });
    
    it("should timeout long-running operations", async () => {
      const slowCircuit = new CircuitBreaker({
        name: "slow-test",
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        resetTimeout: 1000,
      });
      
      const fallback = () => "timeout-fallback";
      
      const result = await slowCircuit.execute(
        () => new Promise(resolve => setTimeout(() => resolve("slow"), 500)),
        fallback
      );
      
      expect(result).toBe("timeout-fallback");
    });
  });
  
  describe("Retry Handler", () => {
    it("should succeed on first attempt if operation succeeds", async () => {
      const result = await withRetry(() => Promise.resolve("success"));
      
      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.attempts).toBe(1);
    });
    
    it("should retry on failure and eventually succeed", async () => {
      let attempts = 0;
      
      const result = await withRetry(
        () => {
          attempts++;
          if (attempts < 3) {
            return Promise.reject(new Error("temporary failure"));
          }
          return Promise.resolve("success");
        },
        { maxRetries: 3, initialDelayMs: 10 }
      );
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
    
    it("should fail after max retries", async () => {
      const result = await withRetry(
        () => Promise.reject(new Error("permanent failure")),
        { maxRetries: 2, initialDelayMs: 10 }
      );
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error?.message).toBe("permanent failure");
    });
    
    it("should track total delay correctly", async () => {
      let attempts = 0;
      
      const result = await withRetry(
        () => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error("fail"));
          }
          return Promise.resolve("success");
        },
        { maxRetries: 2, initialDelayMs: 50, backoffMultiplier: 1 }
      );
      
      expect(result.success).toBe(true);
      expect(result.totalDelayMs).toBeGreaterThanOrEqual(50);
    });
  });
  
  describe("Write-Ahead Log", () => {
    beforeEach(() => {
      writeAheadLog.clear();
    });
    
    it("should log operations with pending status", async () => {
      await writeAheadLog.logOperation("test-1", "insert", "users", { name: "John" });
      
      const pending = writeAheadLog.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe("test-1");
      expect(pending[0].status).toBe("pending");
    });
    
    it("should mark operations as committed", async () => {
      await writeAheadLog.logOperation("test-2", "insert", "users", { name: "Jane" });
      writeAheadLog.markCommitted("test-2");
      
      const pending = writeAheadLog.getPendingOperations();
      expect(pending.length).toBe(0);
    });
    
    it("should track failed operations with retry count", async () => {
      await writeAheadLog.logOperation("test-3", "insert", "users", { name: "Bob" });
      writeAheadLog.markFailed("test-3", "DB connection failed");
      
      const entry = writeAheadLog.getEntry("test-3");
      expect(entry?.status).toBe("retrying");
      expect(entry?.attempts).toBe(1);
      expect(entry?.errorMessage).toBe("DB connection failed");
    });
    
    it("should move to failed after max retries", async () => {
      await writeAheadLog.logOperation("test-4", "insert", "users", { name: "Alice" });
      
      for (let i = 0; i < 5; i++) {
        writeAheadLog.markFailed("test-4", "DB error");
      }
      
      const entry = writeAheadLog.getEntry("test-4");
      expect(entry?.status).toBe("failed");
    });
    
    it("should work with withWriteAheadLog wrapper", async () => {
      const result = await withWriteAheadLog(
        "test-5",
        "insert",
        "users",
        { name: "Test" },
        () => Promise.resolve({ id: 1, name: "Test" })
      );
      
      expect(result).toEqual({ id: 1, name: "Test" });
      expect(writeAheadLog.getPendingOperations().length).toBe(0);
    });
    
    it("should track failed operations from wrapper", async () => {
      try {
        await withWriteAheadLog(
          "test-6",
          "insert",
          "users",
          { name: "Fail" },
          () => Promise.reject(new Error("DB error"))
        );
      } catch (e) {}
      
      const entry = writeAheadLog.getEntry("test-6");
      expect(entry?.status).toBe("retrying");
    });
  });
  
  describe("Queue Provider with Fallback", () => {
    let primaryQueue: InMemoryQueue;
    let queueManager: ResilientQueueManager;
    
    beforeEach(() => {
      primaryQueue = new InMemoryQueue();
      queueManager = new ResilientQueueManager(primaryQueue);
    });
    
    it("should enqueue jobs successfully", async () => {
      const jobId = await queueManager.enqueue("email", { to: "test@example.com" });
      
      expect(jobId).toBeDefined();
      expect(await queueManager.getQueueLength()).toBe(1);
    });
    
    it("should dequeue and process jobs", async () => {
      await queueManager.enqueue("email", { to: "test@example.com" });
      
      const job = await queueManager.dequeue();
      expect(job).toBeDefined();
      expect(job?.type).toBe("email");
      expect(job?.data).toEqual({ to: "test@example.com" });
    });
    
    it("should complete jobs and remove from queue", async () => {
      const jobId = await queueManager.enqueue("email", { to: "test@example.com" });
      await queueManager.dequeue();
      await queueManager.complete(jobId);
      
      expect(await queueManager.getQueueLength()).toBe(0);
    });
    
    it("should move failed jobs to DLQ after max retries", async () => {
      const jobId = await queueManager.enqueue("email", { to: "test@example.com" });
      
      for (let i = 0; i < 4; i++) {
        await queueManager.dequeue();
        await queueManager.fail(jobId, "Send failed");
      }
      
      const dlq = await queueManager.getDeadLetterQueue();
      expect(dlq.length).toBe(1);
    });
    
    it("should track fallback status", () => {
      const status = queueManager.getStatus();
      expect(status.usingFallback).toBe(false);
    });
  });
  
  describe("Error Contract", () => {
    it("should create API errors with correct structure", () => {
      const error = createApiError(ErrorCodes.DATABASE_UNAVAILABLE);
      
      expect(error.code).toBe("DATABASE_UNAVAILABLE");
      expect(error.message).toBeDefined();
      expect(error.action).toBeDefined();
      expect(error.statusCode).toBe(503);
    });
    
    it("should allow overriding error properties", () => {
      const error = createApiError(ErrorCodes.INTERNAL_ERROR, {
        message: "Custom message",
        action: "Custom action",
      });
      
      expect(error.message).toBe("Custom message");
      expect(error.action).toBe("Custom action");
    });
    
    it("should create validation errors with field details", () => {
      const error = createValidationError({
        email: "Invalid email format",
        name: "Name is required",
      });
      
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.details?.fieldErrors).toEqual({
        email: "Invalid email format",
        name: "Name is required",
      });
    });
    
    it("should create AppError instances", () => {
      const error = new AppError(ErrorCodes.AI_SERVICE_UNAVAILABLE);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.apiError.code).toBe("AI_SERVICE_UNAVAILABLE");
      expect(error.apiError.statusCode).toBe(503);
    });
    
    it("should convert unknown errors to API format", () => {
      const apiError = toApiErrorResponse(new Error("Unknown error"));
      
      expect(apiError.code).toBe("INTERNAL_ERROR");
      expect(apiError.message).toBe("Unknown error");
    });
    
    it("should preserve AppError in conversion", () => {
      const appError = new AppError(ErrorCodes.EMAIL_SERVICE_UNAVAILABLE);
      const apiError = toApiErrorResponse(appError);
      
      expect(apiError.code).toBe("EMAIL_SERVICE_UNAVAILABLE");
    });
  });
  
  describe("Global Failure Controller", () => {
    it("should provide system state", () => {
      const state = globalFailureController.getSystemState();
      
      expect(state).toHaveProperty("canGenerateAI");
      expect(state).toHaveProperty("canSendEmails");
      expect(state).toHaveProperty("canWriteToDatabase");
      expect(state).toHaveProperty("canQueueJobs");
      expect(state).toHaveProperty("isFullyOperational");
    });
    
    it("should guard AI generation", () => {
      const guard = globalFailureController.guardAIGeneration();
      
      expect(guard).toHaveProperty("allowed");
      expect(guard).toHaveProperty("fallbackAvailable");
    });
    
    it("should guard email sending", () => {
      const guard = globalFailureController.guardEmailSend();
      
      expect(guard).toHaveProperty("allowed");
      expect(guard).toHaveProperty("fallbackAvailable");
    });
    
    it("should guard database writes", () => {
      const guard = globalFailureController.guardDatabaseWrite();
      
      expect(guard).toHaveProperty("allowed");
      expect(guard).toHaveProperty("fallbackAvailable");
    });
    
    it("should execute with resilience using circuit breaker", async () => {
      const result = await globalFailureController.executeWithResilience(
        "ai",
        () => Promise.resolve("generated-content"),
        () => "fallback-content"
      );
      
      expect(result).toBe("generated-content");
    });
    
    it("should use fallback on failure", async () => {
      const cb = globalFailureController.getCircuitBreaker("ai");
      cb?.forceOpen();
      
      const result = await globalFailureController.executeWithResilience(
        "ai",
        () => Promise.resolve("generated-content"),
        () => "fallback-content"
      );
      
      expect(result).toBe("fallback-content");
      
      cb?.forceClose();
    });
    
    it("should provide health report", () => {
      const report = globalFailureController.getHealthReport();
      
      expect(report).toHaveProperty("systemState");
      expect(report).toHaveProperty("circuitBreakers");
      expect(report).toHaveProperty("walStats");
      expect(report).toHaveProperty("queueStatus");
    });
  });
});
