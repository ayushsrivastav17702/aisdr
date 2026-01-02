import { Router } from "express";
import { db } from "../db";
import { 
  organizations, 
  workspaces, 
  workspaceMemberships,
  users,
  insertOrganizationSchema,
  updateOrganizationSchema,
  insertWorkspaceSchema,
  updateWorkspaceSchema,
  insertWorkspaceMembershipSchema
} from "@shared/schema";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { z } from "zod";
import { nanoid } from "nanoid";

const router = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + nanoid(6);
}

// ============================================
// ORGANIZATION ROUTES
// ============================================

router.get("/organizations", authenticate, requireAdmin, async (req, res) => {
  try {
    const allOrgs = await db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
    
    res.json(allOrgs);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.get("/organizations/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userContext!.userId;
    
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.organizationId !== id && user?.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json(org);
  } catch (error) {
    console.error("Error fetching organization:", error);
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

router.post("/organizations", authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.userContext!.userId;
    const orgData = {
      name: req.body.name as string,
      slug: (req.body.slug || generateSlug(req.body.name)) as string,
      logo: req.body.logo as string | undefined,
      address: req.body.address as string | undefined,
      city: req.body.city as string | undefined,
      state: req.body.state as string | undefined,
      country: req.body.country as string | undefined,
      postalCode: req.body.postalCode as string | undefined,
      industry: req.body.industry as string | undefined,
      companySize: req.body.companySize as string | undefined,
      website: req.body.website as string | undefined,
      phone: req.body.phone as string | undefined,
      timezone: req.body.timezone as string | undefined,
      language: req.body.language as string | undefined,
      ownerId: (req.body.ownerId || userId) as string,
    };
    
    const [newOrg] = await db
      .insert(organizations)
      .values(orgData)
      .returning();
    
    const [defaultWorkspace] = await db
      .insert(workspaces)
      .values({
        organizationId: newOrg.id,
        name: "Default Workspace",
        slug: generateSlug("default"),
        description: "Default workspace for " + newOrg.name,
        ownerId: userId,
      })
      .returning();
    
    res.status(201).json({ organization: newOrg, defaultWorkspace });
  } catch (error) {
    console.error("Error creating organization:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create organization" });
  }
});

router.patch("/organizations/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = ['name', 'logo', 'address', 'city', 'state', 'country', 'postalCode', 
      'industry', 'companySize', 'website', 'phone', 'timezone', 'language', 
      'fiscalYearStart', 'reportingPeriod', 'brandingColors', 'preferences', 'status'];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning();
    
    if (!updatedOrg) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    res.json(updatedOrg);
  } catch (error) {
    console.error("Error updating organization:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update organization" });
  }
});

router.delete("/organizations/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.delete(organizations).where(eq(organizations.id, id));
    
    res.json({ success: true, message: "Organization deleted" });
  } catch (error) {
    console.error("Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

router.get("/organizations/:id/stats", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [workspaceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaces)
      .where(eq(workspaces.organizationId, id));
    
    const [memberCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.organizationId, id));
    
    res.json({
      workspaces: workspaceCount?.count || 0,
      members: memberCount?.count || 0,
    });
  } catch (error) {
    console.error("Error fetching organization stats:", error);
    res.status(500).json({ error: "Failed to fetch organization stats" });
  }
});

// ============================================
// WORKSPACE ROUTES
// ============================================

router.get("/workspaces", authenticate, async (req, res) => {
  try {
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation - only return workspaces from user's organization
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, userOrgId))
      .orderBy(desc(workspaces.createdAt));
    
    res.json(allWorkspaces);
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    res.status(500).json({ error: "Failed to fetch workspaces" });
  }
});

router.get("/workspaces/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, userOrgId)
      ));
    
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    
    res.json(workspace);
  } catch (error) {
    console.error("Error fetching workspace:", error);
    res.status(500).json({ error: "Failed to fetch workspace" });
  }
});

router.post("/workspaces", authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.userContext!.userId;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation - admins can only create workspaces in their own organization
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    // Prevent cross-tenant workspace creation by ignoring req.body.organizationId
    const workspaceData = {
      organizationId: userOrgId, // Always use authenticated user's organization
      name: req.body.name as string,
      slug: (req.body.slug || generateSlug(req.body.name)) as string,
      description: req.body.description as string | undefined,
      type: req.body.type as string | undefined,
      parentId: req.body.parentId as string | undefined,
      ownerId: (req.body.ownerId || userId) as string,
    };
    
    const [newWorkspace] = await db
      .insert(workspaces)
      .values(workspaceData)
      .returning();
    
    await db.insert(workspaceMemberships).values({
      workspaceId: newWorkspace.id,
      userId,
      role: "owner",
      permissions: ["all"],
      invitedBy: userId,
    });
    
    res.status(201).json(newWorkspace);
  } catch (error) {
    console.error("Error creating workspace:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

router.patch("/workspaces/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = ['name', 'description', 'type', 'parentId', 'settings', 
      'resourceLimits', 'status', 'ownerId'];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set(updateData)
      .where(and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, userOrgId)
      ))
      .returning();
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    
    res.json(updatedWorkspace);
  } catch (error) {
    console.error("Error updating workspace:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update workspace" });
  }
});

router.delete("/workspaces/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    await db.delete(workspaces).where(and(
      eq(workspaces.id, id),
      eq(workspaces.organizationId, userOrgId)
    ));
    
    res.json({ success: true, message: "Workspace deleted" });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    res.status(500).json({ error: "Failed to delete workspace" });
  }
});

router.post("/workspaces/:id/archive", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const [archivedWorkspace] = await db
      .update(workspaces)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, userOrgId)
      ))
      .returning();
    
    if (!archivedWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    
    res.json(archivedWorkspace);
  } catch (error) {
    console.error("Error archiving workspace:", error);
    res.status(500).json({ error: "Failed to archive workspace" });
  }
});

router.post("/workspaces/:id/restore", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const [restoredWorkspace] = await db
      .update(workspaces)
      .set({ status: "active", archivedAt: null, updatedAt: new Date() })
      .where(and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, userOrgId)
      ))
      .returning();
    
    if (!restoredWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    
    res.json(restoredWorkspace);
  } catch (error) {
    console.error("Error restoring workspace:", error);
    res.status(500).json({ error: "Failed to restore workspace" });
  }
});

router.post("/workspaces/:id/transfer-ownership", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body;
    const userOrgId = req.userContext!.organizationId;
    
    // SECURITY: Enforce tenant isolation
    if (!userOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    if (!newOwnerId) {
      return res.status(400).json({ error: "New owner ID is required" });
    }
    
    // SECURITY: Verify new owner is in same organization
    const [newOwner] = await db.select().from(users).where(and(
      eq(users.id, newOwnerId),
      eq(users.organizationId, userOrgId)
    ));
    if (!newOwner) {
      return res.status(404).json({ error: "New owner not found in your organization" });
    }
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set({ ownerId: newOwnerId, updatedAt: new Date() })
      .where(and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, userOrgId)
      ))
      .returning();
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    
    res.json(updatedWorkspace);
  } catch (error) {
    console.error("Error transferring workspace ownership:", error);
    res.status(500).json({ error: "Failed to transfer ownership" });
  }
});

// ============================================
// WORKSPACE MEMBERSHIP ROUTES
// ============================================

router.get("/workspaces/:id/members", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const members = await db
      .select({
        membership: workspaceMemberships,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        },
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(workspaceMemberships.userId, users.id))
      .where(eq(workspaceMemberships.workspaceId, id));
    
    res.json(members);
  } catch (error) {
    console.error("Error fetching workspace members:", error);
    res.status(500).json({ error: "Failed to fetch workspace members" });
  }
});

router.post("/workspaces/:id/members", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userContext!.userId;
    const { userId: memberUserId, role = "member", permissions } = req.body;
    
    if (!memberUserId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    
    const [membership] = await db
      .insert(workspaceMemberships)
      .values({
        workspaceId: id,
        userId: memberUserId,
        role,
        permissions,
        invitedBy: userId,
      })
      .returning();
    
    res.status(201).json(membership);
  } catch (error) {
    console.error("Error adding workspace member:", error);
    res.status(500).json({ error: "Failed to add workspace member" });
  }
});

router.delete("/workspaces/:workspaceId/members/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    
    await db
      .delete(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
    
    res.json({ success: true, message: "Member removed from workspace" });
  } catch (error) {
    console.error("Error removing workspace member:", error);
    res.status(500).json({ error: "Failed to remove workspace member" });
  }
});

router.get("/organizations/:id/workspaces", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { includeArchived } = req.query;
    
    const whereCondition = includeArchived 
      ? eq(workspaces.organizationId, id)
      : and(eq(workspaces.organizationId, id), eq(workspaces.status, "active"));
    
    const orgWorkspaces = await db
      .select()
      .from(workspaces)
      .where(whereCondition)
      .orderBy(desc(workspaces.createdAt));
    
    res.json(orgWorkspaces);
  } catch (error) {
    console.error("Error fetching organization workspaces:", error);
    res.status(500).json({ error: "Failed to fetch organization workspaces" });
  }
});

router.get("/my-organization", authenticate, async (req, res) => {
  try {
    const userId = req.userContext!.userId;
    
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user?.organizationId) {
      return res.json({ organization: null, workspaces: [] });
    }
    
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.organizationId));
    
    const userWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, user.organizationId));
    
    res.json({ organization: org, workspaces: userWorkspaces });
  } catch (error) {
    console.error("Error fetching user organization:", error);
    res.status(500).json({ error: "Failed to fetch user organization" });
  }
});

export default router;
