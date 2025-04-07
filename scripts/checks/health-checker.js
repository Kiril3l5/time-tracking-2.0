/**
 * Health Checker Module
 * 
 * Performs comprehensive health checks across the project:
 * - Security vulnerability scanning
 * - Environment validation
 * - Workflow validation
 * - Git configuration
 * - Module syntax validation
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const HISTORY_FILE = path.join(process.cwd(), 'temp', '.vulnerability-scan-history.json');
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const IS_DEVELOPMENT = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

/**
 * Run comprehensive health checks
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check results
 */
export async function runChecks(options = {}) {
  const startTime = Date.now();
  const results = {
    success: true,
    issues: [],
    warnings: [],
    duration: 0,
    stats: {
      security: {
        vulnerabilities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0
        }
      },
      environment: {
        missingVars: [],
        invalidConfigs: []
      },
      git: {
        issues: []
      }
    }
  };

  try {
    logger.info('Running health checks...');

    // 1. Security Vulnerability Scan
    const securityResults = await runSecurityScan(options);
    if (!securityResults.success) {
      results.issues.push(securityResults.error);
    }
    results.stats.security = securityResults.stats;

    // 2. Environment Validation
    const envResults = await validateEnvironment(options);
    if (!envResults.success && !IS_DEVELOPMENT) {
      results.issues.push(...envResults.issues);
    }
    results.stats.environment = envResults.stats;

    // 3. Git Configuration Check
    const gitResults = await checkGitConfig(options);
    if (!gitResults.success && !IS_DEVELOPMENT) {
      results.issues.push(...gitResults.issues);
    }
    results.stats.git = gitResults.stats;

    // 4. Module Syntax Validation
    const syntaxResults = await validateModuleSyntax(options);
    if (!syntaxResults.success) {
      results.issues.push(...syntaxResults.issues);
    }

    // Update success status - in development, only fail on syntax errors
    results.success = IS_DEVELOPMENT ? 
      syntaxResults.success : 
      results.issues.length === 0;
    
    results.duration = Date.now() - startTime;

    // Only log critical issues
    if (results.issues.length > 0) {
      logger.error('Health checks failed:', results.issues);
    } else {
      logger.success('Health checks passed');
    }

    return results;

  } catch (error) {
    logger.error('Health checks failed:', error);
    results.issues.push(`Health check failed: ${error.message}`);
    return results;
  }
}

/**
 * Run security vulnerability scan
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan results
 */
async function runSecurityScan(options = {}) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    }
  };

  try {
    // Run npm audit
    const { stdout, stderr } = await commandRunner.runCommand('pnpm audit --json');
    
    if (stderr) {
      results.warnings.push(`Audit produced stderr: ${stderr}`);
    }

    let auditResults;
    try {
      auditResults = JSON.parse(stdout);
    } catch (parseError) {
      results.success = false;
      results.issues.push(`Failed to parse audit results: ${parseError.message}`);
      return results;
    }

    // Check for vulnerabilities
    if (auditResults.metadata?.vulnerabilities) {
      const vulns = auditResults.metadata.vulnerabilities;
      results.stats = {
        critical: vulns.critical || 0,
        high: vulns.high || 0,
        medium: vulns.medium || 0,
        low: vulns.low || 0,
        total: vulns.total || 0
      };

      // Add issues for each severity level
      if (vulns.critical > 0) {
        results.success = false;
        results.issues.push(`Found ${vulns.critical} critical vulnerabilities`);
      }
      if (vulns.high > 0) {
        results.success = false;
        results.issues.push(`Found ${vulns.high} high severity vulnerabilities`);
      }
      if (vulns.medium > 0) {
        results.warnings.push(`Found ${vulns.medium} medium severity vulnerabilities`);
      }
      if (vulns.low > 0) {
        results.warnings.push(`Found ${vulns.low} low severity vulnerabilities`);
      }
    }

    // Check for outdated dependencies
    const { stdout: outdated } = await commandRunner.runCommand('pnpm outdated --json');
    try {
      const outdatedDeps = JSON.parse(outdated);
      if (Object.keys(outdatedDeps).length > 0) {
        results.warnings.push(`Found ${Object.keys(outdatedDeps).length} outdated dependencies`);
      }
    } catch (parseError) {
      results.warnings.push(`Failed to parse outdated dependencies: ${parseError.message}`);
    }

    return results;
  } catch (error) {
    results.success = false;
    results.issues.push(`Security scan failed: ${error.message}`);
    return results;
  }
}

/**
 * Validate environment configuration
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
export async function validateEnvironment(options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      missingVars: [],
      invalidConfigs: []
    }
  };

  try {
    // Required environment variables - only check in production
    const requiredVars = IS_DEVELOPMENT ? [] : [
      'NODE_ENV',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_API_KEY',
      'FIREBASE_AUTH_DOMAIN',
      'FIREBASE_STORAGE_BUCKET',
      'FIREBASE_MESSAGING_SENDER_ID',
      'FIREBASE_APP_ID'
    ];

    // Check for missing variables
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        results.stats.missingVars.push(varName);
        results.issues.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate environment type
    const envType = process.env.NODE_ENV || 'development';
    if (!['development', 'staging', 'production', 'preview'].includes(envType)) {
      results.stats.invalidConfigs.push('NODE_ENV');
      results.issues.push(`Invalid environment type: ${envType}`);
    }

    // Check for .env file
    const envFile = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envFile)) {
      results.warnings.push('No .env file found');
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Environment validation failed:', error);
    return {
      success: false,
      issues: ['Environment validation failed'],
      warnings: [],
      stats: {
        missingVars: [],
        invalidConfigs: []
      }
    };
  }
}

/**
 * Check Git configuration
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check results
 */
async function checkGitConfig(options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      issues: []
    }
  };

  try {
    // Check if git is initialized
    const gitInitResult = await commandRunner.runCommand('git rev-parse --is-inside-work-tree', {
      ignoreError: true
    });

    if (!gitInitResult.success) {
      results.issues.push('Git repository not initialized');
      results.stats.issues.push('not_initialized');
    }

    // Check for .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      results.issues.push('No .gitignore file found');
      results.stats.issues.push('no_gitignore');
    }

    // Only check for sensitive files in production
    if (!IS_DEVELOPMENT) {
      const sensitiveFiles = [
        '.env',
        '*.pem',
        '*.key',
        '*.crt',
        '*.p12'
      ];

      for (const pattern of sensitiveFiles) {
        const findResult = await commandRunner.runCommand(`git ls-files ${pattern}`, {
          ignoreError: true
        });

        if (findResult.success) {
          results.issues.push(`Sensitive file found: ${pattern}`);
          results.stats.issues.push(`sensitive_file_${pattern}`);
        }
      }
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Git config check failed:', error);
    return {
      success: false,
      issues: ['Git config check failed'],
      warnings: [],
      stats: {
        issues: []
      }
    };
  }
}

/**
 * Validate module syntax
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
async function validateModuleSyntax(options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      filesChecked: 0,
      issuesFound: 0
    }
  };

  try {
    // Find all JavaScript/TypeScript files
    const findResult = await commandRunner.runCommand('find . -type f -name "*.js" -o -name "*.ts"', {
      ignoreError: true
    });

    if (!findResult.success) {
      results.issues.push('Failed to find JavaScript/TypeScript files');
      return results;
    }

    const files = findResult.output.split('\n').filter(Boolean);
    results.stats.filesChecked = files.length;

    // Check each file for CommonJS require statements
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Skip files that are already using ES modules
      if (content.includes('import ') || content.includes('export ')) {
        continue;
      }

      // Check for require statements
      if (content.includes('require(')) {
        results.issues.push(`File ${file} uses CommonJS require statements`);
        results.stats.issuesFound++;
      }
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Module syntax validation failed:', error);
    return {
      success: false,
      issues: ['Module syntax validation failed'],
      warnings: [],
      stats: {
        filesChecked: 0,
        issuesFound: 0
      }
    };
  }
}

export default {
  runChecks
}; 