/**
 * Layer 3 — DB validation: enrollment workflow integrity & uniqueness.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db";
import { prospects, sequences, sequenceProspects } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser, createTestOrganization, cleanupTestUser, cleanupTestOrg,
  randomEmail, TestUser, TestOrg,
} from "../fixtures/test-utils";

describe("Layer 3: enrollment integrity", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let prospectId: string;
  let sequenceId: string;

  beforeAll(async () => {
    testOrg = await createTestOrganization("enroll-integrity-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });

    prospectId = nanoid();
    await db.insert(prospects).values({
      id: prospectId, firstName: "I", lastName: "E", primaryEmail: randomEmail(),
      userId: testUser.id, organizationId: testOrg.id,
    });

    sequenceId = nanoid();
    await db.insert(sequences).values({ id: sequenceId, name: `Integrity Seq ${nanoid(6)}`, userId: testUser.id, status: "active" });
  });

  afterAll(async () => {
    await db.delete(sequenceProspects).where(eq(sequenceProspects.sequenceId, sequenceId));
    await db.delete(sequences).where(eq(sequences.id, sequenceId));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  it("creates a sequence_prospects row with status active and enrolledAt set", async () => {
    const [row] = await db.insert(sequenceProspects).values({
      id: nanoid(), sequenceId, prospectId, status: "active", enrolledAt: new Date(),
    }).returning();

    expect(row.status).toBe("active");
    expect(row.enrolledAt).toBeTruthy();
    expect(row.sequenceId).toBe(sequenceId);
    expect(row.prospectId).toBe(prospectId);
  });

  it("enforces the unique (sequenceId, prospectId) constraint — no duplicate enrollments", async () => {
    // First row already exists from the previous test (re-query to confirm)
    const existing = await db.select().from(sequenceProspects)
      .where(and(eq(sequenceProspects.sequenceId, sequenceId), eq(sequenceProspects.prospectId, prospectId)));
    expect(existing.length).toBe(1);

    await expect(
      db.insert(sequenceProspects).values({
        id: nanoid(), sequenceId, prospectId, status: "active", enrolledAt: new Date(),
      })
    ).rejects.toThrow();

    const after = await db.select().from(sequenceProspects)
      .where(and(eq(sequenceProspects.sequenceId, sequenceId), eq(sequenceProspects.prospectId, prospectId)));
    expect(after.length).toBe(1);
  });

  it("a duplicate-enrollment attempt via onConflictDoNothing leaves exactly one row", async () => {
    const result = await db.insert(sequenceProspects).values({
      id: nanoid(), sequenceId, prospectId, status: "active", enrolledAt: new Date(),
    }).onConflictDoNothing().returning();

    expect(result.length).toBe(0);

    const rows = await db.select().from(sequenceProspects)
      .where(and(eq(sequenceProspects.sequenceId, sequenceId), eq(sequenceProspects.prospectId, prospectId)));
    expect(rows.length).toBe(1);
  });
});
