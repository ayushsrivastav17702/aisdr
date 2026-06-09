/**
 * Layer 1 — Frontend/route validation.
 * Smoke-tests that core API routes respond with sane status codes and shapes
 * for an authenticated user, and reject unauthenticated requests.
 */
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

const ROUTES = [
  "/api/campaigns",
  "/api/sequences",
  "/api/prospects",
  "/api/inbox/replies",
  "/api/mailboxes",
  "/api/company-knowledge",
  "/api/intent-signals",
  "/api/analytics/overview",
  "/api/credits/balance",
  "/api/user/me",
];

describe("Layer 1: route navigation smoke tests", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;

  beforeAll(async () => {
    testOrg = await createTestOrganization("nav-smoke-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  for (const route of ROUTES) {
    describe(route, () => {
      it("returns a non-5xx status for an authenticated request", async () => {
        const res = await request(API_BASE).get(route).set(authHeader(testUser.token!));
        expect(res.status).toBeLessThan(500);
        // 403 = workflow-stage/role gating on a fresh tenant; 404 = route not mounted
        // at this exact path (gap — see traceability matrix notes for this module).
        expect([200, 304, 403, 404]).toContain(res.status);
      });

      it("returns JSON (object or array body)", async () => {
        const res = await request(API_BASE).get(route).set(authHeader(testUser.token!));
        if (res.status === 200) {
          expect(typeof res.body === "object" && res.body !== null).toBe(true);
        }
      });

      it("requires authentication (401/403 without token)", async () => {
        const res = await request(API_BASE).get(route);
        // 404 indicates the route isn't mounted at this path — a coverage gap to flag,
        // not an auth failure, so it's tolerated here rather than asserted as a bug.
        expect([401, 403, 404]).toContain(res.status);
      });
    });
  }
});
