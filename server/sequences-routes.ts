import { Router } from "express";
import { storage, type RequestContext } from "./storage";
import { generatePersonalizedEmail, type LinkedInData } from "./services/personalization.service";
import { emailQueueService } from "./services/email-queue.service";
import { db } from "./db";
import { sequenceProspects, emailReplies, emailQueue, emails, prospects } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { authenticate } from "./middleware/auth.middleware";

const router = Router();

// Helper function to initialize sequence when activated
async function initializeSequence(userContext: RequestContext, sequenceId: string): Promise<void> {
  try {
    console.log(`🚀 Initializing sequence ${sequenceId}...`);
    
    // Get all enrolled prospects
    const enrolledProspects = await storage.getSequenceProspects(userContext, sequenceId);
    console.log(`  Found ${enrolledProspects.length} enrolled prospects`);
    
    if (enrolledProspects.length === 0) {
      console.log(`  ⚠️ No prospects enrolled, skipping initialization`);
      return;
    }
    
    // Get sequence steps
    const steps = await storage.getSequenceSteps(userContext, sequenceId);
    console.log(`  Found ${steps.length} sequence steps`);
    
    if (steps.length === 0) {
      console.log(`  ⚠️ No steps found, skipping initialization`);
      return;
    }
    
    // Sort steps by order and get first step
    const sortedSteps = steps.sort((a, b) => a.stepOrder - b.stepOrder);
    const firstStep = sortedSteps[0];
    console.log(`  First step: ${firstStep.subject} (ID: ${firstStep.id})`);
    
    // Initialize each prospect
    for (const enrolledProspect of enrolledProspects) {
      // Set current step if not already set
      if (!enrolledProspect.currentStepId) {
        await db
          .update(sequenceProspects)
          .set({ currentStepId: firstStep.id })
          .where(eq(sequenceProspects.id, enrolledProspect.id));
        console.log(`  📌 Set current step for prospect ${enrolledProspect.prospectId}`);
      }
      
      // Calculate scheduled time based on delay
      const scheduledFor = new Date();
      if (firstStep.delayDays && firstStep.delayDays > 0) {
        scheduledFor.setDate(scheduledFor.getDate() + firstStep.delayDays);
      }
      
      // Always add email to queue (idempotent - won't duplicate if already exists)
      await emailQueueService.addToQueue({
        sequenceId,
        prospectId: enrolledProspect.prospectId,
        subject: firstStep.subject,
        body: firstStep.body,
        scheduledFor,
        priority: 5,
        userId: userContext.userId, // Pass userId for user-scoped mailbox selection
      });
      
      console.log(`  ✅ Added email to queue for prospect ${enrolledProspect.prospectId}`);
    }
    
    console.log(`🎉 Sequence ${sequenceId} initialized successfully!`);
  } catch (error) {
    console.error(`❌ Failed to initialize sequence ${sequenceId}:`, error);
    throw error;
  }
}

// Get all sequences
router.get("/sequences", authenticate, async (req, res) => {
  try {
    const sequences = await storage.getSequences(req.userContext!);
    
    // Enhance each sequence with tracking stats
    const sequencesWithStats = await Promise.all(
      sequences.map(async (sequence) => {
        const emails = await storage.getSequenceEmails(req.userContext!, sequence.id);
        
        const sentCount = emails.filter(e => e.sentAt).length;
        const openedCount = emails.filter(e => e.openedAt).length;
        const repliedCount = emails.filter(e => e.repliedAt).length;
        
        return {
          ...sequence,
          sentCount,
          openedCount,
          repliedCount,
        };
      })
    );
    
    res.json(sequencesWithStats);
  } catch (error) {
    console.error("Error fetching sequences:", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

// Get single sequence with steps
router.get("/sequences/:id", authenticate, async (req, res) => {
  try {
    const sequence = await storage.getSequence(req.userContext!, req.params.id);
    
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    const [steps, emails] = await Promise.all([
      storage.getSequenceSteps(req.userContext!, req.params.id),
      storage.getSequenceEmails(req.userContext!, req.params.id)
    ]);
    
    // Add tracking stats
    const sentCount = emails.filter(e => e.sentAt).length;
    const openedCount = emails.filter(e => e.openedAt).length;
    const repliedCount = emails.filter(e => e.repliedAt).length;
    
    res.json({ 
      ...sequence, 
      steps,
      sentCount,
      openedCount,
      repliedCount,
    });
  } catch (error) {
    console.error("Error fetching sequence:", error);
    res.status(500).json({ error: "Failed to fetch sequence" });
  }
});

// Create sequence
router.post("/sequences", authenticate, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Sequence name is required" });
    }
    
    const sequence = await storage.createSequence(req.userContext!, {
      userId: req.userContext!.userId,
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

// Generate sequence with AI
router.post("/sequences/generate-with-ai", authenticate, async (req, res) => {
  try {
    const { prompt, name, method } = req.body;
    
    if (!prompt || !name) {
      return res.status(400).json({ error: "Prompt and name are required" });
    }
    
    // Import AI service dynamically to avoid circular dependencies
    const { aiService } = await import("./services/ai.service");
    
    // Generate email sequence using AI
    const generatedSequence = await aiService.generateEmailSequence({
      prompt,
      method: method || 'ai', // 'ai' for single email, 'auto-ai' for multi-step
    });
    
    // Create the sequence
    const sequence = await storage.createSequence(req.userContext!, {
      userId: req.userContext!.userId,
      name,
      description: generatedSequence.description || `Generated with AI: ${prompt}`,
      type: "outbound",
      status: "draft",
      aiPersonalizationEnabled: true,
      totalProspects: 0,
      activeProspects: 0,
      completedProspects: 0,
      settings: null,
    });
    
    // Add generated steps to the sequence
    for (let i = 0; i < generatedSequence.steps.length; i++) {
      const step = generatedSequence.steps[i];
      await storage.createSequenceStep(req.userContext!, {
        sequenceId: sequence.id,
        subject: step.subject,
        body: step.body,
        stepOrder: i + 1,
        delayDays: step.delayDays || 0,
        stepType: "email",
        aiGenerated: true,
        variables: null,
      });
    }
    
    res.json({ sequence, steps: generatedSequence.steps });
  } catch (error) {
    console.error("Error generating sequence with AI:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate sequence" });
  }
});

// Update sequence
router.put("/sequences/:id", authenticate, async (req, res) => {
  try {
    const sequence = await storage.updateSequence(req.userContext!, req.params.id, req.body);
    
    // If status changed to active, initialize the sequence
    if (req.body.status === "active") {
      await initializeSequence(req.userContext!, req.params.id);
    }
    
    res.json(sequence);
  } catch (error) {
    console.error("Error updating sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Update sequence (PATCH)
router.patch("/sequences/:id", authenticate, async (req, res) => {
  try {
    const sequence = await storage.updateSequence(req.userContext!, req.params.id, req.body);
    
    // If status changed to active, initialize the sequence
    if (req.body.status === "active") {
      await initializeSequence(req.userContext!, req.params.id);
    }
    
    res.json(sequence);
  } catch (error) {
    console.error("Error updating sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Delete sequence
router.delete("/sequences/:id", authenticate, async (req, res) => {
  try {
    await storage.deleteSequence(req.userContext!, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting sequence:", error);
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});

// Add step to sequence
router.post("/sequences/:id/steps", authenticate, async (req, res) => {
  try {
    const { subject, body, stepOrder, delayDays } = req.body;
    
    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and body are required" });
    }
    
    const step = await storage.createSequenceStep(req.userContext!, {
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

// Delete sequence step
router.delete("/sequences/:id/steps/:stepId", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const stepId = req.params.stepId;
    
    // Fetch all steps for this sequence
    const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
    
    // Verify the step belongs to this sequence
    const stepExists = steps.find(step => step.id === stepId);
    
    if (!stepExists) {
      return res.status(404).json({ 
        error: "Step not found or does not belong to this sequence" 
      });
    }
    
    // Delete the step
    await storage.deleteSequenceStep(req.userContext!, stepId);
    res.json({ success: true, message: "Step deleted successfully" });
  } catch (error) {
    console.error("Error deleting step:", error);
    res.status(500).json({ error: "Failed to delete step" });
  }
});

// Get prospects in sequence
router.get("/sequences/:id/prospects", authenticate, async (req, res) => {
  try {
    const prospects = await storage.getSequenceProspects(req.userContext!, req.params.id);
    res.json({ total: prospects.length, prospects });
  } catch (error) {
    console.error("Error fetching sequence prospects:", error);
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

// Add prospects to sequence
router.post("/sequences/:id/prospects", authenticate, async (req, res) => {
  try {
    const { prospectIds } = req.body;
    
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: "prospectIds array is required" });
    }
    
    const enrolled = await storage.enrollProspects(req.userContext!, req.params.id, prospectIds);
    
    const sequence = await storage.getSequence(req.userContext!, req.params.id);
    if (sequence) {
      await storage.updateSequence(req.userContext!, req.params.id, {
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
router.get("/sequences/:id/replies", authenticate, async (req, res) => {
  try {
    const replies = await storage.getEmailReplies(req.userContext!, req.params.id);
    
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
router.get("/sequences/:id/tracking", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Get all emails for this sequence
    const emails = await storage.getSequenceEmails(req.userContext!, sequenceId);
    
    // Calculate stats
    const sent = emails.filter(e => e.sentAt).length;
    const delivered = emails.filter(e => e.deliveredAt).length;
    const opened = emails.filter(e => e.openedAt).length;
    const replied = emails.filter(e => e.repliedAt).length;
    
    const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
    const openRate = delivered > 0 ? Math.round((opened / delivered) * 100) : 0;
    const replyRate = delivered > 0 ? Math.round((replied / delivered) * 100) : 0;
    
    res.json({
      sent,
      delivered,
      opened,
      replied,
      deliveryRate,
      openRate,
      replyRate,
    });
  } catch (error) {
    console.error("Error fetching tracking:", error);
    res.status(500).json({ error: "Failed to fetch tracking stats" });
  }
});

// Get emails for sequence (for analytics/tracking tab)
router.get("/sequences/:id/emails", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Get all emails for this sequence
    const sequenceEmails = await db
      .select()
      .from(emails)
      .where(eq(emails.sequenceId, sequenceId));
    
    res.json(sequenceEmails);
  } catch (error) {
    console.error("Error fetching sequence emails:", error);
    res.status(500).json({ error: "Failed to fetch sequence emails" });
  }
});

// Manual LinkedIn personalization
router.post("/personalization/manual-linkedin", authenticate, async (req, res) => {
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
// TODO: Webhooks need special authentication (API key, webhook secret, etc.)
// For now, using authenticate middleware which might need adjustment for webhook providers
router.post("/webhooks/email-reply", authenticate, async (req, res) => {
  try {
    const { emailId, prospectId, from, body, receivedAt } = req.body;
    
    if (!emailId || !prospectId || !body) {
      return res.status(400).json({ error: "emailId, prospectId, and body are required" });
    }
    
    await storage.createEmailReply(req.userContext!, {
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

// AI Email Generation
router.post("/sequences/ai-generate-email", authenticate, async (req, res) => {
  try {
    const { emailGenerationService } = await import("./services/ai-email-generator.service");
    const { prospectId, emailType, sequenceStep, previousEmails, tone, sequenceId } = req.body;
    
    if (!prospectId || !emailType) {
      return res.status(400).json({ error: "prospectId and emailType are required" });
    }
    
    // Fetch previous steps from sequence if sequenceId is provided
    let enrichedPreviousEmails = previousEmails || [];
    if (sequenceId && !previousEmails) {
      try {
        const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
        if (steps && steps.length > 0) {
          // Get all steps except the current one being written
          const previousSteps = sequenceStep 
            ? steps.slice(0, sequenceStep - 1) 
            : steps;
          
          enrichedPreviousEmails = previousSteps.map((step, index) => 
            `Step ${index + 1} - Subject: ${step.subject}\n\nBody:\n${step.body}`
          );
          
          console.log(`📧 Loaded ${enrichedPreviousEmails.length} previous steps from sequence for context`);
        }
      } catch (error) {
        console.error("Error fetching previous steps:", error);
        // Continue without previous steps if fetch fails
      }
    }
    
    const result = await emailGenerationService.generateWithRetry({
      prospectId,
      emailType,
      sequenceStep,
      previousEmails: enrichedPreviousEmails,
      tone
    });
    
    res.json(result);
  } catch (error) {
    console.error("AI email generation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate email" 
    });
  }
});

// Generate Email Variants (A/B Testing)
router.post("/sequences/ai-generate-variants", authenticate, async (req, res) => {
  try {
    const { generateEmailVariants } = await import("./services/ai-email-generator.service");
    const { prospectId, emailType, variantCount } = req.body;
    
    if (!prospectId || !emailType) {
      return res.status(400).json({ error: "prospectId and emailType are required" });
    }
    
    const variants = await generateEmailVariants(
      { prospectId, emailType },
      variantCount || 2
    );
    
    res.json({ variants });
  } catch (error) {
    console.error("Variant generation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate variants" 
    });
  }
});

// Enhanced Personalization
router.post("/sequences/enhanced-personalization", authenticate, async (req, res) => {
  try {
    const { generateEnhancedPersonalizedEmail } = await import("./services/enhanced-personalization.service");
    const { prospectId, includeLinkedInData, customPrompt, emailSettings, sequenceId, sequenceStep } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    // Fetch previous steps from sequence if sequenceId is provided
    let previousStepsContext = '';
    if (sequenceId) {
      try {
        const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
        if (steps && steps.length > 0) {
          const previousSteps = sequenceStep 
            ? steps.slice(0, sequenceStep - 1) 
            : steps;
          
          if (previousSteps.length > 0) {
            previousStepsContext = `\n\nPREVIOUS EMAILS IN THIS SEQUENCE:\n` +
              previousSteps.map((step, index) => 
                `Email ${index + 1}:\nSubject: ${step.subject}\n${step.body}`
              ).join('\n\n---\n\n');
            
            console.log(`📧 Loaded ${previousSteps.length} previous steps for enhanced personalization`);
          }
        }
      } catch (error) {
        console.error("Error fetching previous steps:", error);
      }
    }
    
    const result = await generateEnhancedPersonalizedEmail({
      prospectId,
      includeLinkedInData,
      customPrompt: previousStepsContext ? `${customPrompt || ''}\n${previousStepsContext}` : customPrompt,
      emailSettings
    });
    
    res.json(result);
  } catch (error) {
    console.error("Enhanced personalization error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate personalized email" 
    });
  }
});

// Analyze Email Response
router.post("/sequences/analyze-response", authenticate, async (req, res) => {
  try {
    const { analyzeEmailResponse } = await import("./services/enhanced-personalization.service");
    const { originalEmail, prospectResponse, prospectId } = req.body;
    
    if (!originalEmail || !prospectResponse || !prospectId) {
      return res.status(400).json({ error: "originalEmail, prospectResponse, and prospectId are required" });
    }
    
    const analysis = await analyzeEmailResponse(originalEmail, prospectResponse, prospectId);
    
    res.json(analysis);
  } catch (error) {
    console.error("Response analysis error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to analyze response" 
    });
  }
});

// Generate Follow-up Preview
router.post("/sequences/followup-preview", async (req, res) => {
  try {
    const { aiFollowUpScheduler } = await import("./services/ai-followup-scheduler.service");
    const { prospectId, emailHistory, followUpType, followUpNumber } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    // Build proper email history array
    let emailHistoryArray: string[] = [];
    
    if (Array.isArray(emailHistory) && emailHistory.length > 0) {
      // Use provided array directly
      emailHistoryArray = emailHistory;
    } else if (typeof emailHistory === 'string' && emailHistory.trim() !== "") {
      // Treat single string as one entry (don't split - could be malformed)
      emailHistoryArray = [emailHistory.trim()];
    } else {
      // Fetch from database
      const [latestReply] = await db
        .select()
        .from(emailReplies)
        .where(eq(emailReplies.prospectId, prospectId))
        .orderBy(sql`${emailReplies.receivedAt} DESC`)
        .limit(1);
      
      const replyContent = latestReply?.replyContent || "";
      
      // Get the sent email for context
      const [sentEmail] = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.prospectId, prospectId),
            eq(emailQueue.status, "sent")
          )
        )
        .orderBy(sql`${emailQueue.scheduledFor} DESC`)
        .limit(1);
      
      // Build proper array with original email and reply
      if (sentEmail?.subject && sentEmail?.body) {
        emailHistoryArray.push(`Subject: ${sentEmail.subject}\n\n${sentEmail.body}`);
      }
      if (replyContent) {
        emailHistoryArray.push(`Prospect replied: ${replyContent}`);
      }
    }
    
    const preview = await aiFollowUpScheduler.generateFollowUpEmailPreview(
      prospectId,
      emailHistoryArray,
      followUpType || "gentle_reminder",
      followUpNumber || 1
    );
    
    res.json(preview);
  } catch (error) {
    console.error("Follow-up preview error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate follow-up preview" 
    });
  }
});

// AI Email Generation - Main endpoint
router.post("/sequences/ai-generate-email", async (req, res) => {
  try {
    const { generateEmail } = await import("./services/ai-email-generator.service");
    const { prospectId, emailType, sequenceStep, tone } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    const request = {
      prospectId,
      emailType: emailType || 'cold_outreach',
      sequenceStep: sequenceStep || 1,
      tone: tone || 'professional',
    };
    
    const result = await generateEmail(request);
    
    res.json(result);
  } catch (error) {
    console.error("AI email generation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate email" 
    });
  }
});

// AI Email Variants - A/B testing
router.post("/sequences/ai-generate-variants", async (req, res) => {
  try {
    const { generateEmailVariants } = await import("./services/ai-email-generator.service");
    const { prospectId, emailType, sequenceStep, variantCount } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    const request = {
      prospectId,
      emailType: emailType || 'cold_outreach',
      sequenceStep: sequenceStep || 1,
      tone: 'professional' as const,
    };
    
    const variants = await generateEmailVariants(request, variantCount || 2);
    
    res.json({ variants });
  } catch (error) {
    console.error("AI variant generation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate variants" 
    });
  }
});

// Enhanced Personalization - Deep research
router.post("/sequences/enhanced-personalization", async (req, res) => {
  try {
    const { generateEnhancedPersonalizedEmail } = await import("./services/enhanced-personalization.service");
    const { prospectId } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    const result = await generateEnhancedPersonalizedEmail({
      prospectId,
      includeLinkedInData: true,
    });
    
    res.json(result);
  } catch (error) {
    console.error("Enhanced personalization error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to enhance personalization" 
    });
  }
});

// AI Follow-up Preview by Prospect ID
router.get("/sequences/ai-followup-preview/:prospectId", async (req, res) => {
  try {
    const { aiFollowUpScheduler } = await import("./services/ai-followup-scheduler.service");
    const { prospectId } = req.params;
    
    // Get the actual reply content for this prospect
    const [latestReply] = await db
      .select()
      .from(emailReplies)
      .where(eq(emailReplies.prospectId, prospectId))
      .orderBy(sql`${emailReplies.receivedAt} DESC`)
      .limit(1);
    
    const replyContent = latestReply?.replyContent || "";
    
    // Get the sent email for context
    const [sentEmail] = await db
      .select()
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.prospectId, prospectId),
          eq(emailQueue.status, "sent")
        )
      )
      .orderBy(sql`${emailQueue.scheduledFor} DESC`)
      .limit(1);
    
    // Build proper array with original email and reply
    const emailHistoryArray: string[] = [];
    if (sentEmail?.subject && sentEmail?.body) {
      emailHistoryArray.push(`Subject: ${sentEmail.subject}\n\n${sentEmail.body}`);
    }
    if (replyContent) {
      emailHistoryArray.push(`Prospect replied: ${replyContent}`);
    }
    
    const preview = await aiFollowUpScheduler.generateFollowUpEmailPreview(
      prospectId,
      emailHistoryArray,
      "gentle_reminder",
      1
    );
    
    res.json(preview);
  } catch (error) {
    console.error("Follow-up preview error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate follow-up preview" 
    });
  }
});

// Send reply to prospect
router.post("/sequences/send-reply", async (req, res) => {
  try {
    const { prospectId, sequenceId, subject, body } = req.body;
    
    if (!prospectId || !subject || !body) {
      return res.status(400).json({ error: "prospectId, subject, and body are required" });
    }
    
    // Get the most recent email to this prospect in this sequence for threading
    let inReplyTo: string | undefined;
    let references: string | undefined;
    
    if (sequenceId) {
      const [previousEmail] = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.prospectId, prospectId),
            eq(emails.sequenceId, sequenceId),
            sql`${emails.messageId} IS NOT NULL`
          )
        )
        .orderBy(sql`${emails.sentAt} DESC`)
        .limit(1);
      
      if (previousEmail?.messageId) {
        inReplyTo = previousEmail.messageId;
        // References should be the entire thread history
        references = previousEmail.messageId;
        console.log(`🔗 Threading reply - In-Reply-To: ${inReplyTo}`);
      }
    }
    
    // Ensure userId is available (should always be present via authenticate middleware)
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Add to email queue with immediate sending (scheduled for now)
    const queueItem = await emailQueueService.addToQueue({
      prospectId,
      sequenceId: sequenceId || null,
      subject,
      body,
      scheduledFor: new Date(), // Send immediately
      priority: 1, // High priority
      inReplyTo,
      references,
      userId: req.userContext.userId, // Pass userId for user-scoped mailbox selection
    });
    
    console.log(`📧 Reply queued for sending: ${queueItem.id}`);
    
    res.json({ 
      success: true, 
      queueId: queueItem.id,
      message: "Reply queued for sending"
    });
  } catch (error) {
    console.error("Send reply error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to send reply" 
    });
  }
});

export default router;
