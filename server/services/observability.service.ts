import { db } from '../db';
import { sql } from 'drizzle-orm';

interface AICostEvent {
  organizationId: string;
  userId?: string;
  provider: 'openai' | 'anthropic' | 'openrouter' | 'perplexity';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  operation: string;
}

interface AutoPauseCandidateEvent {
  organizationId: string;
  reason: 'spend_spike' | 'queue_backlog' | 'error_storm';
  currentValue: number;
  threshold: number;
  wouldPause: boolean;
}

interface ThrottleViolationEvent {
  organizationId: string;
  userId?: string;
  counterType: string;
  currentCount: number;
  limit: number;
  batchSize?: number;
}

interface ManagerUsageEvent {
  organizationId: string;
  managerId: string;
  counterType: string;
  currentCount: number;
  sdrCount: number;
}

interface QueueDepthEvent {
  organizationId: string;
  pending: number;
  processing: number;
  failed: number;
}

const COST_PER_1M_TOKENS: Record<string, { prompt: number; completion: number }> = {
  'gpt-4': { prompt: 30, completion: 60 },
  'gpt-4-turbo': { prompt: 10, completion: 30 },
  'gpt-4o': { prompt: 2.5, completion: 10 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
  'claude-3-opus': { prompt: 15, completion: 75 },
  'claude-3-sonnet': { prompt: 3, completion: 15 },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
  'claude-3.5-sonnet': { prompt: 3, completion: 15 },
  'default': { prompt: 5, completion: 15 },
};

class ObservabilityService {
  private eventBuffer: Array<{ type: string; data: object; timestamp: Date }> = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.flushInterval = setInterval(() => this.flushEvents(), 30000);
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const modelKey = Object.keys(COST_PER_1M_TOKENS).find(k => model.toLowerCase().includes(k.toLowerCase())) || 'default';
    const costs = COST_PER_1M_TOKENS[modelKey];
    const promptCost = (promptTokens / 1_000_000) * costs.prompt;
    const completionCost = (completionTokens / 1_000_000) * costs.completion;
    return promptCost + completionCost;
  }

  emitAICostEvent(event: Omit<AICostEvent, 'estimatedCostUsd'> & { estimatedCostUsd?: number }): void {
    const estimatedCostUsd = event.estimatedCostUsd ?? this.calculateCost(event.model, event.promptTokens, event.completionTokens);
    
    const fullEvent: AICostEvent = { ...event, estimatedCostUsd };
    
    console.log(`[Observability] AI Cost Event:`, {
      org: fullEvent.organizationId,
      provider: fullEvent.provider,
      model: fullEvent.model,
      tokens: fullEvent.totalTokens,
      cost: `$${estimatedCostUsd.toFixed(6)}`,
      operation: fullEvent.operation,
    });

    this.bufferEvent('ai_cost', fullEvent);
  }

  emitAutoPauseCandidate(event: AutoPauseCandidateEvent): void {
    console.log(`[Observability] Auto-Pause Candidate:`, {
      org: event.organizationId,
      reason: event.reason,
      current: event.currentValue,
      threshold: event.threshold,
      wouldPause: event.wouldPause,
    });

    this.bufferEvent('auto_pause_candidate', event);
  }

  emitThrottleViolation(event: ThrottleViolationEvent): void {
    console.log(`[Observability] Throttle Violation:`, {
      org: event.organizationId,
      type: event.counterType,
      current: event.currentCount,
      limit: event.limit,
      batchSize: event.batchSize,
    });

    this.bufferEvent('throttle_violation', event);
  }

  emitManagerUsage(event: ManagerUsageEvent): void {
    console.log(`[Observability] Manager Usage:`, {
      org: event.organizationId,
      manager: event.managerId,
      type: event.counterType,
      current: event.currentCount,
      sdrCount: event.sdrCount,
    });

    this.bufferEvent('manager_usage', event);
  }

  emitQueueDepth(event: QueueDepthEvent): void {
    console.log(`[Observability] Queue Depth:`, {
      org: event.organizationId,
      pending: event.pending,
      processing: event.processing,
      failed: event.failed,
    });

    this.bufferEvent('queue_depth', event);
  }

  private bufferEvent(type: string, data: object): void {
    this.eventBuffer.push({
      type,
      data,
      timestamp: new Date(),
    });

    if (this.eventBuffer.length >= 100) {
      this.flushEvents();
    }
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      for (const event of eventsToFlush) {
        await db.execute(sql`
          INSERT INTO observability_events (event_type, event_data, created_at)
          VALUES (${event.type}, ${JSON.stringify(event.data)}::jsonb, ${event.timestamp})
          ON CONFLICT DO NOTHING
        `);
      }
    } catch (error) {
      console.error('[Observability] Failed to flush events - table may not exist yet:', error);
    }
  }

  async getAICostSummary(organizationId: string, days: number = 30): Promise<{ totalCost: number; tokensByProvider: Record<string, number> }> {
    try {
      const result = await db.execute(sql`
        SELECT 
          SUM((event_data->>'estimatedCostUsd')::numeric) as total_cost,
          event_data->>'provider' as provider,
          SUM((event_data->>'totalTokens')::integer) as total_tokens
        FROM observability_events
        WHERE event_type = 'ai_cost'
          AND event_data->>'organizationId' = ${organizationId}
          AND created_at > NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY event_data->>'provider'
      `);

      const tokensByProvider: Record<string, number> = {};
      let totalCost = 0;

      for (const row of result.rows as any[]) {
        tokensByProvider[row.provider] = Number(row.total_tokens || 0);
        totalCost += Number(row.total_cost || 0);
      }

      return { totalCost, tokensByProvider };
    } catch (error) {
      console.error('[Observability] Failed to get AI cost summary:', error);
      return { totalCost: 0, tokensByProvider: {} };
    }
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushEvents();
  }
}

export const observability = new ObservabilityService();
