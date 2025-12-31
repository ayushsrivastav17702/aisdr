#!/usr/bin/env node
/**
 * Create a test session in database for load testing
 */
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error('SESSION_SECRET not set');
  process.exit(1);
}

const userId = process.env.TEST_USER_ID || 'd936504a-af40-4843-a799-799e17aa4bb8';
const sessionId = randomUUID();
const token = jwt.sign({ userId, sessionId }, JWT_SECRET, { expiresIn: '1h' });

// Output SQL to create session
const expiresAt = new Date(Date.now() + 3600000).toISOString();
console.log('SESSION_ID:', sessionId);
console.log('TOKEN:', token);
console.log('');
console.log('SQL to insert:');
console.log(`INSERT INTO user_sessions (id, user_id, token, expires_at, is_active, created_at, last_activity) VALUES ('${sessionId}', '${userId}', '${token}', '${expiresAt}', true, NOW(), NOW());`);
