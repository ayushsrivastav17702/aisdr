/**
 * Email Volume Configuration
 * 
 * Configure these settings based on your Resend plan and sending requirements.
 * 
 * RESEND PLANS:
 * - Free:   100 emails/day, 1 email/sec
 * - Pro:    50,000 emails/day, 10 emails/sec ($20/month)
 * - Scale:  100,000 emails/day, 100 emails/sec ($90/month)
 * 
 * AI PERSONALIZATION LIMITS:
 * - OpenAI GPT-4:     500 req/min, ~2s per email
 * - OpenAI GPT-3.5:   3,500 req/min, ~0.8s per email  
 * - Anthropic Claude: 1,000 req/min, ~1.5s per email
 */

export interface EmailVolumeConfig {
  // Resend plan limits
  resendPlan: 'free' | 'pro' | 'scale' | 'enterprise';
  dailyEmailLimit: number;
  emailsPerSecond: number;
  
  // AI personalization settings
  aiProvider: 'openai-gpt4' | 'openai-gpt35' | 'anthropic' | 'none';
  aiConcurrentRequests: number;
  aiTimeoutMs: number;
  
  // Automation settings
  automationDailyLimit: number;
  delayBetweenEmailsMs: number;
  batchSize: number;
  
  // Mailbox rotation
  enableMailboxRotation: boolean;
  maxMailboxesInRotation: number;
}

// Configuration presets
export const EMAIL_VOLUME_PRESETS: Record<string, EmailVolumeConfig> = {
  // Current default (conservative)
  conservative: {
    resendPlan: 'free',
    dailyEmailLimit: 100,
    emailsPerSecond: 1,
    aiProvider: 'openai-gpt4',
    aiConcurrentRequests: 3,
    aiTimeoutMs: 30000,
    automationDailyLimit: 100,
    delayBetweenEmailsMs: 60000, // 1 minute between emails
    batchSize: 10,
    enableMailboxRotation: false,
    maxMailboxesInRotation: 1,
  },
  
  // Medium volume (Resend Pro)
  medium: {
    resendPlan: 'pro',
    dailyEmailLimit: 50000,
    emailsPerSecond: 10,
    aiProvider: 'openai-gpt35',
    aiConcurrentRequests: 10,
    aiTimeoutMs: 30000,
    automationDailyLimit: 5000,
    delayBetweenEmailsMs: 10000, // 10 seconds between emails
    batchSize: 50,
    enableMailboxRotation: true,
    maxMailboxesInRotation: 5,
  },
  
  // High volume (Resend Scale)
  high: {
    resendPlan: 'scale',
    dailyEmailLimit: 100000,
    emailsPerSecond: 100,
    aiProvider: 'openai-gpt35',
    aiConcurrentRequests: 20,
    aiTimeoutMs: 30000,
    automationDailyLimit: 10000,
    delayBetweenEmailsMs: 3000, // 3 seconds between emails
    batchSize: 100,
    enableMailboxRotation: true,
    maxMailboxesInRotation: 10,
  },
  
  // Enterprise (custom limits)
  enterprise: {
    resendPlan: 'enterprise',
    dailyEmailLimit: 500000,
    emailsPerSecond: 500,
    aiProvider: 'openai-gpt35',
    aiConcurrentRequests: 50,
    aiTimeoutMs: 30000,
    automationDailyLimit: 50000,
    delayBetweenEmailsMs: 1000, // 1 second between emails
    batchSize: 200,
    enableMailboxRotation: true,
    maxMailboxesInRotation: 20,
  },
};

// Active configuration - change this to switch presets
const ACTIVE_PRESET = process.env.EMAIL_VOLUME_PRESET || 'medium';

export const emailVolumeConfig: EmailVolumeConfig = 
  EMAIL_VOLUME_PRESETS[ACTIVE_PRESET] || EMAIL_VOLUME_PRESETS.medium;

// Helper functions
export function getEffectiveDailyLimit(): number {
  return Math.min(
    emailVolumeConfig.dailyEmailLimit,
    emailVolumeConfig.automationDailyLimit
  );
}

export function getEstimatedTimeForEmails(count: number): {
  minutes: number;
  hours: number;
  formatted: string;
} {
  const delayMs = emailVolumeConfig.delayBetweenEmailsMs;
  const totalMs = count * delayMs;
  const minutes = Math.ceil(totalMs / 60000);
  const hours = Math.round((totalMs / 3600000) * 10) / 10;
  
  if (hours >= 1) {
    return { minutes, hours, formatted: `${hours} hours` };
  }
  return { minutes, hours, formatted: `${minutes} minutes` };
}

export function getCapacityReport(): string {
  const config = emailVolumeConfig;
  const dailyLimit = getEffectiveDailyLimit();
  const hourlyLimit = Math.floor(dailyLimit / 24);
  const timeFor1000 = getEstimatedTimeForEmails(1000);
  
  return `
╔══════════════════════════════════════════════════════════════╗
║  EMAIL VOLUME CONFIGURATION - ${ACTIVE_PRESET.toUpperCase().padEnd(15)}              ║
╠══════════════════════════════════════════════════════════════╣
║  Resend Plan: ${config.resendPlan.padEnd(45)}║
║  Daily Limit: ${dailyLimit.toLocaleString().padEnd(45)}║
║  Hourly Capacity: ${hourlyLimit.toLocaleString().padEnd(41)}║
║  Delay Between Emails: ${(config.delayBetweenEmailsMs / 1000)}s${' '.repeat(36)}║
║  AI Provider: ${config.aiProvider.padEnd(45)}║
║  Concurrent AI Requests: ${config.aiConcurrentRequests.toString().padEnd(34)}║
║  Mailbox Rotation: ${config.enableMailboxRotation ? 'Enabled' : 'Disabled'}${' '.repeat(32)}║
║  Time for 1,000 emails: ${timeFor1000.formatted.padEnd(35)}║
╚══════════════════════════════════════════════════════════════╝
`;
}

// Log configuration on import
console.log(getCapacityReport());
