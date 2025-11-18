import Redis from "ioredis";

const redisHost = process.env.REDIS_HOST || process.env.UPSTASH_REDIS_REST_URL?.replace('https://', '').split('@')[1] || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redisPassword = process.env.REDIS_PASSWORD || process.env.UPSTASH_REDIS_REST_TOKEN || undefined;

export const redisConnection = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

export default redisConnection;
