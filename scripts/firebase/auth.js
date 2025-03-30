#!/usr/bin/env node

import { execSync } from 'child_process';
import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';

const TOKEN_FILE = '.auth-tokens.json';
const TOKEN_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

export async function ensureFirebaseAuth() {
  try {
    // Check if token file exists
    if (!fs.existsSync(TOKEN_FILE)) {
      return await authenticate();
    }

    // Read token file
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    
    // Check if token needs refresh
    if (needsTokenRefresh(tokens)) {
      logger.info('Firebase token needs refresh');
      return await authenticate();
    }

    // Verify token is still valid
    if (!await verifyToken(tokens)) {
      logger.info('Firebase token is invalid');
      return await authenticate();
    }

    return true;
  } catch (error) {
    logger.error(`Firebase authentication failed: ${error.message}`);
    return false;
  }
}

function needsTokenRefresh(tokens) {
  if (!tokens.expires_at) return true;
  
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  const timeUntilExpiry = expiresAt - now;
  
  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
}

async function verifyToken(tokens) {
  try {
    // Try to list projects to verify token
    execSync('firebase projects:list --token ' + tokens.access_token, { 
      stdio: 'pipe' 
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function authenticate() {
  logger.info('Initiating Firebase reauthentication...');
  
  try {
    // Run Firebase login
    execSync('firebase login --reauth', { stdio: 'inherit' });
    
    // Get token info
    const tokenInfo = JSON.parse(
      execSync('firebase login:ci --token', { encoding: 'utf8' })
    );
    
    // Save token with expiry
    const tokens = {
      ...tokenInfo,
      expires_at: new Date(Date.now() + tokenInfo.expires_in * 1000).toISOString()
    };
    
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    
    logger.success('Firebase reauthentication successful');
    return true;
  } catch (error) {
    logger.error(`Firebase authentication failed: ${error.message}`);
    return false;
  }
}

// Run authentication if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureFirebaseAuth().then(success => {
    if (!success) process.exit(1);
  });
} 