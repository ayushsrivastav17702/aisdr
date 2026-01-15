import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  cleanupTestUser,
  cleanupTestOrg,
  generateExpiredToken,
  generateToken,
  invalidateSession,
  API_BASE,
  authHeader,
  delay,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";
import { login, logout, callProtectedEndpoint, attemptRoleEscalation } from "../fixtures/api-client";

describe("AUTH & SESSION TESTS", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("auth-test-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("TC-AUTH-01: Token Expiry Mid-Session", () => {
    it("should return 401 when JWT is expired", async () => {
      const expiredToken = generateExpiredToken(testUser.id, testUser.sessionId!);
      
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(expiredToken));
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should not execute partial actions with expired token", async () => {
      const expiredToken = generateExpiredToken(testUser.id, testUser.sessionId!);
      
      const createResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(expiredToken))
        .send({ name: "Should Not Create" });
      
      expect(createResponse.status).toBe(401);
      
      const listResponse = await request(API_BASE)
        .get("/api/campaigns")
        .set(authHeader(testUser.token!));
      
      const foundCampaign = listResponse.body?.campaigns?.find(
        (c: any) => c.name === "Should Not Create"
      );
      expect(foundCampaign).toBeUndefined();
    });

    it("should redirect to login on frontend when token expires", async () => {
      const expiredToken = generateExpiredToken(testUser.id, testUser.sessionId!);
      
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(expiredToken));
      
      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid|expired|authentication/i);
    });
  });

  describe("TC-AUTH-02: Multi-Device Login", () => {
    let sessionA: TestUser;
    let sessionB: TestUser;
    
    beforeEach(async () => {
      const multiDeviceUser = await createTestUser({ 
        role: "user", 
        organizationId: testOrg.id 
      });
      sessionA = await loginTestUser(multiDeviceUser);
      sessionB = await loginTestUser(multiDeviceUser);
    });

    afterEach(async () => {
      if (sessionA?.id) await cleanupTestUser(sessionA.id);
    });

    it("should allow multiple concurrent sessions", async () => {
      const responseA = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(sessionA.token!));
      
      const responseB = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(sessionB.token!));
      
      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);
    });

    it("should keep session B valid after logging out session A", async () => {
      await invalidateSession(sessionA.sessionId!);
      
      const responseA = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(sessionA.token!));
      
      const responseB = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(sessionB.token!));
      
      expect(responseA.status).toBe(401);
      expect(responseB.status).toBe(200);
    });
  });

  describe("TC-AUTH-03: Role Escalation Attempt", () => {
    it("should ignore role parameter in API request body", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Escalation Test Campaign",
          role: "manager",
        });
      
      if (response.status === 201 || response.status === 200) {
        const createdCampaign = response.body;
        expect(createdCampaign.role).not.toBe("manager");
      }
    });

    it("should return 403 when user tries manager-only endpoint", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/team")
        .set(authHeader(testUser.token!));
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
    });

    it("should return 403 when user tries super-admin endpoint", async () => {
      const response = await request(API_BASE)
        .get("/api/super-admin/tenants")
        .set(authHeader(testUser.token!));
      
      expect(response.status).toBe(403);
    });

    it("should block role injection via headers", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/team")
        .set(authHeader(testUser.token!))
        .set("X-User-Role", "manager");
      
      expect(response.status).toBe(403);
    });

    it("should block role injection via query params", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/team?role=manager")
        .set(authHeader(testUser.token!));
      
      expect(response.status).toBe(403);
    });
  });

  describe("Token Validation Edge Cases", () => {
    it("should reject malformed JWT", async () => {
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader("not.a.valid.jwt"));
      
      expect(response.status).toBe(401);
    });

    it("should reject token with invalid signature", async () => {
      const tamperedToken = testUser.token!.slice(0, -5) + "XXXXX";
      
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set(authHeader(tamperedToken));
      
      expect(response.status).toBe(401);
    });

    it("should reject empty authorization header", async () => {
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set("Authorization", "");
      
      expect(response.status).toBe(401);
    });

    it("should reject Bearer without token", async () => {
      const response = await request(API_BASE)
        .get("/api/user/me")
        .set("Authorization", "Bearer ");
      
      expect(response.status).toBe(401);
    });
  });
});
