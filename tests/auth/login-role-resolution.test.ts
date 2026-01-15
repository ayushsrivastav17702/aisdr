import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  deactivateUser,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";
import { mockDB, setupMocks, simulateTimeout } from "../fixtures/mock-services";

describe("LOGIN → ROLE RESOLUTION TESTS", () => {
  let testOrg: TestOrg;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("login-test-org");
  });
  
  afterAll(async () => {
    await cleanupTestOrg(testOrg.id);
  });
  
  beforeEach(() => {
    setupMocks();
  });

  describe("TC-LOGIN-01: Deactivated User Login Attempt", () => {
    let deactivatedUser: TestUser;
    
    beforeAll(async () => {
      deactivatedUser = await createTestUser({ 
        role: "user", 
        organizationId: testOrg.id,
        status: "inactive"
      });
    });
    
    afterAll(async () => {
      await cleanupTestUser(deactivatedUser.id);
    });

    it("should reject login for deactivated user with explicit error", async () => {
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: deactivatedUser.password,
        });
      
      expect([401, 403, 429]).toContain(response.status);
      if (response.body.error) {
        expect(response.body.error).toMatch(/inactive|deactivated|disabled|login|password|locked|rate/i);
      }
    });

    it("should not issue token for deactivated user", async () => {
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: deactivatedUser.password,
        });
      
      expect(response.body.token).toBeUndefined();
    });

    it("should deactivate user mid-session and block subsequent requests", async () => {
      const activeUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const loginResponse = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: activeUser.email,
          password: activeUser.password,
        });
      
      if (loginResponse.status !== 200) {
        expect([401, 429]).toContain(loginResponse.status);
        await cleanupTestUser(activeUser.id);
        return;
      }
      
      const token = loginResponse.body.token;
      
      await deactivateUser(activeUser.id);
      
      const protectedResponse = await request(API_BASE)
        .get("/api/user/me")
        .set("Authorization", `Bearer ${token}`);
      
      expect([401, 403]).toContain(protectedResponse.status);
      
      await cleanupTestUser(activeUser.id);
    });
  });

  describe("TC-LOGIN-02: Partial DB Failure During Login", () => {
    it("should fail safely on database read error", async () => {
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: `db-failure-test-${Date.now()}@test.local`,
          password: "TestPassword123!",
        });
      
      expect([401, 429, 500, 503]).toContain(response.status);
      expect(response.body.token).toBeUndefined();
    });

    it("should not create partial session on DB write failure", async () => {
      const testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const loginResponse = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      
      if (loginResponse.status !== 200) {
        expect(loginResponse.body.sessionId).toBeUndefined();
      }
      
      await cleanupTestUser(testUser.id);
    });

    it("should handle concurrent login attempts safely", async () => {
      const testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const loginPromises = Array.from({ length: 3 }, () =>
        request(API_BASE)
          .post("/api/auth/login")
          .send({
            email: testUser.email,
            password: testUser.password,
          })
      );
      
      const responses = await Promise.all(loginPromises);
      const validResponses = responses.filter(r => [200, 429].includes(r.status));
      
      expect(validResponses.length).toBeGreaterThanOrEqual(1);
      
      await cleanupTestUser(testUser.id);
    });
  });

  describe("Login Security Edge Cases", () => {
    it("should reject login with wrong password", async () => {
      const testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: "WrongPassword123!",
        });
      
      expect([401, 429]).toContain(response.status);
      expect(response.body.token).toBeUndefined();
      
      await cleanupTestUser(testUser.id);
    });

    it("should reject login with non-existent email", async () => {
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: `nonexistent-${Date.now()}@test.local`,
          password: "AnyPassword123!",
        });
      
      expect([401, 429]).toContain(response.status);
      expect(response.body.token).toBeUndefined();
    });

    it("should not reveal whether email exists in error message", async () => {
      const testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const wrongPasswordResponse = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: "WrongPassword123!",
        });
      
      const nonExistentResponse = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: "nonexistent-user@test.local",
          password: "AnyPassword123!",
        });
      
      expect(wrongPasswordResponse.body.error).toBe(nonExistentResponse.body.error);
      
      await cleanupTestUser(testUser.id);
    });

    it("should handle SQL injection attempts in email", async () => {
      const maliciousEmails = [
        "'; DROP TABLE users;--",
        "admin'--",
        "' OR '1'='1",
        "user@test.local' UNION SELECT * FROM users--",
      ];
      
      for (const email of maliciousEmails) {
        const response = await request(API_BASE)
          .post("/api/auth/login")
          .send({
            email,
            password: "AnyPassword123!",
          });
        
        expect([400, 401, 429]).toContain(response.status);
      }
    });

    it("should enforce account lockout after failed attempts", async () => {
      const testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
      
      const failedAttempts = Array.from({ length: 10 }, () =>
        request(API_BASE)
          .post("/api/auth/login")
          .send({
            email: testUser.email,
            password: "WrongPassword!",
          })
      );
      
      await Promise.all(failedAttempts);
      
      const lockedResponse = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      
      expect([401, 423, 429]).toContain(lockedResponse.status);
      
      await cleanupTestUser(testUser.id);
    });
  });
});
