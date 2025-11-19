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

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  createMiddleware(config: RateLimitConfig) {
    const { windowMs, maxRequests, message = 'Too many requests, please try again later' } = config;

    return (req: Request, res: Response, next: NextFunction) => {
      const identifier = this.getIdentifier(req);
      const now = Date.now();
      const entry = this.store.get(identifier);

      if (!entry || now > entry.resetTime) {
        const resetTime = now + windowMs;
        this.store.set(identifier, {
          count: 1,
          resetTime,
        });
        this.cleanupExpiredEntries();
        
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
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
      next();
    };
  }

  private getIdentifier(req: Request): string {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
               req.socket.remoteAddress || 
               'unknown';
    const userId = req.user?.id || '';
    return `${ip}:${userId}`;
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    
    for (const [key, entry] of entries) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
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
