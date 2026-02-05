interface KnowledgeEntry {
  keywords: string[];
  content: string;
  category: string;
}

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    keywords: ["etimedout", "timeout", "connection"],
    content: "ETIMEDOUT indicates the SMTP server did not respond within the timeout period. This is a temporary/retryable error. Common causes: network issues, SMTP server overload, firewall blocking. The system will automatically retry with exponential backoff.",
    category: "smtp_errors",
  },
  {
    keywords: ["econnrefused", "refused", "connection refused"],
    content: "ECONNREFUSED means the SMTP server actively refused the connection. Check: server is running, correct port, firewall rules. This is typically retryable.",
    category: "smtp_errors",
  },
  {
    keywords: ["econnreset", "reset", "connection reset"],
    content: "ECONNRESET indicates the connection was forcefully closed by the remote server. Often caused by: security policies, rate limiting, or server restart. Retryable error.",
    category: "smtp_errors",
  },
  {
    keywords: ["4xx", "421", "450", "451", "452"],
    content: "SMTP 4xx errors are temporary failures. 421=service unavailable, 450=mailbox unavailable, 451=local error, 452=insufficient storage. These are automatically retried.",
    category: "smtp_errors",
  },
  {
    keywords: ["5xx", "550", "551", "552", "553", "554"],
    content: "SMTP 5xx errors are permanent failures. 550=mailbox not found, 551=user not local, 552=storage exceeded, 553=invalid mailbox, 554=transaction failed. These are NOT retried.",
    category: "smtp_errors",
  },
  {
    keywords: ["blocked", "blacklist", "spam"],
    content: "Email was blocked by the recipient's mail server. Common reasons: sender IP/domain blacklisted, content flagged as spam, recipient server policy. Non-retryable.",
    category: "smtp_errors",
  },
  {
    keywords: ["rate", "limit", "throttle", "too many"],
    content: "Rate limit reached on the sending mailbox or SMTP server. The system respects daily limits per mailbox and will resume sending after the limit resets. Retryable.",
    category: "smtp_errors",
  },
  {
    keywords: ["invalid", "email", "address", "syntax"],
    content: "The recipient email address is invalid or malformed. This is a permanent error and will not be retried. Verify prospect email addresses.",
    category: "smtp_errors",
  },
  {
    keywords: ["auth", "authentication", "password", "credential"],
    content: "SMTP authentication failed. Check mailbox credentials are correct and haven't expired. May require app-specific password for Gmail/Outlook.",
    category: "smtp_errors",
  },
  {
    keywords: ["retry", "attempts", "backoff"],
    content: "Retry policy: Attempt 1 waits 2 minutes, attempt 2 waits 5 minutes, attempt 3 waits 15 minutes. After 3 failed attempts, email is marked as permanently failed.",
    category: "retry_policy",
  },
  {
    keywords: ["pending", "stuck", "waiting"],
    content: "Emails pending >10 minutes are flagged as stuck. Causes: scheduler not running, worker error, database lock. Watchdog automatically moves stuck emails to retry queue.",
    category: "queue_status",
  },
  {
    keywords: ["sending", "in progress"],
    content: "Status 'sending' means worker picked up the email. If stuck in 'sending' >5 minutes, watchdog will intervene and move to retry queue.",
    category: "queue_status",
  },
  {
    keywords: ["retrying", "retry queue"],
    content: "Status 'retrying' means email failed but is scheduled for automatic retry. Check nextRetryAt for when retry will occur.",
    category: "queue_status",
  },
  {
    keywords: ["failed", "failure"],
    content: "Status 'failed' means email permanently failed after max retries or hit a non-retryable error. Check failure_reason for specific cause.",
    category: "queue_status",
  },
  {
    keywords: ["sent", "delivered", "success"],
    content: "Status 'sent' means SMTP accepted the email with a valid message_id. Note: 'sent' does not guarantee inbox delivery, only SMTP acceptance.",
    category: "queue_status",
  },
  {
    keywords: ["scheduler", "heartbeat", "worker"],
    content: "Email scheduler sends heartbeat every 60 seconds. If no heartbeat for >5 minutes, scheduler may be down. Status 'delayed' or 'down' triggers alerts.",
    category: "scheduler",
  },
  {
    keywords: ["message_id", "messageid", "phantom"],
    content: "A valid message_id from SMTP is required to mark email as 'sent'. Emails without message_id are marked 'failed' as 'phantom sent' - delivery cannot be confirmed.",
    category: "integrity",
  },
  {
    keywords: ["sequence", "campaign", "automation"],
    content: "Sequences define email steps. If sequence is paused/inactive, no new emails are queued. Check sequence.status and sequence.is_active.",
    category: "sequences",
  },
  {
    keywords: ["mailbox", "daily limit", "quota"],
    content: "Each mailbox has a daily send limit to protect deliverability. When limit reached, emails are deferred until daily reset (midnight UTC).",
    category: "limits",
  },
  {
    keywords: ["bounce", "bounced", "hard bounce"],
    content: "Bounced emails indicate permanent delivery failure. High bounce rate (>10%) triggers mailbox auto-pause to protect sender reputation.",
    category: "deliverability",
  },
  {
    keywords: ["open", "opened", "tracking"],
    content: "Open tracking uses invisible pixel. Open rate = opened/sent. Industry average 15-25%. Low rates may indicate deliverability issues.",
    category: "analytics",
  },
  {
    keywords: ["reply", "replied", "response"],
    content: "Reply detection polls IMAP for responses. Replies update prospect status and can pause sequence. Reply rate = replied/sent.",
    category: "analytics",
  },
];

export function getRelevantKnowledge(question: string): string[] {
  const questionLower = question.toLowerCase();
  const relevantEntries: KnowledgeEntry[] = [];
  
  for (const entry of KNOWLEDGE_BASE) {
    const matches = entry.keywords.some(kw => questionLower.includes(kw.toLowerCase()));
    if (matches) {
      relevantEntries.push(entry);
    }
  }
  
  if (relevantEntries.length === 0) {
    for (const entry of KNOWLEDGE_BASE) {
      if (entry.category === "queue_status" || entry.category === "retry_policy") {
        relevantEntries.push(entry);
      }
    }
  }
  
  return relevantEntries.slice(0, 5).map(e => e.content);
}

export function getKnowledgeByCategory(category: string): string[] {
  return KNOWLEDGE_BASE
    .filter(e => e.category === category)
    .map(e => e.content);
}
