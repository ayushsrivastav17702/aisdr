import { Router } from "express";
import { mailboxService } from "./services/mailbox.service";
import { emailSendingService } from "./services/email-sending.service";
import { emailQueueService } from "./services/email-queue.service";
import { insertEmailMailboxSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

router.get("/mailboxes", async (req, res) => {
  try {
    const mailboxes = await mailboxService.getAllMailboxes();
    
    const sanitized = mailboxes.map(m => ({
      ...m,
      smtpPassword: m.smtpPassword ? "***" : null,
      apiKey: m.apiKey ? "***" : null,
      refreshToken: m.refreshToken ? "***" : null,
      accessToken: m.accessToken ? "***" : null,
    }));
    
    res.json(sanitized);
  } catch (error) {
    console.error("Get mailboxes error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get mailboxes" });
  }
});

router.get("/mailboxes/:id", async (req, res) => {
  try {
    const mailbox = await mailboxService.getMailboxById(req.params.id);
    
    if (!mailbox) {
      return res.status(404).json({ error: "Mailbox not found" });
    }
    
    const sanitized = {
      ...mailbox,
      smtpPassword: mailbox.smtpPassword ? "***" : null,
      apiKey: mailbox.apiKey ? "***" : null,
      refreshToken: mailbox.refreshToken ? "***" : null,
      accessToken: mailbox.accessToken ? "***" : null,
    };
    
    res.json(sanitized);
  } catch (error) {
    console.error("Get mailbox error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get mailbox" });
  }
});

router.post("/mailboxes", async (req, res) => {
  try {
    const mailboxData = insertEmailMailboxSchema.parse(req.body);
    const { name, email, provider, smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, apiKey } = mailboxData;
    const mailbox = await mailboxService.addMailbox({
      name,
      email,
      provider,
      smtpHost: smtpHost || undefined,
      smtpPort: smtpPort || undefined,
      smtpUser: smtpUser || undefined,
      smtpPassword: smtpPassword || undefined,
      smtpSecure: smtpSecure || undefined,
      apiKey: apiKey || undefined,
    });
    
    const sanitized = {
      ...mailbox,
      smtpPassword: mailbox.smtpPassword ? "***" : null,
      apiKey: mailbox.apiKey ? "***" : null,
      refreshToken: mailbox.refreshToken ? "***" : null,
      accessToken: mailbox.accessToken ? "***" : null,
    };
    
    res.json(sanitized);
  } catch (error) {
    console.error("Create mailbox error:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create mailbox" });
  }
});

router.put("/mailboxes/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!["active", "paused", "error", "warming"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    await mailboxService.updateStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    console.error("Update mailbox status error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update status" });
  }
});

router.delete("/mailboxes/:id", async (req, res) => {
  try {
    await mailboxService.deleteMailbox(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete mailbox error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete mailbox" });
  }
});

router.post("/mailboxes/:id/test", async (req, res) => {
  try {
    const success = await emailSendingService.testMailbox(req.params.id);
    res.json({ success });
  } catch (error) {
    console.error("Test mailbox error:", error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : "Test failed" 
    });
  }
});

router.post("/mailboxes/:id/set-default", async (req, res) => {
  try {
    await mailboxService.setDefaultMailbox(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Set default mailbox error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to set default mailbox";
    
    if (errorMessage.includes("not found") || errorMessage.includes("no longer exists")) {
      return res.status(404).json({ error: errorMessage });
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

router.get("/email-queue/stats", async (req, res) => {
  try {
    const stats = await emailQueueService.getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error("Get queue stats error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get stats" });
  }
});

router.post("/email-queue/process", async (req, res) => {
  try {
    await emailQueueService.processPendingEmails();
    res.json({ success: true });
  } catch (error) {
    console.error("Process queue error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to process queue" });
  }
});

router.post("/email-queue/:id/cancel", async (req, res) => {
  try {
    await emailQueueService.cancelEmail(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Cancel email error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to cancel email" });
  }
});

export default router;
