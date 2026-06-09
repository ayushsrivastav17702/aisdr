/**
 * Layer 3 — DB validation: deletion semantics.
 *
 * Note: prospects use a hard delete with FK cascade (server/storage.ts deleteProspect),
 * while `users` carries a `deletedAt` column for soft-delete/deactivation. This suite
 * verifies both behave as the schema intends — cascade integrity for prospects, and
 * soft-delete (status flip, row retained) for users.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db";
import { prospects, sequences, sequenceProspects, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser, createTestOrganization, cleanupTestUser, cleanupTestOrg,
  randomEmail, TestUser, TestOrg,
} from "../fixtures/test-utils";

describe("Layer 3: deletion integrity", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;

  beforeAll(async () => {
    testOrg = await createTestOrganization("soft-delete-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  describe("prospect deletion cascades cleanly", () => {
    let prospectId: string;
    let sequenceId: string;

    beforeAll(async () => {
      prospectId = nanoid();
      await db.insert(prospects).values({
        id: prospectId, firstName: "Del", lastName: "Me", primaryEmail: randomEmail(),
        userId: testUser.id, organizationId: testOrg.id,
      });

      sequenceId = nanoid();
      await db.insert(sequences).values({ id: sequenceId, name: `Cascade Seq ${nanoid(6)}`, userId: testUser.id, status: "draft" });

      await db.insert(sequenceProspects).values({
        id: nanoid(), sequenceId, prospectId, status: "active", enrolledAt: new Date(),
      });
    });

    afterAll(async () => {
      await db.delete(sequences).where(eq(sequences.id, sequenceId));
    });

    it("removes the prospect row and cascades to sequence_prospects", async () => {
      await db.delete(prospects).where(eq(prospects.id, prospectId));

      const remainingProspect = await db.select().from(prospects).where(eq(prospects.id, prospectId));
      expect(remainingProspect.length).toBe(0);

      const remainingEnrollment = await db.select().from(sequenceProspects).where(eq(sequenceProspects.prospectId, prospectId));
      expect(remainingEnrollment.length).toBe(0);
    });
  });

  describe("user soft-delete via status/deletedAt", () => {
    let softDeleteUserId: string;

    beforeAll(async () => {
      const u = await createTestUser({ role: "user", organizationId: testOrg.id });
      softDeleteUserId = u.id;
    });

    it("marks the user inactive and sets deletedAt without removing the row", async () => {
      await db.update(users).set({ status: "inactive", deletedAt: new Date() }).where(eq(users.id, softDeleteUserId));

      const [row] = await db.select().from(users).where(eq(users.id, softDeleteUserId));
      expect(row).toBeDefined();
      expect(row.status).toBe("inactive");
      expect(row.deletedAt).toBeTruthy();

      await db.delete(users).where(eq(users.id, softDeleteUserId));
    });
  });
});
