import { db } from "../db";
import { userCredits, creditLogs, tenantSettings } from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export const CREDIT_COSTS = {
  email_generation: 2,
  enrichment: 1,
} as const;

export type CreditActionType = keyof typeof CREDIT_COSTS;

function getMonthPeriod(refDate = new Date()): { start: string; end: string } {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

async function getTenantCreditLimit(tenantId: string): Promise<number> {
  const settings = await db.query.tenantSettings.findFirst({
    where: eq(tenantSettings.organizationId, tenantId),
  });
  return settings?.creditPerUser ?? 500;
}

async function getOrCreateUserCredits(userId: string, tenantId: string) {
  const { start, end } = getMonthPeriod();

  const existing = await db.query.userCredits.findFirst({
    where: and(
      eq(userCredits.userId, userId),
      eq(userCredits.tenantId, tenantId),
      eq(userCredits.periodStart, start)
    ),
  });

  if (existing) return existing;

  const limit = await getTenantCreditLimit(tenantId);

  const [created] = await db
    .insert(userCredits)
    .values({
      userId,
      tenantId,
      creditsAssigned: limit,
      creditsUsed: 0,
      periodStart: start,
      periodEnd: end,
    })
    .returning();

  return created;
}

export async function getUserCreditBalance(userId: string, tenantId: string) {
  const record = await getOrCreateUserCredits(userId, tenantId);
  return {
    assigned: record.creditsAssigned,
    used: record.creditsUsed,
    remaining: record.creditsAssigned - record.creditsUsed,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
  };
}

export async function checkCredits(
  userId: string,
  tenantId: string,
  action: CreditActionType
): Promise<{ allowed: boolean; remaining: number; required: number; message?: string }> {
  const cost = CREDIT_COSTS[action];
  const balance = await getUserCreditBalance(userId, tenantId);

  if (balance.remaining < cost) {
    const actionLabel = action === "email_generation" ? "AI email generation" : "prospect enrichment";
    return {
      allowed: false,
      remaining: balance.remaining,
      required: cost,
      message: `Insufficient credits. ${actionLabel} requires ${cost} credit${cost > 1 ? "s" : ""}, but you only have ${balance.remaining} remaining this month. Credits reset on the 1st of next month.`,
    };
  }

  return { allowed: true, remaining: balance.remaining, required: cost };
}

export async function deductCredits(
  userId: string,
  tenantId: string,
  action: CreditActionType,
  count = 1,
  description?: string,
  prospectId?: string
): Promise<{ success: boolean; remaining: number }> {
  const cost = CREDIT_COSTS[action] * count;
  const { start } = getMonthPeriod();

  await db
    .update(userCredits)
    .set({
      creditsUsed: sql`${userCredits.creditsUsed} + ${cost}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userCredits.userId, userId),
        eq(userCredits.tenantId, tenantId),
        eq(userCredits.periodStart, start)
      )
    );

  await db.insert(creditLogs).values({
    userId,
    tenantId,
    actionType: action,
    creditsDeducted: cost,
    description: description ?? action,
    prospectId,
  });

  const balance = await getUserCreditBalance(userId, tenantId);
  return { success: true, remaining: balance.remaining };
}

export async function initializeUserCredits(
  userId: string,
  tenantId: string
): Promise<void> {
  await getOrCreateUserCredits(userId, tenantId);
}

export async function resetMonthlyCredits(tenantId: string): Promise<void> {
  const limit = await getTenantCreditLimit(tenantId);
  const { start, end } = getMonthPeriod();

  const existingUsers = await db.query.userCredits.findMany({
    where: eq(userCredits.tenantId, tenantId),
    columns: { userId: true },
  });

  const seen = new Set<string>();
  for (const { userId } of existingUsers) {
    if (seen.has(userId)) continue;
    seen.add(userId);

    const existing = await db.query.userCredits.findFirst({
      where: and(
        eq(userCredits.userId, userId),
        eq(userCredits.tenantId, tenantId),
        eq(userCredits.periodStart, start)
      ),
    });

    if (!existing) {
      await db.insert(userCredits).values({
        userId,
        tenantId,
        creditsAssigned: limit,
        creditsUsed: 0,
        periodStart: start,
        periodEnd: end,
      });
    }
  }
}

export async function updateTenantCreditLimit(
  tenantId: string,
  creditPerUser: number
): Promise<void> {
  await db
    .update(tenantSettings)
    .set({ creditPerUser, updatedAt: new Date() })
    .where(eq(tenantSettings.organizationId, tenantId));
}

export async function getCreditLog(
  userId: string,
  tenantId: string,
  limit = 20
) {
  return db.query.creditLogs.findMany({
    where: and(
      eq(creditLogs.userId, userId),
      eq(creditLogs.tenantId, tenantId)
    ),
    orderBy: [desc(creditLogs.createdAt)],
    limit,
  });
}
