import Redis from "ioredis";

const upstashRedisUrl = process.env.UPSTASH_REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisDisabled = process.env.REDIS_DISABLED === 'true';

const isRedisConfigured = !redisDisabled && Boolean(redisHost || upstashRedisUrl);

let redisConnection: Redis | null = null;

// Resolves when Redis is ready; rejects if unconfigured or connection fails within timeout.
// Resolves immediately (without a connection) when REDIS_DISABLED=true.
let redisReadyPromise: Promise<void>;

if (redisDisabled) {
  console.warn('⚠️  Redis disabled via REDIS_DISABLED=true — running in degraded/poller-only mode');
  redisReadyPromise = Promise.resolve();
} else if (!isRedisConfigured) {
  const msg = 'Redis not configured: set UPSTASH_REDIS_URL or REDIS_HOST, or set REDIS_DISABLED=true to opt out';
  console.error('❌ FATAL:', msg);
  redisReadyPromise = Promise.reject(new Error(msg));
} else {
  console.log('🔧 Redis configured, attempting connection...');

  redisReadyPromise = new Promise<void>((resolve, reject) => {
    try {
      // Shared flag — set to true when Upstash rate-limit hit so retryStrategy stops immediately
      let rateLimitHit = false;
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err); else resolve();
      };

      const CONNECT_TIMEOUT_MS = 10_000;
      const timeoutHandle = setTimeout(() => {
        settle(new Error(`Redis did not connect within ${CONNECT_TIMEOUT_MS / 1000}s`));
      }, CONNECT_TIMEOUT_MS);

      const retryStrategy = (times: number) => {
        if (rateLimitHit) return null;
        if (times > 3) return null;
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
            rateLimitHit = true;
            if (!rateLimitLogged) {
              rateLimitLogged = true;
              console.warn('⚠️  Upstash Redis rate limit exceeded — email processing continues via adaptive DB poller. Upgrade Upstash plan or wait for monthly reset to re-enable BullMQ layer.');
            }
            redisConnection?.disconnect();
            redisConnection = null;
            clearTimeout(timeoutHandle);
            settle(new Error('Upstash Redis rate limit exceeded'));
          } else if (err.code === 'ECONNREFUSED') {
            clearTimeout(timeoutHandle);
            settle(new Error(`Redis connection refused at ${redisHost}`));
          } else if (!isConnClosed) {
            console.error('Redis connection error:', err.message);
          }
        });

        redisConnection.on('connect', () => {
          console.log('✅ Redis connected — BullMQ event-driven layer enabled');
          clearTimeout(timeoutHandle);
          settle();
        });

        redisConnection.connect().catch((err) => {
          if (!err.message?.includes('max requests limit exceeded') && !err.message?.includes('Connection is closed')) {
            clearTimeout(timeoutHandle);
            settle(err);
          }
        });
      } else {
        clearTimeout(timeoutHandle);
        settle(new Error('Redis connection object could not be created'));
      }
    } catch (err: any) {
      console.error('❌ Redis initialization error:', err.message);
      redisConnection = null;
      reject(err);
    }
  });
}

export { redisConnection, isRedisConfigured, redisReadyPromise };
export default redisConnection;
