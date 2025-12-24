import Redis from "ioredis";

// Upstash provides both REST API and native Redis protocol
// For ioredis, we need to use the native Redis connection string format
// UPSTASH_REDIS_URL format: redis://default:password@host:port (or rediss:// for TLS)

// Check for native Redis URL first (preferred for ioredis)
const upstashRedisUrl = process.env.UPSTASH_REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisDisabled = process.env.REDIS_DISABLED === 'true';

// Check if Redis is configured (can be disabled via env var)
const isRedisConfigured = !redisDisabled && Boolean(redisHost || upstashRedisUrl);

let redisConnection: Redis | null = null;

if (isRedisConfigured) {
  console.log('🔧 Redis configured, attempting connection...');
  
  try {
    if (upstashRedisUrl) {
      // Use Upstash Redis URL directly (supports TLS with rediss://)
      console.log('📡 Connecting to Upstash Redis...');
      redisConnection = new Redis(upstashRedisUrl, {
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => {
          if (times > 3) {
            console.error('⚠️  Redis connection failed after 3 attempts. Scheduler features will be disabled.');
            return null;
          }
          const delay = Math.min(times * 1000, 3000);
          return delay;
        },
        lazyConnect: true,
        tls: upstashRedisUrl.startsWith('rediss://') ? {} : undefined,
      });
    } else if (redisHost) {
      // Use traditional Redis host/port/password
      const redisPort = parseInt(process.env.REDIS_PORT || '6379');
      const redisPassword = process.env.REDIS_PASSWORD || undefined;
      
      redisConnection = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => {
          if (times > 3) {
            console.error('⚠️  Redis connection failed after 3 attempts. Scheduler features will be disabled.');
            return null;
          }
          const delay = Math.min(times * 1000, 3000);
          return delay;
        },
        lazyConnect: true,
      });
    }

    if (redisConnection) {
      redisConnection.on('error', (err: any) => {
        if (err.code === 'ECONNREFUSED') {
          console.warn('⚠️  Redis unavailable - Automation scheduling features will not work until Redis/Upstash is configured');
        } else if (err.message?.includes('max requests limit exceeded')) {
          console.warn('⚠️  Upstash Redis rate limit exceeded - Automation scheduling temporarily disabled. Please upgrade your Upstash plan or wait for limit reset.');
          redisConnection?.disconnect();
          redisConnection = null;
        } else {
          console.error('Redis connection error:', err.message);
        }
      });

      redisConnection.on('connect', () => {
        console.log('✅ Redis connected - Automation scheduling enabled');
      });

      // Attempt connection
      redisConnection.connect().catch((err) => {
        console.warn('⚠️  Could not connect to Redis:', err.message);
        console.warn('ℹ️  Automation scheduling requires Redis/Upstash. Other features will work normally.');
      });
    }
  } catch (err: any) {
    console.error('❌ Redis initialization error:', err.message);
    redisConnection = null;
  }
} else if (redisDisabled) {
  console.warn('⚠️  Redis disabled via REDIS_DISABLED env var');
  console.warn('ℹ️  Automation scheduling features disabled. Remove REDIS_DISABLED to enable.');
} else {
  console.warn('⚠️  Redis not configured (REDIS_HOST or UPSTASH_REDIS_URL not set)');
  console.warn('ℹ️  Automation scheduling features disabled. Configure Redis/Upstash to enable scheduled automations.');
  console.warn('💡 To configure Upstash: Add UPSTASH_REDIS_URL secret (find it in Upstash dashboard under "Connect to your database" -> "ioredis")');
}

export { redisConnection, isRedisConfigured };
export default redisConnection;
