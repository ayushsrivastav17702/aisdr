import { Router } from "express";
import { db } from "../db";
import { 
  emailDeliverabilitySettings,
  doNotContactList,
  suppressionListImports,
  emailFooterCompliance,
  users
} from "@shared/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { parse } from "csv-parse/sync";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================
// EMAIL DELIVERABILITY SETTINGS (FR-A19)
// ============================================

router.get("/deliverability-settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    let [settings] = await db
      .select()
      .from(emailDeliverabilitySettings)
      .where(eq(emailDeliverabilitySettings.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(emailDeliverabilitySettings)
        .values({ organizationId })
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching deliverability settings:", error);
    res.status(500).json({ error: "Failed to fetch deliverability settings" });
  }
});

router.patch("/deliverability-settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'globalDailyLimit', 'globalHourlyLimit', 'perProspectMaxEmails', 'minTimeBetweenEmailsHours',
      'hardBounceAction', 'softBounceRetries', 'softBounceAction', 'bounceThresholdPercent',
      'unsubscribePageUrl', 'unsubscribePageLogo', 'unsubscribePageMessage', 'unsubscribeConfirmationEmail',
      'companySignature', 'signatureIncludeAddress', 'signatureIncludePhone', 'signatureIncludeWebsite', 'signatureIncludeSocial',
      'trackOpens', 'trackClicks', 'customTrackingDomain', 'pixelPlacement',
      'linkTrackingEnabled', 'excludeLinksFromTracking',
      'spamComplaintThreshold', 'spamAlertEmails',
      'blacklistMonitoringEnabled', 'blacklistAlertEmails', 'monitoredBlacklists'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    let [settings] = await db
      .select()
      .from(emailDeliverabilitySettings)
      .where(eq(emailDeliverabilitySettings.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(emailDeliverabilitySettings)
        .values({ organizationId, ...updateData })
        .returning();
    } else {
      [settings] = await db
        .update(emailDeliverabilitySettings)
        .set(updateData)
        .where(eq(emailDeliverabilitySettings.organizationId, organizationId))
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error updating deliverability settings:", error);
    res.status(500).json({ error: "Failed to update deliverability settings" });
  }
});

// ============================================
// COMPLIANCE - DO NOT CONTACT LIST
// ============================================

router.get("/do-not-contact", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { search, reason, limit = "100", offset = "0" } = req.query;

    const conditions = [eq(doNotContactList.organizationId, organizationId)];

    if (search) {
      conditions.push(or(
        ilike(doNotContactList.email, `%${search}%`),
        ilike(doNotContactList.domain, `%${search}%`)
      )!);
    }

    if (reason) {
      conditions.push(eq(doNotContactList.reason, reason as string));
    }

    const entries = await db
      .select()
      .from(doNotContactList)
      .where(and(...conditions))
      .orderBy(desc(doNotContactList.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(doNotContactList)
      .where(eq(doNotContactList.organizationId, organizationId));

    res.json({
      entries,
      total: countResult?.count || 0,
    });
  } catch (error) {
    console.error("Error fetching do not contact list:", error);
    res.status(500).json({ error: "Failed to fetch do not contact list" });
  }
});

router.post("/do-not-contact", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { email, domain, phone, reason, notes, expiresAt } = req.body;

    if (!email && !domain && !phone) {
      return res.status(400).json({ error: "At least one contact method (email, domain, or phone) is required" });
    }

    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const [entry] = await db
      .insert(doNotContactList)
      .values({
        organizationId,
        email,
        domain,
        phone,
        reason,
        source: "manual",
        notes,
        addedBy: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    res.status(201).json(entry);
  } catch (error) {
    console.error("Error adding to do not contact list:", error);
    res.status(500).json({ error: "Failed to add to do not contact list" });
  }
});

router.delete("/do-not-contact/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [deleted] = await db
      .delete(doNotContactList)
      .where(and(
        eq(doNotContactList.id, req.params.id),
        eq(doNotContactList.organizationId, organizationId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting from do not contact list:", error);
    res.status(500).json({ error: "Failed to delete from do not contact list" });
  }
});

router.post("/do-not-contact/bulk", authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const { reason = "import" } = req.body;
    const content = req.file.buffer.toString('utf-8');

    let records: any[];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseError) {
      return res.status(400).json({ error: "Invalid CSV format" });
    }

    const [importRecord] = await db
      .insert(suppressionListImports)
      .values({
        organizationId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        recordCount: records.length,
        importedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        importedBy: userId,
        status: "processing",
      })
      .returning();

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const record of records) {
      try {
        const email = record.email || record.Email || record.EMAIL;
        const domain = record.domain || record.Domain || record.DOMAIN;

        if (!email && !domain) {
          errorCount++;
          continue;
        }

        const existingCheck = email
          ? await db.select().from(doNotContactList).where(
              and(eq(doNotContactList.organizationId, organizationId), eq(doNotContactList.email, email))
            )
          : await db.select().from(doNotContactList).where(
              and(eq(doNotContactList.organizationId, organizationId), eq(doNotContactList.domain, domain))
            );

        if (existingCheck.length > 0) {
          duplicateCount++;
          continue;
        }

        await db.insert(doNotContactList).values({
          organizationId,
          email,
          domain,
          reason,
          source: "import",
          addedBy: userId,
        });

        importedCount++;
      } catch (err) {
        errorCount++;
      }
    }

    await db.update(suppressionListImports).set({
      importedCount,
      duplicateCount,
      errorCount,
      status: "completed",
      completedAt: new Date(),
    }).where(eq(suppressionListImports.id, importRecord.id));

    res.json({
      success: true,
      importId: importRecord.id,
      stats: { total: records.length, imported: importedCount, duplicates: duplicateCount, errors: errorCount },
    });
  } catch (error) {
    console.error("Error bulk importing suppression list:", error);
    res.status(500).json({ error: "Failed to import suppression list" });
  }
});

router.get("/suppression-imports", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const imports = await db
      .select()
      .from(suppressionListImports)
      .where(eq(suppressionListImports.organizationId, organizationId))
      .orderBy(desc(suppressionListImports.createdAt))
      .limit(50);

    res.json({ imports });
  } catch (error) {
    console.error("Error fetching suppression imports:", error);
    res.status(500).json({ error: "Failed to fetch suppression imports" });
  }
});

// ============================================
// EMAIL FOOTER COMPLIANCE
// ============================================

router.get("/footer-compliance", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    let [settings] = await db
      .select()
      .from(emailFooterCompliance)
      .where(eq(emailFooterCompliance.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(emailFooterCompliance)
        .values({ organizationId })
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching footer compliance:", error);
    res.status(500).json({ error: "Failed to fetch footer compliance" });
  }
});

router.patch("/footer-compliance", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'physicalAddressRequired', 'physicalAddress',
      'unsubscribeLinkRequired', 'unsubscribeLinkText', 'unsubscribeLinkPlacement',
      'companyNameRequired', 'companyName',
      'includePrivacyLink', 'privacyPolicyUrl',
      'includeTermsLink', 'termsUrl',
      'customFooterHtml', 'customFooterEnabled'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    let [settings] = await db
      .select()
      .from(emailFooterCompliance)
      .where(eq(emailFooterCompliance.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(emailFooterCompliance)
        .values({ organizationId, ...updateData })
        .returning();
    } else {
      [settings] = await db
        .update(emailFooterCompliance)
        .set(updateData)
        .where(eq(emailFooterCompliance.organizationId, organizationId))
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error updating footer compliance:", error);
    res.status(500).json({ error: "Failed to update footer compliance" });
  }
});

export default router;
