/**
 * Layer 5 — Email pipeline: atomic deduplication via idempotencyKey unique index.
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

describe("Layer 5: email_queue idempotency / deduplication", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  let mailboxId: string;
  let prospectId: string;
  const key = `dedup-test-${nanoid(8)}`;

  beforeAll(async () => {
    testOrg = await createTestOrganization("dedup-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });

    mailboxId = nanoid();
    await db.insert(emailMailboxes).values({
      id: mailboxId, userId: testUser.id, name: "Dedup Mailbox",
      email: `dedup-mailbox-${nanoid(6)}@example.com`, provider: "smtp", status: "active",
    });

    prospectId = nanoid();
    await db.insert(prospects).values({
      id: prospectId, firstName: "D", lastName: "D", primaryEmail: randomEmail(),
      userId: testUser.id, organizationId: testOrg.id,
    });
  });

  afterAll(async () => {
    await db.delete(emailQueue).where(eq(emailQueue.idempotencyKey, key));
    await db.delete(prospects).where(eq(prospects.id, prospectId));
    await db.delete(emailMailboxes).where(eq(emailMailboxes.id, mailboxId));
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  it("inserting the same idempotencyKey twice results in exactly one row", async () => {
    const base = {
      userId: testUser.id, prospectId, mailboxId,
      subject: "S", body: "B", status: "pending" as const,
      scheduledFor: new Date(), idempotencyKey: key, priority: 5,
    };

    const first = await db.insert(emailQueue).values({ id: nanoid(), ...base }).onConflictDoNothing().returning();
    const second = await db.insert(emailQueue).values({ id: nanoid(), ...base, subject: "S2" }).onConflictDoNothing().returning();

    expect(first.length).toBe(1);
    expect(second.length).toBe(0);

    const rows = await db.select().from(emailQueue).where(eq(emailQueue.idempotencyKey, key));
    expect(rows.length).toBe(1);
    expect(rows[0].subject).toBe("S");
  });
});
