import { vi } from "vitest";

export interface MockConfig {
  shouldFail?: boolean;
  delay?: number;
  errorType?: "timeout" | "500" | "429" | "network";
  failureRate?: number;
}

export class MockAIService {
  private config: MockConfig = {};
  
  configure(config: MockConfig) {
    this.config = config;
  }
  
  reset() {
    this.config = {};
  }
  
  async generateText(prompt: string): Promise<string> {
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }
    
    if (this.config.shouldFail) {
      if (this.config.errorType === "timeout") {
        throw new Error("AI_TIMEOUT: Request timed out after 30000ms");
      }
      if (this.config.errorType === "429") {
        throw new Error("AI_RATE_LIMIT: Too many requests");
      }
      throw new Error("AI_ERROR: Service unavailable");
    }
    
    if (this.config.failureRate && Math.random() < this.config.failureRate) {
      throw new Error("AI_RANDOM_FAILURE: Simulated failure");
    }
    
    return `Generated response for: ${prompt.substring(0, 50)}...`;
  }
}

export class MockEmailService {
  private config: MockConfig = {};
  private sentEmails: Array<{ to: string; subject: string; body: string }> = [];
  private failedEmails: Array<{ to: string; error: string }> = [];
  
  configure(config: MockConfig) {
    this.config = config;
  }
  
  reset() {
    this.config = {};
    this.sentEmails = [];
    this.failedEmails = [];
  }
  
  async sendEmail(params: { to: string; subject: string; body: string }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }
    
    if (this.config.shouldFail) {
      this.failedEmails.push({ to: params.to, error: this.config.errorType || "SEND_FAILED" });
      return { success: false, error: this.config.errorType || "SEND_FAILED" };
    }
    
    if (this.config.failureRate && Math.random() < this.config.failureRate) {
      this.failedEmails.push({ to: params.to, error: "RANDOM_FAILURE" });
      return { success: false, error: "RANDOM_FAILURE" };
    }
    
    this.sentEmails.push(params);
    return { success: true, messageId: `msg-${Date.now()}` };
  }
  
  getSentEmails() {
    return this.sentEmails;
  }
  
  getFailedEmails() {
    return this.failedEmails;
  }
  
  getStats() {
    return {
      sent: this.sentEmails.length,
      failed: this.failedEmails.length,
      total: this.sentEmails.length + this.failedEmails.length,
    };
  }
}

export class MockDatabaseService {
  private config: MockConfig = {};
  
  configure(config: MockConfig) {
    this.config = config;
  }
  
  reset() {
    this.config = {};
  }
  
  async query(sql: string): Promise<any> {
    if (this.config.shouldFail) {
      if (this.config.errorType === "timeout") {
        throw new Error("DB_TIMEOUT: Query timed out");
      }
      throw new Error("DB_ERROR: Connection failed");
    }
    
    return { rows: [], rowCount: 0 };
  }
}

export const mockAI = new MockAIService();
export const mockEmail = new MockEmailService();
export const mockDB = new MockDatabaseService();

export function setupMocks() {
  mockAI.reset();
  mockEmail.reset();
  mockDB.reset();
}

export function simulatePartialFailure(service: MockEmailService, failureRate: number) {
  service.configure({ failureRate });
}

export function simulateTimeout(service: MockAIService | MockDatabaseService, delay: number = 35000) {
  service.configure({ shouldFail: true, errorType: "timeout", delay });
}

export function simulateProviderDown(service: MockEmailService | MockAIService) {
  service.configure({ shouldFail: true, errorType: "500" });
}

export function simulateRateLimit(service: MockAIService) {
  service.configure({ shouldFail: true, errorType: "429" });
}
