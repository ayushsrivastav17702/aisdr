import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { auditService } from '../services/audit.service';
import { db } from '../db';
import { users, auditLogs } from '@shared/schema';
import { eq, desc, or, ilike, and, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

const updateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
});

router.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { search, status, role, page = '1', limit = '25' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let conditions: any[] = [isNull(users.deletedAt)];

    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`),
          ilike(users.username, `%${search}%`)
        )
      );
    }

    if (status) {
      conditions.push(eq(users.status, status as any));
    }

    if (role) {
      conditions.push(eq(users.role, role as any));
    }

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...conditions));

    res.json({
      users: allUsers,
      total: count,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(count / limitNum),
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

router.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.patch('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const updates = validationResult.data;

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    auditService.logUserAction(req, 'USER_UPDATED', { 
      targetUserId: id, 
      targetEmail: user.email,
      changes: updates,
      before: { role: user.role, status: user.status },
      after: updates
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.patch('/api/users/profile/me', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const updates = validationResult.data;

    const [updatedUser] = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    auditService.logUserAction(req, 'PROFILE_UPDATED', { 
      changes: updates 
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db
      .update(users)
      .set({
        status: 'inactive',
        isActive: false,
        deletedAt: new Date(),
      })
      .where(eq(users.id, id));

    auditService.logUserAction(req, 'USER_DELETED', { 
      targetUserId: id, 
      targetEmail: user.email,
      role: user.role
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/api/users/:id/reactivate', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [reactivatedUser] = await db
      .update(users)
      .set({
        status: 'active',
        isActive: true,
        deletedAt: null,
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    auditService.logUserAction(req, 'USER_REACTIVATED', { 
      targetUserId: id, 
      targetEmail: user.email,
      role: user.role
    });

    res.json(reactivatedUser);
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

router.get('/api/users/:id/audit-logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export default router;
