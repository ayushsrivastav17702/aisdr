interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RequestRecord {
  timestamp: number;
  endpoint: string;
}

class RateLimiterService {
  private requests: Map<string, RequestRecord[]> = new Map();
  private quotaUsage: Map<string, number> = new Map();

  // Default Apollo rate limits
  private readonly APOLLO_RATE_LIMITS: Record<string, RateLimitConfig> = {
    search: { maxRequests: 100, windowMs: 60000 }, // 100 requests per minute
    enrichment: { maxRequests: 50, windowMs: 60000 }, // 50 requests per minute
    bulk_enrichment: { maxRequests: 10, windowMs: 60000 } // 10 requests per minute
  };

  async checkRateLimit(service: string, endpoint: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const config = this.APOLLO_RATE_LIMITS[endpoint] || { maxRequests: 60, windowMs: 60000 };
    const key = `${service}:${endpoint}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get existing requests for this key
    let requestsForKey = this.requests.get(key) || [];

    // Filter out requests outside the time window
    requestsForKey = requestsForKey.filter(req => req.timestamp > windowStart);

    // Check if limit exceeded
    const allowed = requestsForKey.length < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - requestsForKey.length);
    const resetAt = new Date(now + config.windowMs);

    if (allowed) {
      // Add new request
      requestsForKey.push({ timestamp: now, endpoint });
      this.requests.set(key, requestsForKey);
    }

    return { allowed, remaining, resetAt };
  }

  async trackApiUsage(service: string, creditsUsed: number = 1): Promise<void> {
    const current = this.quotaUsage.get(service) || 0;
    this.quotaUsage.set(service, current + creditsUsed);
  }

  getQuotaUsage(service: string): number {
    return this.quotaUsage.get(service) || 0;
  }

  resetQuota(service: string): void {
    this.quotaUsage.set(service, 0);
  }

  async getApolloStatistics(): Promise<{
    searchRequests: number;
    enrichmentRequests: number;
    bulkEnrichmentRequests: number;
    totalCreditsUsed: number;
  }> {
    return {
      searchRequests: this.getRequestCount('apollo:search'),
      enrichmentRequests: this.getRequestCount('apollo:enrichment'),
      bulkEnrichmentRequests: this.getRequestCount('apollo:bulk_enrichment'),
      totalCreditsUsed: this.getQuotaUsage('apollo')
    };
  }

  private getRequestCount(key: string): number {
    const requests = this.requests.get(key) || [];
    const windowStart = Date.now() - 3600000; // Last hour
    return requests.filter(req => req.timestamp > windowStart).length;
  }

  // Cleanup old requests periodically
  cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    const entries = Array.from(this.requests.entries());
    for (const [key, requests] of entries) {
      const filtered = requests.filter((req: RequestRecord) => now - req.timestamp < maxAge);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

export const rateLimiterService = new RateLimiterService();

// Cleanup every 5 minutes
setInterval(() => {
  rateLimiterService.cleanup();
}, 300000);