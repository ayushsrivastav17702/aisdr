# Redis Caching Strategy

## Overview
This document outlines the caching strategy for the AI-Powered SDR Platform using Redis/Upstash for improved performance and reduced database load.

## Current Implementation Status
- **Redis Integration**: Optional (requires `REDIS_URL` environment variable)
- **BullMQ**: Uses Redis for job queue management when available
- **Graceful Degradation**: System functions with in-memory fallback when Redis is unavailable

## Recommended Caching Layers

### 1. API Response Caching
**Target Endpoints:**
- `/api/analytics/overview` - Cache for 5 minutes
- `/api/analytics/time-series` - Cache for 15 minutes
- `/api/prospects` (list view) - Cache for 2 minutes with userId-based keys
- `/api/sequences` (list view) - Cache for 5 minutes
- `/api/apollo/search` - Cache for 1 hour (external API results)

**Implementation Pattern:**
```typescript
const cacheKey = `analytics:overview:${userId}:${dateRange}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const data = await fetchFromDatabase();
await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min TTL
return data;
```

### 2. Session Store
**Current:** In-memory/PostgreSQL sessions
**Recommended:** Redis-backed session store for scalability

**Benefits:**
- Faster session lookups
- Horizontal scaling support
- Automatic expiration handling

**Implementation:**
```typescript
import connectRedis from 'connect-redis';
import session from 'express-session';

const RedisStore = connectRedis(session);
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));
```

### 3. Rate Limiting
**Current:** In-memory (single-instance only)
**Recommended:** Redis-backed rate limiting for multi-instance deployments

**Benefits:**
- Shared rate limit counters across instances
- Atomic increment operations
- Automatic TTL management

### 4. Job Queue (BullMQ) - Already Implemented ✅
**Status:** Active when Redis available
**Use Cases:**
- Email sending queue
- Prospect enrichment
- CSV imports
- Automation scheduling

### 5. Apollo.io Search Results
**High-Value Caching Target:**
- Search results are expensive (API costs)
- Results relatively static for same queries
- TTL: 1-24 hours depending on query specificity

**Cache Key Strategy:**
```typescript
const cacheKey = `apollo:search:${hash(apolloFilters)}:${page}`;
```

## Cache Invalidation Strategies

### Time-Based (TTL)
- Analytics: 5-15 minutes
- Search results: 1-24 hours
- Static data: 1 day

### Event-Based
Invalidate on data mutations:
```typescript
// After creating a prospect
await redis.del(`prospects:list:${userId}`);
await redis.del(`analytics:overview:${userId}:*`);

// After sending an email
await redis.del(`analytics:overview:${userId}:*`);
await redis.del(`sequence:${sequenceId}:stats`);
```

### Hybrid Approach
Combine TTL with event-based invalidation:
- Set reasonable TTL (5-30 minutes)
- Invalidate immediately on writes
- Best of both worlds: automatic cleanup + real-time updates

## Cache Key Naming Convention

```
<module>:<resource>:<identifier>:<filter>
```

**Examples:**
- `analytics:overview:user123:30days`
- `prospects:list:user123:page1:search=acme`
- `sequence:seq456:stats`
- `apollo:search:hash123:page2`

## Memory Management

### Redis Configuration
```redis
# Recommended for production
maxmemory 256mb
maxmemory-policy allkeys-lru  # Evict least recently used keys
```

### Size Limits
- Per-key maximum: 1MB
- Monitor with: `MEMORY USAGE <key>`
- Large datasets: Use pagination + caching of pages

## Performance Monitoring

### Key Metrics
1. **Cache Hit Rate**: Target >80% for frequently accessed data
2. **Average Response Time**: Compare cached vs uncached
3. **Memory Usage**: Monitor Redis memory consumption
4. **Eviction Rate**: Track how often keys are evicted

### Monitoring Implementation
```typescript
let hits = 0;
let misses = 0;

async function getCached(key: string) {
  const value = await redis.get(key);
  if (value) {
    hits++;
    console.log(`Cache hit rate: ${(hits / (hits + misses) * 100).toFixed(2)}%`);
    return JSON.parse(value);
  }
  misses++;
  return null;
}
```

## Implementation Priorities

### Phase 1: High-Impact Quick Wins
1. ✅ BullMQ job queue (already implemented)
2. 🔄 Apollo.io search result caching
3. 🔄 Analytics dashboard caching

### Phase 2: Session & Rate Limiting
1. Redis session store
2. Distributed rate limiting
3. Session cleanup automation

### Phase 3: Advanced Optimization
1. Prospect list view caching
2. Sequence performance metrics caching
3. Pre-computed analytics aggregations

## Code Examples

### Basic Cache Wrapper
```typescript
class CacheService {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async del(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.del(`*:${userId}:*`);
  }
}
```

### Analytics Caching Example
```typescript
async function getAnalyticsOverview(userId: string, dateRange: string) {
  const cacheKey = `analytics:overview:${userId}:${dateRange}`;
  
  // Try cache first
  const cached = await cacheService.get<AnalyticsOverview>(cacheKey);
  if (cached) return cached;
  
  // Fetch from database
  const data = await db.query(/* complex analytics query */);
  
  // Cache for 5 minutes
  await cacheService.set(cacheKey, data, 300);
  
  return data;
}
```

## Security Considerations

1. **Sensitive Data**: Don't cache passwords, API keys, or PII without encryption
2. **Multi-Tenancy**: Always include `userId` in cache keys to prevent leaks
3. **Expiration**: Set appropriate TTLs to limit exposure window
4. **Validation**: Validate cached data before use (check schema version)

## Cost Optimization

### Upstash Pricing Tiers
- **Free**: 10K commands/day, 256MB storage
- **Pay-as-you-go**: $0.20/100K commands
- **Pro**: Fixed monthly rate for predictable costs

### Cost Reduction Strategies
1. Use appropriate TTLs (don't cache forever)
2. Compress large values before caching
3. Cache only frequently accessed data
4. Monitor and tune eviction policy

## Testing Strategy

### Local Development
```bash
# Use Redis in Docker
docker run -d -p 6379:6379 redis:alpine

# Or use Upstash free tier
# Set REDIS_URL in .env
```

### Cache Testing
```typescript
describe('Cache Service', () => {
  it('should cache analytics data', async () => {
    const data = await getAnalytics('user123');
    const cached = await redis.get('analytics:overview:user123:30days');
    expect(cached).toBeTruthy();
  });

  it('should invalidate on data change', async () => {
    await createProspect({ userId: 'user123', ... });
    const cached = await redis.get('prospects:list:user123');
    expect(cached).toBeNull();
  });
});
```

## Migration Path

### Step 1: Add Redis Support (Optional)
- Keep current in-memory fallback
- Add Redis when `REDIS_URL` is set
- No breaking changes

### Step 2: Gradual Rollout
- Start with analytics caching (low risk)
- Monitor hit rates and performance
- Expand to other endpoints

### Step 3: Production Optimization
- Tune TTLs based on metrics
- Implement advanced invalidation
- Add monitoring and alerts

## Conclusion

This caching strategy provides a clear path to improved performance without breaking existing functionality. The system gracefully degrades when Redis is unavailable, ensuring reliability while enabling significant performance gains when properly configured.

**Next Steps:**
1. Configure Upstash Redis instance
2. Add `REDIS_URL` to environment
3. Implement Phase 1 caching (Apollo, Analytics)
4. Monitor performance improvements
5. Iterate based on metrics
