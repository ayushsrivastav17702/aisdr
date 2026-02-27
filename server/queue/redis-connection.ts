import Redis from "ioredis";

const upstashRedisUrl = process.env.UPSTASH_REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisDisabled = process.env.REDIS_DISABLED === 'true';

const isRedisConfigured = !redisDisabled && Boolean(redisHost || upstashRedisUrl);

let redisConnection: Redis | null = null;

if (isRedisConfigured) {
  console.log('🔧 Redis configured, attempting connection...');

  try {
    // Shared flag — set to true when Upstash rate-limit hit so retryStrategy stops immediately
    let rateLimitHit = false;

    const retryStrategy = (times: number) => {
      if (rateLimitHit) return null;
      if (times > 3) {
        console.error('⚠️  Redis connection failed after 3 attempts. Scheduler features will be disabled.');
        return null;
      }
      return Math.min(times * 1000, 3000);
    };

    const baseOpts = {
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
      retryStrategy,
      lazyConnect: true,
    };

    if (upstashRedisUrl) {
      console.log('📡 Connecting to Upstash Redis...');
      redisConnection = new Redis(upstashRedisUrl, {
        ...baseOpts,
        tls: upstashRedisUrl.startsWith('rediss://') ? {} : undefined,
      });
    } else if (redisHost) {
      const redisPort = parseInt(process.env.REDIS_PORT || '6379');
      const redisPassword = process.env.REDIS_PASSWORD || undefined;
      redisConnection = new Redis({ host: redisHost, port: redisPort, password: redisPassword, ...baseOpts });
    }

    if (redisConnection) {
      let rateLimitLogged = false;

      redisConnection.on('error', (err: any) => {
        const isRateLimit = err.message?.includes('max requests limit exceeded');
        const isConnClosed = err.message?.includes('Connection is closed') || err.code === 'ECONNRESET';

        if (isRateLimit) {
          rateLimitHit = true;           // Stop all future reconnection attempts
          if (!rateLimitLogged) {
            rateLimitLogged = true;
            console.warn('⚠️  Upstash Redis rate limit exceeded — email processing continues via adaptive DB poller. Upgrade Upstash plan or wait for monthly reset to re-enable BullMQ layer.');
          }
          redisConnection?.disconnect();
          redisConnection = null;
        } else if (err.code === 'ECONNREFUSED') {
          console.warn('⚠️  Redis unavailable — automation scheduling disabled until Redis is configured');
        } else if (!isConnClosed) {
          console.error('Redis connection error:', err.message);
        }
      });

      redisConnection.on('connect', () => {
        console.log('✅ Redis connected — BullMQ event-driven layer enabled');
      });

      redisConnection.connect().catch((err) => {
        if (!err.message?.includes('max requests limit exceeded') && !err.message?.includes('Connection is closed')) {
          console.warn('⚠️  Could not connect to Redis:', err.message);
          console.warn('ℹ️  Automation scheduling requires Redis/Upstash. Other features work normally.');
        }
      });
    }
  } catch (err: any) {
    console.error('❌ Redis initialization error:', err.message);
    redisConnection = null;
  }
} else if (redisDisabled) {
  console.warn('⚠️  Redis disabled via REDIS_DISABLED env var');
} else {
  console.warn('⚠️  Redis not configured (REDIS_HOST or UPSTASH_REDIS_URL not set)');
  console.warn('ℹ️  Configure Redis/Upstash to enable event-driven email processing and scheduled automations.');
}

export { redisConnection, isRedisConfigured };
export default redisConnection;
