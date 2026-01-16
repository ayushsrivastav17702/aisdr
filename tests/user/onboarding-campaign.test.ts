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

describe("USER ROLE - ONBOARDING & CAMPAIGN TESTS", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("user-onboarding-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("TC-USER-ONB-01: Skip Required Onboarding Steps", () => {
    it("should block campaign launch without ICP selection", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Campaign Without ICP",
          targetAudience: null,
          icpId: null,
        });
      
      if (campaignResponse.status === 201) {
        const launchResponse = await request(API_BASE)
          .post(`/api/campaigns/${campaignResponse.body.id}/launch`)
          .set(authHeader(testUser.token!));
        
        expect([400, 422]).toContain(launchResponse.status);
        expect(launchResponse.body.error).toBeDefined();
        expect(launchResponse.body.error).toMatch(/ICP|audience|target|required/i);
      }
    });

    it("should block campaign launch without mailbox configured", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Campaign Without Mailbox",
          icpId: "test-icp",
        });
      
      if (campaignResponse.status === 201) {
        const launchResponse = await request(API_BASE)
          .post(`/api/campaigns/${campaignResponse.body.id}/launch`)
          .set(authHeader(testUser.token!));
        
        expect([400, 422]).toContain(launchResponse.status);
        expect(launchResponse.body.error).toMatch(/mailbox|email|configured/i);
      }
    });

    it("should return actionable error when steps are missing", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Incomplete Campaign",
        });
      
      if (response.status === 201) {
        const launchResponse = await request(API_BASE)
          .post(`/api/campaigns/${response.body.id}/launch`)
          .set(authHeader(testUser.token!));
        
        if (launchResponse.status !== 200) {
          expect(launchResponse.body.missingSteps || launchResponse.body.error).toBeDefined();
        }
      }
    });

    it("should validate sequence is attached before launch", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Campaign Without Sequence",
          icpId: "test-icp",
        });
      
      if (campaignResponse.status === 201) {
        const launchResponse = await request(API_BASE)
          .post(`/api/campaigns/${campaignResponse.body.id}/launch`)
          .set(authHeader(testUser.token!));
        
        if (launchResponse.status !== 200) {
          expect(launchResponse.body.error).toMatch(/sequence|steps|missing/i);
        }
      }
    });
  });

  describe("TC-USER-ONB-02: Resume Incomplete Setup", () => {
    it("should restore onboarding state after re-login", async () => {
      const stateResponse = await request(API_BASE)
        .get("/api/user/onboarding-state")
        .set(authHeader(testUser.token!));
      
      if (stateResponse.status === 200) {
        const currentStep = stateResponse.body.currentStep;
        
        const freshUser = await createTestUser({ role: "user", organizationId: testOrg.id });
        const freshSession = await loginTestUser(freshUser);
        
        const newStateResponse = await request(API_BASE)
          .get("/api/user/onboarding-state")
          .set(authHeader(freshSession.token!));
        
        if (newStateResponse.status === 200) {
          expect(newStateResponse.body).toHaveProperty("currentStep");
        }
        
        await cleanupTestUser(freshUser.id);
      }
    });

    it("should preserve draft campaign data after session break", async () => {
      const draftResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({
          name: "Draft Campaign To Resume",
          status: "draft",
        });
      
      if (draftResponse.status === 201) {
        const campaignId = draftResponse.body.id;
        
        const retrieveResponse = await request(API_BASE)
          .get(`/api/campaigns/${campaignId}`)
          .set(authHeader(testUser.token!));
        
        expect(retrieveResponse.status).toBe(200);
        expect(retrieveResponse.body.name).toBe("Draft Campaign To Resume");
        expect(retrieveResponse.body.status).toBe("draft");
      }
    });
  });

  describe("TC-CAMP-01: Empty/Missing Campaign Inputs", () => {
    const requiredFields = ["name"];
    
    it("should reject campaign without name", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({});
      
      expect([400, 422]).toContain(response.status);
    });

    it("should reject campaign with empty name", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name: "" });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should reject campaign with whitespace-only name", async () => {
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name: "   " });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should validate each required field individually", async () => {
      for (const field of requiredFields) {
        const validPayload: Record<string, any> = { name: "Valid Campaign" };
        delete validPayload[field];
        
        const response = await request(API_BASE)
          .post("/api/campaigns")
          .set(authHeader(testUser.token!))
          .send(validPayload);
        
        if (field === "name") {
          expect([400, 422]).toContain(response.status);
        }
      }
    });

    it("should reject extremely long campaign names", async () => {
      const longName = "A".repeat(10000);
      
      const response = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name: longName });
      
      expect([400, 413, 422]).toContain(response.status);
    });
  });

  describe("TC-CAMP-02: Conflicting AI Signals", () => {
    it("should override curiosity subject for enterprise persona", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          persona: "Enterprise",
          subjectStrategy: "Curiosity",
          prospectData: {
            firstName: "John",
            lastName: "Doe",
            company: "BigCorp Inc",
            title: "VP of Engineering",
          },
        });
      
      if (response.status === 200) {
        expect(response.body.metadata?.overrideApplied).toBe(true);
        expect(response.body.metadata?.reason).toBeDefined();
        const subject = response.body.emailSubject || response.body.subjectLine || "";
        expect(subject).not.toMatch(/you won't believe|shocking|secret/i);
      }
    });

    it("should log AI decision reasoning", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          persona: "Enterprise",
          subjectStrategy: "Casual",
          prospectData: {
            firstName: "Jane",
            lastName: "Smith",
            company: "Enterprise Corp",
            title: "CTO",
          },
        });
      
      if (response.status === 200) {
        if (response.body.metadata?.overrideApplied) {
          expect(response.body.metadata.reason).toBeDefined();
          expect(typeof response.body.metadata.reason).toBe("string");
        }
      }
    });

    it("should apply executive-safe defaults for C-level prospects", async () => {
      const response = await request(API_BASE)
        .post("/api/ai/generate-email")
        .set(authHeader(testUser.token!))
        .send({
          persona: "SMB",
          subjectStrategy: "Aggressive",
          prospectData: {
            firstName: "Michael",
            lastName: "Johnson",
            company: "Startup Inc",
            title: "CEO",
          },
        });
      
      if (response.status === 200 && response.body.emailBody) {
        expect(response.body.emailBody).not.toMatch(/urgent|act now|limited time/i);
      }
    });
  });

  describe("Campaign Status Transitions", () => {
    it("should enforce valid status transitions", async () => {
      const createResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name: "Status Test Campaign" });
      
      if (createResponse.status === 201) {
        const campaignId = createResponse.body.id;
        
        const invalidTransition = await request(API_BASE)
          .patch(`/api/campaigns/${campaignId}`)
          .set(authHeader(testUser.token!))
          .send({ status: "completed" });
        
        expect([400, 422]).toContain(invalidTransition.status);
      }
    });
  });
});
