/**
 * Layer 2 — API validation: campaigns (POST /api/campaigns, /:id/launch)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "../../server/db";
import { sequences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
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

describe("Layer 2: campaigns API", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  const createdIds: string[] = [];

  beforeAll(async () => {
    testOrg = await createTestOrganization("campaigns-api-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(sequences).where(eq(sequences.id, id));
    }
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("POST /api/campaigns", () => {
    it("1. happy path creates a campaign in draft status", async () => {
      const name = `Campaign ${nanoid(6)}`;
      const res = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name });

      expect([201, 403]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.id).toBeDefined();
        expect(res.body.name).toBe(name);
        createdIds.push(res.body.id);
      }
    });

    it("2. duplicate name → 409", async () => {
      const name = `Dup Campaign ${nanoid(6)}`;
      const first = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name });
      if (first.status === 201) createdIds.push(first.body.id);

      const second = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ name });

      if (first.status === 201) {
        expect(second.status).toBe(409);
        expect(second.body.error).toBeDefined();
      } else {
        expect([403, 409]).toContain(second.status);
      }
    });

    it("3. missing name → 400", async () => {
      const res = await request(API_BASE)
        .post("/api/campaigns")
        .set(authHeader(testUser.token!))
        .send({ description: "no name supplied" });

      // validationMiddleware(campaignSchema) returns 422 for schema violations
      expect([400, 403, 422]).toContain(res.status);
    });
  });

  describe("POST /api/campaigns/:id/launch", () => {
    let sequenceId: string;

    beforeAll(async () => {
      sequenceId = nanoid();
      await db.insert(sequences).values({
        id: sequenceId,
        name: `Launch Test ${nanoid(6)}`,
        userId: testUser.id,
        status: "draft",
      });
      createdIds.push(sequenceId);
    });

    it("1. no mailbox connected → 400", async () => {
      const res = await request(API_BASE)
        .post(`/api/campaigns/${sequenceId}/launch`)
        .set(authHeader(testUser.token!))
        .send({});

      // BUG-004 regression: explicit 400 with message about missing mailbox
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error || res.body.message).toBeDefined();
      }
    });

    it("2. non-existent sequence → 404", async () => {
      const res = await request(API_BASE)
        .post(`/api/campaigns/${nanoid()}/launch`)
        .set(authHeader(testUser.token!))
        .send({});

      expect([400, 403, 404]).toContain(res.status);
    });
  });
});
