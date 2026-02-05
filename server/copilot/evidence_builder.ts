import { SystemState } from "./state_collector";

export function buildEvidence(state: SystemState): string[] {
  const evidence: string[] = [];
  
  if (state.queue) {
    if (state.queue.status) {
      evidence.push(`email_queue.status=${state.queue.status}`);
    }
    if (state.queue.attempts !== null) {
      evidence.push(`email_queue.attempts=${state.queue.attempts}`);
    }
    if (state.queue.lastError) {
      evidence.push(`email_queue.last_error=${sanitizeError(state.queue.lastError)}`);
    }
    if (state.queue.failureReason) {
      evidence.push(`email_queue.failure_reason=${state.queue.failureReason}`);
    }
    if (state.queue.scheduledFor) {
      const age = Date.now() - state.queue.scheduledFor.getTime();
      const ageMinutes = Math.floor(age / 60000);
      if (ageMinutes > 0) {
        evidence.push(`email_queue.scheduled_age_minutes=${ageMinutes}`);
      }
    }
    if (state.queue.lastAttemptAt) {
      const sinceLast = Date.now() - state.queue.lastAttemptAt.getTime();
      const sinceLastMinutes = Math.floor(sinceLast / 60000);
      evidence.push(`email_queue.minutes_since_last_attempt=${sinceLastMinutes}`);
    }
    if (state.queue.nextRetryAt) {
      const untilRetry = state.queue.nextRetryAt.getTime() - Date.now();
      const untilRetryMinutes = Math.floor(untilRetry / 60000);
      evidence.push(`email_queue.minutes_until_retry=${untilRetryMinutes}`);
    }
  }
  
  if (state.email) {
    if (state.email.status) {
      evidence.push(`email.status=${state.email.status}`);
    }
    if (state.email.messageId) {
      evidence.push(`email.has_message_id=true`);
    } else {
      evidence.push(`email.has_message_id=false`);
    }
    if (state.email.lastError) {
      evidence.push(`email.last_error=${sanitizeError(state.email.lastError)}`);
    }
    if (state.email.sentAt) {
      evidence.push(`email.sent_at=${state.email.sentAt.toISOString()}`);
    }
    if (state.email.failedAt) {
      evidence.push(`email.failed_at=${state.email.failedAt.toISOString()}`);
    }
  }
  
  if (state.sequence) {
    evidence.push(`sequence.name=${state.sequence.name}`);
    if (state.sequence.status) {
      evidence.push(`sequence.status=${state.sequence.status}`);
    }
    evidence.push(`sequence.is_active=${state.sequence.isActive}`);
  }
  
  if (state.prospect) {
    evidence.push(`prospect.has_email=${!!state.prospect.email}`);
    if (state.prospect.company) {
      evidence.push(`prospect.company=${state.prospect.company}`);
    }
  }
  
  if (state.scheduler) {
    evidence.push(`scheduler.status=${state.scheduler.status}`);
    const heartbeatAge = Date.now() - state.scheduler.lastHeartbeat.getTime();
    const heartbeatAgeMinutes = Math.floor(heartbeatAge / 60000);
    evidence.push(`scheduler.minutes_since_heartbeat=${heartbeatAgeMinutes}`);
    if (state.scheduler.failedCount !== null) {
      evidence.push(`scheduler.failed_count=${state.scheduler.failedCount}`);
    }
    
    if (heartbeatAgeMinutes > 5) {
      evidence.push(`scheduler.warning=heartbeat_delayed`);
    }
    if (heartbeatAgeMinutes > 10) {
      evidence.push(`scheduler.critical=scheduler_may_be_down`);
    }
  } else {
    evidence.push(`scheduler.status=unknown`);
  }
  
  return evidence;
}

function sanitizeError(error: string): string {
  return error
    .replace(/['"]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

export function extractSmtpError(lastError: string | null): string | null {
  if (!lastError) return null;
  
  const patterns = [
    /ETIMEDOUT/i,
    /ECONNREFUSED/i,
    /ECONNRESET/i,
    /4\d{2}/,
    /5\d{2}/,
    /rate.?limit/i,
    /blocked/i,
    /blacklist/i,
    /invalid.?email/i,
    /timeout/i,
    /auth/i,
  ];
  
  for (const pattern of patterns) {
    const match = lastError.match(pattern);
    if (match) {
      return match[0].toUpperCase();
    }
  }
  
  return null;
}
