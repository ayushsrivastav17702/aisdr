import { db } from "../db";
import { emailMailboxes, InsertEmailMailbox, EmailMailbox } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import crypto from "crypto";

export class MailboxService {
  private encryptionKey = process.env.ENCRYPTION_KEY || "default-key-change-in-prod";

  async addMailbox(mailboxData: {
    name: string;
    email: string;
    provider: "gmail" | "outlook" | "smtp" | "sendgrid";
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    smtpSecure?: boolean;
    apiKey?: string;
  }): Promise<EmailMailbox> {
    try {
      const encrypted = {
        ...mailboxData,
        smtpPassword: mailboxData.smtpPassword ? this.encrypt(mailboxData.smtpPassword) : null,
        apiKey: mailboxData.apiKey ? this.encrypt(mailboxData.apiKey) : null,
      };

      const [mailbox] = await db
        .insert(emailMailboxes)
        .values({
          ...encrypted,
          status: "warming",
          warmupStage: 1,
          dailyLimit: this.getWarmupLimit(1),
        })
        .returning();

      console.log(`✅ Added mailbox: ${mailbox.email}`);
      return mailbox;
    } catch (error) {
      console.error("Failed to add mailbox:", error);
      throw error;
    }
  }

  async getNextMailbox(): Promise<EmailMailbox> {
    const availableMailboxes = await db
      .select()
      .from(emailMailboxes)
      .where(
        and(
          sql`${emailMailboxes.status} IN ('active', 'warming')`,
          lt(emailMailboxes.dailySent, sql`${emailMailboxes.dailyLimit}`)
        )
      )
      .orderBy(emailMailboxes.roundRobinOrder);

    if (availableMailboxes.length === 0) {
      throw new Error("No available mailboxes");
    }

    const mailbox = availableMailboxes[0];

    await db
      .update(emailMailboxes)
      .set({
        roundRobinOrder: sql`${emailMailboxes.roundRobinOrder} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailbox.id));

    return mailbox;
  }

  async incrementDailySent(mailboxId: string): Promise<void> {
    await db
      .update(emailMailboxes)
      .set({
        dailySent: sql`${emailMailboxes.dailySent} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailboxId));
  }

  async resetDailyCounters(): Promise<void> {
    await db.update(emailMailboxes).set({
      dailySent: 0,
      lastResetAt: new Date(),
    });
    console.log("✅ Reset daily mailbox counters");
  }

  private getWarmupLimit(stage: number): number {
    const limits: Record<number, number> = {
      1: 10,
      2: 20,
      3: 50,
      4: 100,
      5: 200,
    };
    return limits[stage] || 200;
  }

  async advanceWarmup(mailboxId: string): Promise<void> {
    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, mailboxId));

    if (mailbox && mailbox.warmupStage !== null && mailbox.warmupStage < 5) {
      const newStage = mailbox.warmupStage + 1;
      await db
        .update(emailMailboxes)
        .set({
          warmupStage: newStage,
          dailyLimit: this.getWarmupLimit(newStage),
          status: newStage >= 5 ? "active" : "warming",
        })
        .where(eq(emailMailboxes.id, mailboxId));

      console.log(`📈 Mailbox ${mailbox.email} advanced to warmup stage ${newStage}`);
    }
  }

  private encrypt(text: string): string {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    return iv.toString("hex") + ":" + encrypted;
  }

  decrypt(encrypted: string): string {
    if (encrypted.includes(":")) {
      const algorithm = "aes-256-cbc";
      const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
      
      const parts = encrypted.split(":");
      const iv = Buffer.from(parts[0], "hex");
      const encryptedText = parts[1];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      
      return decrypted;
    } else {
      const decipher = crypto.createDecipher("aes-256-cbc", this.encryptionKey);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
  }

  async getAllMailboxes(): Promise<EmailMailbox[]> {
    return await db.select().from(emailMailboxes);
  }

  async getMailboxById(id: string): Promise<EmailMailbox | undefined> {
    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.id, id));
    return mailbox;
  }

  async updateStatus(mailboxId: string, status: "active" | "paused" | "error" | "warming"): Promise<void> {
    await db
      .update(emailMailboxes)
      .set({ status, updatedAt: new Date() })
      .where(eq(emailMailboxes.id, mailboxId));
  }

  async deleteMailbox(mailboxId: string): Promise<void> {
    await db.delete(emailMailboxes).where(eq(emailMailboxes.id, mailboxId));
  }

  async testConnection(mailboxId: string): Promise<boolean> {
    const mailbox = await this.getMailboxById(mailboxId);
    if (!mailbox) {
      throw new Error("Mailbox not found");
    }

    return true;
  }
}

export const mailboxService = new MailboxService();
