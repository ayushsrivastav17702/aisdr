import { Router } from "express";
import { storage } from "./storage";
import { generatePersonalizedEmail, type LinkedInData } from "./services/personalization.service";
import { z } from "zod";

const router = Router();

// Get all sequences
router.get("/sequences", async (req, res) => {
  try {
    const sequences = await storage.getSequences();
    res.json(sequences);
  } catch (error) {
    console.error("Error fetching sequences:", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

// Get single sequence with steps
router.get("/sequences/:id", async (req, res) => {
  try {
    const sequence = await storage.getSequence(req.params.id);
    
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    const steps = await storage.getSequenceSteps(req.params.id);
    
    res.json({ ...sequence, steps });
  } catch (error) {
    console.error("Error fetching sequence:", error);
    res.status(500).json({ error: "Failed to fetch sequence" });
  }
});

// Create sequence
router.post("/sequences", async (req, res) => {
  try {
    const { name, description, type } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Sequence name is required" });
    }
    
    const sequence = await storage.createSequence({
      name,
      description: description || null,
      type: type || "outbound",
      status: "draft",
      aiPersonalizationEnabled: false,
      totalProspects: 0,
      activeProspects: 0,
      completedProspects: 0,
      settings: null,
    });
    
    res.json(sequence);
  } catch (error) {
    console.error("Error creating sequence:", error);
    res.status(500).json({ error: "Failed to create sequence" });
  }
});

// Update sequence
router.put("/sequences/:id", async (req, res) => {
  try {
    const sequence = await storage.updateSequence(req.params.id, req.body);
    res.json(sequence);
  } catch (error) {
    console.error("Error updating sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Add step to sequence
router.post("/sequences/:id/steps", async (req, res) => {
  try {
    const { subject, body, stepOrder, delayDays } = req.body;
    
    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and body are required" });
    }
    
    const step = await storage.createSequenceStep({
      sequenceId: req.params.id,
      subject,
      body,
      stepOrder: stepOrder || 1,
      delayDays: delayDays || 0,
      stepType: "email",
      aiGenerated: false,
      variables: null,
    });
    
    res.json(step);
  } catch (error) {
    console.error("Error adding step:", error);
    res.status(500).json({ error: "Failed to add step" });
  }
});

// Get prospects in sequence
router.get("/sequences/:id/prospects", async (req, res) => {
  try {
    const prospects = await storage.getSequenceProspects(req.params.id);
    res.json({ total: prospects.length, prospects });
  } catch (error) {
    console.error("Error fetching sequence prospects:", error);
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

// Add prospects to sequence
router.post("/sequences/:id/prospects", async (req, res) => {
  try {
    const { prospectIds } = req.body;
    
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: "prospectIds array is required" });
    }
    
    const enrolled = await storage.enrollProspects(req.params.id, prospectIds);
    
    const sequence = await storage.getSequence(req.params.id);
    if (sequence) {
      await storage.updateSequence(req.params.id, {
        totalProspects: (sequence.totalProspects || 0) + enrolled.length,
        activeProspects: (sequence.activeProspects || 0) + enrolled.length,
      });
    }
    
    res.json({ message: `${enrolled.length} prospects enrolled`, enrolled });
  } catch (error) {
    console.error("Error enrolling prospects:", error);
    res.status(500).json({ error: "Failed to enroll prospects" });
  }
});

// Get email replies for sequence
router.get("/sequences/:id/replies", async (req, res) => {
  try {
    const replies = await storage.getEmailReplies(req.params.id);
    
    const total = replies.length;
    const responseRate = 0;
    const latestReply = replies[0] 
      ? `${replies[0].prospect?.firstName || ""} ${replies[0].prospect?.lastName || ""}`.trim()
      : null;
    
    res.json({ 
      total, 
      responseRate,
      latestReply,
      replies 
    });
  } catch (error) {
    console.error("Error fetching replies:", error);
    res.status(500).json({ error: "Failed to fetch replies" });
  }
});

// Get tracking stats for sequence
router.get("/sequences/:id/tracking", async (req, res) => {
  try {
    res.json({
      sent: 0,
      delivered: 0,
      opened: 0,
      replied: 0,
      deliveryRate: 0,
      openRate: 0,
      replyRate: 0,
    });
  } catch (error) {
    console.error("Error fetching tracking:", error);
    res.status(500).json({ error: "Failed to fetch tracking stats" });
  }
});

// Manual LinkedIn personalization
router.post("/personalization/manual-linkedin", async (req, res) => {
  try {
    const { prospectId, linkedInData } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    if (!linkedInData) {
      return res.status(400).json({ error: "linkedInData is required" });
    }
    
    const result = await generatePersonalizedEmail(prospectId, linkedInData as LinkedInData);
    
    res.json({
      message: "Personalization complete",
      ...result,
    });
  } catch (error) {
    console.error("Personalization error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate personalization" 
    });
  }
});

// Webhook: Email reply
router.post("/webhooks/email-reply", async (req, res) => {
  try {
    const { emailId, prospectId, from, body, receivedAt } = req.body;
    
    if (!emailId || !prospectId || !body) {
      return res.status(400).json({ error: "emailId, prospectId, and body are required" });
    }
    
    await storage.createEmailReply({
      emailId,
      prospectId,
      replyContent: body,
      sentiment: "neutral",
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      aiSummary: null,
      nextAction: null,
    });
    
    res.json({ message: "Reply processed successfully" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Failed to process reply" });
  }
});

// Webhook: Email opened
router.post("/webhooks/email-opened", async (req, res) => {
  try {
    const { trackingId, timestamp } = req.body;
    res.json({ message: "Email open recorded" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Failed to process email open" });
  }
});

export default router;
