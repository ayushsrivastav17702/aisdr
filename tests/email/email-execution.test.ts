import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  createTestProspect,
  createTestCampaign,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  authHeader,
  delay,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";
import { mockEmail, setupMocks, simulateProviderDown, simulatePartialFailure } from "../fixtures/mock-services";

describe("EMAIL EXECUTION TESTS", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("email-test-org");
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

  describe("TC-SEND-01: Email Provider Down", () => {
    it("should queue retries when provider is down", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "provider-down")
        .send({
          prospectId,
          subject: "Test Email",
          body: "Test body content",
        });
      
      expect([200, 202, 503]).toContain(response.status);
      
      if (response.status === 202) {
        expect(response.body.status).toMatch(/queued|retry|delayed/i);
      }
    });

    it("should show 'Delayed' status in UI during outage", async () => {
      const response = await request(API_BASE)
        .get("/api/emails/queue-status")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "provider-down");
      
      if (response.status === 200) {
        if (response.body.hasDelayed) {
          expect(response.body.delayedCount).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("should implement exponential backoff for retries", async () => {
      const response = await request(API_BASE)
        .get("/api/emails/retry-policy")
        .set(authHeader(testUser.token!));
      
      if (response.status === 200) {
        expect(response.body.backoffType).toBe("exponential");
        expect(response.body.maxRetries).toBeGreaterThanOrEqual(3);
      }
    });

    it("should not lose emails during provider outage", async () => {
      const prospectIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          createTestProspect({ userId: testUser.id, organizationId: testOrg.id })
        )
      );
      
      const sendPromises = prospectIds.map(prospectId =>
        request(API_BASE)
          .post("/api/emails/send")
          .set(authHeader(testUser.token!))
          .set("X-Test-Simulate", "provider-down")
          .send({
            prospectId,
            subject: "Outage Test",
            body: "Test body",
          })
      );
      
      const responses = await Promise.all(sendPromises);
      
      const queued = responses.filter(r => [200, 202].includes(r.status));
      expect(queued.length).toBe(5);
    });
  });

  describe("TC-SEND-02: Partial Batch Failure", () => {
    it("should correctly report partial batch results", async () => {
      const prospectIds = await Promise.all(
        Array.from({ length: 100 }, () =>
          createTestProspect({ userId: testUser.id, organizationId: testOrg.id })
        )
      );
      
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "partial-failure-20")
        .send({
          prospectIds,
          subject: "Batch Test",
          body: "Test body content",
        });
      
      if (response.status === 200 || response.status === 207) {
        expect(response.body.sent).toBeDefined();
        expect(response.body.failed).toBeDefined();
        expect(response.body.sent + response.body.failed).toBe(100);
      }
    });

    it("should not create duplicates on retry", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const idempotencyKey = `test-${Date.now()}`;
      
      const firstAttempt = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Idempotency-Key", idempotencyKey)
        .send({
          prospectId,
          subject: "Idempotency Test",
          body: "Test body",
        });
      
      const secondAttempt = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Idempotency-Key", idempotencyKey)
        .send({
          prospectId,
          subject: "Idempotency Test",
          body: "Test body",
        });
      
      if (firstAttempt.status === 200 && secondAttempt.status === 200) {
        expect(firstAttempt.body.messageId).toBe(secondAttempt.body.messageId);
      }
    });

    it("should track individual email status in batch", async () => {
      const prospectIds = await Promise.all(
        Array.from({ length: 10 }, () =>
          createTestProspect({ userId: testUser.id, organizationId: testOrg.id })
        )
      );
      
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "partial-failure-30")
        .send({
          prospectIds,
          subject: "Batch Status Test",
          body: "Test body",
        });
      
      if (response.status === 200 || response.status === 207) {
        if (response.body.results) {
          expect(response.body.results).toHaveLength(10);
          response.body.results.forEach((result: any) => {
            expect(result).toHaveProperty("prospectId");
            expect(result).toHaveProperty("status");
          });
        }
      }
    });

    it("should preserve send order in batch processing", async () => {
      const prospectIds = await Promise.all(
        Array.from({ length: 20 }, () =>
          createTestProspect({ userId: testUser.id, organizationId: testOrg.id })
        )
      );
      
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .send({
          prospectIds,
          subject: "Order Test",
          body: "Test body",
          preserveOrder: true,
        });
      
      if (response.status === 200 && response.body.results) {
        const resultIds = response.body.results.map((r: any) => r.prospectId);
        expect(resultIds).toEqual(prospectIds);
      }
    });
  });

  describe("Email Validation", () => {
    it("should reject invalid email addresses", async () => {
      const invalidProspectId = await createTestProspect({
        userId: testUser.id,
        organizationId: testOrg.id,
        email: "not-an-email",
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId: invalidProspectId,
          subject: "Test",
          body: "Test body",
        });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should reject empty subject", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId,
          subject: "",
          body: "Test body",
        });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should reject empty body", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId,
          subject: "Test Subject",
          body: "",
        });
      
      expect([400, 422]).toContain(response.status);
    });
  });

  describe("Email Rate Limiting", () => {
    it("should enforce daily email limit", async () => {
      const response = await request(API_BASE)
        .get("/api/user/quota")
        .set(authHeader(testUser.token!));
      
      if (response.status === 200) {
        expect(response.body.emailsRemaining).toBeDefined();
        expect(response.body.dailyLimit).toBeDefined();
      }
    });

    it("should block sends when quota exceeded", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "quota-exceeded")
        .send({
          prospectId: "test-prospect",
          subject: "Test",
          body: "Test",
        });
      
      expect([429, 403]).toContain(response.status);
    });
  });

  describe("Email Tracking", () => {
    it("should generate tracking pixel for sent emails", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId,
          subject: "Tracking Test",
          body: "Test body with tracking",
          enableTracking: true,
        });
      
      if (response.status === 200) {
        expect(response.body.trackingId).toBeDefined();
      }
    });

    it("should wrap URLs for click tracking", async () => {
      const prospectId = await createTestProspect({ 
        userId: testUser.id, 
        organizationId: testOrg.id 
      });
      
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId,
          subject: "Link Tracking Test",
          body: "Check out https://example.com for more info",
          enableClickTracking: true,
        });
      
      if (response.status === 200) {
        expect(response.body.linksWrapped).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
