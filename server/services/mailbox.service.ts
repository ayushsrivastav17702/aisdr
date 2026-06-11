import { db } from "../db";
import { emailMailboxes, InsertEmailMailbox, EmailMailbox } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import crypto from "crypto";

/**
 * Validates ENCRYPTION_KEY and returns it if valid.
 * Throws an error if missing or weak (< 32 characters).
 */
function getValidatedEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      '🔐 SECURITY ERROR: ENCRYPTION_KEY environment variable is required.\n' +
      'Mailbox credentials cannot be encrypted without this key.\n' +
      'Generate a secure key with: openssl rand -hex 32'
    );
  }
  
  if (key.length < 32) {
    throw new Error(
      `🔐 SECURITY ERROR: ENCRYPTION_KEY must be at least 32 characters (currently ${key.length}).\n` +
      'A weak encryption key puts all mailbox credentials at risk.\n' +
      'Generate a secure key with: openssl rand -hex 32'
    );
  }
  
  return key;
}

export class MailboxService {
  private encryptionKey: string;

  constructor() {
    this.encryptionKey = getValidatedEncryptionKey();
  }

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
    userId?: string; // User ID for multi-tenant ownership
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

      console.log(`✅ Added mailbox: ${mailbox.email} for user ${mailboxData.userId || 'system'}`);
      return mailbox;
    } catch (error) {
      console.error("Failed to add mailbox:", error);
      throw error;
    }
  }

  async getNextMailbox(userId?: string): Promise<EmailMailbox> {
    // Build base conditions
    const baseConditions = [
      sql`${emailMailboxes.status} IN ('active', 'warming')`,
      lt(emailMailboxes.dailySent, sql`${emailMailboxes.dailyLimit}`)
    ];

    // Add user filtering if userId provided (multi-tenant mode)
    if (userId) {
      baseConditions.push(eq(emailMailboxes.userId, userId));
    }

    // First, try to find user's default mailbox
    const [defaultMailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(
        and(
          eq(emailMailboxes.isDefault, true),
          ...baseConditions
        )
      )
      .limit(1);

    if (defaultMailbox) {
      await db
        .update(emailMailboxes)
        .set({
          lastUsedAt: new Date(),
        })
        .where(eq(emailMailboxes.id, defaultMailbox.id));

      console.log(`✅ Selected default mailbox for user ${userId || 'system'}: ${defaultMailbox.email}`);
      return defaultMailbox;
    }

    // Fallback: Get available mailboxes for this user, ordered by last used
    const availableMailboxes = await db
      .select()
      .from(emailMailboxes)
      .where(and(...baseConditions))
      .orderBy(emailMailboxes.lastUsedAt);

    if (availableMailboxes.length === 0) {
      const errorMsg = userId 
        ? `No available mailboxes for user ${userId}. Please add a mailbox in Settings.`
        : "No available mailboxes in the system";
      throw new Error(errorMsg);
    }

    const mailbox = availableMailboxes[0];

    await db
      .update(emailMailboxes)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailbox.id));

    console.log(`✅ Selected mailbox for user ${userId || 'system'}: ${mailbox.email}`);
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
    if (!encrypted.includes(":")) {
      throw new Error(
        "Legacy encrypted data detected. Data must be re-encrypted using the secure format. " +
        "Please update the stored credentials for this mailbox."
      );
    }
    
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(this.encryptionKey, "salt", 32);
    
    const parts = encrypted.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  }

  async getAllMailboxes(): Promise<EmailMailbox[]> {
    return await db.select().from(emailMailboxes);
  }

  async getMailboxesByUserId(userId: string): Promise<EmailMailbox[]> {
    // SECURITY: Only return mailboxes owned by this user
    return await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.userId, userId));
  }

  /**
   * Create or update a Gmail mailbox connected via OAuth. If the user
   * already has a mailbox for this email address, refresh its OAuth
   * tokens; otherwise create a new mailbox entry.
   */
  async upsertGmailOAuthMailbox(params: {
    userId: string;
    email: string;
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }): Promise<EmailMailbox> {
    const tokenExpiry = new Date(Date.now() + params.expiresIn * 1000);
    const encryptedAccessToken = this.encrypt(params.accessToken);
    const encryptedRefreshToken = params.refreshToken ? this.encrypt(params.refreshToken) : undefined;

    const [existing] = await db
      .select()
      .from(emailMailboxes)
      .where(and(eq(emailMailboxes.userId, params.userId), eq(emailMailboxes.email, params.email)));

    if (existing) {
      const updateData: Partial<InsertEmailMailbox> & { updatedAt: Date } = {
        accessToken: encryptedAccessToken,
        tokenExpiry,
        status: "active",
        updatedAt: new Date(),
      };
      // Google only returns a refresh_token on the first consent grant;
      // don't overwrite an existing one with undefined on re-connect.
      if (encryptedRefreshToken) {
        updateData.refreshToken = encryptedRefreshToken;
      }

      const [updated] = await db
        .update(emailMailboxes)
        .set(updateData)
        .where(eq(emailMailboxes.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(emailMailboxes)
      .values({
        userId: params.userId,
        name: params.email,
        email: params.email,
        provider: "gmail",
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpUser: params.email,
        smtpSecure: true,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry,
        status: "warming",
        warmupStage: 1,
        dailyLimit: this.getWarmupLimit(1),
      })
      .returning();

    console.log(`✅ Connected Gmail mailbox via OAuth: ${created.email} for user ${params.userId}`);
    return created;
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

  async updateMailbox(mailboxId: string, updates: Partial<InsertEmailMailbox>): Promise<EmailMailbox> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    
    if (updates.smtpPassword) {
      updateData.smtpPassword = this.encrypt(updates.smtpPassword);
    }
    
    if (updates.apiKey) {
      updateData.apiKey = this.encrypt(updates.apiKey);
    }
    
    const [updated] = await db
      .update(emailMailboxes)
      .set(updateData)
      .where(eq(emailMailboxes.id, mailboxId))
      .returning();
    
    if (!updated) {
      throw new Error(`Mailbox ${mailboxId} not found`);
    }
    
    return updated;
  }

  async testConnection(mailboxId: string): Promise<boolean> {
    const mailbox = await this.getMailboxById(mailboxId);
    if (!mailbox) {
      throw new Error("Mailbox not found");
    }

    return true;
  }

  async setDefaultMailbox(mailboxId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [mailbox] = await tx
        .select()
        .from(emailMailboxes)
        .where(eq(emailMailboxes.id, mailboxId));
      
      if (!mailbox) {
        throw new Error(`Mailbox with ID ${mailboxId} not found`);
      }

      await tx.update(emailMailboxes).set({ isDefault: false });
      
      const result = await tx
        .update(emailMailboxes)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(emailMailboxes.id, mailboxId))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Failed to set mailbox ${mailboxId} as default - mailbox no longer exists`);
      }
      
      console.log(`✅ Set ${mailbox.email} as default mailbox`);
    });
  }

  async setDefaultMailboxByEmail(email: string): Promise<void> {
    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.email, email));
    
    if (!mailbox) {
      throw new Error(`Mailbox with email ${email} not found`);
    }
    
    await this.setDefaultMailbox(mailbox.id);
  }

  async checkMailboxHealth(mailboxId: string): Promise<{
    healthy: boolean;
    smtp: { connected: boolean; error?: string };
    imap: { connected: boolean; error?: string };
    lastChecked: string;
  }> {
    const mailbox = await this.getMailboxById(mailboxId);
    if (!mailbox) {
      throw new Error("Mailbox not found");
    }

    const result = {
      healthy: false,
      smtp: { connected: false, error: undefined as string | undefined },
      imap: { connected: false, error: undefined as string | undefined },
      lastChecked: new Date().toISOString()
    };

    const password = mailbox.smtpPassword ? this.decrypt(mailbox.smtpPassword) : "";

    if (!password) {
      result.smtp.error = "No SMTP password configured";
      result.imap.error = "No IMAP password configured";
      return result;
    }

    const nodemailer = await import("nodemailer");
    try {
      const smtpConfig = {
        host: mailbox.smtpHost || "smtp.gmail.com",
        port: mailbox.smtpPort || 587,
        secure: mailbox.smtpSecure ?? false,
        auth: {
          user: mailbox.smtpUser || mailbox.email,
          pass: password
        }
      };

      const transporter = nodemailer.default.createTransport(smtpConfig);
      await transporter.verify();
      result.smtp.connected = true;
    } catch (error) {
      result.smtp.error = error instanceof Error ? error.message : "SMTP connection failed";
    }

    const Imap = (await import("imap")).default;
    try {
      // Determine IMAP host based on provider with sensible fallbacks
      let imapHost = "imap.gmail.com"; // Default to Gmail
      
      // Provider-specific IMAP hosts
      const providerImapHosts: Record<string, string> = {
        gmail: "imap.gmail.com",
        outlook: "outlook.office365.com",
        sendgrid: "imap.gmail.com" // SendGrid doesn't have IMAP, default to Gmail
      };
      
      if (mailbox.provider && providerImapHosts[mailbox.provider]) {
        imapHost = providerImapHosts[mailbox.provider];
      } else if (mailbox.provider === "smtp" && mailbox.smtpHost) {
        // For custom SMTP, try to derive IMAP host intelligently
        const smtpHost = mailbox.smtpHost.toLowerCase();
        
        // Common SMTP → IMAP host mappings
        if (smtpHost.includes("gmail")) {
          imapHost = "imap.gmail.com";
        } else if (smtpHost.includes("outlook") || smtpHost.includes("office365")) {
          imapHost = "outlook.office365.com";
        } else if (smtpHost.includes("yahoo")) {
          imapHost = "imap.mail.yahoo.com";
        } else if (smtpHost.startsWith("smtp.")) {
          // Generic smtp.domain.com → imap.domain.com transformation
          imapHost = smtpHost.replace(/^smtp\./, "imap.");
        } else {
          // Fallback: prepend imap. to the domain
          imapHost = `imap.${smtpHost.replace(/^mail\./, "")}`;
        }
      }
      
      const imapConnected = await new Promise<boolean>((resolve) => {
        const imapConfig = {
          user: mailbox.smtpUser || mailbox.email,
          password: password,
          host: imapHost,
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          connTimeout: 10000,
          authTimeout: 10000
        };

        const imap = new Imap(imapConfig);

        const timeout = setTimeout(() => {
          result.imap.error = "IMAP connection timeout";
          try { imap.end(); } catch {}
          resolve(false);
        }, 15000);

        imap.once("ready", () => {
          // Test actual INBOX access to verify credentials fully work
          imap.openBox("INBOX", true, (err: any) => {
            clearTimeout(timeout);
            if (err) {
              result.imap.error = `INBOX access failed: ${err.message || err}`;
              imap.end();
              resolve(false);
            } else {
              imap.end();
              resolve(true);
            }
          });
        });

        imap.once("error", (err: any) => {
          clearTimeout(timeout);
          result.imap.error = err?.message || "IMAP connection failed";
          try { imap.end(); } catch {}
          resolve(false);
        });

        imap.connect();
      });

      result.imap.connected = imapConnected;
    } catch (error) {
      result.imap.error = error instanceof Error ? error.message : "IMAP connection failed";
    }

    result.healthy = result.smtp.connected && result.imap.connected;
    return result;
  }
}

export const mailboxService = new MailboxService();
