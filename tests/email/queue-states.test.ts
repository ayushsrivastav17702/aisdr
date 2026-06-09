/**
 * Layer 5 — Email pipeline: email_queue status-transition matrix.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db";
import { emailQueue, emailMailboxes, prospects, sequences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTestUser,
  createTestOrganization,
  cleanupTestUser,
  cleanupTestOrg,
  randomEmail,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";

describe("Layer 5: email_queue status transitions", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let mailboxId: string;
  let prospectId: string;
  let sequenceId: string;
  const rowIds: string[] = [];

  beforeAll(async () => {
    testOrg = await createTestOrganization("queue-states-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });

    mailboxId = nanoid();
    await db.insert(emailMailboxes).values({
      id: mailboxId, userId: testUser.id, name: "QS Mailbox",
      email: `qs-mailbox-${nanoid(6)}@example.com`, provider: "smtp", status: "active",
    });

    prospectId = nanoid();
    await db.insert(prospects).values({
      id: prospectId, firstName: "Q", lastName: "S", primaryEmail: randomEmail(),
      userId: testUser.id, organizationId: testOrg.id,
    });

    sequenceId = nanoid();
    await db.insert(sequences).values({ id: sequenceId, name: `QS Seq ${nanoid(6)}`, userId: testUser.id, status: "active" });
  });

  afterAll(async () => {
    for (const id of rowIds) await db.delete(emailQueue).where(eq(emailQueue.id, id));
    await db.delete(sequences).where(eq(sequences.id, sequenceId));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(emailMailboxes).where(eq(emailMailboxes.id, mailboxId));
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  async function seed(overrides: Partial<typeof emailQueue.$inferInsert> = {}) {
    const id = nanoid();
    rowIds.push(id);
    await db.insert(emailQueue).values({
      id, userId: testUser.id, prospectId, mailboxId, sequenceId,
      subject: "Subj", body: "Body", scheduledFor: new Date(),
      ...overrides,
    });
    return id;
  }

  it("1. created email defaults to status = 'pending'", async () => {
    const id = await seed();
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("pending");
  });

  it("2. scheduled email has status = 'scheduled' and scheduledFor in the future", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const id = await seed({ status: "scheduled", scheduledFor: future });
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("scheduled");
    expect(new Date(row.scheduledFor).getTime()).toBeGreaterThan(Date.now());
  });

  it("3. approval clears hold — approved → pending transition", async () => {
    const id = await seed({ status: "approved" });
    await db.update(emailQueue).set({ status: "pending" }).where(eq(emailQueue.id, id));
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("pending");
  });

  it("4. sent email has status = 'sent' and sentAt set", async () => {
    const id = await seed();
    const sentAt = new Date();
    await db.update(emailQueue).set({ status: "sent", sentAt }).where(eq(emailQueue.id, id));
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("sent");
    expect(row.sentAt).toBeTruthy();
  });

  it("5. failed email has status = 'failed' and lastError set", async () => {
    const id = await seed();
    await db.update(emailQueue).set({ status: "failed", lastError: "SMTP 550", failedAt: new Date() }).where(eq(emailQueue.id, id));
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("failed");
    expect(row.lastError).toBe("SMTP 550");
  });

  it("6. paused_failed is distinct from permanent 'failed'", async () => {
    const id = await seed({ status: "paused_failed" });
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("paused_failed");
    expect(row.status).not.toBe("failed");
  });

  it("7. simulated/demo email has status = 'simulated'", async () => {
    const id = await seed({ status: "simulated" });
    const [row] = await db.select().from(emailQueue).where(eq(emailQueue.id, id));
    expect(row.status).toBe("simulated");
    expect(row.status).not.toBe("sent");
  });
});
