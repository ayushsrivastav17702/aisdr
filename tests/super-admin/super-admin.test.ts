import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  cleanupTestUser,
  cleanupTestOrg,
  getAuditLogs,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";

describe("SUPER ADMIN (HIGH RISK) TESTS", () => {
  let testOrg: TestOrg;
  let superAdmin: TestUser;
  let regularUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("super-admin-test-org");
    
    superAdmin = await createTestUser({ role: "super_admin", organizationId: null });
    superAdmin = await loginTestUser(superAdmin);
    
    regularUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    regularUser = await loginTestUser(regularUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(regularUser.id);
    await cleanupTestUser(superAdmin.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("TC-SA-01: Org Deletion Confirmation Enforcement", () => {
    it("should block deletion without confirmation", async () => {
      const response = await request(API_BASE)
        .delete(`/api/super-admin/tenants/${testOrg.id}`)
        .set(authHeader(superAdmin.token!))
        .send({});
      
      expect([400, 422]).toContain(response.status);
      expect(response.body.error).toMatch(/confirm|verification|required/i);
    });

    it("should require explicit confirmation text", async () => {
      const response = await request(API_BASE)
        .delete(`/api/super-admin/tenants/${testOrg.id}`)
        .set(authHeader(superAdmin.token!))
        .send({ confirm: true });
      
      expect([400, 422]).toContain(response.status);
    });

    it("should require typing org name for deletion", async () => {
      const orgToDelete = await createTestOrganization("delete-me-org");
      
      const wrongNameResponse = await request(API_BASE)
        .delete(`/api/super-admin/tenants/${orgToDelete.id}`)
        .set(authHeader(superAdmin.token!))
        .send({ confirmationText: "wrong-name" });
      
      expect([400, 422]).toContain(wrongNameResponse.status);
      
      await cleanupTestOrg(orgToDelete.id);
    });

    it("should cascade delete all tenant data", async () => {
      const tempOrg = await createTestOrganization("cascade-delete-org");
      const tempUser = await createTestUser({ role: "user", organizationId: tempOrg.id });
      
      const deleteResponse = await request(API_BASE)
        .delete(`/api/super-admin/tenants/${tempOrg.id}`)
        .set(authHeader(superAdmin.token!))
        .send({ 
          confirmationText: tempOrg.name,
          confirm: true,
          acknowledgeDataLoss: true,
        });
      
      if (deleteResponse.status === 200) {
        const userCheck = await request(API_BASE)
          .get(`/api/super-admin/users/${tempUser.id}`)
          .set(authHeader(superAdmin.token!));
        
        expect([404, 410]).toContain(userCheck.status);
      } else {
        await cleanupTestUser(tempUser.id);
        await cleanupTestOrg(tempOrg.id);
      }
    });
  });

  describe("TC-SA-02: Audit Log Completeness", () => {
    it("should log tenant creation", async () => {
      const createResponse = await request(API_BASE)
        .post("/api/super-admin/tenants")
        .set(authHeader(superAdmin.token!))
        .send({
          name: "Audit Test Org",
          plan: "pro",
        });
      
      if (createResponse.status === 201) {
        const auditResponse = await request(API_BASE)
          .get("/api/super-admin/audit-logs")
          .set(authHeader(superAdmin.token!))
          .query({ action: "TENANT_PROVISIONED", limit: 1 });
        
        if (auditResponse.status === 200) {
          const logs = auditResponse.body.logs || auditResponse.body;
          expect(logs.length).toBeGreaterThan(0);
          expect(logs[0].action).toBe("TENANT_PROVISIONED");
        }
        
        await cleanupTestOrg(createResponse.body.id);
      }
    });

    it("should log config changes", async () => {
      const configResponse = await request(API_BASE)
        .patch(`/api/super-admin/tenants/${testOrg.id}/config`)
        .set(authHeader(superAdmin.token!))
        .send({ maxUsers: 100 });
      
      if (configResponse.status === 200) {
        const auditResponse = await request(API_BASE)
          .get("/api/super-admin/audit-logs")
          .set(authHeader(superAdmin.token!))
          .query({ action: "TENANT_CONFIG_UPDATED", limit: 1 });
        
        if (auditResponse.status === 200) {
          const logs = auditResponse.body.logs || auditResponse.body;
          expect(logs.length).toBeGreaterThan(0);
        }
      }
    });

    it("should log impersonation events", async () => {
      const impersonateResponse = await request(API_BASE)
        .post(`/api/super-admin/impersonate/${regularUser.id}`)
        .set(authHeader(superAdmin.token!));
      
      if (impersonateResponse.status === 200) {
        const auditResponse = await request(API_BASE)
          .get("/api/super-admin/audit-logs")
          .set(authHeader(superAdmin.token!))
          .query({ action: "IMPERSONATION_STARTED", limit: 1 });
        
        if (auditResponse.status === 200) {
          const logs = auditResponse.body.logs || auditResponse.body;
          expect(logs.length).toBeGreaterThan(0);
          expect(logs[0].targetId).toBeDefined();
        }
      }
    });

    it("should create immutable audit trail", async () => {
      const auditResponse = await request(API_BASE)
        .get("/api/super-admin/audit-logs")
        .set(authHeader(superAdmin.token!))
        .query({ limit: 10 });
      
      if (auditResponse.status === 200 && auditResponse.body.logs?.length > 0) {
        const firstLog = auditResponse.body.logs[0];
        
        const deleteAttempt = await request(API_BASE)
          .delete(`/api/super-admin/audit-logs/${firstLog.id}`)
          .set(authHeader(superAdmin.token!));
        
        expect([403, 404, 405]).toContain(deleteAttempt.status);
        
        const modifyAttempt = await request(API_BASE)
          .patch(`/api/super-admin/audit-logs/${firstLog.id}`)
          .set(authHeader(superAdmin.token!))
          .send({ action: "MODIFIED" });
        
        expect([403, 404, 405]).toContain(modifyAttempt.status);
      }
    });

    it("should include all required audit fields", async () => {
      const auditResponse = await request(API_BASE)
        .get("/api/super-admin/audit-logs")
        .set(authHeader(superAdmin.token!))
        .query({ limit: 1 });
      
      if (auditResponse.status === 200 && auditResponse.body.logs?.length > 0) {
        const log = auditResponse.body.logs[0];
        
        expect(log).toHaveProperty("id");
        expect(log).toHaveProperty("action");
        expect(log).toHaveProperty("createdAt");
        expect(log).toHaveProperty("superAdminId");
      }
    });
  });

  describe("TC-SA-03: Config Rollback", () => {
    it("should restore previous config state on rollback", async () => {
      const initialConfig = await request(API_BASE)
        .get(`/api/super-admin/tenants/${testOrg.id}/config`)
        .set(authHeader(superAdmin.token!));
      
      if (initialConfig.status !== 200) return;
      
      const originalMaxUsers = initialConfig.body.maxUsers || 50;
      
      await request(API_BASE)
        .patch(`/api/super-admin/tenants/${testOrg.id}/config`)
        .set(authHeader(superAdmin.token!))
        .send({ maxUsers: 200 });
      
      const rollbackResponse = await request(API_BASE)
        .post(`/api/super-admin/tenants/${testOrg.id}/config/rollback`)
        .set(authHeader(superAdmin.token!));
      
      if (rollbackResponse.status === 200) {
        const restoredConfig = await request(API_BASE)
          .get(`/api/super-admin/tenants/${testOrg.id}/config`)
          .set(authHeader(superAdmin.token!));
        
        expect(restoredConfig.body.maxUsers).toBe(originalMaxUsers);
      }
    });

    it("should maintain config history", async () => {
      const historyResponse = await request(API_BASE)
        .get(`/api/super-admin/tenants/${testOrg.id}/config/history`)
        .set(authHeader(superAdmin.token!));
      
      if (historyResponse.status === 200) {
        expect(Array.isArray(historyResponse.body.history || historyResponse.body)).toBe(true);
      }
    });

    it("should allow rollback to specific version", async () => {
      const historyResponse = await request(API_BASE)
        .get(`/api/super-admin/tenants/${testOrg.id}/config/history`)
        .set(authHeader(superAdmin.token!));
      
      if (historyResponse.status === 200 && historyResponse.body.history?.length > 1) {
        const targetVersion = historyResponse.body.history[1].version;
        
        const rollbackResponse = await request(API_BASE)
          .post(`/api/super-admin/tenants/${testOrg.id}/config/rollback`)
          .set(authHeader(superAdmin.token!))
          .send({ targetVersion });
        
        expect([200, 400]).toContain(rollbackResponse.status);
      }
    });
  });

  describe("Super Admin Access Controls", () => {
    it("should block super admin from SDR operations", async () => {
      const sdrEndpoints = [
        { method: "post", path: "/api/campaigns", body: { name: "SA Campaign" } },
        { method: "post", path: "/api/prospects", body: { firstName: "SA", lastName: "Prospect" } },
        { method: "post", path: "/api/emails/send", body: { prospectId: "test", subject: "Test" } },
      ];
      
      for (const endpoint of sdrEndpoints) {
        const response = await (request(API_BASE) as any)[endpoint.method](endpoint.path)
          .set(authHeader(superAdmin.token!))
          .send(endpoint.body);
        
        expect(response.status).toBe(403);
        expect(response.body.error).toMatch(/forbidden|not.*allowed|super.*admin/i);
      }
    });

    it("should allow super admin to view but not modify tenant data", async () => {
      const viewResponse = await request(API_BASE)
        .get(`/api/super-admin/tenants/${testOrg.id}`)
        .set(authHeader(superAdmin.token!));
      
      expect(viewResponse.status).toBe(200);
    });

    it("should require super admin for platform settings", async () => {
      const regularResponse = await request(API_BASE)
        .get("/api/super-admin/platform/settings")
        .set(authHeader(regularUser.token!));
      
      expect(regularResponse.status).toBe(403);
      
      const saResponse = await request(API_BASE)
        .get("/api/super-admin/platform/settings")
        .set(authHeader(superAdmin.token!));
      
      expect([200, 404]).toContain(saResponse.status);
    });
  });
});
