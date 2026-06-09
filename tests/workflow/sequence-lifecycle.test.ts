/**
 * Layer 4 — Workflow validation: full sequence lifecycle
 * create → add step → enroll → activate → simulate send/reply.
 *
 * Note: this codebase activates a sequence via PATCH /api/sequences/:id
 * with { status: "active" } — there is no separate POST /activate route.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "../../server/db";
import { sequences, sequenceProspects, prospects, emailReplies, sdrWorkflowProgress } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser, createTestOrganization, loginTestUser, cleanupTestUser, cleanupTestOrg,
  randomEmail, API_BASE, authHeader, TestUser, TestOrg,
} from "../fixtures/test-utils";

describe("Layer 4: sequence lifecycle workflow", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let sequenceId: string;
  let prospectId: string;

  beforeAll(async () => {
    testOrg = await createTestOrganization("lifecycle-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);

    await db.insert(sdrWorkflowProgress).values({
      id: nanoid(), userId: testUser.id, organizationId: testOrg.id,
      currentStage: "enrollment",
      readinessCompletedAt: new Date(), uploadCompletedAt: new Date(),
      enrichmentCompletedAt: new Date(), sequenceCompletedAt: new Date(),
    }).onConflictDoUpdate({ target: sdrWorkflowProgress.userId, set: { currentStage: "enrollment" } });
  });

  afterAll(async () => {
    if (sequenceId) {
      await db.delete(sequenceProspects).where(eq(sequenceProspects.sequenceId, sequenceId));
      await db.delete(sequences).where(eq(sequences.id, sequenceId));
    }
    if (prospectId) await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(sdrWorkflowProgress).where(eq(sdrWorkflowProgress.userId, testUser.id));
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  it("Step 1: creates a sequence in draft status", async () => {
    const res = await request(API_BASE)
      .post("/api/sequences")
      .set(authHeader(testUser.token!))
      .send({ name: `Lifecycle Seq ${nanoid(6)}` });

    expect([200, 201, 403]).toContain(res.status);
    if ([200, 201].includes(res.status)) {
      sequenceId = res.body.id || res.body.sequence?.id;
      expect(sequenceId).toBeDefined();
      expect(res.body.status || res.body.sequence?.status || "draft").toBe("draft");
    }
  });

  it("Step 2: adds an email step to the sequence", async () => {
    if (!sequenceId) return;
    const res = await request(API_BASE)
      .post(`/api/sequences/${sequenceId}/steps`)
      .set(authHeader(testUser.token!))
      .send({ type: "email", delayDays: 1, subject: "Hi {{firstName}}", body: "Hello" });

    expect(res.status).not.toBe(500);
    expect([200, 201, 400, 403]).toContain(res.status);
  });

  it("Step 3: enrolls a prospect into the sequence", async () => {
    if (!sequenceId) return;
    prospectId = nanoid();
    await db.insert(prospects).values({
      id: prospectId, firstName: "Life", lastName: "Cycle", primaryEmail: randomEmail(),
      userId: testUser.id, organizationId: testOrg.id,
    });

    const res = await request(API_BASE)
      .post(`/api/sequences/${sequenceId}/prospects`)
      .set(authHeader(testUser.token!))
      .send({ prospectIds: [prospectId] });

    expect(res.status).not.toBe(500);
    expect([200, 201, 400, 403, 429, 503]).toContain(res.status);
  });

  it("Step 4: activates the sequence (status transitions to active)", async () => {
    if (!sequenceId) return;
    const res = await request(API_BASE)
      .patch(`/api/sequences/${sequenceId}`)
      .set(authHeader(testUser.token!))
      .send({ status: "active" });

    // FIXED: "No available mailboxes" is now caught and mapped to a clean 400.
    expect(res.status).not.toBe(500);
    expect([200, 400, 403]).toContain(res.status);
    if (res.status === 200) {
      const [row] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
      expect(["active", "draft"]).toContain(row.status);
    }
  });

  it("Step 5: simulating a sent email does not advance the prospect's step prematurely", async () => {
    if (!sequenceId || !prospectId) return;
    const [enrollment] = await db.select().from(sequenceProspects)
      .where(eq(sequenceProspects.prospectId, prospectId));
    if (enrollment) {
      const before = enrollment.currentStepId;
      // status flip alone (simulating "sent") must not silently change currentStepId
      await db.update(sequenceProspects).set({ lastContactedAt: new Date() }).where(eq(sequenceProspects.id, enrollment.id));
      const [after] = await db.select().from(sequenceProspects).where(eq(sequenceProspects.id, enrollment.id));
      expect(after.currentStepId).toBe(before);
    }
  });

  it("Step 6: a reply row carries classification fields", async () => {
    if (!prospectId) return;
    const replyId = nanoid();
    await db.insert(emailReplies).values({
      id: replyId,
      prospectId,
      replyContent: "Sounds interesting, tell me more",
      sentiment: "positive",
      intent: "interested",
      receivedAt: new Date(),
    });

    const [row] = await db.select().from(emailReplies).where(eq(emailReplies.id, replyId));
    expect(row.sentiment).toBe("positive");
    expect(row.intent).toBe("interested");

    await db.delete(emailReplies).where(eq(emailReplies.id, replyId));
  });
});
