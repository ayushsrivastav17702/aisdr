import { Router } from "express";
import { db } from "../db";
import { 
  sendingDomains, 
  mailboxTeamAllocations,
  mailboxWarmupSchedules,
  emailMailboxes,
  teams,
  users
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { nanoid } from "nanoid";
import crypto from "crypto";

const router = Router();

// ============================================
// SENDING DOMAINS ROUTES
// ============================================

router.get("/sending-domains", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const domains = await db
      .select()
      .from(sendingDomains)
      .where(eq(sendingDomains.organizationId, organizationId))
      .orderBy(desc(sendingDomains.createdAt));

    res.json({ domains });
  } catch (error) {
    console.error("Error fetching sending domains:", error);
    res.status(500).json({ error: "Failed to fetch sending domains" });
  }
});

router.get("/sending-domains/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [domain] = await db
      .select()
      .from(sendingDomains)
      .where(and(
        eq(sendingDomains.id, req.params.id),
        eq(sendingDomains.organizationId, organizationId)
      ));

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    res.json(domain);
  } catch (error) {
    console.error("Error fetching domain:", error);
    res.status(500).json({ error: "Failed to fetch domain" });
  }
});

router.post("/sending-domains", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    const verificationToken = `aisdr-verify-${nanoid(32)}`;
    const dkimSelector = `aisdr${Date.now().toString(36)}`;
    
    const spfRecord = `v=spf1 include:_spf.${domain} ~all`;
    const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`;

    const [newDomain] = await db
      .insert(sendingDomains)
      .values({
        organizationId,
        domain,
        verificationToken,
        dkimSelector,
        spfRecord,
        dmarcRecord,
        returnPath: `bounce@${domain}`,
        verificationStatus: "pending",
      })
      .returning();

    res.status(201).json({
      domain: newDomain,
      dnsRecords: {
        verification: {
          type: "TXT",
          host: `_aisdr-verification.${domain}`,
          value: verificationToken,
        },
        spf: {
          type: "TXT",
          host: domain,
          value: spfRecord,
        },
        dmarc: {
          type: "TXT",
          host: `_dmarc.${domain}`,
          value: dmarcRecord,
        },
        dkim: {
          type: "CNAME",
          host: `${dkimSelector}._domainkey.${domain}`,
          value: `${dkimSelector}.dkim.aisdr.com`,
        },
      },
    });
  } catch (error) {
    console.error("Error creating domain:", error);
    res.status(500).json({ error: "Failed to create domain" });
  }
});

router.post("/sending-domains/:id/verify", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [domain] = await db
      .select()
      .from(sendingDomains)
      .where(and(
        eq(sendingDomains.id, req.params.id),
        eq(sendingDomains.organizationId, organizationId)
      ));

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const [updatedDomain] = await db
      .update(sendingDomains)
      .set({
        verificationStatus: "verified",
        verifiedAt: new Date(),
        lastVerifiedAt: new Date(),
        healthScore: 100,
        lastHealthCheck: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sendingDomains.id, req.params.id))
      .returning();

    res.json({ domain: updatedDomain, verified: true });
  } catch (error) {
    console.error("Error verifying domain:", error);
    res.status(500).json({ error: "Failed to verify domain" });
  }
});

router.patch("/sending-domains/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const allowedFields = ['isActive', 'isPrimary'];
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.isPrimary === true) {
      await db
        .update(sendingDomains)
        .set({ isPrimary: false })
        .where(eq(sendingDomains.organizationId, organizationId));
    }

    const [updatedDomain] = await db
      .update(sendingDomains)
      .set(updateData)
      .where(and(
        eq(sendingDomains.id, req.params.id),
        eq(sendingDomains.organizationId, organizationId)
      ))
      .returning();

    if (!updatedDomain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    res.json(updatedDomain);
  } catch (error) {
    console.error("Error updating domain:", error);
    res.status(500).json({ error: "Failed to update domain" });
  }
});

router.delete("/sending-domains/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [deleted] = await db
      .delete(sendingDomains)
      .where(and(
        eq(sendingDomains.id, req.params.id),
        eq(sendingDomains.organizationId, organizationId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Domain not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting domain:", error);
    res.status(500).json({ error: "Failed to delete domain" });
  }
});

router.get("/sending-domains/:id/health", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [domain] = await db
      .select()
      .from(sendingDomains)
      .where(and(
        eq(sendingDomains.id, req.params.id),
        eq(sendingDomains.organizationId, organizationId)
      ));

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const healthChecks = {
      spf: domain.verificationStatus === "verified",
      dkim: domain.verificationStatus === "verified",
      dmarc: domain.verificationStatus === "verified",
      overallScore: domain.healthScore || 0,
      lastCheck: domain.lastHealthCheck,
      issues: domain.healthIssues || [],
    };

    res.json(healthChecks);
  } catch (error) {
    console.error("Error checking domain health:", error);
    res.status(500).json({ error: "Failed to check domain health" });
  }
});

// ============================================
// MAILBOX TEAM ALLOCATION ROUTES
// ============================================

router.get("/mailbox-allocations", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const allocations = await db
      .select({
        allocation: mailboxTeamAllocations,
        mailbox: {
          id: emailMailboxes.id,
          name: emailMailboxes.name,
          email: emailMailboxes.email,
          status: emailMailboxes.status,
        },
        team: {
          id: teams.id,
          name: teams.name,
        },
      })
      .from(mailboxTeamAllocations)
      .innerJoin(emailMailboxes, eq(mailboxTeamAllocations.mailboxId, emailMailboxes.id))
      .innerJoin(teams, eq(mailboxTeamAllocations.teamId, teams.id))
      .where(eq(teams.organizationId, organizationId));

    res.json({ allocations });
  } catch (error) {
    console.error("Error fetching mailbox allocations:", error);
    res.status(500).json({ error: "Failed to fetch mailbox allocations" });
  }
});

router.post("/mailbox-allocations", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { mailboxId, teamId, priority = 1 } = req.body;
    if (!mailboxId || !teamId) {
      return res.status(400).json({ error: "Mailbox ID and Team ID are required" });
    }

    const [team] = await db.select().from(teams).where(
      and(eq(teams.id, teamId), eq(teams.organizationId, organizationId))
    );
    if (!team) {
      return res.status(404).json({ error: "Team not found in organization" });
    }

    const [allocation] = await db
      .insert(mailboxTeamAllocations)
      .values({
        mailboxId,
        teamId,
        priority,
        allocatedBy: userId,
      })
      .returning();

    res.status(201).json(allocation);
  } catch (error) {
    console.error("Error creating mailbox allocation:", error);
    res.status(500).json({ error: "Failed to create mailbox allocation" });
  }
});

router.delete("/mailbox-allocations/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await db
      .delete(mailboxTeamAllocations)
      .where(eq(mailboxTeamAllocations.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting mailbox allocation:", error);
    res.status(500).json({ error: "Failed to delete mailbox allocation" });
  }
});

// ============================================
// MAILBOX WARMUP SCHEDULE ROUTES
// ============================================

router.get("/mailbox-warmup/:mailboxId", authenticate, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    if (!mailbox || mailbox.userId !== userId) {
      return res.status(404).json({ error: "Mailbox not found" });
    }

    const [schedule] = await db
      .select()
      .from(mailboxWarmupSchedules)
      .where(eq(mailboxWarmupSchedules.mailboxId, req.params.mailboxId));

    res.json({ schedule });
  } catch (error) {
    console.error("Error fetching warmup schedule:", error);
    res.status(500).json({ error: "Failed to fetch warmup schedule" });
  }
});

router.post("/mailbox-warmup/:mailboxId", authenticate, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    if (!mailbox || mailbox.userId !== userId) {
      return res.status(404).json({ error: "Mailbox not found" });
    }

    const {
      initialDailyLimit = 5,
      targetDailyLimit = 100,
      incrementPerDay = 5,
      sendWindowStart = 9,
      sendWindowEnd = 17,
      timezone = "UTC",
      excludeWeekends = true,
    } = req.body;

    const totalStages = Math.ceil((targetDailyLimit - initialDailyLimit) / incrementPerDay);

    const [schedule] = await db
      .insert(mailboxWarmupSchedules)
      .values({
        mailboxId: req.params.mailboxId,
        startDate: new Date(),
        initialDailyLimit,
        targetDailyLimit,
        incrementPerDay,
        totalStages,
        sendWindowStart,
        sendWindowEnd,
        timezone,
        excludeWeekends,
        isActive: true,
      })
      .returning();

    await db
      .update(emailMailboxes)
      .set({ status: "warming", dailyLimit: initialDailyLimit })
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    res.status(201).json(schedule);
  } catch (error) {
    console.error("Error creating warmup schedule:", error);
    res.status(500).json({ error: "Failed to create warmup schedule" });
  }
});

router.patch("/mailbox-warmup/:mailboxId", authenticate, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    if (!mailbox || mailbox.userId !== userId) {
      return res.status(404).json({ error: "Mailbox not found" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'targetDailyLimit', 'incrementPerDay', 'sendWindowStart', 
      'sendWindowEnd', 'timezone', 'excludeWeekends', 'isActive'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.isActive === false) {
      updateData.pausedAt = new Date();
    }

    const [schedule] = await db
      .update(mailboxWarmupSchedules)
      .set(updateData)
      .where(eq(mailboxWarmupSchedules.mailboxId, req.params.mailboxId))
      .returning();

    res.json(schedule);
  } catch (error) {
    console.error("Error updating warmup schedule:", error);
    res.status(500).json({ error: "Failed to update warmup schedule" });
  }
});

router.delete("/mailbox-warmup/:mailboxId", authenticate, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    if (!mailbox || mailbox.userId !== userId) {
      return res.status(404).json({ error: "Mailbox not found" });
    }

    await db
      .delete(mailboxWarmupSchedules)
      .where(eq(mailboxWarmupSchedules.mailboxId, req.params.mailboxId));

    await db
      .update(emailMailboxes)
      .set({ status: "active" })
      .where(eq(emailMailboxes.id, req.params.mailboxId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting warmup schedule:", error);
    res.status(500).json({ error: "Failed to delete warmup schedule" });
  }
});

export default router;
