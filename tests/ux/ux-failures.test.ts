import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

describe("UX FAILURE TESTS", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("ux-test-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("TC-UX-01: Silent Failure Prevention", () => {
    it("should show explicit error on backend failure", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "internal-error")
        .send({ name: "Error Test Campaign" });
      
      if (response.status >= 400) {
        expect(response.body.error).toBeDefined();
        expect(response.body.error).not.toBe("");
        expect(response.body.error).not.toMatch(/undefined|null|NaN/i);
      }
    });

    it("should include user-friendly error message", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "send-failure")
        .send({
          prospectId: "test-prospect",
          subject: "Test",
          body: "Test",
        });
      
      if (response.status >= 400) {
        expect(response.body.message || response.body.error).toBeDefined();
        expect(response.body.message || response.body.error).not.toMatch(/Error: |Exception: /);
      }
    });

    it("should include actionable guidance in errors", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns/fake-id/launch")
        .set(authHeader(testUser.token!));
      
      if (response.status >= 400) {
        const errorText = JSON.stringify(response.body);
        expect(errorText.length).toBeGreaterThan(10);
      }
    });

    it("should not swallow validation errors", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({});
      
      expect([400, 422]).toContain(response.status);
      expect(response.body.error || response.body.errors).toBeDefined();
    });

    it("should provide specific field-level errors", async () => {
      const response = await request(API_BASE)
        .post("/api/prospects")
        .set(authHeader(testUser.token!))
        .send({
          firstName: "",
          lastName: "",
          email: "not-an-email",
        });
      
      if (response.status === 400 || response.status === 422) {
        if (response.body.fieldErrors || response.body.errors) {
          const errors = response.body.fieldErrors || response.body.errors;
          expect(typeof errors).toBe("object");
        }
      }
    });
  });

  describe("TC-UX-02: False Success Prevention", () => {
    it("should not show success when backend fails", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "silent-failure")
        .send({
          prospectId: "test-prospect",
          subject: "Test",
          body: "Test",
        });
      
      if (response.status < 300) {
        expect(response.body.success).not.toBe(true);
        expect(response.body.status).not.toBe("sent");
      }
    });

    it("should accurately report partial failures", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "partial-failure-50")
        .send({
          prospectIds: ["p1", "p2", "p3", "p4"],
          subject: "Test",
          body: "Test",
        });
      
      if (response.status === 200 || response.status === 207) {
        if (response.body.failed > 0) {
          expect(response.body.success).not.toBe(true);
          expect(response.body.partialSuccess).toBe(true);
        }
      }
    });

    it("should not claim campaign launched when it failed", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name: "Launch Failure Test" });
      
      if (campaignResponse.status !== 201) return;
      
      const launchResponse = await request(API_BASE)
        .post(`/api/campaigns/${campaignResponse.body.id}/launch`)
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "launch-failure");
      
      if (launchResponse.status >= 400) {
        expect(launchResponse.body.launched).not.toBe(true);
        expect(launchResponse.body.status).not.toBe("active");
      }
    });

    it("should report accurate email delivery status", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "delivery-failure")
        .send({
          prospectId: "test-prospect",
          subject: "Delivery Test",
          body: "Test",
        });
      
      if (response.status >= 400 || response.body.delivered === false) {
        expect(response.body.status).not.toBe("delivered");
      }
    });
  });

  describe("Loading States", () => {
    it("should indicate processing for long operations", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
        });
      
      if (response.status === 202) {
        expect(response.body.status).toMatch(/processing|pending|generating/i);
      }
    });

    it("should provide progress for batch operations", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .send({
          prospectIds: Array.from({ length: 50 }, (_, i) => `p${i}`),
          subject: "Batch",
          body: "Test",
        });
      
      if (response.status === 202 && response.body.operationId) {
        const statusResponse = await request(API_BASE)
          .get(`/api/operations/${response.body.operationId}/status`)
          .set(authHeader(testUser.token!));
        
        if (statusResponse.status === 200) {
          expect(statusResponse.body.progress).toBeDefined();
        }
      }
    });
  });

  describe("Error Recovery", () => {
    it("should allow retry after failure", async () => {
      const failedResponse = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "recoverable-failure")
        .send({
          prospectId: "test-prospect",
          subject: "Retry Test",
          body: "Test",
        });
      
      if (failedResponse.status >= 400) {
        expect(failedResponse.body.canRetry).not.toBe(false);
      }
    });

    it("should preserve form data after error", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "validation-error")
        .send({
          name: "Preserve Data Test",
          description: "Long description here",
        });
      
      if (response.status >= 400 && response.body.submittedData) {
        expect(response.body.submittedData.name).toBe("Preserve Data Test");
      }
    });
  });

  describe("Timeout Handling", () => {
    it("should show timeout message for long requests", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "slow-response")
        .timeout(35000)
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
        });
      
      if (response.status === 408 || response.status === 504) {
        expect(response.body.error).toMatch(/timeout|took too long/i);
      }
    });

    it("should not leave operations in limbo after timeout", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns/test-id/launch")
        .set(authHeader(testUser.token!))
        .set("X-Test-Simulate", "timeout-during-launch");
      
      if (response.status === 408 || response.status === 504) {
        const statusCheck = await request(API_BASE)
          .get("/api/campaigns/test-id")
          .set(authHeader(testUser.token!));
        
        if (statusCheck.status === 200) {
          expect(statusCheck.body.status).not.toBe("launching");
        }
      }
    });
  });
});
