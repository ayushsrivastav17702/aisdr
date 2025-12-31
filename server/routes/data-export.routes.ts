import { Router } from 'express';
import { authenticate, forbidManager } from '../middleware/auth.middleware';
import { db } from '../db';
import { 
  prospects, 
  sequences, 
  sequenceSteps, 
  sequenceProspects, 
  emailQueue, 
  emailSendLog,
  emailReplies,
  searches,
  jobs,
  importRecords,
  users
} from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify';
import { getEffectiveUserId } from '../storage';

const router = Router();

// Export safety limits to prevent excessive memory usage
const EXPORT_LIMIT = 50000; // Max records per export

// Export prospects as CSV
router.get('/api/export/prospects/csv', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const userProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.userId, effectiveUserId))
      .limit(EXPORT_LIMIT);

    stringify(userProspects, {
      header: true,
      columns: [
        'id', 'firstName', 'lastName', 'fullName', 'primaryEmail', 
        'secondaryEmail', 'jobTitle', 'seniority', 'department',
        'companyName', 'companyDomain', 'companySize', 'companyIndustry',
        'companyLocation', 'contactLocation', 'phoneNumber', 'linkedinUrl',
        'tags', 'leadScore', 'enrichmentStatus', 'createdAt', 'updatedAt'
      ]
    }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="prospects.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Export prospects error:', error);
    res.status(500).json({ error: 'Failed to export prospects' });
  }
});

// Export prospects as JSON
router.get('/api/export/prospects/json', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const userProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.userId, effectiveUserId))
      .limit(EXPORT_LIMIT);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="prospects.json"');
    res.json(userProspects);
  } catch (error) {
    console.error('Export prospects error:', error);
    res.status(500).json({ error: 'Failed to export prospects' });
  }
});

// Export sequences as CSV
router.get('/api/export/sequences/csv', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const userSequences = await db
      .select()
      .from(sequences)
      .where(eq(sequences.userId, effectiveUserId));

    stringify(userSequences, {
      header: true,
      columns: [
        'id', 'name', 'description', 'isActive', 'totalSteps',
        'createdAt', 'updatedAt'
      ]
    }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sequences.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Export sequences error:', error);
    res.status(500).json({ error: 'Failed to export sequences' });
  }
});

// Export sequences as JSON (with steps)
router.get('/api/export/sequences/json', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const userSequences = await db
      .select()
      .from(sequences)
      .where(eq(sequences.userId, effectiveUserId));

    const sequencesWithSteps = await Promise.all(
      userSequences.map(async (sequence) => {
        const steps = await db
          .select()
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, sequence.id));
        
        return {
          ...sequence,
          steps
        };
      })
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="sequences.json"');
    res.json(sequencesWithSteps);
  } catch (error) {
    console.error('Export sequences error:', error);
    res.status(500).json({ error: 'Failed to export sequences' });
  }
});

// Export email activity as CSV
router.get('/api/export/emails/csv', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const emailActivity = await db
      .select()
      .from(emailSendLog)
      .where(eq(emailSendLog.userId, effectiveUserId));

    stringify(emailActivity, {
      header: true,
      columns: [
        'id', 'mailboxId', 'status', 'messageId', 'sentAt', 'deliveredAt',
        'error', 'responseCode', 'responseMessage', 'createdAt'
      ]
    }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="email-activity.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Export email activity error:', error);
    res.status(500).json({ error: 'Failed to export email activity' });
  }
});

// Export email replies as CSV
router.get('/api/export/replies/csv', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    // Join with prospects to filter by userId
    const replies = await db
      .select({
        id: emailReplies.id,
        prospectId: emailReplies.prospectId,
        sequenceId: emailReplies.sequenceId,
        emailId: emailReplies.emailId,
        replyContent: emailReplies.replyContent,
        sentiment: emailReplies.sentiment,
        receivedAt: emailReplies.receivedAt,
        aiSummary: emailReplies.aiSummary,
        nextAction: emailReplies.nextAction,
        createdAt: emailReplies.createdAt
      })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(eq(prospects.userId, effectiveUserId));

    stringify(replies, {
      header: true,
      columns: [
        'id', 'prospectId', 'sequenceId', 'emailId', 'replyContent',
        'sentiment', 'receivedAt', 'aiSummary', 'nextAction', 'createdAt'
      ]
    }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="email-replies.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Export email replies error:', error);
    res.status(500).json({ error: 'Failed to export email replies' });
  }
});

// Export searches/analytics as CSV
router.get('/api/export/analytics/csv', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const effectiveUserId = getEffectiveUserId(req.userContext);

    const userSearches = await db
      .select()
      .from(searches)
      .where(eq(searches.userId, effectiveUserId));

    stringify(userSearches, {
      header: true,
      columns: [
        'id', 'query', 'extractionName', 'tag', 'totalResults',
        'importedResults', 'createdAt'
      ]
    }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

// Export full account data as JSON (GDPR complete data export)
router.get('/api/export/account/full', authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = getEffectiveUserId(req.userContext);

    // Collect all user data
    // Get user info
    const userInfoResult = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    }).from(users).where(eq(users.id, userId));

    const userInfo = userInfoResult[0];

    // Get user sequences
    const userSequences = await db
      .select()
      .from(sequences)
      .where(eq(sequences.userId, userId));

    // Get user prospects
    const userProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.userId, userId));

    // Get sequence steps - JOIN with sequences to filter by userId
    const userSteps = await db
      .select({
        id: sequenceSteps.id,
        sequenceId: sequenceSteps.sequenceId,
        subject: sequenceSteps.subject,
        body: sequenceSteps.body,
        stepOrder: sequenceSteps.stepOrder,
        delayDays: sequenceSteps.delayDays,
        stepType: sequenceSteps.stepType,
        aiGenerated: sequenceSteps.aiGenerated,
        variables: sequenceSteps.variables,
        createdAt: sequenceSteps.createdAt,
        updatedAt: sequenceSteps.updatedAt
      })
      .from(sequenceSteps)
      .innerJoin(sequences, eq(sequenceSteps.sequenceId, sequences.id))
      .where(eq(sequences.userId, userId));

    // Get enrollments - JOIN with prospects to filter by userId
    const userEnrollments = await db
      .select({
        id: sequenceProspects.id,
        sequenceId: sequenceProspects.sequenceId,
        prospectId: sequenceProspects.prospectId,
        currentStepId: sequenceProspects.currentStepId,
        automationRunId: sequenceProspects.automationRunId,
        status: sequenceProspects.status,
        enrolledAt: sequenceProspects.enrolledAt,
        lastContactedAt: sequenceProspects.lastContactedAt,
        completedAt: sequenceProspects.completedAt,
        replies: sequenceProspects.replies,
        opens: sequenceProspects.opens,
        clicks: sequenceProspects.clicks
      })
      .from(sequenceProspects)
      .innerJoin(prospects, eq(sequenceProspects.prospectId, prospects.id))
      .where(eq(prospects.userId, userId));

    // Get email activity - already filtered by userId
    const userEmails = await db
      .select()
      .from(emailSendLog)
      .where(eq(emailSendLog.userId, userId));

    // Get email replies - JOIN with prospects to filter by userId
    const userReplies = await db
      .select({
        id: emailReplies.id,
        emailId: emailReplies.emailId,
        sequenceId: emailReplies.sequenceId,
        prospectId: emailReplies.prospectId,
        replyContent: emailReplies.replyContent,
        sentiment: emailReplies.sentiment,
        receivedAt: emailReplies.receivedAt,
        aiSummary: emailReplies.aiSummary,
        nextAction: emailReplies.nextAction,
        createdAt: emailReplies.createdAt
      })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(eq(prospects.userId, userId));

    // Get searches, jobs, and imports - already filtered by userId
    const userSearches = await db.select().from(searches).where(eq(searches.userId, userId));
    const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
    const userImports = await db.select().from(importRecords).where(eq(importRecords.userId, userId));

    const fullAccountData = {
      exportedAt: new Date().toISOString(),
      user: userInfo,
      statistics: {
        totalProspects: userProspects.length,
        totalSequences: userSequences.length,
        totalEmailsSent: userEmails.length,
        totalReplies: userReplies.length,
        totalSearches: userSearches.length
      },
      data: {
        prospects: userProspects,
        sequences: userSequences,
        sequenceSteps: userSteps,
        enrollments: userEnrollments,
        emailActivity: userEmails,
        emailReplies: userReplies,
        searches: userSearches,
        jobs: userJobs,
        imports: userImports
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="account-data-${userId}.json"`);
    res.json(fullAccountData);
  } catch (error) {
    console.error('Export full account error:', error);
    res.status(500).json({ error: 'Failed to export account data' });
  }
});

export default router;
