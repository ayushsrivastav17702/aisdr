type VerificationEventType =
  | 'TX_COMMIT'
  | 'TX_ROLLBACK'
  | 'THREAD_MATCH'
  | 'THREAD_FALLBACK'
  | 'FALLBACK_USED'
  | 'KILL_SWITCH_CHECK'
  | 'PARITY_CHECK'
  | 'SCHEMA_VERIFY'
  | 'SMOKE_TEST';

interface VerificationEvent {
  type: VerificationEventType;
  timestamp: string;
  success: boolean;
  details: Record<string, any>;
  environment: string;
}

class VerificationLoggingService {
  private environment: string;
  private eventBuffer: VerificationEvent[] = [];
  private maxBufferSize = 1000;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
  }

  log(type: VerificationEventType, success: boolean, details: Record<string, any> = {}): void {
    const event: VerificationEvent = {
      type,
      timestamp: new Date().toISOString(),
      success,
      details,
      environment: this.environment,
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    const statusIcon = success ? '✅' : '❌';
    const logMessage = `[${type}] ${statusIcon} ${this.formatDetails(details)}`;

    if (success) {
      console.log(logMessage);
    } else {
      console.error(logMessage);
    }
  }

  private formatDetails(details: Record<string, any>): string {
    return Object.entries(details)
      .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join(' ');
  }

  txCommit(operation: string, count: number, metadata?: Record<string, any>): void {
    this.log('TX_COMMIT', true, {
      operation,
      count,
      ...metadata,
    });
  }

  txRollback(operation: string, reason: string, metadata?: Record<string, any>): void {
    this.log('TX_ROLLBACK', false, {
      operation,
      reason,
      ...metadata,
    });
  }

  threadMatch(method: 'messageId' | 'references' | 'subject' | 'dsn', messageId: string, prospectId?: string): void {
    this.log('THREAD_MATCH', true, {
      method,
      messageId: messageId.substring(0, 30) + '...',
      prospectId,
    });
  }

  threadFallback(reason: string, fromEmail: string, subject: string): void {
    this.log('THREAD_FALLBACK', false, {
      reason,
      fromEmail,
      subject: subject.substring(0, 50),
    });
  }

  fallbackUsed(feature: string, fallbackType: string, reason?: string): void {
    this.log('FALLBACK_USED', true, {
      feature,
      fallbackType,
      reason,
    });
  }

  killSwitchCheck(switchName: string, value: string | boolean, allowed: boolean): void {
    this.log('KILL_SWITCH_CHECK', allowed, {
      switch: switchName,
      value,
      allowed,
    });
  }

  parityCheck(variable: string, preValue: string | undefined, prodValue: string | undefined, match: boolean): void {
    this.log('PARITY_CHECK', match, {
      variable,
      preProduction: preValue || '(undefined)',
      production: prodValue || '(undefined)',
    });
  }

  schemaVerify(table: string, column: string, exists: boolean): void {
    this.log('SCHEMA_VERIFY', exists, {
      table,
      column,
    });
  }

  smokeTest(testName: string, passed: boolean, duration?: number, error?: string): void {
    this.log('SMOKE_TEST', passed, {
      test: testName,
      durationMs: duration,
      error,
    });
  }

  getRecentEvents(count: number = 100): VerificationEvent[] {
    return this.eventBuffer.slice(-count);
  }

  getEventsByType(type: VerificationEventType, count: number = 100): VerificationEvent[] {
    return this.eventBuffer
      .filter(e => e.type === type)
      .slice(-count);
  }

  getFailedEvents(count: number = 100): VerificationEvent[] {
    return this.eventBuffer
      .filter(e => !e.success)
      .slice(-count);
  }

  compareWithProductionLogs(productionEvents: VerificationEvent[]): {
    match: boolean;
    divergences: Array<{
      type: VerificationEventType;
      difference: string;
    }>;
  } {
    const divergences: Array<{ type: VerificationEventType; difference: string }> = [];

    const localCounts = this.getEventCounts();
    const prodCounts = this.countEvents(productionEvents);

    for (const type of Object.keys(localCounts) as VerificationEventType[]) {
      const localSuccessRate = localCounts[type].success / (localCounts[type].total || 1);
      const prodSuccessRate = prodCounts[type]?.success / (prodCounts[type]?.total || 1) || 0;

      if (Math.abs(localSuccessRate - prodSuccessRate) > 0.1) {
        divergences.push({
          type,
          difference: `Success rate divergence: local=${(localSuccessRate * 100).toFixed(1)}% prod=${(prodSuccessRate * 100).toFixed(1)}%`,
        });
      }
    }

    return {
      match: divergences.length === 0,
      divergences,
    };
  }

  private getEventCounts(): Record<VerificationEventType, { total: number; success: number }> {
    const counts: Record<string, { total: number; success: number }> = {};

    for (const event of this.eventBuffer) {
      if (!counts[event.type]) {
        counts[event.type] = { total: 0, success: 0 };
      }
      counts[event.type].total++;
      if (event.success) {
        counts[event.type].success++;
      }
    }

    return counts as Record<VerificationEventType, { total: number; success: number }>;
  }

  private countEvents(events: VerificationEvent[]): Record<VerificationEventType, { total: number; success: number }> {
    const counts: Record<string, { total: number; success: number }> = {};

    for (const event of events) {
      if (!counts[event.type]) {
        counts[event.type] = { total: 0, success: 0 };
      }
      counts[event.type].total++;
      if (event.success) {
        counts[event.type].success++;
      }
    }

    return counts as Record<VerificationEventType, { total: number; success: number }>;
  }
}

export const verificationLogger = new VerificationLoggingService();
