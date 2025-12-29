import { Router, Request, Response } from "express";
import { db } from "./db";
import { emailReplies, emails, prospects } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate } from "./middleware/auth.middleware";
import { replyClassificationService } from "./services/reply-classification.service";

export const inboxRouter = Router();

inboxRouter.get("/replies", authenticate, async (req: Request, res: Response) => {
  const userId = req.userContext?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const replies = await db
      .select({
        id: emailReplies.id,
        emailId: emailReplies.emailId,
        sequenceId: emailReplies.sequenceId,
        prospectId: emailReplies.prospectId,
        replyContent: emailReplies.replyContent,
        sentiment: emailReplies.sentiment,
        replyType: emailReplies.replyType,
        intent: emailReplies.intent,
        extractedInfo: emailReplies.extractedInfo,
        oooReturnDate: emailReplies.oooReturnDate,
        receivedAt: emailReplies.receivedAt,
        aiSummary: emailReplies.aiSummary,
        nextAction: emailReplies.nextAction,
        processed: emailReplies.processed,
        createdAt: emailReplies.createdAt,
        prospect: {
          id: prospects.id,
          fullName: prospects.fullName,
          firstName: prospects.firstName,
          lastName: prospects.lastName,
          primaryEmail: prospects.primaryEmail,
          companyName: prospects.companyName,
          jobTitle: prospects.jobTitle,
        },
      })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(eq(emails.userId, userId))
      .orderBy(desc(emailReplies.receivedAt))
      .limit(100);

    const formattedReplies = replies.map(r => ({
      ...r,
      prospect: r.prospect,
    }));

    res.json(formattedReplies);
  } catch (error) {
    console.error("Error fetching inbox replies:", error);
    res.status(500).json({ error: "Failed to fetch replies" });
  }
});

inboxRouter.get("/stats", authenticate, async (req: Request, res: Response) => {
  const userId = req.userContext?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const allReplies = await db
      .select({
        processed: emailReplies.processed,
        sentiment: emailReplies.sentiment,
        intent: emailReplies.intent,
      })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(eq(emails.userId, userId));

    const stats = {
      total: allReplies.length,
      unread: allReplies.filter(r => !r.processed).length,
      positive: allReplies.filter(r => r.sentiment === 'positive').length,
      needsAction: allReplies.filter(r => 
        r.intent === 'meeting_request' || 
        r.intent === 'interested' || 
        r.intent === 'question'
      ).length,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching inbox stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

inboxRouter.post("/replies/:id/read", authenticate, async (req: Request, res: Response) => {
  const userId = req.userContext?.userId;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Verify ownership through email before processing
    const [replyOwnership] = await db
      .select({ replyId: emailReplies.id })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(and(
        eq(emailReplies.id, id),
        eq(emails.userId, userId)
      ))
      .limit(1);

    if (!replyOwnership) {
      return res.status(404).json({ error: "Reply not found" });
    }

    const result = await replyClassificationService.processReply(id, userId);
    
    if (!result) {
      return res.status(404).json({ error: "Reply not found" });
    }

    res.json({ success: true, reply: result.reply });
  } catch (error) {
    console.error("Error marking reply as read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

inboxRouter.post("/replies/:id/archive", authenticate, async (req: Request, res: Response) => {
  const userId = req.userContext?.userId;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [reply] = await db
      .select()
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(and(
        eq(emailReplies.id, id),
        eq(emails.userId, userId)
      ))
      .limit(1);

    if (!reply) {
      return res.status(404).json({ error: "Reply not found" });
    }

    await db
      .update(emailReplies)
      .set({ processed: true })
      .where(eq(emailReplies.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error archiving reply:", error);
    res.status(500).json({ error: "Failed to archive reply" });
  }
});

inboxRouter.get("/replies/:id", authenticate, async (req: Request, res: Response) => {
  const userId = req.userContext?.userId;
  const { id } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [reply] = await db
      .select({
        id: emailReplies.id,
        emailId: emailReplies.emailId,
        sequenceId: emailReplies.sequenceId,
        prospectId: emailReplies.prospectId,
        replyContent: emailReplies.replyContent,
        sentiment: emailReplies.sentiment,
        replyType: emailReplies.replyType,
        intent: emailReplies.intent,
        extractedInfo: emailReplies.extractedInfo,
        oooReturnDate: emailReplies.oooReturnDate,
        receivedAt: emailReplies.receivedAt,
        aiSummary: emailReplies.aiSummary,
        nextAction: emailReplies.nextAction,
        processed: emailReplies.processed,
        createdAt: emailReplies.createdAt,
        prospect: {
          id: prospects.id,
          fullName: prospects.fullName,
          firstName: prospects.firstName,
          lastName: prospects.lastName,
          primaryEmail: prospects.primaryEmail,
          companyName: prospects.companyName,
          jobTitle: prospects.jobTitle,
        },
        email: {
          id: emails.id,
          subject: emails.subject,
          content: emails.content,
          sentAt: emails.sentAt,
        },
      })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(and(
        eq(emailReplies.id, id),
        eq(emails.userId, userId)
      ))
      .limit(1);

    if (!reply) {
      return res.status(404).json({ error: "Reply not found" });
    }

    res.json(reply);
  } catch (error) {
    console.error("Error fetching reply:", error);
    res.status(500).json({ error: "Failed to fetch reply" });
  }
});
