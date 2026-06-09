import { Router } from "express";
import { storage, type RequestContext } from "./storage";
import { generatePersonalizedEmail, type LinkedInData } from "./services/personalization.service";
import { emailQueueService } from "./services/email-queue.service";
import { db } from "./db";
import { sequenceProspects, emailReplies, emailQueue, emails, prospects, personalizationResults, userActivityLogs, leadEvents, sequenceSteps, sequences } from "@shared/schema";
import { eq, and, sql, desc, asc, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { authenticate, forbidManager, blockSuperAdminFromSDR } from "./middleware/auth.middleware";
import { checkAutomationStatus, throttleOperation, incrementThrottle, trackUsage, checkUserPause, checkDailyEmailLimit, checkEnrollmentConcurrency } from "./middleware/throttle.middleware";
import { sdrWorkflowService, WorkflowBlockedError } from "./services/sdr-workflow.service";
import { hardeningService } from "./services/hardening.service";
import { aiTrackingService } from "./services/ai-tracking.service";
import { checkCredits, deductCredits } from "./services/credit.service";

// Helper to log user activity for audit trail (TC-SDR-AUDIT-01)
async function logActivity(
  userId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.insert(userActivityLogs).values({
      userId,
      action,
      targetType,
      targetId,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

const router = Router();

/**
 * FIX-2: Schedule within 9am–5pm local business hours, skipping weekends.
 * Uses Intl (no external deps) to work in prospect's IANA timezone.
 */
function getNextBusinessHour(delayDays: number, tz: string = 'UTC'): Date {
  const safeTz = (() => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; }
    catch { return 'UTC'; }
  })();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MS_PER_HOUR = 60 * 60 * 1000;
  const getLocalParts = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone: safeTz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d);
  const getHour = (d: Date): number =>
    parseInt(getLocalParts(d).find(p => p.type === 'hour')?.value ?? '12', 10);
  const getDow = (d: Date): string =>
    getLocalParts(d).find(p => p.type === 'weekday')?.value ?? 'Mon';
  const skipWeekend = (d: Date): Date => {
    let cur = d;
    while (getDow(cur) === 'Sat' || getDow(cur) === 'Sun')
      cur = new Date(cur.getTime() + MS_PER_DAY);
    return cur;
  };
  let target = skipWeekend(new Date(Date.now() + delayDays * MS_PER_DAY));
  const h = getHour(target);
  if (h < 9) target = new Date(target.getTime() + (9 - h) * MS_PER_HOUR);
  else if (h >= 17) {
    target = skipWeekend(new Date(target.getTime() + (24 - h + 9) * MS_PER_HOUR));
  }
  return target;
}

// Helper function to initialize sequence when activated
async function initializeSequence(userContext: RequestContext, sequenceId: string): Promise<void> {
  try {
    console.log(`🚀 Initializing sequence ${sequenceId}...`);
    
    // Get sequence details to check aiPersonalizationEnabled flag
    const sequence = await storage.getSequence(userContext, sequenceId);
    if (!sequence) {
      console.log(`  ❌ Sequence ${sequenceId} not found`);
      return;
    }
    const usePersonalization = sequence.aiPersonalizationEnabled === true;
    console.log(`  AI Personalization: ${usePersonalization ? 'enabled' : 'disabled'}`);
    
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
      
      // FIX-2: Calculate scheduled time using business-hours window in prospect's timezone
      const prospectRecord = await db.query.prospects.findFirst({
        where: eq(prospects.id, enrolledProspect.prospectId)
      });
      const prospectTimezone = (prospectRecord as any)?.timezone || 'UTC';
      const scheduledFor = getNextBusinessHour(firstStep.delayDays || 0, prospectTimezone);
      console.log(`  🕘 Scheduled first email at ${scheduledFor.toISOString()} (tz: ${prospectTimezone})`);
      
      // Start with template content
      let emailSubject = firstStep.subject;
      let emailBody = firstStep.body;
      
      // ALWAYS check for pre-generated personalized emails (from PersonalizationWizard)
      // These are explicitly created by the user, so we should always use them
      const allPersonalizations = await db.query.personalizationResults.findMany({
        where: and(
          eq(personalizationResults.prospectId, enrolledProspect.prospectId),
          eq(personalizationResults.userId, userContext.userId)
        ),
        orderBy: (pr, { desc }) => [desc(pr.createdAt)],
        limit: 10
      });
      
      // STRICT: Only use personalization that matches THIS specific sequence
      const matchingPersonalization = allPersonalizations.find(p => {
        const emailSuggestions = p.emailSuggestions as { sequenceId?: string } | null;
        return emailSuggestions?.sequenceId === sequenceId;
      });
      
      if (matchingPersonalization?.emailSuggestions) {
        const savedEmail = matchingPersonalization.emailSuggestions as { subject?: string; body?: string; generatedAt?: string; sequenceId?: string };
        
        if (savedEmail.subject && savedEmail.body) {
          emailSubject = savedEmail.subject;
          emailBody = savedEmail.body;
          console.log(`  ✨ Using pre-generated personalized email for prospect ${enrolledProspect.prospectId} (generated: ${savedEmail.generatedAt || 'unknown'})`);
        }
      } else if (usePersonalization) {
        // No pre-generated email found, and AI personalization is enabled
        // The aiPersonalizationEnabled flag controls ON-THE-FLY generation (done elsewhere)
        console.log(`  ℹ️ No pre-generated email found for prospect ${enrolledProspect.prospectId}, using template`);
      }
      
      // Add email to queue with personalized content (or template fallback)
      // CRITICAL: Include stepOrder for deduplication to prevent duplicate emails
      // Skip SafeToSend during initialization - it will be checked when email is processed/sent
      await emailQueueService.addToQueue({
        sequenceId,
        prospectId: enrolledProspect.prospectId,
        subject: emailSubject,
        body: emailBody,
        scheduledFor,
        priority: 5,
        userId: userContext.userId,
        stepOrder: firstStep.stepOrder, // Required for deduplication check
        skipSafeToSendCheck: true, // Check happens during send, not scheduling
      });
      
      console.log(`  ✅ Added email to queue for prospect ${enrolledProspect.prospectId}`);
    }
    
    console.log(`🎉 Sequence ${sequenceId} initialized successfully!`);
  } catch (error) {
    console.error(`❌ Failed to initialize sequence ${sequenceId}:`, error);
    throw error;
  }
}

// Get all sequences with pagination
router.get("/sequences", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const { page = '1', limit = '25', status } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50); // Cap at 50
    const offset = (pageNum - 1) * limitNum;
    
    const result = await storage.getSequences(req.userContext!, {
      limit: limitNum,
      offset,
      status: status as string | undefined,
    });
    
    // Enhance each sequence with tracking stats
    const sequencesWithStats = await Promise.all(
      result.sequences.map(async (sequence) => {
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
    
    res.json({
      sequences: sequencesWithStats,
      total: result.total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(result.total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching sequences:", error);
    res.status(500).json({ error: "Failed to fetch sequences" });
  }
});

// Get single sequence with steps
router.get("/sequences/:id", authenticate, blockSuperAdminFromSDR, async (req, res) => {
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

// Create sequence - workflow-gated
router.post("/sequences", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past sequence stage
    try {
      await sdrWorkflowService.assertStage(userId, "sequence");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot create sequences while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

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

    // Log activity for audit trail (TC-SDR-AUDIT-01)
    await logActivity(userId, "sequence.create", "sequence", sequence.id, { name, type: type || "outbound" });

    // Try to advance workflow stage after sequence creation
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
    res.json(sequence);
  } catch (error: any) {
    console.error("Error creating sequence:", error);
    if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(error?.message || '')) {
      return res.status(409).json({ error: "A sequence with this name already exists" });
    }
    res.status(500).json({ error: "Failed to create sequence" });
  }
});

// Generate sequence with AI - workflow-gated
router.post("/sequences/generate-with-ai", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past sequence stage
    try {
      await sdrWorkflowService.assertStage(userId, "sequence");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot generate sequences while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

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

    // Track AI usage for sequence generation
    await aiTrackingService.trackGeneration({
      userId,
      tenantId: organizationId,
      generationType: 'sequence_generation',
      model: 'multi-provider',
      provider: 'ai-service',
      promptTokens: 0,
      completionTokens: 0,
      success: true,
      metadata: {
        source: 'api_sequences_generate_with_ai',
        sequenceId: sequence.id,
        stepsGenerated: generatedSequence.steps.length,
        method: method || 'ai',
      },
    });

    // Try to advance workflow stage after sequence creation
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
    res.json({ sequence, steps: generatedSequence.steps });
  } catch (error: any) {
    console.error("Error generating sequence with AI:", error);
    if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(error?.message || '')) {
      return res.status(409).json({ error: "A sequence with this name already exists" });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate sequence" });
  }
});

// Pre-defined AI-optimized templates
// Note: Using {{variable|fallback}} syntax for proper fallback handling
const SEQUENCE_TEMPLATES = [
  {
    id: 'cold-outreach',
    name: 'Cold Outreach',
    description: 'Classic 4-step cold outreach sequence for new prospects',
    category: 'Sales',
    steps: [
      {
        subject: 'Quick question about {{companyName|your company}}',
        body: '<p>Hi {{firstName|there}},</p><p>I noticed {{companyName|your company}} is growing fast in the {{industry|your industry}} space. I wanted to reach out because we help companies like yours solve key challenges and drive growth.</p><p>Would you be open to a quick 15-minute call this week to explore how we can help?</p><p>Best regards</p>',
        delayDays: 0,
      },
      {
        subject: 'Following up - {{companyName|your company}}',
        body: '<p>Hi {{firstName|there}},</p><p>I wanted to follow up on my previous email. I understand you\'re busy, so I\'ll keep this brief.</p><p>We\'ve helped similar companies in {{industry|your industry}} achieve significant results. I think we could do the same for {{companyName|your company}}.</p><p>Are you available for a quick chat this week?</p><p>Thanks!</p>',
        delayDays: 3,
      },
      {
        subject: 'Thought you might find this helpful',
        body: '<p>Hi {{firstName|there}},</p><p>I came across a case study that reminded me of {{companyName|your company}}. Companies facing similar challenges saw significant results after implementing our solution.</p><p>I thought this might be relevant to your goals. Would you like to discuss how we can help {{companyName|your company}} achieve similar results?</p><p>Let me know!</p>',
        delayDays: 5,
      },
      {
        subject: 'Should I close your file?',
        body: '<p>Hi {{firstName|there}},</p><p>I haven\'t heard back from you, so I\'m assuming this isn\'t a priority right now. I\'ll go ahead and close your file.</p><p>If I\'m wrong and you\'d still like to explore how we can help {{companyName|your company}}, just reply to this email and I\'ll reopen it.</p><p>All the best!</p>',
        delayDays: 7,
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: '3-step sequence for announcing new products or features',
    category: 'Marketing',
    steps: [
      {
        subject: 'Exciting news for {{companyName|your company}}!',
        body: '<p>Hi {{firstName|there}},</p><p>I\'m excited to share that we just launched our new solution, designed specifically for companies like {{companyName|your company}} in the {{industry|your industry}} space.</p><p>Our solution helps you achieve better results more efficiently.</p><p>I\'d love to give you an exclusive early access demo. Are you available this week?</p><p>Cheers!</p>',
        delayDays: 0,
      },
      {
        subject: 'Early access demo for {{companyName|your company}}',
        body: '<p>Hi {{firstName|there}},</p><p>Just wanted to make sure you saw my email about our new solution. We\'re offering early access to select companies, and I thought {{companyName|your company}} would be a perfect fit.</p><p>The demo only takes 20 minutes, and I think you\'ll love what you see.</p><p>Can I book you in for this week?</p><p>Thanks!</p>',
        delayDays: 4,
      },
      {
        subject: 'Last chance for early access',
        body: '<p>Hi {{firstName|there}},</p><p>We\'re closing early access registration soon, and I didn\'t want {{companyName|your company}} to miss out.</p><p>Companies that have seen the demo are already seeing great results. I\'d hate for you to miss this opportunity.</p><p>Let me know if you\'d like to jump on a quick call!</p><p>Best,</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'follow-up',
    name: 'Follow-up Sequence',
    description: 'Gentle 3-step follow-up for warm leads',
    category: 'Sales',
    steps: [
      {
        subject: 'Following up from our conversation',
        body: '<p>Hi {{firstName|there}},</p><p>It was great speaking with you about {{companyName|your company}}\'s goals. As promised, I\'m sending over some additional information that might be helpful.</p><p>Let me know if you have any questions, or if you\'d like to schedule a follow-up call.</p><p>Thanks!</p>',
        delayDays: 0,
      },
      {
        subject: 'Checking in - {{companyName|your company}}',
        body: '<p>Hi {{firstName|there}},</p><p>I wanted to check in and see if you had a chance to review the information I sent over.</p><p>I\'m happy to answer any questions or set up a time to discuss next steps.</p><p>Looking forward to hearing from you!</p>',
        delayDays: 4,
      },
      {
        subject: 'Any questions about what we discussed?',
        body: '<p>Hi {{firstName|there}},</p><p>I haven\'t heard back, so I wanted to make sure everything is clear on your end.</p><p>If you need more information or would like to explore this further, just let me know. Otherwise, I\'ll follow up in a few weeks.</p><p>Thanks for your time!</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'reengagement',
    name: 'Re-engagement',
    description: '2-step sequence to re-engage inactive prospects',
    category: 'Sales',
    steps: [
      {
        subject: 'Are you still interested?',
        body: '<p>Hi {{firstName|there}},</p><p>We spoke a while back about how we could help {{companyName|your company}} achieve your goals. I wanted to reach out and see if this is still a priority for you.</p><p>A lot has changed since we last spoke - we\'ve added new features that I think would be really valuable for {{companyName|your company}}.</p><p>Would you like to reconnect for a quick call?</p><p>Best,</p>',
        delayDays: 0,
      },
      {
        subject: 'Last check-in for {{companyName|your company}}',
        body: '<p>Hi {{firstName|there}},</p><p>I understand priorities change, so this will be my last email unless I hear back from you.</p><p>If you\'re still interested, I\'d be happy to reconnect. Otherwise, I wish you and {{companyName|your company}} all the best!</p><p>Thanks,</p>',
        delayDays: 5,
      },
    ],
  },
];

// Create sequence from template - workflow-gated
router.post("/sequences/from-template", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past sequence stage
    try {
      await sdrWorkflowService.assertStage(userId, "sequence");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot create sequences while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

    const { templateId } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }
    
    // Find the template
    const template = SEQUENCE_TEMPLATES.find(t => t.id === templateId);
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    // Create the sequence
    const sequence = await storage.createSequence(req.userContext!, {
      userId: req.userContext!.userId,
      name: template.name,
      description: template.description,
      type: "outbound",
      status: "draft",
      aiPersonalizationEnabled: true, // Templates support AI personalization
      totalProspects: 0,
      activeProspects: 0,
      completedProspects: 0,
      settings: null,
    });
    
    // Add template steps to the sequence
    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      await storage.createSequenceStep(req.userContext!, {
        sequenceId: sequence.id,
        subject: step.subject,
        body: step.body,
        stepOrder: i + 1,
        delayDays: step.delayDays || 0,
        stepType: "email",
        aiGenerated: true, // Mark as AI-optimized
        variables: null,
      });
    }
    
    console.log(`✅ Created sequence from template "${template.name}" with ${template.steps.length} steps`);

    // Try to advance workflow stage after sequence creation
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
    res.json({ 
      sequenceId: sequence.id, 
      sequence, 
      stepsCount: template.steps.length 
    });
  } catch (error: any) {
    console.error("Error creating sequence from template:", error);
    if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(error?.message || '')) {
      return res.status(409).json({ error: "A sequence with this name already exists" });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create sequence from template" });
  }
});

// Update sequence (with automation check for activation) - workflow-gated for activation
router.put("/sequences/:id", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // If activating sequence, run comprehensive pre-activation validation
    if (req.body.status === "active") {
      // Workflow stage gate: must be at or past activation stage
      try {
        await sdrWorkflowService.assertStage(userId, "activation");
      } catch (stageError) {
        if (stageError instanceof WorkflowBlockedError) {
          return res.status(403).json(stageError.toJSON());
        }
        console.error("Workflow stage check failed:", stageError);
        return res.status(503).json({ error: "Unable to verify workflow stage" });
      }

      // Check automation status (tenant-level kill switch)
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(503).json({
          error: 'Automation paused',
          message: 'Cannot activate sequence while automation is paused for this organization.',
          code: 'AUTOMATION_PAUSED',
        });
      }

      // Comprehensive pre-activation validation (5 checks)
      const validation = await hardeningService.validateSequenceActivation(
        req.params.id,
        userId,
        organizationId
      );
      
      if (!validation.valid) {
        console.warn(`🚫 Sequence activation blocked: ${validation.code} - ${validation.message}`);
        return res.status(400).json({
          error: validation.message,
          code: validation.code,
          details: validation.details,
        });
      }
    }
    
    // Auto-approve sequence when activating (user explicitly chose to start sending)
    const updateData = { ...req.body };
    if (req.body.status === "active") {
      updateData.isApproved = true;
    }
    
    const sequence = await storage.updateSequence(req.userContext!, req.params.id, updateData);
    
    // If status changed to active, initialize and record status change
    if (req.body.status === "active") {
      try {
        await initializeSequence(req.userContext!, req.params.id);
      } catch (initError) {
        const initMessage = initError instanceof Error ? initError.message : String(initError);
        if (/no available mailbox/i.test(initMessage)) {
          // Roll the sequence back to draft so it isn't left "active" with no way to send
          await storage.updateSequence(req.userContext!, req.params.id, { status: "draft", isApproved: false }).catch(() => {});
          return res.status(400).json({
            error: "No active mailbox connected. Please connect a mailbox before activating a sequence.",
            code: "NO_ACTIVE_MAILBOX",
          });
        }
        throw initError;
      }
      await hardeningService.recordSequenceStatusChange(req.params.id, "active");
      try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    } else if (req.body.status && req.body.status !== "active") {
      // Record any status change for rate limiting
      await hardeningService.recordSequenceStatusChange(req.params.id, req.body.status);
    }
    
    res.json(sequence);
  } catch (error) {
    console.error("Error updating sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Update sequence (PATCH) (with automation check for activation) - workflow-gated for activation
router.patch("/sequences/:id", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // If activating sequence, run comprehensive pre-activation validation
    if (req.body.status === "active") {
      // Workflow stage gate: must be at or past activation stage
      try {
        await sdrWorkflowService.assertStage(userId, "activation");
      } catch (stageError) {
        if (stageError instanceof WorkflowBlockedError) {
          return res.status(403).json(stageError.toJSON());
        }
        console.error("Workflow stage check failed:", stageError);
        return res.status(503).json({ error: "Unable to verify workflow stage" });
      }

      // Check automation status (tenant-level kill switch)
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(503).json({
          error: 'Automation paused',
          message: 'Cannot activate sequence while automation is paused for this organization.',
          code: 'AUTOMATION_PAUSED',
        });
      }

      // Comprehensive pre-activation validation (5 checks)
      const validation = await hardeningService.validateSequenceActivation(
        req.params.id,
        userId,
        organizationId
      );
      
      if (!validation.valid) {
        console.warn(`🚫 Sequence activation blocked: ${validation.code} - ${validation.message}`);
        return res.status(400).json({
          error: validation.message,
          code: validation.code,
          details: validation.details,
        });
      }
    }
    
    // Auto-approve sequence when activating (user explicitly chose to start sending)
    const updateData = { ...req.body };
    if (req.body.status === "active") {
      updateData.isApproved = true;
    }
    
    const sequence = await storage.updateSequence(req.userContext!, req.params.id, updateData);
    
    // If status changed to active, initialize and record status change
    if (req.body.status === "active") {
      try {
        await initializeSequence(req.userContext!, req.params.id);
      } catch (initError) {
        const initMessage = initError instanceof Error ? initError.message : String(initError);
        if (/no available mailbox/i.test(initMessage)) {
          // Roll the sequence back to draft so it isn't left "active" with no way to send
          await storage.updateSequence(req.userContext!, req.params.id, { status: "draft", isApproved: false }).catch(() => {});
          return res.status(400).json({
            error: "No active mailbox connected. Please connect a mailbox before activating a sequence.",
            code: "NO_ACTIVE_MAILBOX",
          });
        }
        throw initError;
      }
      await hardeningService.recordSequenceStatusChange(req.params.id, "active");
      try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
      // Log activity for audit trail (TC-SDR-AUDIT-01)
      await logActivity(userId, "sequence.activate", "sequence", req.params.id, { name: sequence?.name });
    } else if (req.body.status === "paused") {
      await hardeningService.recordSequenceStatusChange(req.params.id, "paused");
      await logActivity(userId, "sequence.pause", "sequence", req.params.id, { name: sequence?.name });
    } else if (req.body.status && req.body.status !== "active") {
      // Record any status change for rate limiting
      await hardeningService.recordSequenceStatusChange(req.params.id, req.body.status);
      await logActivity(userId, "sequence.update", "sequence", req.params.id, { status: req.body.status });
    }
    
    res.json(sequence);
  } catch (error) {
    console.error("Error updating sequence:", error);
    res.status(500).json({ error: "Failed to update sequence" });
  }
});

// Delete sequence
router.delete("/sequences/:id", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    await storage.deleteSequence(req.userContext!, req.params.id);
    // Log activity for audit trail (TC-SDR-AUDIT-01)
    if (userId) {
      await logActivity(userId, "sequence.delete", "sequence", req.params.id, {});
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting sequence:", error);
    res.status(500).json({ error: "Failed to delete sequence" });
  }
});

// Add step to sequence - workflow-gated
router.post("/sequences/:id/steps", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past sequence stage
    try {
      await sdrWorkflowService.assertStage(userId, "sequence");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot modify sequences while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

    const { subject, body, stepOrder, delayDays, mailboxId } = req.body;
    
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
      mailboxId: mailboxId || null,
    });
    
    res.json(step);
  } catch (error) {
    console.error("Error adding step:", error);
    res.status(500).json({ error: "Failed to add step" });
  }
});

// Delete sequence step
router.delete("/sequences/:id/steps/:stepId", authenticate, forbidManager, async (req, res) => {
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

// Update sequence step
router.put("/sequences/:id/steps/:stepId", authenticate, forbidManager, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const stepId = req.params.stepId;
    const { subject, body, delayDays, stepOrder, mailboxId } = req.body;
    
    // Fetch all steps for this sequence to verify ownership
    const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
    
    // Verify the step belongs to this sequence
    const stepExists = steps.find(step => step.id === stepId);
    
    if (!stepExists) {
      return res.status(404).json({ 
        error: "Step not found or does not belong to this sequence" 
      });
    }
    
    // Build update object with only provided fields
    const updates: any = {};
    if (subject !== undefined) updates.subject = subject;
    if (body !== undefined) updates.body = body;
    if (delayDays !== undefined) updates.delayDays = delayDays;
    if (stepOrder !== undefined) updates.stepOrder = stepOrder;
    if (mailboxId !== undefined) updates.mailboxId = mailboxId || null;
    
    const updated = await storage.updateSequenceStep(req.userContext!, stepId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating step:", error);
    res.status(500).json({ error: "Failed to update step" });
  }
});

// Get prospects in sequence
router.get("/sequences/:id/prospects", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const prospects = await storage.getSequenceProspects(req.userContext!, req.params.id);
    res.json({ total: prospects.length, prospects });
  } catch (error) {
    console.error("Error fetching sequence prospects:", error);
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

// Get all sequences a specific prospect is enrolled in, with progress info
router.get("/prospects/:prospectId/sequence-progress", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const { prospectId } = req.params;
    const userId = req.userContext?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify the prospect belongs to this user
    const prospect = await storage.getProspect(req.userContext!, prospectId);
    if (!prospect) {
      return res.status(404).json({ error: "Prospect not found" });
    }

    // Fetch enrollments with joined sequence data
    const enrollments = await db
      .select({
        id: sequenceProspects.id,
        sequenceId: sequenceProspects.sequenceId,
        sequenceName: sequences.name,
        sequenceStatus: sequences.status,
        enrollmentStatus: sequenceProspects.status,
        enrolledAt: sequenceProspects.enrolledAt,
        lastContactedAt: sequenceProspects.lastContactedAt,
        completedAt: sequenceProspects.completedAt,
        replies: sequenceProspects.replies,
        opens: sequenceProspects.opens,
        clicks: sequenceProspects.clicks,
        currentStepId: sequenceProspects.currentStepId,
        totalSteps: sql<number>`(
          SELECT COUNT(*) FROM sequence_steps
          WHERE sequence_steps.sequence_id = ${sequenceProspects.sequenceId}
        )`.mapWith(Number),
        currentStepNumber: sql<number>`COALESCE((
          SELECT step_order FROM sequence_steps
          WHERE sequence_steps.id = ${sequenceProspects.currentStepId}
        ), 0)`.mapWith(Number),
      })
      .from(sequenceProspects)
      .innerJoin(sequences, eq(sequenceProspects.sequenceId, sequences.id))
      .where(eq(sequenceProspects.prospectId, prospectId))
      .orderBy(desc(sequenceProspects.enrolledAt));

    res.json({ enrollments });
  } catch (error) {
    console.error("Error fetching prospect sequence progress:", error);
    res.status(500).json({ error: "Failed to fetch sequence progress" });
  }
});

// Add prospects to sequence (with throttling, automation check, and workflow gate) - workflow-gated
router.post("/sequences/:id/prospects", authenticate, forbidManager, checkUserPause, checkEnrollmentConcurrency, checkAutomationStatus, throttleOperation('enrollments'), async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past enrollment stage
    try {
      await sdrWorkflowService.assertStage(userId, "enrollment");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    const { prospectIds } = req.body;
    
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: "prospectIds array is required" });
    }
    
    // Hard limit: Max 1000 prospects per enrollment request
    const MAX_ENROLLMENT_BATCH = 1000;
    if (prospectIds.length > MAX_ENROLLMENT_BATCH) {
      return res.status(400).json({ 
        error: `Batch size exceeds limit. Maximum ${MAX_ENROLLMENT_BATCH} prospects per request.`,
        code: 'BATCH_SIZE_EXCEEDED'
      });
    }
    
    // P0 FIX: Unit-based throttling - check if this batch fits in remaining quota
    const throttleInfo = req.throttleInfo;
    if (throttleInfo && organizationId) {
      const remainingCapacity = throttleInfo.limit - throttleInfo.currentCount;
      if (prospectIds.length > remainingCapacity) {
        return res.status(429).json({
          error: 'Rate limit would be exceeded',
          message: `This batch of ${prospectIds.length} prospects would exceed your hourly limit. Remaining capacity: ${remainingCapacity}. Try a smaller batch or wait until the hour resets.`,
          code: 'RATE_LIMIT_EXCEEDED',
          currentUsage: throttleInfo.currentCount,
          limit: throttleInfo.limit,
          batchSize: prospectIds.length,
          retryAfter: 3600,
        });
      }
    }
    
    const sequenceId = req.params.id;
    
    const enrolled = await storage.enrollProspects(req.userContext!, sequenceId, prospectIds);
    
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (sequence) {
      await storage.updateSequence(req.userContext!, sequenceId, {
        totalProspects: (sequence.totalProspects || 0) + enrolled.length,
        activeProspects: (sequence.activeProspects || 0) + enrolled.length,
      });
    }
    
    // 🔥 CRITICAL: Schedule first email for each enrolled prospect (10-second SLA)
    // Import the sequence step service
    const sequenceStepServiceModule = await import("./services/sequence-step.service");
    const sequenceStepService = sequenceStepServiceModule.default;
    
    for (const enrolledProspect of enrolled) {
      try {
        await sequenceStepService.scheduleFirstEmail({
          sequenceProspectId: enrolledProspect.id,
          sequenceId,
          prospectId: enrolledProspect.prospectId,
          automationRunId: '', // Manual enrollment, no automation run
          aiPersonalizationEnabled: false, // Use template content for manual enrollment
          userId
        });
        console.log(`[Manual Enrollment] Scheduled first email for prospect ${enrolledProspect.prospectId}`);
      } catch (scheduleError) {
        console.error(`[Manual Enrollment] Failed to schedule email for prospect ${enrolledProspect.prospectId}:`, scheduleError);
        // Continue with other prospects even if one fails
      }
    }
    
    // Track enrollment usage for throttling and cost guardrails
    if (organizationId) {
      await incrementThrottle(organizationId, 'enrollments', enrolled.length, userId);
    }

    // Track AI/API usage for enrollment
    await aiTrackingService.trackGeneration({
      userId,
      tenantId: organizationId,
      generationType: 'enrollment',
      model: 'internal',
      provider: 'internal',
      promptTokens: 0,
      completionTokens: 0,
      success: enrolled.length > 0,
      metadata: {
        source: 'api_sequences_prospects',
        sequenceId,
        prospectsEnrolled: enrolled.length,
        prospectsRequested: prospectIds.length,
      },
    });

    // Try to advance workflow stage after successful enrollment
    if (enrolled.length > 0) {
      try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
      // Log activity for audit trail (TC-SDR-AUDIT-01)
      await logActivity(userId, "prospect.enroll", "sequence", sequenceId, { 
        count: enrolled.length, 
        prospectIds: prospectIds.slice(0, 10) // Limit metadata size
      });
    }
    
    res.json({ message: `${enrolled.length} prospects enrolled and emails scheduled`, enrolled });
  } catch (error: any) {
    console.error("Error enrolling prospects:", error);

    const message = error instanceof Error ? error.message : String(error);

    // Map "not found" validation errors raised by storage.enrollProspects to 404
    if (message.startsWith('Sequence not found')) {
      return res.status(404).json({ error: message });
    }
    if (message.startsWith('Prospects not found')) {
      return res.status(404).json({ error: message });
    }

    // Map Postgres unique-constraint violations (duplicate enrollment) to 409
    if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(message)) {
      return res.status(409).json({ error: 'One or more prospects are already enrolled in this sequence' });
    }

    res.status(500).json({ error: "Failed to enroll prospects" });
  }
});

// Get email replies for sequence
router.get("/sequences/:id/replies", authenticate, blockSuperAdminFromSDR, async (req, res) => {
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
router.get("/sequences/:id/tracking", authenticate, blockSuperAdminFromSDR, async (req, res) => {
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
router.get("/sequences/:id/emails", authenticate, blockSuperAdminFromSDR, async (req, res) => {
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
router.post("/personalization/manual-linkedin", authenticate, forbidManager, async (req, res) => {
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

// Webhook: Email opened - requires HMAC signature verification for security
router.post("/webhooks/email-opened", async (req, res) => {
  try {
    const { trackingId, timestamp, signature } = req.body;
    
    // Verify webhook signature to prevent abuse
    const webhookSecret = process.env.WEBHOOK_SECRET || process.env.SESSION_SECRET;
    if (webhookSecret) {
      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${trackingId}:${timestamp}`)
        .digest('hex');
      
      if (!signature || signature !== expectedSignature) {
        console.warn('Email open webhook: Invalid signature for trackingId:', trackingId);
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }
    }
    
    if (!trackingId) {
      return res.status(400).json({ error: 'trackingId is required' });
    }
    
    res.json({ message: "Email open recorded" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Failed to process email open" });
  }
});

// AI Email Generation
router.post("/sequences/ai-generate-email", authenticate, forbidManager, async (req, res) => {
  try {
    const { emailGenerationService } = await import("./services/ai-email-generator.service");
    const { prospectId, emailType, sequenceStep, previousEmails, tone, sequenceId } = req.body;
    
    if (!prospectId || !emailType) {
      return res.status(400).json({ error: "prospectId and emailType are required" });
    }

    // Credit check — 2 credits per AI email generated
    const userId = req.userContext?.userId;
    const tenantId = req.userContext?.organizationId;
    if (userId && tenantId) {
      const creditCheck = await checkCredits(userId, tenantId, "email_generation");
      if (!creditCheck.allowed) {
        return res.status(402).json({
          error: "INSUFFICIENT_CREDITS",
          message: creditCheck.message,
          remaining: creditCheck.remaining,
          required: creditCheck.required,
        });
      }
    }
    
    // FIX-3: Fetch previous steps from sequence so follow-up steps have full context
    let enrichedPreviousEmails: string[] = previousEmails || [];
    let threadSubjectHint: string | undefined;
    if (sequenceId && !previousEmails) {
      try {
        const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
        if (steps && steps.length > 0) {
          // Get all steps before the current one being written
          const previousSteps = sequenceStep
            ? steps.slice(0, sequenceStep - 1)
            : steps;

          enrichedPreviousEmails = previousSteps.map((step, index) =>
            `Step ${index + 1} - Subject: ${step.subject}\n\nBody:\n${step.body}`
          );

          // FIX-3: Capture step 1 subject for Re: threading hint on follow-ups
          const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
          if (sequenceStep && sequenceStep > 1 && sortedSteps[0]?.subject) {
            const baseSubject = sortedSteps[0].subject.replace(/^Re:\s*/i, '');
            threadSubjectHint = `Re: ${baseSubject}`;
          }

          console.log(`📧 Loaded ${enrichedPreviousEmails.length} previous steps from sequence for context`);
        }
      } catch (error) {
        console.error("Error fetching previous steps:", error);
        // Continue without previous steps if fetch fails
      }
    }

    // If this is a follow-up and we have the original subject, prepend a threading instruction
    if (threadSubjectHint) {
      enrichedPreviousEmails = [
        `THREADING INSTRUCTION: This is follow-up email #${sequenceStep}. ` +
        `The subject line MUST start with "${threadSubjectHint}" to keep the email thread intact. ` +
        `Do NOT invent a new subject line.`,
        ...enrichedPreviousEmails,
      ];
    }

    const result = await emailGenerationService.generateWithRetry({
      prospectId,
      emailType,
      sequenceStep,
      previousEmails: enrichedPreviousEmails,
      tone
    });

    // Deduct credits after successful generation
    if (userId && tenantId) {
      try {
        await deductCredits(
          userId,
          tenantId,
          "email_generation",
          1,
          `AI email generated for prospect ${prospectId}`,
          prospectId
        );
      } catch (creditErr) {
        console.error("[credits] Failed to deduct email generation credits:", creditErr);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error("AI email generation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate email" 
    });
  }
});

// Generate Email Variants (A/B Testing)
router.post("/sequences/ai-generate-variants", authenticate, forbidManager, async (req, res) => {
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
router.post("/sequences/enhanced-personalization", authenticate, forbidManager, async (req, res) => {
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
      organizationId: req.userContext?.organizationId || '',
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

// Analyze Email Response - workflow-gated
router.post("/sequences/analyze-response", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past replies stage
    try {
      await sdrWorkflowService.assertStage(userId, "replies");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    const { analyzeEmailResponse } = await import("./services/enhanced-personalization.service");
    const { originalEmail, prospectResponse, prospectId } = req.body;
    
    if (!originalEmail || !prospectResponse || !prospectId) {
      return res.status(400).json({ error: "originalEmail, prospectResponse, and prospectId are required" });
    }
    
    const analysis = await analyzeEmailResponse(originalEmail, prospectResponse, prospectId);

    // Track AI usage for response analysis
    await aiTrackingService.trackGeneration({
      userId,
      tenantId: organizationId,
      generationType: 'response_analysis',
      model: 'multi-provider',
      provider: 'ai-service',
      promptTokens: 0,
      completionTokens: 0,
      success: true,
      metadata: {
        source: 'api_sequences_analyze_response',
        prospectId,
      },
    });

    // Try to advance workflow stage after reply analysis
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
    res.json(analysis);
  } catch (error) {
    console.error("Response analysis error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to analyze response" 
    });
  }
});

// Generate Follow-up Preview - workflow-gated
router.post("/sequences/followup-preview", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past replies stage
    try {
      await sdrWorkflowService.assertStage(userId, "replies");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot generate follow-up preview while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

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

    // Track AI usage for follow-up preview generation
    await aiTrackingService.trackGeneration({
      userId,
      tenantId: organizationId,
      generationType: 'followup_preview',
      model: 'multi-provider',
      provider: 'ai-service',
      promptTokens: 0,
      completionTokens: 0,
      success: true,
      metadata: {
        source: 'api_sequences_followup_preview',
        prospectId,
        followUpType: followUpType || "gentle_reminder",
      },
    });

    // Try to advance workflow stage after preview generation
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
    res.json(preview);
  } catch (error) {
    console.error("Follow-up preview error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate follow-up preview" 
    });
  }
});

// AI Email Generation - Main endpoint
router.post("/sequences/ai-generate-email", authenticate, forbidManager, async (req, res) => {
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
router.post("/sequences/ai-generate-variants", authenticate, forbidManager, async (req, res) => {
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
router.post("/sequences/enhanced-personalization", authenticate, forbidManager, async (req, res) => {
  try {
    const { generateEnhancedPersonalizedEmail } = await import("./services/enhanced-personalization.service");
    const { prospectId } = req.body;
    
    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }
    
    const result = await generateEnhancedPersonalizedEmail({
      prospectId,
      organizationId: req.userContext?.organizationId || '',
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
router.get("/sequences/ai-followup-preview/:prospectId", authenticate, blockSuperAdminFromSDR, async (req, res) => {
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
    const originalSubject = sentEmail?.subject || undefined; // Capture for threading
    if (sentEmail?.subject && sentEmail?.body) {
      emailHistoryArray.push(`Subject: ${sentEmail.subject}\n\n${sentEmail.body}`);
    }
    if (replyContent) {
      emailHistoryArray.push(`Prospect replied: ${replyContent}`);
    }
    
    // CRITICAL: Pass original subject for proper email threading
    const preview = await aiFollowUpScheduler.generateFollowUpEmailPreview(
      prospectId,
      emailHistoryArray,
      "gentle_reminder",
      1,
      originalSubject // Use original subject for "Re: [subject]" threading
    );
    
    res.json(preview);
  } catch (error) {
    console.error("Follow-up preview error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate follow-up preview" 
    });
  }
});

// Send reply to prospect - workflow-gated
router.post("/sequences/send-reply", authenticate, forbidManager, async (req, res) => {
  try {
    const userId = req.userContext?.userId;
    const organizationId = req.userContext?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Workflow stage gate: must be at or past sending stage
    try {
      await sdrWorkflowService.assertStage(userId, "sending");
    } catch (stageError) {
      if (stageError instanceof WorkflowBlockedError) {
        return res.status(403).json(stageError.toJSON());
      }
      console.error("Workflow stage check failed:", stageError);
      return res.status(503).json({ error: "Unable to verify workflow stage" });
    }

    // Check tenant automation status - fail-closed
    try {
      const isPaused = await hardeningService.isAutomationPaused(organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot send emails while tenant automation is paused.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status:", guardError);
      return res.status(503).json({ error: "Unable to verify tenant automation status" });
    }

    const { prospectId, sequenceId, subject, body } = req.body;
    
    if (!prospectId || !subject || !body) {
      return res.status(400).json({ error: "prospectId, subject, and body are required" });
    }
    
    // FIX-6: Fetch ALL prior Message-IDs for a complete RFC 5322 References chain.
    // In-Reply-To = latest; References = all IDs in chronological order (space-separated).
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (sequenceId) {
      const threadEmails = await db
        .select({ messageId: emails.messageId, sentAt: emails.sentAt })
        .from(emails)
        .where(
          and(
            eq(emails.prospectId, prospectId),
            eq(emails.sequenceId, sequenceId),
            isNotNull(emails.messageId)
          )
        )
        .orderBy(asc(emails.sentAt));

      const allMessageIds = threadEmails
        .map(e => e.messageId)
        .filter((id): id is string => Boolean(id));

      if (allMessageIds.length > 0) {
        inReplyTo = allMessageIds[allMessageIds.length - 1]; // Latest
        references = allMessageIds.join(' ');               // Full chain (RFC 5322)
        console.log(`🔗 Threading reply - In-Reply-To: ${inReplyTo} | References chain length: ${allMessageIds.length}`);
      }
    }

    // FIX-7: Ensure subject has Re: prefix for proper email-client threading
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    // Add to email queue with immediate sending (scheduled for now)
    const queueItem = await emailQueueService.addToQueue({
      prospectId,
      sequenceId: sequenceId || null,
      subject: replySubject,
      body,
      scheduledFor: new Date(), // Send immediately
      priority: 1, // High priority
      inReplyTo,
      references,
      userId, // Pass userId for user-scoped mailbox selection
    });
    
    console.log(`📧 Reply queued for sending: ${queueItem.id}`);

    // Track AI/API usage for sending
    await aiTrackingService.trackGeneration({
      userId,
      tenantId: organizationId,
      generationType: 'email_send',
      model: 'internal',
      provider: 'internal',
      promptTokens: 0,
      completionTokens: 0,
      success: true,
      metadata: {
        source: 'api_sequences_send_reply',
        prospectId,
        sequenceId: sequenceId || null,
      },
    });

    // Try to advance workflow stage after sending
    try { await sdrWorkflowService.tryAutoAdvance(userId); } catch (err) { console.error('[Sequences] Workflow auto-advance failed:', err); }
    
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

// ============================================
// BULK APPROVAL PREVIEW SYSTEM
// ============================================

interface PreviewEmail {
  prospectId: string;
  prospectName: string;
  companyName: string;
  subject: string;
  body: string;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  riskLevel: 'low' | 'medium' | 'high';
  hasHallucinationFlags: boolean;
  claimViolations: Array<{ type: string; matchedText: string; reason: string }>;
  dynamicFields: Array<{ field: string; value: string; start: number; end: number }>;
  warnings: string[];
}

interface BulkPreviewResponse {
  sequenceId: string;
  sequenceName: string;
  totalProspects: number;
  previewCount: number;
  previews: PreviewEmail[];
  aggregateStats: {
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    hallucinationFlagCount: number;
    lowRiskCount: number;
    approvalRecommendation: 'safe_to_bulk_approve' | 'review_recommended' | 'manual_review_required';
  };
  templateLogic: {
    subject: string;
    bodyTemplate: string;
    dynamicTokens: string[];
  };
}

function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function getRiskLevel(confidenceScore: number, hasHallucinationFlags: boolean, warningsCount: number): 'low' | 'medium' | 'high' {
  if (hasHallucinationFlags) return 'high';
  if (confidenceScore >= 80 && warningsCount === 0) return 'low';
  if (confidenceScore >= 50 && warningsCount <= 1) return 'medium';
  return 'high';
}

function extractDynamicFields(template: string, resolvedContent: string): Array<{ field: string; value: string; start: number; end: number }> {
  const dynamicFields: Array<{ field: string; value: string; start: number; end: number }> = [];
  
  // Common dynamic field patterns
  const patterns = [
    { pattern: /\{\{firstName\}\}/gi, field: 'firstName' },
    { pattern: /\{\{lastName\}\}/gi, field: 'lastName' },
    { pattern: /\{\{companyName\}\}/gi, field: 'companyName' },
    { pattern: /\{\{jobTitle\}\}/gi, field: 'jobTitle' },
    { pattern: /\{\{industry\}\}/gi, field: 'industry' },
  ];
  
  // Find resolved values by comparing template placeholders with resolved content
  const nameMatch = resolvedContent.match(/(?:Hi|Hello|Dear|Hey)\s+([A-Z][a-z]+)/);
  if (nameMatch) {
    const start = resolvedContent.indexOf(nameMatch[1]);
    dynamicFields.push({ field: 'firstName', value: nameMatch[1], start, end: start + nameMatch[1].length });
  }
  
  // Find company mentions (typically capitalized words that appear after context clues)
  const companyPatterns = [/at\s+([A-Z][A-Za-z0-9\s]+?)(?:\s|,|\.|\?)/g, /(?:your team at|with|for)\s+([A-Z][A-Za-z0-9\s]+?)(?:\s|,|\.|\?)/g];
  for (const pattern of companyPatterns) {
    let match;
    while ((match = pattern.exec(resolvedContent)) !== null) {
      const value = match[1].trim();
      if (value.length > 2 && value.length < 50) {
        dynamicFields.push({ field: 'companyName', value, start: match.index + match[0].indexOf(value), end: match.index + match[0].indexOf(value) + value.length });
      }
    }
  }
  
  return dynamicFields;
}

// GET /api/sequences/:id/preview - Generate bulk preview of emails for approval
router.get("/sequences/:id/preview", authenticate, forbidManager, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const sampleSize = Math.min(parseInt(req.query.sampleSize as string) || 10, 20);
    
    // Get sequence details
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Get enrolled prospects
    const enrolledProspects = await storage.getSequenceProspects(req.userContext!, sequenceId);
    if (enrolledProspects.length === 0) {
      return res.status(400).json({ error: "No prospects enrolled in this sequence" });
    }
    
    // Get sequence steps (for template logic)
    const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
    const firstStep = steps.sort((a, b) => a.stepOrder - b.stepOrder)[0];
    
    // Sample prospects for preview
    const sampleProspects = enrolledProspects
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
    
    // Generate preview emails for sample
    const { generateEmail } = await import("./services/ai-email-generator.service");
    
    const previews: PreviewEmail[] = [];
    
    for (const enrollment of sampleProspects) {
      try {
        const prospect = await storage.getProspect(req.userContext!, enrollment.prospectId);
        if (!prospect) continue;
        
        // Generate preview email using the AI email generator
        // Uses the AI to generate personalized emails based on prospect data
        const generated = await generateEmail({
          prospectId: enrollment.prospectId,
          emailType: 'cold_outreach',
          sequenceStep: 1,
          enforceSourceValidation: false, // Don't block for preview
          campaignStage: 'first_touch',
        }, prospect, req.userContext!);
        
        const confidenceLevel = getConfidenceLevel(generated.confidenceScore);
        const hasHallucinationFlags = (generated.claimViolations?.length || 0) > 0;
        const warnings = generated.warnings || [];
        const riskLevel = getRiskLevel(generated.confidenceScore, hasHallucinationFlags, warnings.length);
        
        previews.push({
          prospectId: enrollment.prospectId,
          prospectName: `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim() || 'Unknown',
          companyName: prospect.companyName || 'Unknown Company',
          subject: generated.subject,
          body: generated.body,
          confidenceScore: generated.confidenceScore,
          confidenceLevel,
          riskLevel,
          hasHallucinationFlags,
          claimViolations: generated.claimViolations || [],
          dynamicFields: extractDynamicFields(firstStep?.body || '', generated.body),
          warnings,
        });
      } catch (error) {
        console.error(`Preview generation failed for prospect ${enrollment.prospectId}:`, error);
      }
    }
    
    // Calculate aggregate stats
    const highConfidenceCount = previews.filter(p => p.confidenceLevel === 'high').length;
    const mediumConfidenceCount = previews.filter(p => p.confidenceLevel === 'medium').length;
    const lowConfidenceCount = previews.filter(p => p.confidenceLevel === 'low').length;
    const hallucinationFlagCount = previews.filter(p => p.hasHallucinationFlags).length;
    const lowRiskCount = previews.filter(p => p.riskLevel === 'low').length;
    
    // Determine approval recommendation
    let approvalRecommendation: 'safe_to_bulk_approve' | 'review_recommended' | 'manual_review_required';
    if (hallucinationFlagCount === 0 && lowRiskCount >= previews.length * 0.8) {
      approvalRecommendation = 'safe_to_bulk_approve';
    } else if (hallucinationFlagCount <= previews.length * 0.1 && lowRiskCount >= previews.length * 0.5) {
      approvalRecommendation = 'review_recommended';
    } else {
      approvalRecommendation = 'manual_review_required';
    }
    
    // Extract template logic (dynamic tokens from first step)
    const tokenPattern = /\{\{([^}]+)\}\}/g;
    const dynamicTokens: string[] = [];
    let match;
    const templateBody = firstStep?.body || '';
    while ((match = tokenPattern.exec(templateBody)) !== null) {
      if (!dynamicTokens.includes(match[1])) {
        dynamicTokens.push(match[1]);
      }
    }
    
    const response: BulkPreviewResponse = {
      sequenceId,
      sequenceName: sequence.name,
      totalProspects: enrolledProspects.length,
      previewCount: previews.length,
      previews,
      aggregateStats: {
        highConfidenceCount,
        mediumConfidenceCount,
        lowConfidenceCount,
        hallucinationFlagCount,
        lowRiskCount,
        approvalRecommendation,
      },
      templateLogic: {
        subject: firstStep?.subject || '',
        bodyTemplate: templateBody,
        dynamicTokens,
      },
    };
    
    res.json(response);
  } catch (error) {
    console.error("Bulk preview error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to generate preview" 
    });
  }
});

// POST /api/sequences/:id/bulk-approve - Approve all low-risk emails
router.post("/:id/bulk-approve", authenticate, forbidManager, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const { approveType } = req.body; // 'all', 'low_risk_only', 'selected'
    const selectedProspectIds: string[] = req.body.selectedProspectIds || [];
    const lowRiskProspectIds: string[] = req.body.lowRiskProspectIds || [];
    
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Determine which prospect IDs to approve based on approveType
    let targetProspectIds: string[] = [];
    
    if (approveType === 'all') {
      // Approve all pending emails for this sequence
      const approvedCount = await db
        .update(emailQueue)
        .set({ status: 'approved' })
        .where(
          and(
            eq(emailQueue.sequenceId, sequenceId),
            eq(emailQueue.status, 'pending')
          )
        )
        .returning({ id: emailQueue.id });
      
      await logActivity(req.userContext!.userId, "sequence.bulk_approve", "sequence", sequenceId, 
        { approveType, approvedCount: approvedCount.length });
      
      return res.json({ 
        success: true,
        approvedCount: approvedCount.length,
        message: `Approved ${approvedCount.length} emails for sending`
      });
    } else if (approveType === 'selected') {
      targetProspectIds = selectedProspectIds;
    } else if (approveType === 'low_risk_only') {
      targetProspectIds = lowRiskProspectIds;
    }
    
    if (targetProspectIds.length === 0) {
      return res.status(400).json({ error: "No prospect IDs provided for approval" });
    }
    
    // Update email queue items for specific prospects only (using parameterized query)
    const approvedCount = await db
      .update(emailQueue)
      .set({ status: 'approved' })
      .where(
        and(
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.status, 'pending'),
          inArray(emailQueue.prospectId, targetProspectIds)
        )
      )
      .returning({ id: emailQueue.id });
    
    // Log activity
    await logActivity(
      req.userContext!.userId,
      "sequence.bulk_approve",
      "sequence",
      sequenceId,
      { approveType, approvedCount: approvedCount.length, prospectIds: targetProspectIds.length }
    );
    
    res.json({ 
      success: true,
      approvedCount: approvedCount.length,
      message: `Approved ${approvedCount.length} emails for sending`
    });
  } catch (error) {
    console.error("Bulk approve error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to bulk approve" 
    });
  }
});

// POST /api/sequences/:id/revert-activation - Revert last sequence activation
router.post("/:id/revert-activation", authenticate, forbidManager, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    if (sequence.status !== 'active') {
      return res.status(400).json({ error: "Sequence is not active" });
    }
    
    // Cancel all pending/approved emails in queue
    const cancelledEmails = await db
      .update(emailQueue)
      .set({ 
        status: 'cancelled'
      })
      .where(
        and(
          eq(emailQueue.sequenceId, sequenceId),
          sql`status IN ('pending', 'approved', 'generating', 'scheduled')`
        )
      )
      .returning({ id: emailQueue.id });
    
    // Pause the sequence
    await storage.updateSequence(req.userContext!, sequenceId, { status: 'paused' });
    
    // Record in hardening service
    await hardeningService.recordSequenceStatusChange(sequenceId, 'paused');
    
    // Log activity
    await logActivity(
      req.userContext!.userId,
      "sequence.revert_activation",
      "sequence",
      sequenceId,
      { cancelledEmailCount: cancelledEmails.length }
    );
    
    res.json({ 
      success: true,
      cancelledEmailCount: cancelledEmails.length,
      message: `Reverted activation: ${cancelledEmails.length} emails cancelled, sequence paused`
    });
  } catch (error) {
    console.error("Revert activation error:", error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Failed to revert activation" 
    });
  }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

// GET /api/sequences/:id/funnel - Get funnel analytics for a sequence
router.get("/sequences/:id/funnel", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Verify sequence ownership
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Get total enrolled prospects
    const totalProspects = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sequenceProspects)
      .where(eq(sequenceProspects.sequenceId, sequenceId));
    
    const totalCount = totalProspects[0]?.count || 0;
    
    // Get event counts from lead_events table
    const eventCounts = await db
      .select({
        eventType: leadEvents.eventType,
        count: sql<number>`count(distinct ${leadEvents.leadId})::int`
      })
      .from(leadEvents)
      .where(eq(leadEvents.sequenceId, sequenceId))
      .groupBy(leadEvents.eventType);
    
    const countMap: Record<string, number> = {};
    eventCounts.forEach(e => { countMap[e.eventType] = e.count; });
    
    // Also get contacted count from email_queue (sent emails)
    const sentEmails = await db
      .select({ count: sql<number>`count(distinct ${emailQueue.prospectId})::int` })
      .from(emailQueue)
      .where(and(
        eq(emailQueue.sequenceId, sequenceId),
        eq(emailQueue.status, 'sent')
      ));
    
    const contactedCount = sentEmails[0]?.count || countMap['contacted'] || 0;
    
    // Get opened count from emails table (tracking data is stored there, not in email_queue)
    const openedEmails = await db
      .select({ count: sql<number>`count(distinct ${emails.prospectId})::int` })
      .from(emails)
      .where(and(
        eq(emails.sequenceId, sequenceId),
        sql`${emails.openedAt} IS NOT NULL`
      ));
    const openedCount = openedEmails[0]?.count || countMap['opened'] || 0;
    
    // Get clicked count from emails table
    const clickedEmails = await db
      .select({ count: sql<number>`count(distinct ${emails.prospectId})::int` })
      .from(emails)
      .where(and(
        eq(emails.sequenceId, sequenceId),
        sql`${emails.clickedAt} IS NOT NULL`
      ));
    const interactionCount = clickedEmails[0]?.count || countMap['clicked'] || 0;
    
    // Get replied count from email_replies
    const repliedEmails = await db
      .select({ count: sql<number>`count(distinct ${emailReplies.prospectId})::int` })
      .from(emailReplies)
      .where(eq(emailReplies.sequenceId, sequenceId));
    const answeredCount = repliedEmails[0]?.count || countMap['replied'] || 0;
    
    const interestedCount = countMap['interested'] || 0;
    const interruptedCount = countMap['interrupted'] || countMap['unsubscribed'] || countMap['bounced'] || 0;
    
    // Use totalCount for percentages, but fall back to contactedCount if no enrolled prospects
    const baseCount = totalCount > 0 ? totalCount : contactedCount;
    
    console.log(`[Funnel Analytics] sequenceId=${sequenceId}, total=${totalCount}, base=${baseCount}, contacted=${contactedCount}, opened=${openedCount}, clicked=${interactionCount}, answered=${answeredCount}`);
    
    res.json({
      contacted: { count: contactedCount, percent: baseCount > 0 ? Math.round((contactedCount / baseCount) * 100) : 0 },
      opened: { count: openedCount, percent: baseCount > 0 ? Math.round((openedCount / baseCount) * 100) : 0 },
      interaction: { count: interactionCount, percent: baseCount > 0 ? Math.round((interactionCount / baseCount) * 100) : 0 },
      answered: { count: answeredCount, percent: baseCount > 0 ? Math.round((answeredCount / baseCount) * 100) : 0 },
      interested: { count: interestedCount, percent: baseCount > 0 ? Math.round((interestedCount / baseCount) * 100) : 0 },
      interrupted: { count: interruptedCount, percent: baseCount > 0 ? Math.round((interruptedCount / baseCount) * 100) : 0 }
    });
  } catch (error) {
    console.error("Funnel analytics error:", error);
    res.status(500).json({ error: "Failed to get funnel analytics" });
  }
});

// GET /api/sequences/:id/summary - Get campaign summary stats
router.get("/sequences/:id/summary", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Verify sequence ownership
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Total leads enrolled
    const totalLeads = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sequenceProspects)
      .where(eq(sequenceProspects.sequenceId, sequenceId));
    
    // Leads launched (have at least one email in queue)
    const launchedLeads = await db
      .select({ count: sql<number>`count(distinct ${emailQueue.prospectId})::int` })
      .from(emailQueue)
      .where(eq(emailQueue.sequenceId, sequenceId));
    
    // Leads reached (have at least one sent email)
    const reachedLeads = await db
      .select({ count: sql<number>`count(distinct ${emailQueue.prospectId})::int` })
      .from(emailQueue)
      .where(and(
        eq(emailQueue.sequenceId, sequenceId),
        eq(emailQueue.status, 'sent')
      ));
    
    // Messages sent
    const sentMessages = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailQueue)
      .where(and(
        eq(emailQueue.sequenceId, sequenceId),
        eq(emailQueue.status, 'sent')
      ));
    
    // Messages failed
    const failedMessages = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailQueue)
      .where(and(
        eq(emailQueue.sequenceId, sequenceId),
        eq(emailQueue.status, 'failed')
      ));
    
    const totalSent = sentMessages[0]?.count || 0;
    const totalFailed = failedMessages[0]?.count || 0;
    const totalAttempted = totalSent + totalFailed;
    const deliveredPercent = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;
    
    res.json({
      totalLeads: totalLeads[0]?.count || 0,
      launchedLeads: launchedLeads[0]?.count || 0,
      reachedLeads: reachedLeads[0]?.count || 0,
      deliveredPercent,
      messagesSent: totalSent,
      messagesFailed: totalFailed
    });
  } catch (error) {
    console.error("Summary analytics error:", error);
    res.status(500).json({ error: "Failed to get summary analytics" });
  }
});

// GET /api/sequences/:id/steps/analytics - Get per-step analytics
router.get("/sequences/:id/steps/analytics", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Verify sequence ownership
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Get all steps for this sequence
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);
    
    const stepAnalytics = await Promise.all(steps.map(async (step) => {
      // Sent count for this step (using sequenceId + stepOrder)
      const sent = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailQueue)
        .where(and(
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, step.stepOrder),
          eq(emailQueue.status, 'sent')
        ));
      
      // Get opened/clicked/replied counts by joining email_queue with emails table
      // Join on prospect_id + sequence_id (email_id may not be populated)
      const stepMetrics = await db
        .select({
          opened: sql<number>`count(*) filter (where ${emails.openedAt} is not null)::int`,
          clicked: sql<number>`count(*) filter (where ${emails.clickedAt} is not null)::int`,
          replied: sql<number>`count(*) filter (where ${emails.repliedAt} is not null)::int`,
        })
        .from(emailQueue)
        .innerJoin(emails, and(
          eq(emailQueue.prospectId, emails.prospectId),
          eq(emailQueue.sequenceId, emails.sequenceId)
        ))
        .where(and(
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, step.stepOrder),
          eq(emailQueue.status, 'sent')
        ));
      
      // Booked count (from lead_events - meetings are tracked separately)
      const booked = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadEvents)
        .where(and(
          eq(leadEvents.sequenceId, sequenceId),
          eq(leadEvents.stepId, step.id),
          eq(leadEvents.eventType, 'booked')
        ));
      
      const sentCount = sent[0]?.count || 0;
      const openedCount = stepMetrics[0]?.opened || 0;
      const clickedCount = stepMetrics[0]?.clicked || 0;
      const repliedCount = stepMetrics[0]?.replied || 0;
      const bookedCount = booked[0]?.count || 0;
      
      return {
        stepId: step.id,
        stepOrder: step.stepOrder,
        sent: sentCount,
        opened: { count: openedCount, percent: sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0 },
        clicked: { count: clickedCount, percent: sentCount > 0 ? Math.round((clickedCount / sentCount) * 100) : 0 },
        replied: { count: repliedCount, percent: sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0 },
        booked: { count: bookedCount, percent: sentCount > 0 ? Math.round((bookedCount / sentCount) * 100) : 0 }
      };
    }));
    
    console.log(`[Step Analytics] sequenceId=${sequenceId}, steps=${steps.length}, analytics=`, JSON.stringify(stepAnalytics));
    res.json({ stepAnalytics });
  } catch (error) {
    console.error("Step analytics error:", error);
    res.status(500).json({ error: "Failed to get step analytics" });
  }
});

// GET /api/sequences/:id/steps/negative-signals - Get negative signals per step
router.get("/sequences/:id/steps/negative-signals", authenticate, async (req, res) => {
  try {
    const sequenceId = req.params.id;
    
    // Verify sequence ownership
    const sequence = await storage.getSequence(req.userContext!, sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }
    
    // Get all steps for this sequence
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);
    
    const negativeSignals = await Promise.all(steps.map(async (step) => {
      // Not sent (failed status)
      const notSent = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailQueue)
        .where(and(
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, step.stepOrder),
          eq(emailQueue.status, 'failed')
        ));
      
      // Bounced
      const bounced = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadEvents)
        .where(and(
          eq(leadEvents.stepId, step.id),
          eq(leadEvents.eventType, 'bounced')
        ));
      
      // Unsubscribed
      const unsubscribed = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadEvents)
        .where(and(
          eq(leadEvents.stepId, step.id),
          eq(leadEvents.eventType, 'unsubscribed')
        ));
      
      // Not interested
      const notInterested = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadEvents)
        .where(and(
          eq(leadEvents.stepId, step.id),
          eq(leadEvents.eventType, 'not_interested')
        ));
      
      return {
        stepId: step.id,
        stepOrder: step.stepOrder,
        notSent: notSent[0]?.count || 0,
        bounced: bounced[0]?.count || 0,
        unsubscribed: unsubscribed[0]?.count || 0,
        notInterested: notInterested[0]?.count || 0
      };
    }));
    
    res.json({ negativeSignals });
  } catch (error) {
    console.error("Negative signals error:", error);
    res.status(500).json({ error: "Failed to get negative signals" });
  }
});

export default router;
