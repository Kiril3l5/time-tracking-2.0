/**
 * Health Checks Module
 * 
 * This module provides comprehensive health checks for the development environment
 * and project setup. It's designed to be modular and extensible.
 * 
 * @module core/health-checks
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { setTimeout, clearTimeout } from 'timers';
import dns from 'dns';
import { logger } from './logger.js';

// Import specific check modules
import { checkNodeVersion } from './health/node-version.js';
import { checkPnpmVersion } from './health/pnpm-version.js';
import { checkGitInstallation } from './health/git-installation.js';
import { checkFirebaseTools } from './health/firebase-tools.js';
import { checkEnvironmentVariables } from './health/environment-vars.js';
import { checkDiskSpace } from './health/disk-space.js';
import { checkNetworkConnectivity } from './health/network.js';
import { checkWorkspaceSetup } from './health/workspace.js';
import { checkDependencies } from './health/dependencies.js';
import { checkTypeScript } from './health/typescript.js';
import { checkBuildSetup } from './health/build.js';
import { checkTestSetup } from './health/tests.js';
import { checkFirebaseRules } from './health/firebase-rules.js';

/**
 * Health Check System
 * Verifies environment and dependencies before workflow execution
 */
export class HealthChecker {
  constructor() {
    this.checks = {
      node: checkNodeVersion,
      pnpm: checkPnpmVersion,
      git: checkGitInstallation,
      firebase: checkFirebaseTools,
      env: checkEnvironmentVariables,
      disk: checkDiskSpace,
      network: checkNetworkConnectivity,
      workspace: checkWorkspaceSetup,
      dependencies: checkDependencies,
      typescript: checkTypeScript,
      build: checkBuildSetup,
      tests: checkTestSetup,
      firebaseRules: checkFirebaseRules
    };
  }

  /**
   * Run all health checks
   * @returns {Promise<Array>} Array of check results
   */
  async runChecks() {
    const results = [];
    for (const [name, check] of Object.entries(this.checks)) {
      try {
        results.push(await check());
      } catch (error) {
        results.push({
          name,
          status: 'error',
          message: error.message,
          required: false
        });
      }
    }
    return results;
  }
} 