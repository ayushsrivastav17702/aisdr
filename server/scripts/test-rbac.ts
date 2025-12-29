import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

async function testManagerRBAC() {
  console.log('🔐 Testing Manager RBAC Enforcement\n');
  
  // Find a manager user (role = 'admin')
  const [manager] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  
  if (!manager) {
    console.log('❌ No manager found in database');
    process.exit(1);
  }
  
  console.log(`Found manager: ${manager.email} (role: ${manager.role})`);
  
  // Create a JWT token for the manager
  const token = jwt.sign(
    { 
      userId: manager.id,
      email: manager.email,
      role: manager.role,
      organizationId: manager.organizationId
    },
    process.env.SESSION_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
  
  const BASE_URL = 'http://localhost:5000';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // SDR routes that should return 403 for managers
  const sdrRoutes = [
    { method: 'POST', path: '/api/sequences', body: JSON.stringify({ name: 'test' }) },
    { method: 'POST', path: '/api/ai-search', body: JSON.stringify({ query: 'test' }) },
    { method: 'GET', path: '/api/jobs' },
    { method: 'GET', path: '/api/email-volume-config' },
    { method: 'GET', path: '/api/automation/list' },
  ];
  
  console.log('\nTesting SDR routes (should return 403 for managers):');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const route of sdrRoutes) {
    try {
      const response = await fetch(`${BASE_URL}${route.path}`, {
        method: route.method,
        headers,
        body: route.method !== 'GET' ? route.body : undefined,
      });
      
      if (response.status === 403) {
        console.log(`✅ ${route.method} ${route.path} -> 403 (BLOCKED correctly)`);
        passed++;
      } else {
        console.log(`❌ ${route.method} ${route.path} -> ${response.status} (SHOULD BE 403)`);
        failed++;
      }
    } catch (error) {
      console.log(`⚠️ ${route.method} ${route.path} -> Error: ${error}`);
      failed++;
    }
  }
  
  // Manager routes that should work
  const managerRoutes = [
    { method: 'GET', path: '/api/manager/stats' },
    { method: 'GET', path: '/api/manager/team' },
    { method: 'GET', path: '/api/manager/campaigns' },
    { method: 'GET', path: '/api/manager/analytics' },
  ];
  
  console.log('\nTesting Manager routes (should work for managers):');
  console.log('='.repeat(60));
  
  for (const route of managerRoutes) {
    try {
      const response = await fetch(`${BASE_URL}${route.path}`, {
        method: route.method,
        headers,
      });
      
      if (response.status === 200 || response.status === 304) {
        console.log(`✅ ${route.method} ${route.path} -> ${response.status} (ALLOWED correctly)`);
        passed++;
      } else {
        console.log(`❌ ${route.method} ${route.path} -> ${response.status} (SHOULD BE 200)`);
        failed++;
      }
    } catch (error) {
      console.log(`⚠️ ${route.method} ${route.path} -> Error: ${error}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  process.exit(failed > 0 ? 1 : 0);
}

testManagerRBAC().catch(console.error);
