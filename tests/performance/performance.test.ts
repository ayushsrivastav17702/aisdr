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

describe("PERFORMANCE TESTS (Lightweight)", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("performance-test-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("API Response Time Benchmarks", () => {
    it("should respond to health check under 100ms", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE).get("/api/health");
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    it("should authenticate under 500ms", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      
      const duration = Date.now() - startTime;
      
      expect([200, 401]).toContain(response.status);
      expect(duration).toBeLessThan(500);
    });

    it("should list campaigns under 200ms", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE)
        .get("/api/campaigns")
        .set(authHeader(testUser.token!));
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(200);
    });

    it("should list prospects under 300ms", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE)
        .get("/api/prospects")
        .set(authHeader(testUser.token!));
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(300);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle 10 concurrent requests", async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(API_BASE)
          .get("/api/campaigns")
          .set(authHeader(testUser.token!))
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      const successful = responses.filter(r => r.status === 200);
      expect(successful.length).toBe(10);
      expect(duration).toBeLessThan(2000);
    });

    it("should handle 20 concurrent campaign creates", async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        request(API_BASE)
          .post("/api/campaigns")
          .set(authHeader(testUser.token!))
          .send({ name: `Concurrent Campaign ${i}` })
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      const successful = responses.filter(r => r.status === 201);
      expect(successful.length).toBe(20);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe("Memory and Resource Usage", () => {
    it("should not leak memory on repeated requests", async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 100; i++) {
        await request(API_BASE)
          .get("/api/campaigns")
          .set(authHeader(testUser.token!));
      }
      
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  describe("Database Query Performance", () => {
    it("should complete complex queries under 500ms", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE)
        .get("/api/campaigns")
        .set(authHeader(testUser.token!))
        .query({
          limit: 100,
          offset: 0,
          sort: "createdAt",
          order: "desc",
        });
      
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    it("should handle pagination efficiently", async () => {
      const pages = [0, 1, 2, 3, 4];
      const times: number[] = [];
      
      for (const page of pages) {
        const startTime = Date.now();
        
        await request(API_BASE)
          .get("/api/prospects")
          .set(authHeader(testUser.token!))
          .query({ limit: 50, offset: page * 50 });
        
        times.push(Date.now() - startTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(300);
      
      const variance = Math.max(...times) - Math.min(...times);
      expect(variance).toBeLessThan(500);
    });
  });

  describe("AI Endpoint Performance", () => {
    it("should respond to AI requests under 15s", async () => {
      const startTime = Date.now();
      
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .timeout(20000)
        .send({
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "Test Corp",
            title: "Manager",
          },
        });
      
      const duration = Date.now() - startTime;
      
      expect([200, 202, 503]).toContain(response.status);
      expect(duration).toBeLessThan(15000);
    });
  });
});
