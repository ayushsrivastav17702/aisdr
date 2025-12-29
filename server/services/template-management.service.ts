import { db } from '../db';
import { messageTemplates, emails, emailReplies, type MessageTemplate, type InsertMessageTemplate } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface TemplatePerformance {
  totalSent: number;
  totalOpens: number;
  totalReplies: number;
  openRate: number;
  replyRate: number;
}

export interface TemplateWithPerformance extends MessageTemplate {
  performance: TemplatePerformance;
}

export interface ApplyTemplateParams {
  templateId: string;
  variables: Record<string, string>;
}

class TemplateManagementService {
  async createTemplate(data: InsertMessageTemplate): Promise<MessageTemplate> {
    const [template] = await db.insert(messageTemplates)
      .values({
        ...data,
        variables: this.extractVariables(data.body, data.subjectLine || ''),
      })
      .returning();
    return template;
  }

  async getTemplateById(id: string, userId: string): Promise<MessageTemplate | null> {
    const [template] = await db.select()
      .from(messageTemplates)
      .where(and(
        eq(messageTemplates.id, id),
        eq(messageTemplates.userId, userId)
      ))
      .limit(1);
    return template || null;
  }

  async getTemplatesForUser(userId: string, tenantId?: string): Promise<TemplateWithPerformance[]> {
    const conditions = [eq(messageTemplates.userId, userId)];
    if (tenantId) {
      conditions.push(eq(messageTemplates.tenantId, tenantId));
    }

    const templates = await db.select()
      .from(messageTemplates)
      .where(and(...conditions))
      .orderBy(desc(messageTemplates.createdAt));

    return templates.map(t => ({
      ...t,
      performance: {
        totalSent: t.totalSent || 0,
        totalOpens: t.totalOpens || 0,
        totalReplies: t.totalReplies || 0,
        openRate: t.totalSent ? ((t.totalOpens || 0) / t.totalSent) * 100 : 0,
        replyRate: t.totalSent ? ((t.totalReplies || 0) / t.totalSent) * 100 : 0,
      },
    }));
  }

  async getSharedTemplates(tenantId: string): Promise<MessageTemplate[]> {
    return db.select()
      .from(messageTemplates)
      .where(and(
        eq(messageTemplates.tenantId, tenantId),
        eq(messageTemplates.type, 'team')
      ))
      .orderBy(desc(messageTemplates.avgReplyRate));
  }

  async updateTemplate(id: string, userId: string, data: Partial<InsertMessageTemplate>): Promise<MessageTemplate | null> {
    const updates: Partial<InsertMessageTemplate & { updatedAt: Date }> = {
      ...data,
      updatedAt: new Date(),
    };
    
    if (data.body || data.subjectLine) {
      const existing = await this.getTemplateById(id, userId);
      if (existing) {
        updates.variables = this.extractVariables(
          data.body || existing.body,
          data.subjectLine || existing.subjectLine || ''
        );
      }
    }

    const [updated] = await db.update(messageTemplates)
      .set(updates)
      .where(and(
        eq(messageTemplates.id, id),
        eq(messageTemplates.userId, userId)
      ))
      .returning();
    return updated || null;
  }

  async deleteTemplate(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(messageTemplates)
      .where(and(
        eq(messageTemplates.id, id),
        eq(messageTemplates.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  applyTemplate(template: MessageTemplate, variables: Record<string, string>): { subject: string; body: string } {
    let subject = template.subjectLine || '';
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    return { subject, body };
  }

  async incrementUseCount(templateId: string): Promise<void> {
    await db.update(messageTemplates)
      .set({
        useCount: sql`${messageTemplates.useCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(messageTemplates.id, templateId));
  }

  async updateTemplateStats(templateId: string, stats: { sent?: number; opened?: number; replied?: number }): Promise<void> {
    const updates: Record<string, any> = { updatedAt: new Date() };
    
    if (stats.sent) {
      updates.totalSent = sql`${messageTemplates.totalSent} + ${stats.sent}`;
    }
    if (stats.opened) {
      updates.totalOpens = sql`${messageTemplates.totalOpens} + ${stats.opened}`;
    }
    if (stats.replied) {
      updates.totalReplies = sql`${messageTemplates.totalReplies} + ${stats.replied}`;
    }

    await db.update(messageTemplates)
      .set(updates)
      .where(eq(messageTemplates.id, templateId));
    
    await this.recalculateReplyRate(templateId);
  }

  private async recalculateReplyRate(templateId: string): Promise<void> {
    const [template] = await db.select()
      .from(messageTemplates)
      .where(eq(messageTemplates.id, templateId))
      .limit(1);

    if (template && template.totalSent && template.totalSent > 0) {
      const avgReplyRate = ((template.totalReplies || 0) / template.totalSent) * 100;
      await db.update(messageTemplates)
        .set({ avgReplyRate })
        .where(eq(messageTemplates.id, templateId));
    }
  }

  async getTopPerformingTemplates(userId: string, limit = 10): Promise<TemplateWithPerformance[]> {
    const templates = await db.select()
      .from(messageTemplates)
      .where(and(
        eq(messageTemplates.userId, userId),
        sql`${messageTemplates.totalSent} >= 5`
      ))
      .orderBy(desc(messageTemplates.avgReplyRate))
      .limit(limit);

    return templates.map(t => ({
      ...t,
      performance: {
        totalSent: t.totalSent || 0,
        totalOpens: t.totalOpens || 0,
        totalReplies: t.totalReplies || 0,
        openRate: t.totalSent ? ((t.totalOpens || 0) / t.totalSent) * 100 : 0,
        replyRate: t.totalSent ? ((t.totalReplies || 0) / t.totalSent) * 100 : 0,
      },
    }));
  }

  async saveEmailAsTemplate(
    emailId: string, 
    userId: string, 
    name: string, 
    options?: { type?: 'personal' | 'team' | 'company'; category?: string }
  ): Promise<MessageTemplate | null> {
    const [email] = await db.select()
      .from(emails)
      .where(and(
        eq(emails.id, emailId),
        eq(emails.userId, userId)
      ))
      .limit(1);

    if (!email) return null;

    return this.createTemplate({
      userId,
      name,
      subjectLine: email.subject,
      body: email.content,
      type: options?.type || 'personal',
      category: options?.category,
    });
  }

  private extractVariables(body: string, subject: string): string[] {
    const combined = `${subject} ${body}`;
    const matches = combined.match(/\{\{(\w+)\}\}/g) || [];
    const variables = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
    return Array.from(new Set(variables));
  }

  async cloneTemplate(templateId: string, userId: string, newName?: string): Promise<MessageTemplate | null> {
    const original = await this.getTemplateById(templateId, userId);
    if (!original) return null;

    return this.createTemplate({
      userId,
      tenantId: original.tenantId,
      name: newName || `${original.name} (Copy)`,
      subjectLine: original.subjectLine,
      body: original.body,
      type: 'personal',
      tone: original.tone,
      category: original.category,
      variables: original.variables as string[],
    });
  }
}

export const templateManagementService = new TemplateManagementService();
