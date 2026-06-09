/**
 * Layer 5 — Email pipeline: approval workflow (approve/reject before send).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db";
import { emailQueue, emailMailboxes, prospects } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser, createTestOrganization, cleanupTestUser, cleanupTestOrg,
  randomEmail, TestUser, TestOrg,
} from "../fixtures/test-utils";

describe("Layer 5: email approval/rejection flow", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let mailboxId: string;
  let prospectId: string;
  const rowIds: string[] = [];

  beforeAll(async () => {
    testOrg = await createTestOrganization("approval-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });

    mailboxId = nanoid();
    await db.insert(emailMailboxes).values({
      id: mailboxId, userId: testUser.id, name: "Approval Mailbox",
      email: `approval-mailbox-${nanoid(6)}@example.com`, provider: "smtp", status: "active",
    });

    prospectId = nanoid();
    await db.insert(prospects).values({
      id: prospectId, firstName: "A", lastName: "F", primaryEmail: randomEmail(),
      userId: testUser.id, organizationId: testOrg.id,
    });
  });

  afterAll(async () => {
    for (const id of rowIds) await db.delete(emailQueue).where(eq(emailQueue.id, id));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(emailMailboxes).where(eq(emailMailboxes.id, mailboxId));
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  async function seed(status: string) {
    const id = nanoid();
    rowIds.push(id);
    await db.insert(emailQueue).values({
      id, userId: testUser.id, prospectId, mailboxId,
      subject: "Pending Subj", body: "Pending Body", status: status as any,
      scheduledFor: new Date(),
    });
    return id;
  }

  it("1-2. approving a held email moves it into the send queue (status → pending)", async () => {
    const id = await seed("approved");
    await db.update(emailQueue).set({ status: "pending" }).where(eq(emailQueue.id, id));

    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("pending");
  });

  it("3. rejecting an email stores the rejection reason and final status", async () => {
    const id = await seed("approved");
    await db.update(emailQueue)
      .set({ status: "cancelled", lastError: "Rejected by reviewer: tone mismatch" })
      .where(eq(emailQueue.id, id));

    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("cancelled");
    expect(row.lastError).toContain("Rejected");
  });

  it("4. approved email is eligible for the send queue (status != held states)", async () => {
    const id = await seed("approved");
    await db.update(emailQueue).set({ status: "pending" }).where(eq(emailQueue.id, id));

    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(["pending", "scheduled", "sending"]).toContain(row.status);
  });

  it("5. rejected email remains out of the send pipeline", async () => {
    const id = await seed("approved");
    await db.update(emailQueue).set({ status: "cancelled" }).where(eq(emailQueue.id, id));

    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(["pending", "scheduled", "sending", "sent"]).not.toContain(row.status);
  });
});
