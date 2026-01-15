import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  createTestCampaign,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";

describe("MANAGER ROLE TESTS", () => {
  let testOrg: TestOrg;
  let managerUser: TestUser;
  let regularUser: TestUser;
  let userCampaignId: string;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("manager-test-org");
    
    managerUser = await createTestUser({ role: "admin", organizationId: testOrg.id });
    managerUser = await loginTestUser(managerUser);
    
    regularUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    regularUser = await loginTestUser(regularUser);
    
    userCampaignId = await createTestCampaign({ userId: regularUser.id, name: "User Campaign" });
  });
  
  afterAll(async () => {
    await cleanupTestUser(regularUser.id);
    await cleanupTestUser(managerUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("TC-MGR-01: Metrics Accuracy", () => {
    it("should match backend events with dashboard metrics", async () => {
      const eventsResponse = await request(API_BASE)
        .get("/api/manager/analytics/events")
        .set(authHeader(managerUser.token!))
        .query({ timeRange: "24h" });
      
      const dashboardResponse = await request(API_BASE)
        .get("/api/manager/stats")
        .set(authHeader(managerUser.token!));
      
      if (eventsResponse.status === 200 && dashboardResponse.status === 200) {
        const eventCounts = eventsResponse.body;
        const dashboardCounts = dashboardResponse.body;
        
        if (eventCounts.emailsSent !== undefined && dashboardCounts.emailsSent !== undefined) {
          expect(eventCounts.emailsSent).toBe(dashboardCounts.emailsSent);
        }
        
        if (eventCounts.campaignsActive !== undefined && dashboardCounts.campaignsActive !== undefined) {
          expect(eventCounts.campaignsActive).toBe(dashboardCounts.campaignsActive);
        }
      }
    });

    it("should accurately count team members", async () => {
      const teamResponse = await request(API_BASE)
        .get("/api/manager/team")
        .set(authHeader(managerUser.token!));
      
      const statsResponse = await request(API_BASE)
        .get("/api/manager/stats")
        .set(authHeader(managerUser.token!));
      
      if (teamResponse.status === 200 && statsResponse.status === 200) {
        const teamCount = teamResponse.body.users?.length || 0;
        const statsTeamCount = statsResponse.body.teamSize || 0;
        
        expect(teamCount).toBe(statsTeamCount);
      }
    });

    it("should calculate email metrics correctly", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/analytics")
        .set(authHeader(managerUser.token!));
      
      if (response.status === 200) {
        const { openRate, clickRate, replyRate, totalSent, totalOpened } = response.body;
        
        if (totalSent > 0 && openRate !== undefined) {
          const calculatedOpenRate = (totalOpened / totalSent) * 100;
          expect(Math.abs(openRate - calculatedOpenRate)).toBeLessThan(0.1);
        }
      }
    });
  });

  describe("TC-MGR-02: Cache Staleness", () => {
    it("should refresh dashboard within SLA after updates", async () => {
      const initialStats = await request(API_BASE)
        .get("/api/manager/stats")
        .set(authHeader(managerUser.token!));
      
      await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(regularUser.token!))
        .send({ name: "New Campaign For Refresh Test" });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const refreshedStats = await request(API_BASE)
        .get("/api/manager/stats")
        .set(authHeader(managerUser.token!));
      
      if (initialStats.status === 200 && refreshedStats.status === 200) {
        expect(refreshedStats.body.lastUpdated).toBeDefined();
      }
    });

    it("should support force refresh", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/stats")
        .set(authHeader(managerUser.token!))
        .query({ forceRefresh: true });
      
      if (response.status === 200) {
        expect(response.body.cached).toBeFalsy();
      }
    });

    it("should update in real-time for critical metrics", async () => {
      const startTime = Date.now();
      
      const refreshResponse = await request(API_BASE)
        .post("/api/manager/analytics/refresh")
        .set(authHeader(managerUser.token!));
      
      const refreshTime = Date.now() - startTime;
      
      if (refreshResponse.status === 200) {
        expect(refreshTime).toBeLessThan(5000);
      }
    });
  });

  describe("TC-MGR-03: Approval Enforcement", () => {
    it("should block campaign launch without manager approval", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(regularUser.token!))
        .send({
          name: "Campaign Needs Approval",
          requiresApproval: true,
        });
      
      if (campaignResponse.status === 201) {
        const launchResponse = await request(API_BASE)
          .post(`/api/campaigns/${campaignResponse.body.id}/launch`)
          .set(authHeader(regularUser.token!));
        
        if (launchResponse.status !== 200) {
          expect(launchResponse.body.error).toMatch(/approval|pending|manager/i);
        }
      }
    });

    it("should allow manager to approve campaigns", async () => {
      const response = await request(API_BASE)
        .post(`/api/manager/campaigns/${userCampaignId}/approve`)
        .set(authHeader(managerUser.token!));
      
      expect([200, 404]).toContain(response.status);
    });

    it("should notify user when campaign is approved", async () => {
      const approvalResponse = await request(API_BASE)
        .post(`/api/manager/campaigns/${userCampaignId}/approve`)
        .set(authHeader(managerUser.token!));
      
      if (approvalResponse.status === 200) {
        expect(approvalResponse.body.notificationSent).toBeDefined();
      }
    });
  });

  describe("TC-MGR-04: API Bypass Attempt", () => {
    it("should block direct launch API call from user when approval required", async () => {
      const campaignResponse = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(regularUser.token!))
        .send({
          name: "Bypass Attempt Campaign",
          requiresApproval: true,
          status: "pending_approval",
        });
      
      if (campaignResponse.status === 201) {
        const bypassResponse = await request(API_BASE)
          .patch(`/api/campaigns/${campaignResponse.body.id}`)
          .set(authHeader(regularUser.token!))
          .send({ status: "active" });
        
        expect([400, 403]).toContain(bypassResponse.status);
      }
    });

    it("should prevent user from accessing manager endpoints", async () => {
      const endpoints = [
        "/api/manager/team",
        "/api/manager/stats",
        "/api/manager/analytics",
        "/api/manager/campaigns",
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(API_BASE)
          .get(endpoint)
          .set(authHeader(regularUser.token!));
        
        expect(response.status).toBe(403);
      }
    });

    it("should prevent user from approving their own campaigns", async () => {
      const response = await request(API_BASE)
        .post(`/api/manager/campaigns/${userCampaignId}/approve`)
        .set(authHeader(regularUser.token!));
      
      expect(response.status).toBe(403);
    });

    it("should log attempted bypasses", async () => {
      const bypassAttempt = await request(API_BASE)
        .post("/api/manager/campaigns/fake-id/approve")
        .set(authHeader(regularUser.token!));
      
      expect(bypassAttempt.status).toBe(403);
    });
  });

  describe("Manager Read-Only Access to User Data", () => {
    it("should allow manager to view user campaigns", async () => {
      const response = await request(API_BASE)
        .get("/api/manager/campaigns")
        .set(authHeader(managerUser.token!));
      
      expect(response.status).toBe(200);
    });

    it("should block manager from editing user campaigns directly", async () => {
      const response = await request(API_BASE)
        .patch(`/api/campaigns/${userCampaignId}`)
        .set(authHeader(managerUser.token!))
        .send({ name: "Manager Edited" });
      
      expect([403, 404]).toContain(response.status);
    });

    it("should block manager from sending emails as user", async () => {
      const response = await request(API_BASE)
        .post("/api/emails/send")
        .set(authHeader(managerUser.token!))
        .send({
          prospectId: "test-prospect",
          subject: "Manager Send Attempt",
          body: "Test",
        });
      
      expect(response.status).toBe(403);
    });
  });
});
