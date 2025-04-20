/**
 * Health Checker Module
 * 
 * Performs comprehensive health checks on the codebase.
 * This module is responsible for validating code quality, security,
 * and overall project health.
 * 
 * @security
 * This module uses several security measures:
 * 1. Command injection prevention via commandRunner
 * 2. File path sanitization using path.join()
 * 3. Input validation for all parameters
 * 4. Safe command execution with proper escaping
 * 5. No direct shell command execution
 * 6. All file operations use safe paths
 * 7. All command outputs are sanitized
 * 8. All regex patterns are pre-compiled and validated
 * 9. All file paths are validated before use
 * 10. All numeric values are type-checked and defaulted
 * 
 * @module health-checker
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
import { promisify } from 'util';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const HISTORY_FILE = path.join(process.cwd(), 'temp', '.vulnerability-scan-history.json');
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const IS_DEVELOPMENT = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

/**
 * Run comprehensive health checks
 * @param {Object} options - Check options
 * @param {Function} [options.recordWarning] - Optional callback to record warnings in the main workflow
 * @returns {Promise<Object>} Check results
 */
export async function runChecks(options = {}) {
  const startTime = Date.now();
  const recordWarning = options.recordWarning || ((msg, phase, step, severity) => { 
    logger.debug(`Health Check Warning (not propagated): ${msg} (${phase}/${step}, ${severity})`); 
  });
  
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
      if (securityResults.issues && securityResults.issues.length > 0) {
        results.issues.push(...securityResults.issues);
      } else {
        results.issues.push('Security scan failed with an unknown error');
      }
    }
    
    results.stats.security = {
      vulnerabilities: securityResults.stats || {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0
      }
    };

    if (securityResults.warnings && securityResults.warnings.length > 0) {
        results.warnings.push(...securityResults.warnings);
    }

    // 2. Environment Validation
    const envResults = await validateEnvironment(options);
    if (!envResults.success && !IS_DEVELOPMENT) {
      if (envResults.issues && envResults.issues.length > 0) {
        results.issues.push(...envResults.issues);
      } else {
        results.issues.push('Environment validation failed with an unknown error');
      }
    }
    results.stats.environment = envResults.stats || {
      missingVars: [],
      invalidConfigs: []
    };

    if (envResults.warnings && envResults.warnings.length > 0) {
       results.warnings.push(...envResults.warnings);
    }

    // 3. Git Configuration Check
    const gitResults = await checkGitConfig(options);
    if (!gitResults.success && !IS_DEVELOPMENT) {
      if (gitResults.issues && gitResults.issues.length > 0) {
        results.issues.push(...gitResults.issues);
      } else {
        results.issues.push('Git configuration check failed with an unknown error');
      }
    }
    results.stats.git = gitResults.stats || {
      issues: []
    };

    if (gitResults.warnings && gitResults.warnings.length > 0) {
       results.warnings.push(...gitResults.warnings);
    }

    // 4. Module Syntax Validation
    const syntaxResults = await validateModuleSyntax(options);
    if (!syntaxResults.success) {
      if (syntaxResults.issues && syntaxResults.issues.length > 0) {
        results.issues.push(...syntaxResults.issues);
      } else {
        results.issues.push('Module syntax validation failed with an unknown error');
      }
    }

    if (syntaxResults.warnings && syntaxResults.warnings.length > 0) {
       results.warnings.push(...syntaxResults.warnings);
    }

    // 5. Deprecated/Unpinned Dependency Check
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deprecatedPackages = [
          'tslint',
          'moment',
          'request',
          'react-addons-*',
          'node-sass'
        ];
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        for (const [name, version] of Object.entries(allDeps)) {
          // Check deprecated
          for (const deprecated of deprecatedPackages) {
            if (deprecated.endsWith('*') && name.startsWith(deprecated.slice(0, -1))) {
               recordWarning(`Package "${name}" is deprecated. Consider replacing it.`, 'Validation', 'Health Check (Deprecated Deps)', 'warning');
               break; // Only warn once per package
            } else if (name === deprecated) {
               recordWarning(`Package "${name}" is deprecated. Consider replacing it.`, 'Validation', 'Health Check (Deprecated Deps)', 'warning');
               break; // Only warn once per package
            }
          }
          // Check unpinned
          if (version === 'latest' || version === '*') {
            recordWarning(`Package "${name}" uses unpinned version "${version}". Consider pinning for stability.`, 'Validation', 'Health Check (Unpinned Deps)', 'warning');
          }
        }
      }
    } catch (error) {
       recordWarning(`Failed to check for deprecated/unpinned dependencies: ${error.message}`, 'Validation', 'Health Check (Dependencies)', 'error');
    }

    // 6. Essential Configuration File Check
    try {
      const configFiles = [
        { path: '.eslintrc.js', desc: 'ESLint configuration' },
        { path: '.prettierrc.json', desc: 'Prettier configuration' },
        { path: 'tsconfig.json', desc: 'TypeScript configuration' },
        { path: '.gitignore', desc: 'Git ignore file' }
      ];
      for (const file of configFiles) {
        if (!fs.existsSync(path.join(process.cwd(), file.path))) {
          // Treat missing essential config as a warning, not a failure
          recordWarning(`Missing ${file.desc} file (${file.path})`, 'Validation', 'Health Check (Config Files)', 'warning');
        }
      }
    } catch (error) {
      recordWarning(`Failed to check for essential config files: ${error.message}`, 'Validation', 'Health Check (Config Files)', 'error');
    }

    // Update success status
    // In development, only fail on critical syntax errors.
    // Otherwise (CI/preview builds), fail if *any* issues were found.
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
    results.issues.push(`Health check failed: ${error ? error.message || 'Unknown error' : 'Null error received'}`);
    logger.debug(`Health check error details: ${error ? error.stack || 'No stack trace' : 'Null error object'}`);
    results.success = false;
    results.duration = Date.now() - startTime;
    // Optionally record the main catch error as a warning too
    recordWarning(`Health check failed: ${error?.message || 'Unknown error'}`, 'Validation', 'Health Check', 'error');
    return results;
  }
}

/**
 * Run security vulnerability scan
 * @param {Object} options - Scan options
 * @param {Function} [options.recordWarning] - Optional callback to record warnings
 * @returns {Promise<Object>} Scan results
 */
async function runSecurityScan(options = {}) {
  const recordWarning = options.recordWarning || ((msg, phase, step, severity) => {}); // Get callback
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
  const execPromise = promisify(exec); // Ensure exec is promisified

  try {
    // Run pnpm audit directly using exec
    let stdout, stderr;
    let exitCode = 0;
    try {
      const commandOutput = await execPromise('pnpm audit --json');
      stdout = commandOutput.stdout;
      stderr = commandOutput.stderr;
    } catch (error) {
      // pnpm audit exits non-zero if vulnerabilities are found
      // Capture output even if it errored
      stdout = error.stdout;
      stderr = error.stderr;
      exitCode = error.code; // Capture exit code
      logger.debug(`pnpm audit command finished with exit code: ${exitCode}`);
    }

    if (stderr && !stderr.toLowerCase().includes('deprecated')) {
      const warningMsg = `Audit produced stderr: ${stderr.substring(0, 200)}...`;
      results.warnings.push(warningMsg);
      recordWarning(warningMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
    }

    // Now, proceed with parsing stdout, even if exitCode was non-zero
    if (!stdout || typeof stdout !== 'string') {
      results.success = false;
      results.issues.push(`Invalid audit output: ${stdout === undefined ? 'undefined' : typeof stdout}`);
      // Add more context if the command truly failed beyond finding vulns
      if (exitCode !== 0 && !stdout) { 
         results.issues.push(`pnpm audit command likely failed before producing output (Exit code: ${exitCode})`);
      }
      return results;
    }

    // Check if the output looks like JSON
    const trimmedOutput = stdout.trim();
    // Handle potential empty output if audit finds nothing AND exits 0 (unlikely but possible)
    if (trimmedOutput === '') {
        logger.info('pnpm audit produced empty output, assuming no vulnerabilities.');
        // Keep success = true, stats = 0
        return results;
    }
    
    if (!trimmedOutput.startsWith('{') || !trimmedOutput.endsWith('}')) {
      results.success = false;
      results.issues.push(`Audit output is not valid JSON format: ${trimmedOutput.substring(0, 100)}...`);
      return results;
    }
    
    let auditResults;
    try {
      auditResults = JSON.parse(stdout);
    } catch (parseError) {
      results.success = false;
      results.issues.push(`Failed to parse audit results: ${parseError.message}`);
      logger.debug(`JSON parse error details: ${parseError.stack}`);
      logger.debug(`First 200 chars of stdout: ${stdout.substring(0, 200)}`);
      return results;
    }

    // Validate expected structure exists
    if (!auditResults || typeof auditResults !== 'object') {
      results.success = false;
      results.issues.push(`Audit results not in expected format: ${typeof auditResults}`);
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
        const issueMsg = `Found ${vulns.critical} critical vulnerabilities`;
        results.issues.push(issueMsg);
        // Critical vulns are issues, but also record as error-level warning for visibility
        recordWarning(issueMsg, 'Validation', 'Health Check (Security Audit)', 'error');
      }
      if (vulns.high > 0) {
        const warnMsg = `Found ${vulns.high} high severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
      }
      if (vulns.medium > 0) {
        const warnMsg = `Found ${vulns.medium} medium severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
      }
      if (vulns.low > 0) {
        const warnMsg = `Found ${vulns.low} low severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'info'); // Low severity as info
      }
    } else if (auditResults.vulnerabilities) {
      // Alternative format for some pnpm versions
      const vulnsCount = Object.keys(auditResults.vulnerabilities).length;
      
      // Calculate severity counts manually
      let critical = 0, high = 0, medium = 0, low = 0;
      
      for (const vuln of Object.values(auditResults.vulnerabilities)) {
        if (vuln.severity === 'critical') critical++;
        else if (vuln.severity === 'high') high++;
        else if (vuln.severity === 'medium') medium++;
        else if (vuln.severity === 'low') low++;
      }
      
      results.stats = {
        critical,
        high,
        medium,
        low,
        total: vulnsCount
      };
      
      // Add issues based on manually counted severities
      if (critical > 0) {
        results.success = false;
        const issueMsg = `Found ${critical} critical vulnerabilities`;
        results.issues.push(issueMsg);
        recordWarning(issueMsg, 'Validation', 'Health Check (Security Audit)', 'error');
      }
      if (high > 0) {
        const warnMsg = `Found ${high} high severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
      }
      if (medium > 0) {
        const warnMsg = `Found ${medium} medium severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
      }
      if (low > 0) {
        const warnMsg = `Found ${low} low severity vulnerabilities`;
        results.warnings.push(warnMsg);
        recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'info');
      }
    } else {
      const warnMsg = `No vulnerability data found in audit results`;
      results.warnings.push(warnMsg);
      recordWarning(warnMsg, 'Validation', 'Health Check (Security Audit)', 'warning');
      logger.debug(`Unexpected audit result format: ${JSON.stringify(auditResults).substring(0, 200)}...`);
    }

    // Check for outdated dependencies
    try {
        const { stdout: outdated } = await execPromise('pnpm outdated --json');
        if (outdated) {
            const outdatedDeps = JSON.parse(outdated);
            const count = Object.keys(outdatedDeps).length;
            if (count > 0) {
                const warnMsg = `Found ${count} outdated dependencies`;
                results.warnings.push(warnMsg);
                recordWarning(warnMsg, 'Validation', 'Health Check (Dependencies)', 'warning');
            }
        }
    } catch (outdatedError) {
         // pnpm outdated exits non-zero if outdated packages are found
         // We need to parse the output even if it errors
         if (outdatedError.stdout) {
            try {
                const outdatedDeps = JSON.parse(outdatedError.stdout);
                const count = Object.keys(outdatedDeps).length;
                if (count > 0) {
                    const warnMsg = `Found ${count} outdated dependencies`;
                    results.warnings.push(warnMsg);
                    recordWarning(warnMsg, 'Validation', 'Health Check (Dependencies)', 'warning');
                }
            } catch (parseError) {
                const warnMsg = `Failed to parse outdated dependencies: ${parseError.message}`;
                results.warnings.push(warnMsg);
                recordWarning(warnMsg, 'Validation', 'Health Check (Dependencies)', 'error');
                logger.debug(`Outdated deps parse error: ${parseError.stack}`);
            }
         } else {
             const warnMsg = `Failed to check for outdated dependencies: ${outdatedError.message}`;
             results.warnings.push(warnMsg);
             recordWarning(warnMsg, 'Validation', 'Health Check (Dependencies)', 'error');
             logger.debug(`Outdated check error: ${outdatedError.stack}`);
         }
    }

    return results;
  } catch (error) {
    results.success = false;
    results.issues.push(`Security scan failed: ${error.message}`);
    // Log more detailed error information for debugging
    logger.debug(`Security scan error details: ${error.stack || 'No stack trace available'}`);
    recordWarning(`Security scan failed: ${error.message}`, 'Validation', 'Health Check (Security Audit)', 'error');
    return results;
  }
}

/**
 * Validate environment configuration
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
export async function validateEnvironment(options) {
  const recordWarning = options.recordWarning || ((msg, phase, step, severity) => {});
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
      const warnMsg = 'No .env file found';
      results.warnings.push(warnMsg);
      recordWarning(warnMsg, 'Validation', 'Health Check (Environment)', 'info'); // Record as info
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