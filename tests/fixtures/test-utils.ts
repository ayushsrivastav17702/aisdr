import { db } from "../../server/db";
import { users, userSessions, organizations, prospects, sequences, emails, auditLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";

const JWT_SECRET = process.env.SESSION_SECRET || "test-secret-key";
const TEST_ORG_PREFIX = "test-org-";
const TEST_USER_PREFIX = "test-user-";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: "user" | "admin" | "super_admin";
  organizationId: string | null;
  token?: string;
  sessionId?: string;
}

export interface TestOrg {
  id: string;
  name: string;
}

export async function createTestOrganization(name?: string): Promise<TestOrg> {
  const orgId = nanoid();
  const orgName = name || `${TEST_ORG_PREFIX}${nanoid(6)}`;
  const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  
  const [org] = await db.insert(organizations).values({
    id: orgId,
    name: orgName,
    slug: orgSlug,
    status: "active",
  }).returning();
  
  return { id: org.id, name: org.name };
}

export async function createTestUser(params: {
  role: "user" | "admin" | "super_admin";
  organizationId?: string | null;
  status?: string;
  email?: string;
}): Promise<TestUser> {
  const userId = nanoid();
  const email = params.email || `${TEST_USER_PREFIX}${nanoid(6)}@test.local`;
  const password = `TestPass${nanoid(8)}!`;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const [user] = await db.insert(users).values({
    id: userId,
    email: email.toLowerCase(),
    password: hashedPassword,
    firstName: "Test",
    lastName: "User",
    role: params.role === "super_admin" ? "super_admin" : params.role === "admin" ? "admin" : "user",
    status: params.status || "active",
    organizationId: params.organizationId ?? null,
  }).returning();
  
  return {
    id: user.id,
    email: user.email,
    password,
    role: params.role,
    organizationId: user.organizationId,
  };
}

export async function loginTestUser(user: TestUser): Promise<TestUser> {
  const sessionId = nanoid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await db.insert(userSessions).values({
    id: sessionId,
    userId: user.id,
    token: nanoid(32),
    expiresAt,
    lastActivity: new Date(),
  });
  
  const token = jwt.sign(
    { userId: user.id, sessionId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  
  return { ...user, token, sessionId };
}

export function generateExpiredToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { userId, sessionId },
    JWT_SECRET,
    { expiresIn: "-1h" }
  );
}

export function generateToken(userId: string, sessionId: string, expiresIn: string = "7d"): string {
  return jwt.sign(
    { userId, sessionId },
    JWT_SECRET,
    { expiresIn }
  );
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(userSessions).where(eq(userSessions.id, sessionId));
}

export async function deactivateUser(userId: string): Promise<void> {
  await db.update(users).set({ status: "inactive" }).where(eq(users.id, userId));
}

export async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

export async function cleanupTestOrg(orgId: string): Promise<void> {
  await db.delete(users).where(eq(users.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

export async function cleanupAllTestData(): Promise<void> {
  const testUsers = await db.select().from(users).where(
    eq(users.email, users.email)
  );
  
  for (const user of testUsers) {
    if (user.email.includes(TEST_USER_PREFIX) || user.email.includes("test.local")) {
      await cleanupTestUser(user.id);
    }
  }
  
  const testOrgs = await db.select().from(organizations);
  for (const org of testOrgs) {
    if (org.name.includes(TEST_ORG_PREFIX)) {
      await cleanupTestOrg(org.id);
    }
  }
}

export async function createTestProspect(params: {
  userId: string;
  organizationId?: string;
  email?: string;
}): Promise<string> {
  const prospectId = nanoid();
  
  await db.insert(prospects).values({
    id: prospectId,
    firstName: "Test",
    lastName: "Prospect",
    email: params.email || `prospect-${nanoid(6)}@example.com`,
    userId: params.userId,
    organizationId: params.organizationId || null,
  });
  
  return prospectId;
}

export async function createTestSequence(params: {
  userId: string;
  name?: string;
  status?: string;
}): Promise<string> {
  const sequenceId = nanoid();
  
  await db.insert(sequences).values({
    id: sequenceId,
    name: params.name || `Test Sequence ${nanoid(6)}`,
    userId: params.userId,
    status: params.status || "draft",
  });
  
  return sequenceId;
}

export async function getAuditLogs(params: {
  userId?: string;
  action?: string;
  limit?: number;
}): Promise<any[]> {
  let query = db.select().from(auditLogs);
  
  if (params.userId) {
    query = query.where(eq(auditLogs.userId, params.userId)) as any;
  }
  
  return query.limit(params.limit || 100);
}

export const API_BASE = process.env.TEST_API_BASE || "http://localhost:5000";

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomEmail(): string {
  return `test-${nanoid(8)}@test.local`;
}

export function randomOrgId(): string {
  return nanoid();
}
