/* global process */

/**
 * Dependency Check Module
 * 
 * Provides centralized dependency validation and management.
 */

import { logger } from './logger.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { errorTracker } from './error-handler.js';
import { performanceMonitor } from './performance-monitor.js';
import { commandRunner } from './command-runner.js';

export class DependencyChecker {
  constructor() {
    this.requiredDependencies = {
      node: '>=14.0.0',
      pnpm: '>=6.0.0',
      firebase: '>=9.0.0',
      git: '>=2.0.0'
    };

    this.workspaceDependencies = new Map();
    this.dependencyCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check all dependencies
   * @returns {Promise<boolean>} Whether all dependencies are valid
   */
  async checkAll() {
    const startTime = Date.now();
    
    try {
      // Check system dependencies
      const systemCheck = await this.checkSystemDependencies();
      if (!systemCheck.success) {
        logger.error('System dependencies check failed');
        return false;
      }

      // Check workspace dependencies
      const workspaceCheck = await this.checkWorkspaceDependencies();
      if (!workspaceCheck.success) {
        logger.error('Workspace dependencies check failed');
        return false;
      }

      // Track performance
      const duration = Date.now() - startTime;
      performanceMonitor.trackStepPerformance('dependency-check', duration);

      return true;
    } catch (error) {
      errorTracker.addError(error);
      return false;
    }
  }

  /**
   * Check system dependencies
   * @private
   * @returns {Promise<Object>} Check result
   */
  async checkSystemDependencies() {
    const result = {
      success: true,
      missing: [],
      outdated: []
    };

    for (const [dep, version] of Object.entries(this.requiredDependencies)) {
      try {
        const installed = await this.getInstalledVersion(dep);
        if (!installed) {
          result.missing.push(dep);
          result.success = false;
        } else if (!this.satisfiesVersion(installed, version)) {
          result.outdated.push({ dep, required: version, installed });
          result.success = false;
        }
      } catch (error) {
        logger.warn(`Failed to check ${dep} version:`, error.message);
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Check workspace dependencies
   * @private
   * @returns {Promise<Object>} Check result
   */
  async checkWorkspaceDependencies() {
    const result = {
      success: true,
      issues: []
    };

    try {
      // Read package.json
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      
      // Check dependencies
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      for (const [dep, version] of Object.entries(deps)) {
        const installed = await this.getInstalledVersion(dep);
        if (!installed) {
          result.issues.push(`Missing dependency: ${dep}`);
          result.success = false;
        }
      }

      // Check for duplicate dependencies
      const duplicates = this.findDuplicateDependencies(deps);
      if (duplicates.length > 0) {
        result.issues.push(`Duplicate dependencies: ${duplicates.join(', ')}`);
        result.success = false;
      }

    } catch (error) {
      logger.error('Failed to check workspace dependencies:', error.message);
      result.success = false;
    }

    return result;
  }

  /**
   * Get installed version of a dependency
   * @private
   * @param {string} dep - Dependency name
   * @returns {Promise<string|null>} Installed version
   */
  async getInstalledVersion(dep) {
    // Check cache first
    const cached = this.dependencyCache.get(dep);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.version;
    }

    try {
      let version;
      switch (dep) {
        case 'node':
          version = process.version;
          break;
        case 'pnpm':
          version = await this.runCommand('pnpm --version');
          break;
        case 'firebase':
          version = await this.runCommand('firebase --version');
          break;
        case 'git':
          version = await this.runCommand('git --version');
          break;
        default:
          version = await this.runCommand(`npm list ${dep} --json`);
      }

      // Cache the result
      this.dependencyCache.set(dep, {
        version,
        timestamp: Date.now()
      });

      return version;
    } catch (error) {
      logger.debug(`Failed to get ${dep} version:`, error.message);
      return null;
    }
  }

  /**
   * Run a command and get its output
   * @private
   * @param {string} command - Command to run
   * @returns {Promise<string>} Command output
   */
  async runCommand(command) {
    const result = await commandRunner.run(command, {
      captureOutput: true,
      silent: true
    });
    return result.output.trim();
  }

  /**
   * Check if version satisfies requirement
   * @private
   * @param {string} version - Installed version
   * @param {string} required - Required version
   * @returns {boolean} Whether version satisfies requirement
   */
  satisfiesVersion(version, required) {
    // Remove 'v' prefix if present
    version = version.replace(/^v/, '');
    
    // Handle version ranges
    if (required.startsWith('>=')) {
      const minVersion = required.slice(2);
      return this.compareVersions(version, minVersion) >= 0;
    }
    
    return true;
  }

  /**
   * Compare two versions
   * @private
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} Comparison result
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (parts1[i] > parts2[i]) return 1;
      if (parts1[i] < parts2[i]) return -1;
    }
    
    return 0;
  }

  /**
   * Find duplicate dependencies
   * @private
   * @param {Object} deps - Dependencies object
   * @returns {string[]} List of duplicate dependencies
   */
  findDuplicateDependencies(deps) {
    const seen = new Map();
    const duplicates = [];

    for (const [dep, version] of Object.entries(deps)) {
      if (seen.has(dep)) {
        duplicates.push(dep);
      } else {
        seen.set(dep, version);
      }
    }

    return duplicates;
  }
}

export const dependencyChecker = new DependencyChecker(); 