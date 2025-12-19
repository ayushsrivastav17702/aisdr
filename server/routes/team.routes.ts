import { Router } from "express";
import { db } from "../db";
import { teams, teamMembers, users } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { teamService } from "../services/team.service";
import { auditService } from "../services/audit.service";

const router = Router();

router.get("/api/admin/teams", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }
    
    const { hierarchy } = req.query;

    if (hierarchy === 'true') {
      const teamHierarchy = await teamService.getTeamHierarchy(userContext.organizationId);
      return res.json({ teams: teamHierarchy });
    }

    const allTeams = await teamService.getTeamsByOrganization(userContext.organizationId);
    res.json({ teams: allTeams });
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

router.get("/api/admin/teams/:teamId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found" });
    }

    const members = await teamService.getTeamMembers(teamId);
    const stats = await teamService.getTeamStats(teamId);
    
    res.json({ ...team, members, stats });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

router.post("/api/admin/teams", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { 
      workspaceId, 
      parentTeamId, 
      name, 
      description, 
      territory,
      visibility,
      quotas,
      settings,
      color,
      icon
    } = req.body;
    const adminUser = (req as any).user;

    if (!name) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const team = await teamService.createTeam({
      organizationId: userContext.organizationId,
      workspaceId,
      parentTeamId,
      name,
      description,
      territory,
      visibility: visibility || 'team_only',
      quotas,
      settings,
      color,
      icon,
      createdBy: adminUser.id,
    });
    
    auditService.logFromRequest(req, 'TEAM_CREATED', 'team', { 
      teamId: team.id, 
      teamName: name,
      organizationId: userContext.organizationId 
    });
    
    res.status(201).json(team);
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ error: "Failed to create team" });
  }
});

router.patch("/api/admin/teams/:teamId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }

    const { 
      name, 
      description, 
      parentTeamId, 
      workspaceId,
      territory,
      visibility,
      color,
      icon
    } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (parentTeamId !== undefined) updateData.parentTeamId = parentTeamId;
    if (workspaceId !== undefined) updateData.workspaceId = workspaceId;
    if (territory !== undefined) updateData.territory = territory;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;

    const team = await teamService.updateTeam(teamId, updateData);
    
    auditService.logFromRequest(req, 'TEAM_UPDATED', 'team', { 
      teamId, 
      changes: Object.keys(updateData) 
    });
    
    res.json(team);
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ error: "Failed to update team" });
  }
});

router.post("/api/admin/teams/:teamId/archive", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const team = await teamService.archiveTeam(teamId);
    
    auditService.logFromRequest(req, 'TEAM_ARCHIVED', 'team', { teamId });
    
    res.json(team);
  } catch (error) {
    console.error("Error archiving team:", error);
    res.status(500).json({ error: "Failed to archive team" });
  }
});

router.post("/api/admin/teams/:teamId/restore", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const team = await teamService.restoreTeam(teamId);
    
    auditService.logFromRequest(req, 'TEAM_RESTORED', 'team', { teamId });
    
    res.json(team);
  } catch (error) {
    console.error("Error restoring team:", error);
    res.status(500).json({ error: "Failed to restore team" });
  }
});

router.delete("/api/admin/teams/:teamId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }

    await teamService.deleteTeam(teamId);
    
    auditService.logFromRequest(req, 'TEAM_DELETED', 'team', { teamId, teamName: team.name });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ error: "Failed to delete team" });
  }
});

router.get("/api/admin/teams/:teamId/members", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const members = await teamService.getTeamMembers(teamId);
    res.json(members);
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

router.post("/api/admin/teams/:teamId/members", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }

    const { userId, role = 'member' } = req.body;
    const adminUser = (req as any).user;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const member = await teamService.addTeamMember(teamId, userId, role, adminUser.id);
    
    auditService.logFromRequest(req, 'TEAM_MEMBER_ADDED', 'team', { 
      teamId, 
      targetUserId: userId, 
      role 
    });
    
    res.status(201).json(member);
  } catch (error: any) {
    if (error.message === 'User is already a member of this team') {
      return res.status(400).json({ error: error.message });
    }
    console.error("Error adding team member:", error);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

router.patch("/api/admin/teams/:teamId/members/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId, userId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }

    const { role } = req.body;

    if (!role || !['lead', 'manager', 'member'].includes(role)) {
      return res.status(400).json({ error: "Valid role is required (lead, manager, member)" });
    }

    const member = await teamService.updateTeamMemberRole(teamId, userId, role);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }
    
    auditService.logFromRequest(req, 'TEAM_MEMBER_ROLE_UPDATED', 'team', { 
      teamId, 
      targetUserId: userId, 
      newRole: role 
    });
    
    res.json(member);
  } catch (error) {
    console.error("Error updating team member role:", error);
    res.status(500).json({ error: "Failed to update team member role" });
  }
});

router.delete("/api/admin/teams/:teamId/members/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId, userId } = req.params;
    
    const team = await teamService.getTeamById(teamId);
    if (!team || team.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const member = await teamService.removeTeamMember(teamId, userId);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }
    
    auditService.logFromRequest(req, 'TEAM_MEMBER_REMOVED', 'team', { 
      teamId, 
      targetUserId: userId 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

router.put("/api/admin/teams/:teamId/quotas", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const quotas = req.body;

    const team = await teamService.updateTeamQuotas(teamId, quotas);
    
    auditService.logFromRequest(req, 'TEAM_QUOTAS_UPDATED', 'team', { teamId, quotas });
    
    res.json(team);
  } catch (error) {
    console.error("Error updating team quotas:", error);
    res.status(500).json({ error: "Failed to update team quotas" });
  }
});

router.put("/api/admin/teams/:teamId/goals", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const goals = req.body;

    const team = await teamService.updateTeamGoals(teamId, goals);
    
    auditService.logFromRequest(req, 'TEAM_GOALS_UPDATED', 'team', { teamId });
    
    res.json(team);
  } catch (error) {
    console.error("Error updating team goals:", error);
    res.status(500).json({ error: "Failed to update team goals" });
  }
});

router.put("/api/admin/teams/:teamId/settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { teamId } = req.params;
    
    const existingTeam = await teamService.getTeamById(teamId);
    if (!existingTeam || existingTeam.organizationId !== userContext.organizationId) {
      return res.status(404).json({ error: "Team not found in your organization" });
    }
    
    const settings = req.body;

    const team = await teamService.updateTeamSettings(teamId, settings);
    
    auditService.logFromRequest(req, 'TEAM_SETTINGS_UPDATED', 'team', { teamId });
    
    res.json(team);
  } catch (error) {
    console.error("Error updating team settings:", error);
    res.status(500).json({ error: "Failed to update team settings" });
  }
});

router.get("/api/users/me/teams", authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const userTeams = await teamService.getUserTeams(user.id);
    res.json(userTeams);
  } catch (error) {
    console.error("Error fetching user teams:", error);
    res.status(500).json({ error: "Failed to fetch user teams" });
  }
});

export default router;
