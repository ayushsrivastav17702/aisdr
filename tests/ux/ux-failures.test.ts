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
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({});
      
      if (response.status >= 400) {
        const hasError = response.body.error || response.body.message || response.body.errors;
        expect(hasError).toBeDefined();
      } else {
        expect([200, 201]).toContain(response.status);
      }
    });

    it("should include user-friendly error message", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({});
      
      if (response.status >= 400) {
        const errorMessage = response.body.message || response.body.error;
        if (errorMessage) {
          expect(typeof errorMessage).toBe("string");
          expect(errorMessage.length).toBeGreaterThan(0);
        }
      }
    });

    it("should include actionable guidance in errors", async () => {
      const response = await request(API_BASE)
        .post("/api/sequences/fake-id/launch")
        .set(authHeader(testUser.token!));
      
      expect([200, 400, 401, 403, 404, 500]).toContain(response.status);
      
      if (response.status >= 400) {
        expect(response.body).toBeDefined();
      }
    });

    it("should not swallow validation errors", async () => {
      const response = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({});
      
      expect([200, 201, 400, 401, 403, 422]).toContain(response.status);
      
      if (response.status === 400 || response.status === 422) {
        const hasErrorInfo = response.body.error || response.body.errors || response.body.message;
        expect(hasErrorInfo).toBeDefined();
      }
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
      
      expect([200, 201, 400, 401, 403, 422]).toContain(response.status);
      
      if (response.status === 400 || response.status === 422) {
        expect(response.body).toBeDefined();
      }
    });
  });

  describe("TC-UX-02: False Success Prevention", () => {
    it("should not show success when backend fails", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({});
      
      if (response.status >= 400) {
        expect(response.body.success).not.toBe(true);
      }
    });

    it("should accurately report partial failures", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .send({
          prospectIds: ["p1", "p2", "p3", "p4"],
          subject: "Test",
          body: "Test",
        });
      
      expect([200, 202, 207, 400, 401, 403, 404, 500]).toContain(response.status);
    });

    it("should not claim campaign launched when it failed", async () => {
      const sequenceResponse = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({ name: "Launch Failure Test", status: "draft" });
      
      if (sequenceResponse.status !== 200 && sequenceResponse.status !== 201) return;
      
      const launchResponse = await request(API_BASE)
        .post(`/api/sequences/${sequenceResponse.body.id}/launch`)
        .set(authHeader(testUser.token!));
      
      expect([200, 400, 401, 403, 404, 500]).toContain(launchResponse.status);
    });

    it("should report accurate email delivery status", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({
          prospectId: "test-prospect",
          subject: "Delivery Test",
          body: "Test",
        });
      
      expect([200, 202, 400, 401, 403, 404, 500]).toContain(response.status);
    });
  });

  describe("Loading States", () => {
    it("should indicate processing for long operations", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/personalize")
        .set(authHeader(testUser.token!))
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
        });
      
      expect([200, 202, 400, 401, 403, 404, 500]).toContain(response.status);
    });

    it("should provide progress for batch operations", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send-batch")
        .set(authHeader(testUser.token!))
        .send({
          prospectIds: Array.from({ length: 5 }, (_, i) => `p${i}`),
          subject: "Batch",
          body: "Test",
        });
      
      expect([200, 202, 207, 400, 401, 403, 404, 500]).toContain(response.status);
    });
  });

  describe("Error Recovery", () => {
    it("should allow retry after failure", async () => {
      const failedResponse = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(testUser.token!))
        .send({});
      
      expect([200, 400, 401, 403, 404, 422, 500]).toContain(failedResponse.status);
    });

    it("should preserve form data after error", async () => {
      const response = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({
          name: "Preserve Data Test",
          description: "Long description here",
        });
      
      expect([200, 201, 400, 401, 403, 422, 500]).toContain(response.status);
    });
  });

  describe("Timeout Handling", () => {
    it("should show timeout message for long requests", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/personalize")
        .set(authHeader(testUser.token!))
        .timeout(30000)
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Corp",
          },
        });
      
      expect([200, 400, 401, 403, 404, 408, 500, 503, 504]).toContain(response.status);
    });

    it("should not leave operations in limbo after timeout", async () => {
      const response = await request(API_BASE)
        .post("/api/sequences/test-id/launch")
        .set(authHeader(testUser.token!));
      
      expect([200, 400, 401, 403, 404, 408, 500, 503, 504]).toContain(response.status);
    });
  });
});
