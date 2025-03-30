/**
 * Workspace Health Checks
 * 
 * This module provides health checks specific to the workspace setup
 * and package structure.
 * 
 * @module core/health/workspace
 */

/* global process */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';

/**
 * Check workspace setup and package structure
 * @returns {Promise<Object>} Check result
 */
export async function checkWorkspaceSetup() {
  try {
    const packages = ['hours', 'admin', 'common'];
    const missing = [];
    
    for (const pkg of packages) {
      const pkgPath = path.join(process.cwd(), 'packages', pkg);
      if (!fs.existsSync(pkgPath)) {
        missing.push(pkg);
      }
    }

    return {
      name: 'Workspace Setup',
      status: missing.length === 0 ? 'ok' : 'error',
      message: missing.length === 0 ? 'All packages present' : `Missing packages: ${missing.join(', ')}`,
      required: missing.length === 0
    };
  } catch (error) {
    logger.warn('Failed to check workspace setup:', error.message);
    return {
      name: 'Workspace Setup',
      status: 'error',
      message: 'Failed to check workspace setup',
      required: false
    };
  }
} 