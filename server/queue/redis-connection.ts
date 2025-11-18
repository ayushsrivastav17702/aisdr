import Redis from "ioredis";

const redisHost = process.env.REDIS_HOST || process.env.UPSTASH_REDIS_REST_URL?.replace('https://', '').split('@')[1];
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redisPassword = process.env.REDIS_PASSWORD || process.env.UPSTASH_REDIS_REST_TOKEN || undefined;

// Check if Redis is configured
const isRedisConfigured = Boolean(
  process.env.REDIS_HOST || 
  process.env.UPSTASH_REDIS_REST_URL
);

let redisConnection: Redis | null = null;

if (isRedisConfigured && redisHost) {
  console.log('🔧 Redis configured, attempting connection...');
  redisConnection = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      if (times > 3) {
        console.error('⚠️  Redis connection failed after 3 attempts. Scheduler features will be disabled.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 1000, 3000);
      return delay;
    },
    lazyConnect: true, // Don't connect immediately
  });

  redisConnection.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED') {
      console.warn('⚠️  Redis unavailable - Automation scheduling features will not work until Redis/Upstash is configured');
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
} else {
  console.warn('⚠️  Redis not configured (REDIS_HOST or UPSTASH_REDIS_REST_URL not set)');
  console.warn('ℹ️  Automation scheduling features disabled. Configure Redis/Upstash to enable scheduled automations.');
}

export { redisConnection, isRedisConfigured };
export default redisConnection;
