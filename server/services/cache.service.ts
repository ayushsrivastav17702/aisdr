import { redisConnection, isRedisConfigured } from '../queue/redis-connection';

const CACHE_PREFIX = 'manager_cache:';
const DEFAULT_TTL = 30;

export interface CacheOptions {
  ttl?: number;
}

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisConfigured || !redisConnection) {
      return null;
    }

    try {
      const cached = await redisConnection.get(`${CACHE_PREFIX}${key}`);
      if (cached) {
        return JSON.parse(cached) as T;
      }
      return null;
    } catch (error) {
      console.warn('Cache get error:', error);
      return null;
    }
  },

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    if (!isRedisConfigured || !redisConnection) {
      return;
    }

    try {
      const ttl = options.ttl || DEFAULT_TTL;
      await redisConnection.setex(`${CACHE_PREFIX}${key}`, ttl, JSON.stringify(value));
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  },

  async invalidate(pattern: string): Promise<void> {
    if (!isRedisConfigured || !redisConnection) {
      return;
    }

    try {
      const keys = await redisConnection.keys(`${CACHE_PREFIX}${pattern}*`);
      if (keys.length > 0) {
        await redisConnection.del(...keys);
      }
    } catch (error) {
      console.warn('Cache invalidate error:', error);
    }
  },

  async invalidateOrg(orgId: string): Promise<void> {
    await this.invalidate(`org:${orgId}:`);
  },

  buildKey(orgId: string, endpoint: string, params?: Record<string, any>): string {
    const base = `org:${orgId}:${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join(':');
      return `${base}:${sortedParams}`;
    }
    return base;
  },

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const fresh = await fetcher();
    await this.set(key, fresh, options);
    return fresh;
  },

  isConfigured(): boolean {
    return isRedisConfigured && redisConnection !== null;
  }
};

export default cacheService;
