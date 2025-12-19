import { db } from "../db";
import { teams, teamMembers, users } from "@shared/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import type { InsertTeam, Team, TeamMember } from "@shared/schema";

export class TeamService {
  async getTeamsByOrganization(organizationId: string) {
    return db.select().from(teams)
      .where(and(
        eq(teams.organizationId, organizationId),
        isNull(teams.archivedAt)
      ))
      .orderBy(teams.name);
  }

  async getTeamHierarchy(organizationId: string) {
    const allTeams = await this.getTeamsByOrganization(organizationId);
    
    const teamMap = new Map<string, Team & { children: Team[] }>();
    const rootTeams: (Team & { children: Team[] })[] = [];
    
    for (const team of allTeams) {
      teamMap.set(team.id, { ...team, children: [] });
    }
    
    for (const team of allTeams) {
      const teamWithChildren = teamMap.get(team.id)!;
      if (team.parentTeamId && teamMap.has(team.parentTeamId)) {
        teamMap.get(team.parentTeamId)!.children.push(teamWithChildren);
      } else {
        rootTeams.push(teamWithChildren);
      }
    }
    
    return rootTeams;
  }

  async getTeamById(teamId: string) {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    return team;
  }

  async createTeam(data: InsertTeam) {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
  }

  async updateTeam(teamId: string, data: Partial<InsertTeam>) {
    const [team] = await db.update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async archiveTeam(teamId: string) {
    const [team] = await db.update(teams)
      .set({ archivedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async restoreTeam(teamId: string) {
    const [team] = await db.update(teams)
      .set({ archivedAt: null, isActive: true, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async deleteTeam(teamId: string) {
    await db.delete(teams).where(eq(teams.id, teamId));
  }

  async getTeamMembers(teamId: string) {
    return db.select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      isNull(teamMembers.leftAt)
    ))
    .orderBy(teamMembers.role, users.firstName);
  }

  async addTeamMember(teamId: string, userId: string, role: 'lead' | 'manager' | 'member' = 'member', addedBy?: string) {
    const existing = await db.select().from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      throw new Error('User is already a member of this team');
    }

    const [member] = await db.insert(teamMembers).values({
      teamId,
      userId,
      role,
      addedBy,
    }).returning();
    return member;
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: 'lead' | 'manager' | 'member') {
    const [member] = await db.update(teamMembers)
      .set({ role })
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt)
      ))
      .returning();
    return member;
  }

  async removeTeamMember(teamId: string, userId: string) {
    const [member] = await db.update(teamMembers)
      .set({ leftAt: new Date() })
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt)
      ))
      .returning();
    return member;
  }

  async getTeamLeads(teamId: string) {
    return db.select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.role, 'lead'),
      isNull(teamMembers.leftAt)
    ));
  }

  async getUserTeams(userId: string) {
    return db.select({
      member: teamMembers,
      team: teams,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(
      eq(teamMembers.userId, userId),
      isNull(teamMembers.leftAt),
      isNull(teams.archivedAt)
    ))
    .orderBy(teams.name);
  }

  async updateTeamQuotas(teamId: string, quotas: {
    monthlyProspects?: number;
    monthlyEmails?: number;
    monthlyMeetings?: number;
    revenueTarget?: number;
  }) {
    const [team] = await db.update(teams)
      .set({ quotas, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async updateTeamGoals(teamId: string, goals: {
    q1?: { target: number; achieved: number };
    q2?: { target: number; achieved: number };
    q3?: { target: number; achieved: number };
    q4?: { target: number; achieved: number };
    annual?: { target: number; achieved: number };
  }) {
    const [team] = await db.update(teams)
      .set({ goals, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async updateTeamSettings(teamId: string, settings: {
    allowCrossTeamView?: boolean;
    requireApprovalForOutreach?: boolean;
    shareProspectsWithinTeam?: boolean;
    notifyLeadOnNewMembers?: boolean;
  }) {
    const [team] = await db.update(teams)
      .set({ settings, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async getTeamStats(teamId: string) {
    const members = await this.getTeamMembers(teamId);
    const team = await this.getTeamById(teamId);
    
    return {
      memberCount: members.length,
      leadCount: members.filter(m => m.member.role === 'lead').length,
      managerCount: members.filter(m => m.member.role === 'manager').length,
      quotas: team?.quotas,
      goals: team?.goals,
    };
  }
}

export const teamService = new TeamService();
