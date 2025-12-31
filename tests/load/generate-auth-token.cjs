#!/usr/bin/env node
/**
 * Generate a test auth token for load testing
 * Usage: node generate-auth-token.cjs
 */

const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error('SESSION_SECRET not set');
  process.exit(1);
}

// Use existing user from database
const userId = process.env.TEST_USER_ID || 'd936504a-af40-4843-a799-799e17aa4bb8';
const sessionId = randomUUID();

const token = jwt.sign({ userId, sessionId }, JWT_SECRET, { expiresIn: '1h' });

console.log(token);
