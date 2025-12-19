import { db } from "../db";
import { 
  permissions, 
  roles, 
  rolePermissions, 
  userRoleAssignments, 
  userPermissionOverrides,
  users
} from "@shared/schema";
import { eq, and, or, isNull, lte, gte } from "drizzle-orm";

export interface EffectivePermission {
  key: string;
  allowed: boolean;
  source: 'role' | 'override';
  scopeType?: string;
  scopeId?: string;
}

export class PermissionService {
  async getAllPermissions() {
    return db.select().from(permissions).orderBy(permissions.category, permissions.key);
  }

  async getPermissionsByCategory(category: string) {
    return db.select().from(permissions).where(eq(permissions.category, category as any));
  }

  async createPermission(data: { key: string; name: string; description?: string; category: string }) {
    const [permission] = await db.insert(permissions).values({
      key: data.key,
      name: data.name,
      description: data.description,
      category: data.category as any,
      isSystem: false,
    }).returning();
    return permission;
  }

  async getUserRoles(userId: string) {
    const now = new Date();
    return db.select({
      assignment: userRoleAssignments,
      role: roles,
    })
    .from(userRoleAssignments)
    .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
    .where(
      and(
        eq(userRoleAssignments.userId, userId),
        or(
          isNull(userRoleAssignments.expiresAt),
          gte(userRoleAssignments.expiresAt, now)
        )
      )
    );
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const result = await db.select({
      permissionKey: permissions.key,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
    
    return result.map(r => r.permissionKey);
  }

  async getUserPermissionOverrides(userId: string) {
    const now = new Date();
    return db.select({
      override: userPermissionOverrides,
      permission: permissions,
    })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(
      and(
        eq(userPermissionOverrides.userId, userId),
        or(
          isNull(userPermissionOverrides.expiresAt),
          gte(userPermissionOverrides.expiresAt, now)
        )
      )
    );
  }

  async getEffectivePermissions(userId: string, scopeType?: string, scopeId?: string): Promise<EffectivePermission[]> {
    const effectivePerms: Map<string, EffectivePermission> = new Map();

    const userRolesData = await this.getUserRoles(userId);
    
    for (const { role, assignment } of userRolesData) {
      if (scopeType && assignment.scopeType !== scopeType) continue;
      if (scopeId && assignment.scopeId !== scopeId) continue;

      const rolePerms = await this.getRolePermissions(role.id);
      
      for (const permKey of rolePerms) {
        if (!effectivePerms.has(permKey)) {
          effectivePerms.set(permKey, {
            key: permKey,
            allowed: true,
            source: 'role',
            scopeType: assignment.scopeType ?? undefined,
            scopeId: assignment.scopeId ?? undefined,
          });
        }
      }

      if (role.inheritsFromRoleId) {
        const inheritedPerms = await this.getRolePermissions(role.inheritsFromRoleId);
        for (const permKey of inheritedPerms) {
          if (!effectivePerms.has(permKey)) {
            effectivePerms.set(permKey, {
              key: permKey,
              allowed: true,
              source: 'role',
              scopeType: assignment.scopeType ?? undefined,
              scopeId: assignment.scopeId ?? undefined,
            });
          }
        }
      }
    }

    const overrides = await this.getUserPermissionOverrides(userId);
    
    for (const { override, permission } of overrides) {
      if (scopeType && override.scopeType !== scopeType) continue;
      if (scopeId && override.scopeId !== scopeId) continue;

      effectivePerms.set(permission.key, {
        key: permission.key,
        allowed: override.allowed,
        source: 'override',
        scopeType: override.scopeType ?? undefined,
        scopeId: override.scopeId ?? undefined,
      });
    }

    return Array.from(effectivePerms.values());
  }

  async hasPermission(userId: string, permissionKey: string, scopeType?: string, scopeId?: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user?.role === 'admin') return true;

    const effectivePerms = await this.getEffectivePermissions(userId, scopeType, scopeId);
    const perm = effectivePerms.find(p => p.key === permissionKey);
    return perm?.allowed ?? false;
  }

  async assignRoleToUser(
    userId: string,
    roleId: string,
    scopeType: string = 'organization',
    scopeId?: string,
    assignedBy?: string,
    expiresAt?: Date
  ) {
    const [assignment] = await db.insert(userRoleAssignments).values({
      userId,
      roleId,
      scopeType: scopeType as any,
      scopeId,
      assignedBy,
      expiresAt,
    }).returning();
    return assignment;
  }

  async removeRoleFromUser(userId: string, roleId: string, scopeType?: string, scopeId?: string) {
    const conditions = [
      eq(userRoleAssignments.userId, userId),
      eq(userRoleAssignments.roleId, roleId),
    ];
    
    if (scopeType) conditions.push(eq(userRoleAssignments.scopeType, scopeType as any));
    if (scopeId) conditions.push(eq(userRoleAssignments.scopeId, scopeId));

    await db.delete(userRoleAssignments).where(and(...conditions));
  }

  async setPermissionOverride(
    userId: string,
    permissionKey: string,
    allowed: boolean,
    scopeType: string = 'organization',
    scopeId?: string,
    reason?: string,
    grantedBy?: string,
    expiresAt?: Date
  ) {
    const [permission] = await db.select().from(permissions).where(eq(permissions.key, permissionKey)).limit(1);
    if (!permission) throw new Error(`Permission ${permissionKey} not found`);

    await db.delete(userPermissionOverrides).where(
      and(
        eq(userPermissionOverrides.userId, userId),
        eq(userPermissionOverrides.permissionId, permission.id),
        eq(userPermissionOverrides.scopeType, scopeType as any),
        scopeId ? eq(userPermissionOverrides.scopeId, scopeId) : isNull(userPermissionOverrides.scopeId)
      )
    );

    const [override] = await db.insert(userPermissionOverrides).values({
      userId,
      permissionId: permission.id,
      allowed,
      scopeType: scopeType as any,
      scopeId,
      reason,
      grantedBy,
      expiresAt,
    }).returning();
    
    return override;
  }

  async removePermissionOverride(userId: string, permissionKey: string, scopeType?: string, scopeId?: string) {
    const [permission] = await db.select().from(permissions).where(eq(permissions.key, permissionKey)).limit(1);
    if (!permission) return;

    const conditions = [
      eq(userPermissionOverrides.userId, userId),
      eq(userPermissionOverrides.permissionId, permission.id),
    ];
    
    if (scopeType) conditions.push(eq(userPermissionOverrides.scopeType, scopeType as any));
    if (scopeId) conditions.push(eq(userPermissionOverrides.scopeId, scopeId));

    await db.delete(userPermissionOverrides).where(and(...conditions));
  }
}

export const permissionService = new PermissionService();
