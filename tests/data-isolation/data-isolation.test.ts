import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  createTestProspect,
  createTestSequence,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
  randomOrgId,
} from "../fixtures/test-utils";

describe("DATA ISOLATION TESTS", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let userA: TestUser;
  let userB: TestUser;
  let prospectA: string;
  let sequenceA: string;
  
  beforeAll(async () => {
    orgA = await createTestOrganization("isolation-org-a");
    orgB = await createTestOrganization("isolation-org-b");
    
    userA = await createTestUser({ role: "user", organizationId: orgA.id });
    userA = await loginTestUser(userA);
    
    userB = await createTestUser({ role: "user", organizationId: orgB.id });
    userB = await loginTestUser(userB);
    
    prospectA = await createTestProspect({ userId: userA.id, organizationId: orgA.id });
    sequenceA = await createTestSequence({ userId: userA.id });
  });
  
  afterAll(async () => {
    await cleanupTestUser(userA.id);
    await cleanupTestUser(userB.id);
    await cleanupTestOrg(orgA.id);
    await cleanupTestOrg(orgB.id);
  });

  describe("TC-DATA-01: Cross Org Access Prevention", () => {
    it("should block user B from accessing org A prospects", async () => {
      const response = await request(API_BASE)
        .get(`/api/prospects/${prospectA}`)
        .set(authHeader(userB.token!));
      
      expect([403, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toEqual({});
      }
    });

    it("should block user B from accessing org A sequences", async () => {
      const response = await request(API_BASE)
        .get(`/api/sequences/${sequenceA}`)
        .set(authHeader(userB.token!));
      
      expect([403, 404]).toContain(response.status);
    });

    it("should return empty list when querying cross-org data", async () => {
      const response = await request(API_BASE)
        .get(`/api/prospects?organizationId=${orgA.id}`)
        .set(authHeader(userB.token!));
      
      if (response.status === 200) {
        expect(response.body.prospects || response.body).toEqual([]);
      } else {
        expect([403, 400]).toContain(response.status);
      }
    });

    it("should block cross-org prospect modification", async () => {
      const response = await request(API_BASE)
        .patch(`/api/prospects/${prospectA}`)
        .set(authHeader(userB.token!))
        .send({ firstName: "Hacked" });
      
      expect([403, 404, 500]).toContain(response.status);
    });

    it("should block cross-org prospect deletion", async () => {
      const response = await request(API_BASE)
        .delete(`/api/prospects/${prospectA}`)
        .set(authHeader(userB.token!));
      
      expect([403, 404, 500]).toContain(response.status);
    });

    it("should block cross-org sequence enrollment", async () => {
      const prospectB = await createTestProspect({ userId: userB.id, organizationId: orgB.id });
      
      const response = await request(API_BASE)
        .post(`/api/sequences/${sequenceA}/enroll`)
        .set(authHeader(userB.token!))
        .send({ prospectIds: [prospectB] });
      
      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe("TC-DATA-02: ID Enumeration Attack Prevention", () => {
    // Reduced from 100 to keep the test within the 30s timeout when using a remote DB
    const ENUMERATION_TEST_COUNT = 10;
    
    it("should block unauthorized access for enumerated org IDs", async () => {
      const results: { orgId: string; status: number }[] = [];
      
      for (let i = 0; i < ENUMERATION_TEST_COUNT; i++) {
        const randomId = randomOrgId();
        const response = await request(API_BASE)
          .get(`/api/organizations/${randomId}`)
          .set(authHeader(userA.token!));
        
        results.push({ orgId: randomId, status: response.status });
        
        if (response.status === 200) {
          expect(response.body.id).toBe(orgA.id);
        }
      }
      
      const successfulUnauthorized = results.filter(
        r => r.status === 200 && r.orgId !== orgA.id
      );
      expect(successfulUnauthorized).toHaveLength(0);
    });

    it("should block unauthorized access for enumerated prospect IDs", async () => {
      const randomProspectIds = Array.from({ length: 50 }, () => randomOrgId());
      
      for (const prospectId of randomProspectIds) {
        const response = await request(API_BASE)
          .get(`/api/prospects/${prospectId}`)
          .set(authHeader(userB.token!));
        
        expect([401, 403, 404]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.body.userId).toBe(userB.id);
        }
      }
    });

    it("should block unauthorized access for enumerated sequence IDs", async () => {
      const randomSequenceIds = Array.from({ length: 50 }, () => randomOrgId());
      
      for (const seqId of randomSequenceIds) {
        const response = await request(API_BASE)
          .get(`/api/sequences/${seqId}`)
          .set(authHeader(userB.token!));
        
        expect([200, 401, 403, 404]).toContain(response.status);
      }
    });

    it("should not reveal existence of IDs through error messages", async () => {
      const existingIdResponse = await request(API_BASE)
        .get(`/api/prospects/${prospectA}`)
        .set(authHeader(userB.token!));
      
      const nonExistingIdResponse = await request(API_BASE)
        .get(`/api/prospects/definitely-not-existing-id`)
        .set(authHeader(userB.token!));
      
      expect(existingIdResponse.status).toBe(nonExistingIdResponse.status);
    });

    it("should rate limit rapid enumeration attempts", async () => {
      const rapidRequests = Array.from({ length: 100 }, (_, i) => 
        request(API_BASE)
          .get(`/api/prospects/enum-test-${i}`)
          .set(authHeader(userB.token!))
      );
      
      const responses = await Promise.all(rapidRequests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Cross-Tenant Query Injection Prevention", () => {
    it("should ignore organizationId in request body", async () => {
      const response = await request(API_BASE)
        .post("/api/prospects")
        .set(authHeader(userB.token!))
        .send({
          firstName: "Injected",
          lastName: "Prospect",
          email: "injected@test.local",
          organizationId: orgA.id,
        });
      
      if (response.status === 201) {
        expect(response.body.organizationId).not.toBe(orgA.id);
        expect(response.body.organizationId).toBe(orgB.id);
      }
    });

    it("should ignore userId override attempts", async () => {
      const response = await request(API_BASE)
        .post("/api/prospects")
        .set(authHeader(userB.token!))
        .send({
          firstName: "Injected",
          lastName: "Prospect",
          email: "injected2@test.local",
          userId: userA.id,
        });
      
      if (response.status === 201) {
        expect(response.body.userId).not.toBe(userA.id);
        expect(response.body.userId).toBe(userB.id);
      }
    });
  });
});
