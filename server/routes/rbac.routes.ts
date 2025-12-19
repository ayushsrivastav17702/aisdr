import { Router } from "express";
import { db } from "../db";
import { 
  permissions, 
  roles, 
  rolePermissions,
  userRoleAssignments,
  userPermissionOverrides,
  users
} from "@shared/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { permissionService } from "../services/permission.service";
import { auditService } from "../services/audit.service";

const router = Router();

router.get("/api/admin/permissions", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    const allPermissions = await permissionService.getAllPermissions();
    res.json({ permissions: allPermissions });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(500).json({ error: "Failed to fetch permissions" });
  }
});

router.get("/api/admin/permissions/categories", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    const categories = [
      { id: 'campaign', name: 'Campaign Management', description: 'Create, edit, delete, and view campaigns' },
      { id: 'prospect', name: 'Prospect Data', description: 'View, export, and delete prospects' },
      { id: 'analytics', name: 'Analytics', description: 'View and export analytics data' },
      { id: 'settings', name: 'Settings', description: 'View and edit system settings' },
      { id: 'user_management', name: 'User Management', description: 'View and manage users' },
      { id: 'workspace', name: 'Workspace', description: 'Manage workspaces' },
      { id: 'team', name: 'Team', description: 'Manage teams and team members' },
    ];
    res.json(categories);
  } catch (error) {
    console.error("Error fetching permission categories:", error);
    res.status(500).json({ error: "Failed to fetch permission categories" });
  }
});

router.post("/api/admin/permissions", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { key, name, description, category } = req.body;
    
    if (!key || !name || !category) {
      return res.status(400).json({ error: "Key, name, and category are required" });
    }

    const permission = await permissionService.createPermission({ key, name, description, category });
    
    auditService.logFromRequest(req, 'PERMISSION_CREATED', 'rbac', { permissionKey: key });
    
    res.status(201).json(permission);
  } catch (error) {
    console.error("Error creating permission:", error);
    res.status(500).json({ error: "Failed to create permission" });
  }
});

router.get("/api/admin/roles", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const allRoles = await db.select().from(roles)
      .where(
        or(
          eq(roles.organizationId, userContext.organizationId),
          isNull(roles.organizationId)
        )
      )
      .orderBy(roles.name);
    
    res.json({ roles: allRoles });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

router.get("/api/admin/roles/:roleId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { roleId } = req.params;
    
    const [role] = await db.select().from(roles)
      .where(and(
        eq(roles.id, roleId),
        or(eq(roles.organizationId, userContext.organizationId), isNull(roles.organizationId))
      ))
      .limit(1);
    
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const perms = await permissionService.getRolePermissions(roleId);
    
    res.json({ ...role, permissions: perms });
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ error: "Failed to fetch role" });
  }
});

router.post("/api/admin/roles", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { name, description, scope, isDefault, inheritsFromRoleId, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const [role] = await db.insert(roles).values({
      name,
      description,
      organizationId: userContext.organizationId,
      scope: scope || 'organization',
      isSystem: false,
      isDefault: isDefault || false,
      inheritsFromRoleId,
      color,
    }).returning();
    
    auditService.logFromRequest(req, 'ROLE_CREATED', 'rbac', { roleId: role.id, roleName: name });
    
    res.status(201).json(role);
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ error: "Failed to create role" });
  }
});

router.patch("/api/admin/roles/:roleId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { roleId } = req.params;
    const { name, description, scope, isDefault, inheritsFromRoleId, color } = req.body;

    const [existingRole] = await db.select().from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, userContext.organizationId)))
      .limit(1);
    if (!existingRole) {
      return res.status(404).json({ error: "Role not found in your organization" });
    }

    if (existingRole.isSystem) {
      return res.status(403).json({ error: "Cannot modify system roles" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (scope !== undefined) updateData.scope = scope;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (inheritsFromRoleId !== undefined) updateData.inheritsFromRoleId = inheritsFromRoleId;
    if (color !== undefined) updateData.color = color;

    const [updatedRole] = await db.update(roles)
      .set(updateData)
      .where(eq(roles.id, roleId))
      .returning();
    
    auditService.logFromRequest(req, 'ROLE_UPDATED', 'rbac', { roleId, changes: Object.keys(updateData) });
    
    res.json(updatedRole);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/api/admin/roles/:roleId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { roleId } = req.params;

    const [existingRole] = await db.select().from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, userContext.organizationId)))
      .limit(1);
    if (!existingRole) {
      return res.status(404).json({ error: "Role not found in your organization" });
    }

    if (existingRole.isSystem) {
      return res.status(403).json({ error: "Cannot delete system roles" });
    }

    await db.delete(roles).where(eq(roles.id, roleId));
    
    auditService.logFromRequest(req, 'ROLE_DELETED', 'rbac', { roleId, roleName: existingRole.name });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

router.put("/api/admin/roles/:roleId/permissions", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { roleId } = req.params;
    const { permissionIds } = req.body;

    const [existingRole] = await db.select().from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, userContext.organizationId)))
      .limit(1);
    if (!existingRole) {
      return res.status(404).json({ error: "Role not found in your organization" });
    }

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: "permissionIds must be an array" });
    }

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    if (permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        permissionIds.map((permissionId: string) => ({
          roleId,
          permissionId,
        }))
      );
    }
    
    auditService.logFromRequest(req, 'ROLE_PERMISSIONS_UPDATED', 'rbac', { 
      roleId, 
      permissionCount: permissionIds.length 
    });
    
    res.json({ success: true, permissionCount: permissionIds.length });
  } catch (error) {
    console.error("Error updating role permissions:", error);
    res.status(500).json({ error: "Failed to update role permissions" });
  }
});

router.get("/api/admin/users/:userId/roles", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }
    
    const userRoles = await permissionService.getUserRoles(userId);
    res.json(userRoles);
  } catch (error) {
    console.error("Error fetching user roles:", error);
    res.status(500).json({ error: "Failed to fetch user roles" });
  }
});

router.post("/api/admin/users/:userId/roles", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const { roleId, scopeType, scopeId, expiresAt } = req.body;
    const adminUser = (req as any).user;

    if (!roleId) {
      return res.status(400).json({ error: "roleId is required" });
    }

    const [targetRole] = await db.select().from(roles)
      .where(and(
        eq(roles.id, roleId),
        or(eq(roles.organizationId, userContext.organizationId), isNull(roles.organizationId))
      ))
      .limit(1);
    if (!targetRole) {
      return res.status(404).json({ error: "Role not found or not accessible in your organization" });
    }

    const assignment = await permissionService.assignRoleToUser(
      userId,
      roleId,
      scopeType || 'organization',
      scopeId,
      adminUser.id,
      expiresAt ? new Date(expiresAt) : undefined
    );
    
    auditService.logFromRequest(req, 'ROLE_ASSIGNED_TO_USER', 'rbac', { 
      targetUserId: userId, 
      roleId, 
      scopeType, 
      scopeId 
    });
    
    res.status(201).json(assignment);
  } catch (error) {
    console.error("Error assigning role to user:", error);
    res.status(500).json({ error: "Failed to assign role to user" });
  }
});

router.delete("/api/admin/users/:userId/roles/:roleId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId, roleId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const [targetRole] = await db.select().from(roles)
      .where(and(
        eq(roles.id, roleId),
        or(eq(roles.organizationId, userContext.organizationId), isNull(roles.organizationId))
      ))
      .limit(1);
    if (!targetRole) {
      return res.status(404).json({ error: "Role not found or not accessible in your organization" });
    }

    const { scopeType, scopeId } = req.query;

    await permissionService.removeRoleFromUser(
      userId, 
      roleId, 
      scopeType as string, 
      scopeId as string
    );
    
    auditService.logFromRequest(req, 'ROLE_REMOVED_FROM_USER', 'rbac', { 
      targetUserId: userId, 
      roleId 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing role from user:", error);
    res.status(500).json({ error: "Failed to remove role from user" });
  }
});

router.get("/api/admin/users/:userId/permissions", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const { scopeType, scopeId } = req.query;
    
    const effectivePermissions = await permissionService.getEffectivePermissions(
      userId,
      scopeType as string,
      scopeId as string
    );
    
    res.json(effectivePermissions);
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    res.status(500).json({ error: "Failed to fetch user permissions" });
  }
});

router.get("/api/admin/users/:userId/overrides", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const overrides = await permissionService.getUserPermissionOverrides(userId);
    res.json(overrides);
  } catch (error) {
    console.error("Error fetching user overrides:", error);
    res.status(500).json({ error: "Failed to fetch user overrides" });
  }
});

router.post("/api/admin/users/:userId/overrides", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const { permissionKey, allowed, scopeType, scopeId, reason, expiresAt } = req.body;
    const adminUser = (req as any).user;

    if (!permissionKey || allowed === undefined) {
      return res.status(400).json({ error: "permissionKey and allowed are required" });
    }

    const override = await permissionService.setPermissionOverride(
      userId,
      permissionKey,
      allowed,
      scopeType || 'organization',
      scopeId,
      reason,
      adminUser.id,
      expiresAt ? new Date(expiresAt) : undefined
    );
    
    auditService.logFromRequest(req, 'PERMISSION_OVERRIDE_SET', 'rbac', { 
      targetUserId: userId, 
      permissionKey, 
      allowed 
    });
    
    res.status(201).json(override);
  } catch (error) {
    console.error("Error setting permission override:", error);
    res.status(500).json({ error: "Failed to set permission override" });
  }
});

router.delete("/api/admin/users/:userId/overrides/:permissionKey", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId, permissionKey } = req.params;
    
    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const { scopeType, scopeId } = req.query;

    await permissionService.removePermissionOverride(
      userId, 
      permissionKey, 
      scopeType as string, 
      scopeId as string
    );
    
    auditService.logFromRequest(req, 'PERMISSION_OVERRIDE_REMOVED', 'rbac', { 
      targetUserId: userId, 
      permissionKey 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing permission override:", error);
    res.status(500).json({ error: "Failed to remove permission override" });
  }
});

export default router;
