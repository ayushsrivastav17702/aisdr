import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimitStore {
  private memStore = new Map<string, RateLimitEntry>();
  private redis: any = null;

  constructor() {
    // Lazily load Redis connection — avoids circular import at module load time
    try {
      const conn = require('../queue/redis-connection');
      if (conn && conn.redisConnection) {
        this.redis = conn.redisConnection;
      }
    } catch {
      // Redis not available; fall back to in-memory store
    }
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    if (this.redis) {
      try {
        const val = await this.redis.get(`rl:${key}`);
        return val ? JSON.parse(val) : null;
      } catch {
        // Fall through to memory store
      }
    }
    return this.memStore.get(key) ?? null;
  }

  async set(key: string, entry: RateLimitEntry, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.setex(`rl:${key}`, ttlSeconds, JSON.stringify(entry));
        return;
      } catch {
        // Fall through to memory store
      }
    }
    this.memStore.set(key, entry);
  }

  cleanupMemExpired() {
    const now = Date.now();
    for (const [key, entry] of this.memStore.entries()) {
      if (now > entry.resetTime) {
        this.memStore.delete(key);
      }
    }
  }

  clear() {
    this.memStore.clear();
  }
}

class RateLimiter {
  private store = new RateLimitStore();

  createMiddleware(config: RateLimitConfig) {
    const { windowMs, maxRequests, message = 'Too many requests, please try again later' } = config;

    return async (req: Request, res: Response, next: NextFunction) => {
      const identifier = this.getIdentifier(req);
      const now = Date.now();
      const entry = await this.store.get(identifier);

      if (!entry || now > entry.resetTime) {
        const resetTime = now + windowMs;
        await this.store.set(identifier, { count: 1, resetTime }, Math.ceil(windowMs / 1000));
        this.store.cleanupMemExpired();

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', (maxRequests - 1).toString());
        res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
        return next();
      }

      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
        return res.status(429).json({
          error: message,
          retryAfter
        });
      }

      entry.count++;
      await this.store.set(identifier, entry, Math.ceil((entry.resetTime - now) / 1000));
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
      next();
    };
  }

  private getClientIp(req: Request): string {
    // Only trust X-Forwarded-For if a trusted proxy is configured.
    // Without this guard, attackers can spoof the header to bypass rate limits.
    if (process.env.TRUSTED_PROXY) {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const ips = String(forwarded).split(',');
        return ips[0].trim();
      }
    }
    return req.socket.remoteAddress || '0.0.0.0';
  }

  private getIdentifier(req: Request): string {
    const ip = this.getClientIp(req);
    const userId = req.user?.id || '';
    return `${ip}:${userId}`;
  }

  reset() {
    this.store.clear();
  }
}

const rateLimiter = new RateLimiter();

export const loginRateLimit = rateLimiter.createMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

export const invitationRateLimit = rateLimiter.createMiddleware({
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many invitation requests. Please try again in 1 hour.',
});

export const passwordResetRateLimit = rateLimiter.createMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many password reset attempts. Please try again in 15 minutes.',
});

export const generalApiRateLimit = rateLimiter.createMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: 'Too many requests. Please try again later.',
});

export { rateLimiter };
