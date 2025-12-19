import { db } from "../db";
import { permissions, roles, rolePermissions } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_PERMISSIONS = [
  { key: 'campaign.create', name: 'Create Campaigns', category: 'campaign', description: 'Create new email campaigns and sequences' },
  { key: 'campaign.edit', name: 'Edit Campaigns', category: 'campaign', description: 'Modify existing campaigns and sequences' },
  { key: 'campaign.delete', name: 'Delete Campaigns', category: 'campaign', description: 'Delete campaigns and sequences' },
  { key: 'campaign.view', name: 'View Campaigns', category: 'campaign', description: 'View campaign details and analytics' },
  { key: 'campaign.send', name: 'Send Campaigns', category: 'campaign', description: 'Execute and send campaign emails' },
  
  { key: 'prospect.view', name: 'View Prospects', category: 'prospect', description: 'View prospect data and details' },
  { key: 'prospect.create', name: 'Create Prospects', category: 'prospect', description: 'Add new prospects' },
  { key: 'prospect.edit', name: 'Edit Prospects', category: 'prospect', description: 'Modify prospect information' },
  { key: 'prospect.delete', name: 'Delete Prospects', category: 'prospect', description: 'Remove prospects from the system' },
  { key: 'prospect.export', name: 'Export Prospects', category: 'prospect', description: 'Export prospect data to CSV/Excel' },
  { key: 'prospect.import', name: 'Import Prospects', category: 'prospect', description: 'Import prospects from CSV/Excel' },
  { key: 'prospect.enrich', name: 'Enrich Prospects', category: 'prospect', description: 'Use enrichment services on prospects' },
  
  { key: 'analytics.view', name: 'View Analytics', category: 'analytics', description: 'Access analytics dashboards and reports' },
  { key: 'analytics.export', name: 'Export Analytics', category: 'analytics', description: 'Export analytics data and reports' },
  
  { key: 'settings.view', name: 'View Settings', category: 'settings', description: 'View system and personal settings' },
  { key: 'settings.edit', name: 'Edit Settings', category: 'settings', description: 'Modify system settings' },
  { key: 'settings.mailbox', name: 'Manage Mailboxes', category: 'settings', description: 'Add and configure email mailboxes' },
  
  { key: 'user.view', name: 'View Users', category: 'user_management', description: 'View user list and profiles' },
  { key: 'user.create', name: 'Create Users', category: 'user_management', description: 'Invite new users' },
  { key: 'user.edit', name: 'Edit Users', category: 'user_management', description: 'Modify user profiles and settings' },
  { key: 'user.delete', name: 'Delete Users', category: 'user_management', description: 'Remove users from the system' },
  { key: 'user.manage_roles', name: 'Manage Roles', category: 'user_management', description: 'Assign and modify user roles' },
  
  { key: 'workspace.view', name: 'View Workspaces', category: 'workspace', description: 'View workspace details' },
  { key: 'workspace.create', name: 'Create Workspaces', category: 'workspace', description: 'Create new workspaces' },
  { key: 'workspace.edit', name: 'Edit Workspaces', category: 'workspace', description: 'Modify workspace settings' },
  { key: 'workspace.delete', name: 'Delete Workspaces', category: 'workspace', description: 'Remove workspaces' },
  
  { key: 'team.view', name: 'View Teams', category: 'team', description: 'View team structure and members' },
  { key: 'team.create', name: 'Create Teams', category: 'team', description: 'Create new teams' },
  { key: 'team.edit', name: 'Edit Teams', category: 'team', description: 'Modify team settings and quotas' },
  { key: 'team.delete', name: 'Delete Teams', category: 'team', description: 'Remove teams' },
  { key: 'team.manage_members', name: 'Manage Team Members', category: 'team', description: 'Add/remove team members' },
];

const DEFAULT_ROLES = [
  { 
    name: 'Administrator', 
    description: 'Full system access with all permissions',
    isSystem: true,
    isDefault: false,
    color: '#DC2626',
    permissions: DEFAULT_PERMISSIONS.map(p => p.key)
  },
  { 
    name: 'Manager', 
    description: 'Can manage teams, campaigns, and view analytics',
    isSystem: true,
    isDefault: false,
    color: '#2563EB',
    permissions: [
      'campaign.create', 'campaign.edit', 'campaign.view', 'campaign.send',
      'prospect.view', 'prospect.create', 'prospect.edit', 'prospect.export', 'prospect.import', 'prospect.enrich',
      'analytics.view', 'analytics.export',
      'settings.view', 'settings.mailbox',
      'team.view', 'team.edit', 'team.manage_members',
      'workspace.view',
    ]
  },
  { 
    name: 'User', 
    description: 'Standard user with campaign and prospect access',
    isSystem: true,
    isDefault: true,
    color: '#059669',
    permissions: [
      'campaign.create', 'campaign.edit', 'campaign.view', 'campaign.send',
      'prospect.view', 'prospect.create', 'prospect.edit', 'prospect.import', 'prospect.enrich',
      'analytics.view',
      'settings.view',
      'team.view',
    ]
  },
  { 
    name: 'Read-Only', 
    description: 'View-only access to data and reports',
    isSystem: true,
    isDefault: false,
    color: '#6B7280',
    permissions: [
      'campaign.view',
      'prospect.view',
      'analytics.view',
      'settings.view',
      'team.view',
    ]
  },
];

export async function seedPermissions() {
  console.log('🔐 Seeding permissions...');
  
  for (const perm of DEFAULT_PERMISSIONS) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, perm.key)).limit(1);
    
    if (!existing) {
      await db.insert(permissions).values({
        key: perm.key,
        name: perm.name,
        description: perm.description,
        category: perm.category as any,
        isSystem: true,
      });
      console.log(`  ✓ Created permission: ${perm.key}`);
    }
  }
  
  console.log('✅ Permissions seeded');
}

export async function seedRoles() {
  console.log('👤 Seeding default roles...');
  
  const allPerms = await db.select().from(permissions);
  const permMap = new Map(allPerms.map(p => [p.key, p.id]));
  
  for (const roleData of DEFAULT_ROLES) {
    const [existingRole] = await db.select().from(roles).where(eq(roles.name, roleData.name)).limit(1);
    
    let roleId: string;
    
    if (!existingRole) {
      const [newRole] = await db.insert(roles).values({
        name: roleData.name,
        description: roleData.description,
        isSystem: roleData.isSystem,
        isDefault: roleData.isDefault,
        color: roleData.color,
        scope: 'organization',
      }).returning();
      roleId = newRole.id;
      console.log(`  ✓ Created role: ${roleData.name}`);
    } else {
      roleId = existingRole.id;
      console.log(`  ○ Role exists: ${roleData.name}`);
    }
    
    for (const permKey of roleData.permissions) {
      const permId = permMap.get(permKey);
      if (permId) {
        const [existingRolePerm] = await db.select()
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, roleId))
          .limit(1);
        
        if (!existingRolePerm || !roleData.permissions.includes(permKey)) {
          try {
            await db.insert(rolePermissions).values({
              roleId,
              permissionId: permId,
            }).onConflictDoNothing();
          } catch (e) {
          }
        }
      }
    }
  }
  
  console.log('✅ Roles seeded');
}

export async function seedRBACData() {
  await seedPermissions();
  await seedRoles();
  console.log('🎉 RBAC data seeding complete');
}

seedRBACData().then(() => process.exit(0)).catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
