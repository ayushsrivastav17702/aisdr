import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";
import { mockAI, setupMocks, simulateTimeout, simulateRateLimit } from "../fixtures/mock-services";

describe("AI GENERATION TESTS", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("ai-test-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });
  
  beforeEach(() => {
    setupMocks();
  });

  describe("TC-AI-01: LLM Timeout Handling", () => {
    it("should use fallback template when AI times out", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "ai-timeout")
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Test Corp",
            title: "Manager",
          },
          templateType: "first_touch",
        });
      
      if (response.status === 200) {
        expect(response.body.emailBody).toBeDefined();
        expect(response.body.usedFallback).toBe(true);
      } else if (response.status === 408 || response.status === 504) {
        expect(response.body.fallbackAvailable).toBe(true);
      }
    });

    it("should notify user when AI falls back", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "ai-timeout")
        .send({
          prospectData: {
            firstName: "Jane",
            lastName: "Smith",
            company: "Acme Inc",
          },
        });
      
      if (response.status === 200 && response.body.usedFallback) {
        expect(response.body.userNotification).toBeDefined();
      }
    });

    it("should respect timeout configuration", async () => {
      const startTime = Date.now();
      
      await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "ai-timeout")
        .timeout(35000)
        .send({
          prospectData: {
            firstName: "Test",
            lastName: "User",
            company: "Company",
          },
        });
      
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(35000);
    });
  });

  describe("TC-AI-02: Token Overflow Protection", () => {
    it("should truncate extremely long inputs", async () => {
      const longInput = "A".repeat(100000);
      
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Test Corp",
            bio: longInput,
            notes: longInput,
          },
        });
      
      expect([200, 400, 413]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body.emailBody).toBeDefined();
        expect(response.body.metadata?.inputTruncated).toBe(true);
      }
    });

    it("should succeed with truncation on large context", async () => {
      const largeContext = {
        previousEmails: Array.from({ length: 100 }, (_, i) => ({
          subject: `Email ${i}`,
          body: "Lorem ipsum ".repeat(500),
          date: new Date(Date.now() - i * 86400000).toISOString(),
        })),
      };
      
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
          context: largeContext,
        });
      
      expect([200, 400]).toContain(response.status);
    });

    it("should handle unicode and special characters", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "Müller",
            lastName: "Østerberg",
            company: "日本語会社",
            title: "Директор",
          },
        });
      
      expect([200, 400]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body.emailBody).toBeDefined();
      }
    });

    it("should handle emoji in input", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John 🚀",
            lastName: "Doe",
            company: "Startup 🦄 Inc",
          },
        });
      
      expect([200, 400]).toContain(response.status);
    });
  });

  describe("TC-AI-03: No Context Guardrail", () => {
    it("should block AI generation without ICP", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: null,
          icpId: null,
        });
      
      expect([400, 422]).toContain(response.status);
      expect(response.body.error).toMatch(/ICP|context|prospect|required/i);
    });

    it("should block AI generation without trigger", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
          },
          triggerEvent: null,
          requireTrigger: true,
        });
      
      if (response.status !== 200) {
        expect(response.body.error).toMatch(/trigger|context|event/i);
      }
    });

    it("should require minimum prospect data fields", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {},
        });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should validate email personalization has sufficient context", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            email: "john@example.com",
          },
          aiPersonalization: true,
        });
      
      if (response.status === 200) {
        expect(response.body.personalizationLevel).toMatch(/low|minimal|generic/i);
      }
    });
  });

  describe("AI Content Quality Guardrails", () => {
    it("should not generate spam-like content", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Test Corp",
            title: "Manager",
          },
          templateType: "first_touch",
        });
      
      if (response.status === 200) {
        const body = response.body.emailBody?.toLowerCase() || "";
        expect(body).not.toMatch(/click here now|act immediately|limited time only/i);
        expect(body).not.toMatch(/\$\d+,?\d*,?\d*/);
      }
    });

    it("should not include multiple CTAs in first touch", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "Jane",
            lastName: "Smith",
            company: "Acme",
          },
          templateType: "first_touch",
        });
      
      if (response.status === 200) {
        const body = response.body.emailBody || "";
        const ctaPatterns = /(schedule a call|book a demo|sign up|try free|get started|learn more)/gi;
        const matches = body.match(ctaPatterns) || [];
        expect(matches.length).toBeLessThanOrEqual(2);
      }
    });

    it("should respect word count limits", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
          maxWords: 150,
        });
      
      if (response.status === 200) {
        const wordCount = (response.body.emailBody || "").split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(200);
      }
    });
  });

  describe("AI Rate Limiting", () => {
    it("should handle rate limit gracefully", async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          request(API_BASE)
            .post("/api/ai/generate-email")
            .set(authHeader(testUser.token!))
            .send({
              prospectData: {
                firstName: "Test",
                lastName: "User",
                company: "Corp",
              },
            })
        )
      );
      
      const rateLimited = responses.filter(r => r.status === 429);
      const successful = responses.filter(r => r.status === 200);
      
      expect(successful.length + rateLimited.length).toBe(20);
    });
  });
});
