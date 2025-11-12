import { Request, Response, NextFunction } from 'express';
import { authService, AuthUser } from '../services/auth.service';
import { RequestContext } from '../storage';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
      userContext?: RequestContext;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const user = await authService.validateSession(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const decoded = authService.verifyToken(token);
    req.user = user;
    req.sessionId = decoded?.sessionId;
    
    const actingAs = req.query.actingAs as string | undefined;
    
    if (actingAs && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can use actingAs' });
    }
    
    if (actingAs) {
      console.log(`🔐 Admin impersonation: ${user.email} (${user.id}) acting as user ${actingAs}`);
    }
    
    req.userContext = {
      userId: user.id,
      roles: [user.role],
      actingAs: actingAs
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);

  authService.validateSession(token)
    .then(user => {
      if (user) {
        const decoded = authService.verifyToken(token);
        req.user = user;
        req.sessionId = decoded?.sessionId;
        
        const actingAs = req.query.actingAs as string | undefined;
        
        if (actingAs && user.role !== 'admin') {
          console.warn(`⚠️ Non-admin user ${user.email} attempted to use actingAs`);
          req.userContext = {
            userId: user.id,
            roles: [user.role]
          };
        } else {
          if (actingAs) {
            console.log(`🔐 Admin impersonation: ${user.email} (${user.id}) acting as user ${actingAs}`);
          }
          req.userContext = {
            userId: user.id,
            roles: [user.role],
            actingAs: actingAs
          };
        }
      }
      next();
    })
    .catch(error => {
      console.error('Optional auth error:', error);
      next();
    });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export function requireRole(...allowedRoles: Array<'admin' | 'user'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export function requireActiveStatus(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.status !== 'active') {
    return res.status(403).json({ error: 'Account is not active' });
  }

  next();
}
