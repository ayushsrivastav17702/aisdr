import { Router } from "express";
import { authenticate, forbidManager } from "./middleware/auth.middleware";
import {
  getUserCreditBalance,
  getCreditLog,
  updateTenantCreditLimit,
  resetMonthlyCredits,
  CREDIT_COSTS,
} from "./services/credit.service";
import { db } from "./db";
import { tenantSettings, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/api/credits/balance", authenticate, forbidManager, async (req: any, res) => {
  try {
    const userId = req.userContext?.userId;
    const tenantId = req.userContext?.organizationId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!tenantId) return res.status(400).json({ error: "No organisation associated with account" });

    const balance = await getUserCreditBalance(userId, tenantId);
    return res.json({ ...balance, costs: CREDIT_COSTS });
  } catch (err) {
    console.error("[credits] balance error:", err);
    return res.status(500).json({ error: "Failed to fetch credit balance" });
  }
});

router.get("/api/credits/log", authenticate, forbidManager, async (req: any, res) => {
  try {
    const userId = req.userContext?.userId;
    const tenantId = req.userContext?.organizationId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!tenantId) return res.status(400).json({ error: "No organisation associated with account" });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const log = await getCreditLog(userId, tenantId, limit);
    return res.json(log);
  } catch (err) {
    console.error("[credits] log error:", err);
    return res.status(500).json({ error: "Failed to fetch credit log" });
  }
});

const updateCreditSchema = z.object({
  creditPerUser: z.number().int().min(0).max(100000),
});

router.put("/api/admin/credits/limit", authenticate, async (req: any, res) => {
  try {
    const { role } = req.user;
    const tenantId = req.userContext?.organizationId;
    if (!["manager", "admin", "super_admin"].includes(role)) {
      return res.status(403).json({ error: "Not authorised" });
    }
    if (!tenantId) return res.status(400).json({ error: "No organisation" });

    const { creditPerUser } = updateCreditSchema.parse(req.body);
    await updateTenantCreditLimit(tenantId, creditPerUser);

    const settings = await db.query.tenantSettings.findFirst({
      where: eq(tenantSettings.organizationId, tenantId),
    });

    return res.json({ success: true, creditPerUser: settings?.creditPerUser });
  } catch (err) {
    console.error("[credits] update limit error:", err);
    return res.status(500).json({ error: "Failed to update credit limit" });
  }
});

router.post("/api/admin/credits/reset", authenticate, async (req: any, res) => {
  try {
    const { role } = req.user;
    const tenantId = req.userContext?.organizationId;
    if (!["super_admin"].includes(role)) {
      return res.status(403).json({ error: "Super admin only" });
    }
    if (!tenantId) return res.status(400).json({ error: "No organisation" });

    await resetMonthlyCredits(tenantId);
    return res.json({ success: true, message: "Credits reset for all users in tenant" });
  } catch (err) {
    console.error("[credits] reset error:", err);
    return res.status(500).json({ error: "Failed to reset credits" });
  }
});

router.get("/api/admin/credits/users", authenticate, async (req: any, res) => {
  try {
    const { role } = req.user;
    const tenantId = req.userContext?.organizationId;
    if (!["manager", "admin", "super_admin"].includes(role)) {
      return res.status(403).json({ error: "Not authorised" });
    }
    if (!tenantId) return res.status(400).json({ error: "No organisation" });

    const tenantUsers = await db.query.users.findMany({
      where: eq(users.organizationId, tenantId),
      columns: { id: true, email: true, username: true, role: true },
    });

    const balances = await Promise.all(
      tenantUsers.map(async (u) => {
        const bal = await getUserCreditBalance(u.id, tenantId);
        return { ...u, credits: bal };
      })
    );

    return res.json(balances);
  } catch (err) {
    console.error("[credits] users error:", err);
    return res.status(500).json({ error: "Failed to fetch user credits" });
  }
});

export default router;
