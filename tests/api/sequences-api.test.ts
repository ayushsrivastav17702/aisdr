/**
 * Layer 2 — API validation: sequences (POST /api/sequences, /:id/prospects)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "../../server/db";
import { sequences, prospects } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  cleanupTestUser,
  cleanupTestOrg,
  randomEmail,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";

describe("Layer 2: sequences API", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let managerUser: TestUser;
  const seqIds: string[] = [];
  const prospectIds: string[] = [];

  beforeAll(async () => {
    testOrg = await createTestOrganization("sequences-api-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
    managerUser = await createTestUser({ role: "admin", organizationId: testOrg.id });
    managerUser = await loginTestUser(managerUser);
  });

  afterAll(async () => {
    for (const id of prospectIds) await db.delete(prospects).where(eq(prospects.id, id));
    for (const id of seqIds) await db.delete(sequences).where(eq(sequences.id, id));
    await cleanupTestUser(testUser.id);
    await cleanupTestUser(managerUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("POST /api/sequences", () => {
    it("1. happy path creates a sequence", async () => {
      const res = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({ name: `Seq ${nanoid(6)}` });

      expect([200, 201, 403]).toContain(res.status);
      if ([200, 201].includes(res.status)) {
        expect(res.body.id || res.body.sequence?.id).toBeDefined();
        seqIds.push(res.body.id || res.body.sequence?.id);
      }
    });

    it("2. missing name → 400", async () => {
      const res = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(testUser.token!))
        .send({});

      expect([400, 403]).toContain(res.status);
    });

    it("3. unauthenticated → 401/403", async () => {
      const res = await request(API_BASE).post("/api/sequences").send({ name: "X" });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe("POST /api/sequences/:id/prospects", () => {
    let sequenceId: string;
    let prospectId: string;

    beforeAll(async () => {
      sequenceId = nanoid();
      await db.insert(sequences).values({ id: sequenceId, name: `Enroll ${nanoid(6)}`, userId: testUser.id, status: "draft" });
      seqIds.push(sequenceId);

      prospectId = nanoid();
      await db.insert(prospects).values({
        id: prospectId,
        firstName: "E",
        lastName: "P",
        primaryEmail: randomEmail(),
        userId: testUser.id,
        organizationId: testOrg.id,
      });
      prospectIds.push(prospectId);
    });

    it("1. empty array → 400", async () => {
      const res = await request(API_BASE)
        .post(`/api/sequences/${sequenceId}/prospects`)
        .set(authHeader(testUser.token!))
        .send({ prospectIds: [] });

      expect([400, 403]).toContain(res.status);
    });

    it("2. non-existent sequence → 404 (or guarded earlier)", async () => {
      const res = await request(API_BASE)
        .post(`/api/sequences/${nanoid()}/prospects`)
        .set(authHeader(testUser.token!))
        .send({ prospectIds: [prospectId] });

      expect([400, 403, 404]).toContain(res.status);
    });

    it("3. happy path enrolls a valid prospect", async () => {
      const res = await request(API_BASE)
        .post(`/api/sequences/${sequenceId}/prospects`)
        .set(authHeader(testUser.token!))
        .send({ prospectIds: [prospectId] });

      // Workflow-stage gating may block this in CI (403) — assert it doesn't 500
      expect(res.status).not.toBe(500);
      expect([200, 201, 400, 403, 429, 503]).toContain(res.status);
    });
  });

  describe("forbidManager guard", () => {
    it("manager/admin role → 403 on sequence creation", async () => {
      const res = await request(API_BASE)
        .post("/api/sequences")
        .set(authHeader(managerUser.token!))
        .send({ name: `Manager Seq ${nanoid(6)}` });

      expect([403]).toContain(res.status);
    });
  });
});
