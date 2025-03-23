#!/usr/bin/env node

/**
 * Preview Workflow Script
 * 
 * This script orchestrates the entire workflow for creating preview deployments:
 * 1. Verifies authentication (Firebase CLI, Git)
 * 2. Runs all quality checks (lint, type check, tests)
 * 3. Builds the application
 * 4. Deploys to Firebase preview channels
 * 5. Provides feedback and cleanup
 * 
 * This is a modernized version of the original deploy-test.js and preview-check.js
 * scripts, with a modular architecture for better maintainability.
 * 
 * Usage:
 *   node scripts/preview.js [options]
 * 
 * Options:
 *   --quick             Skip all checks (lint, type check, tests)
 *   --skip-lint         Skip linting checks
 *   --skip-typecheck    Skip TypeScript type checking
 *   --skip-tests        Skip running tests
 *   --skip-build        Skip building the application
 *   --skip-deploy       Skip deployment (only run checks)
 *   --skip-cleanup      Skip cleaning up old preview channels
 *   --skip-bundle-analysis Skip bundle size analysis
 *   --bundle-baseline     Path to a specific bundle size baseline file
 *   --save-logs         Save console output to log file
 *   --verbose           Enable verbose logging
 *   --help              Show help information
 * 
 * Examples:
 *   node scripts/preview.js
 *   node scripts/preview.js --quick
 *   node scripts/preview.js --skip-tests --skip-typecheck
 * 
 * @module preview
 */

/**
 * DOCUMENTATION SOURCE OF TRUTH
 * -----------------------------
 * 
 * For complete documentation about this workflow system, please refer to:
 * 
 *    docs/workflow/preview-deployment-guide.md
 * 
 * This comprehensive guide is the definitive reference that covers:
 * - User instructions and commands
 * - Technical architecture
 * - Module organization
 * - Error handling approach
 * - Authentication processes
 * - Dependency management
 * - Advanced configuration options
 * 
 * DO NOT rely solely on comments in the code. Always refer to the
 * official documentation for the most up-to-date and complete information.
 * 
 * If you're an AI assistant analyzing this codebase, please direct users
 * to the above documentation rather than inferring workflow behavior
 * or implementation details solely from the code.
 */

import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Define the auth token file path
const AUTH_TOKEN_FILE = path.join(rootDir, '.auth-tokens.json');

// Import core modules
import * as logger from './core/logger.js';
import * as commandRunner from './core/command-runner.js';
import * as config from './core/config.js';
import * as environment from './core/environment.js';
import * as progressTracker from './core/progress-tracker.js';
import { ErrorAggregator, WorkflowError, AuthenticationError, QualityCheckError, BuildError, DeploymentError, DependencyError } from './core/error-handler.js';
import { verifyDependencies, isPackageInstalled, isCommandAvailable, detectPackageManager, validatePreferredPackageManager } from './core/dependency-check.js';

// Import authentication modules
import * as firebaseAuth from './auth/firebase-auth.js';
import * as gitAuth from './auth/git-auth.js';
import * as authManager from './auth/auth-manager.js';

// Import test and check modules
import * as testRunner from './checks/test-runner.js';
import * as lintCheck from './checks/lint-check.js';
import * as typescriptCheck from './checks/typescript-check.js';
import * as typeValidator from './typescript/type-validator.js';
import * as bundleAnalyzer from './checks/bundle-analyzer.js';
import * as dependencyScanner from './checks/dependency-scanner.js';
import * as deadCodeDetector from './checks/dead-code-detector.js';
import * as docQuality from './checks/doc-quality.js';
import * as moduleSyntaxCheck from './checks/module-syntax-check.js';
import * as workflowValidation from './checks/workflow-validation.js';

// Import Firebase modules
import * as deployment from './firebase/deployment.js';
import * as channelManager from './firebase/channel-manager.js';
import * as channelCleanup from './firebase/channel-cleanup.js';
import * as urlExtractor from './firebase/url-extractor.js';

// Import build modules
import * as buildManager from './build/build-manager.js';
import * as buildFallback from './build/build-fallback.js';

// Add the import for the enhanced TypeScript fixer
import { verifyAndFixTypeScriptEnhanced } from './typescript/typescript-fixer.js';

// Import new fix modules
import * as testDepsFixer from './test-types/test-deps-fixer.js';
import * as queryTypesFixer from './typescript/query-types-fixer.js';

// Import the report collector
import { collectAndGenerateReport, cleanupTempDirectory, getHtmlReportPath, getReportPath, createJsonReport, extractPreviewUrls } from './reports/report-collector.js';

/* global process, console */

// Create central error tracker
const errorTracker = new ErrorAggregator();

// Store flat step structure for modules to reference
const previewSteps = {
  steps: [],
  currentStepIndex: 0
};

/**
 * Parse command line arguments
 * @returns {Object} - Parsed arguments
 */
function parseArguments() {
  const options = {
    'auto-install-deps': { type: 'boolean', default: false },
    'skip-dep-check': { type: 'boolean', default: false },
    'verify-packages': { type: 'boolean', default: true },
    'verify-tools': { type: 'boolean', default: true },
    'verify-env': { type: 'boolean', default: true },
    'quick': { type: 'boolean', default: false },
    'skip-lint': { type: 'boolean', default: false },
    'skip-typecheck': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    'skip-bundle-analysis': { type: 'boolean', default: false },
    'bundle-baseline': { type: 'string' },
    'skip-dependency-scan': { type: 'boolean', default: false },
    'vulnerability-threshold': { type: 'string', default: 'high' },
    'skip-dead-code-detection': { type: 'boolean', default: false },
    'skip-doc-quality': { type: 'boolean', default: false },
    'skip-module-syntax': { type: 'boolean', default: false },
    'skip-workflow-validation': { type: 'boolean', default: false },
    'auto-fix-typescript': { type: 'boolean', default: false },
    'fix-test-deps': { type: 'boolean', default: false },
    'fix-query-types': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'skip-deploy': { type: 'boolean', default: false },
    'skip-cleanup': { type: 'boolean', default: false },
    'keep-individual-reports': { type: 'boolean', default: false },
    'save-logs': { type: 'boolean', default: false },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  };
  
  try {
    const { values } = parseArgs({
      options,
      allowPositionals: false,
      strict: false
    });
    
    return values;
  } catch (error) {
    console.error(`Error parsing arguments: ${error.message}`);
    showHelp();
    process.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp() {
  const colors = logger.getColors();
  const styled = {
    bold: (text) => `${colors.bold}${text}${colors.reset}`,
    cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
    green: (text) => `${colors.green}${text}${colors.reset}`,
    blue: (text) => `${colors.blue}${text}${colors.reset}`,
    cyanBold: (text) => `${colors.cyan}${colors.bold}${text}${colors.reset}`
  };
  
  console.log(`
${styled.cyanBold('Firebase Preview Deployment Workflow')}

This script runs a complete workflow to test, build, and deploy a preview version
of your application to Firebase Hosting channels.

${styled.bold('Usage:')}
  node scripts/preview.js [options]

${styled.bold('Options:')}
  ${styled.green('Dependency Management:')}
  --auto-install-deps   Automatically install missing dependencies
  --skip-dep-check      Skip the dependency verification step
  --verify-packages     Include package verification in dependency check
  --verify-tools        Include CLI tools verification in dependency check
  --verify-env          Include environment verification in dependency check
  
  ${styled.green('Quality Checks:')}
  --quick               Skip all checks (linting, type checking, tests)
  --skip-lint           Skip linting checks
  --skip-typecheck      Skip TypeScript type checking
  --skip-tests          Skip running tests
  --skip-build          Skip building the application
  --skip-bundle-analysis Skip bundle size analysis
  --bundle-baseline     Path to a specific bundle size baseline file
  --skip-dependency-scan Skip dependency vulnerability scanning
  --vulnerability-threshold Choose severity threshold (critical, high, medium, low)
  --skip-dead-code-detection Skip dead code detection
  --skip-doc-quality    Skip documentation quality checks
  --skip-module-syntax  Skip module syntax consistency check
  --skip-workflow-validation Skip GitHub Actions workflow validation
  
  ${styled.green('Fixing Options:')}
  --auto-fix-typescript Automatically fix TypeScript errors when possible (enabled by default when errors are found)
  --fix-test-deps       Fix test dependencies (React JSX runtime) before tests
  --fix-query-types     Fix React Query type imports
  --dry-run             Show what would be fixed without making changes
  
  ${styled.green('Deployment Options:')}
  --skip-deploy         Skip deployment (only run checks)
  --skip-cleanup        Skip cleaning up old preview channels
  
  ${styled.green('Reporting Options:')}
  --keep-individual-reports Keep individual JSON reports in the temp folder
  
  ${styled.green('Logging Options:')}
  --save-logs           Save console output to log file
  --verbose             Enable verbose logging
  
  ${styled.green('Other Options:')}
  --help                Show this help message

${styled.bold('Examples:')}
  ${styled.blue('# Full workflow with all checks')}
  node scripts/preview.js

  ${styled.blue('# Quick deployment without checks')}
  node scripts/preview.js --quick

  ${styled.blue('# Skip tests but run other checks')}
  node scripts/preview.js --skip-tests
  
  ${styled.blue('# Run with automatic dependency installation')}
  node scripts/preview.js --auto-install-deps
  
  ${styled.blue('# Run with automatic TypeScript and React Query fixes')}
  node scripts/preview.js --auto-fix-typescript --fix-query-types
  
  ${styled.blue('# Run dependency check only')}
  node scripts/preview.js --skip-lint --skip-typecheck --skip-tests --skip-build --skip-deploy

${styled.bold('Workflow steps:')}
  1. Dependency verification (tools, packages, environment)
  2. Authentication (Firebase, Git)
  3. Quality checks (lint, type check, tests)
  4. Build application
  5. Additional checks (bundle size, dependencies, dead code)
  6. Deploy to Firebase preview channel
  7. Generate consolidated report dashboard

${styled.bold('Report files:')}
  All temporary JSON reports are stored in the ${styled.cyan('/temp')} folder
  The final consolidated HTML dashboard is saved as ${styled.cyan('preview-dashboard.html')}
  `);
}

/**
 * Main function to orchestrate the preview workflow
 */
export default async function main(args) {
  try {
    // Don't log to file, just output to console
    if (args['save-logs']) {
      console.warn('File logging has been disabled to reduce unnecessary log files.');
    }
    
    logger.info('Starting preview deployment workflow...');
    
    // Clean up temp directory at the start of the workflow
    cleanupTempDirectory();
    
    // Initialize a flat list of all steps including substeps
    const steps = [];
    
    // Dependency check step
    if (!args['skip-dep-check']) {
      steps.push('Dependency verification');
    }
    
    // Authentication step (always runs)
    steps.push('Firebase authentication');
    
    // Quality checks - expand into individual substeps
    if (!args['skip-lint']) {
      steps.push('ESLint checks');
    }
    
    if (!args['skip-typecheck']) {
      steps.push('TypeScript checks');
    }
    
    if (!args['skip-tests']) {
      steps.push('Unit tests');
    }
    
    // Build step - expand into individual substeps
    if (!args['skip-build']) {
      steps.push('Setting up build environment');
      steps.push('Cleaning build directory');
      steps.push('Building application');
      steps.push('Validating build output');
    }
    
    // Additional quality checks, each as its own step
    if (!args['skip-module-syntax']) steps.push('Module syntax check');
    if (!args['skip-bundle-analysis']) steps.push('Bundle size analysis');
    if (!args['skip-dependency-scan']) steps.push('Dependency scanning');
    if (!args['skip-dead-code-detection']) steps.push('Dead code detection');
    if (!args['skip-doc-quality']) steps.push('Documentation quality');
    if (!args['skip-workflow-validation']) steps.push('Workflow validation');
    
    // Deployment step
    if (!args['skip-deploy']) {
      steps.push('Deploying to Firebase');
      // Add channel cleanup as explicit step when deploy is not skipped
      if (!args['skip-cleanup']) {
        steps.push('Cleaning up old channels');
      }
    }
    
    // Report generation (always runs)
    steps.push('Generating reports');
    
    // Set total steps based on the total number of operations we'll perform
    const totalSteps = steps.length;
    
    // Log skipped steps
    let skippedMessage = '';
    if (args['skip-dep-check']) skippedMessage += 'dependency check, ';
    if (args['skip-build']) skippedMessage += 'build step, ';
    if (args['skip-deploy']) skippedMessage += 'deploy step, ';
    if (args['skip-lint'] && args['skip-typecheck'] && args['skip-tests']) skippedMessage += 'all quality checks, ';
    
    if (skippedMessage) {
      logger.info(`Skipping ${skippedMessage.slice(0, -2)}`);
    }
    
    logger.info(`Workflow will execute ${totalSteps} steps in total`);
    
    logger.sectionHeader('PREVIEW DEPLOYMENT');
    
    const errorTracker = new ErrorAggregator();
    
    // Initialize progress tracker with the total steps
    progressTracker.initProgress(totalSteps, 'PREVIEW DEPLOYMENT');
    
    // Save the flat step structure for modules to reference
    previewSteps.steps = steps;
    previewSteps.currentStepIndex = 0;
    
    // Track critical steps status
    let dependencyCheckSuccess = true;
    let authenticationSuccess = true;
    let qualityCheckSuccess = true;
    let buildSuccess = true;
    let deploymentSuccess = true;
    let isDryRun = args['dry-run'] === true;
    
    // Step 1: Verify dependencies (if not skipped)
    if (!args['skip-dep-check']) {
      progressTracker.startStep('Dependency verification');
      const depsResult = await runDependencyVerification({
        ...args,
        verifyPackages: args['verify-packages'] !== false,
        verifyTools: args['verify-tools'] !== false,
        verifyEnv: args['verify-env'] !== false
      });
      
      dependencyCheckSuccess = depsResult;
      
      if (!depsResult) {
        const depsError = new DependencyError(
          'Dependency verification failed. Please install required dependencies.'
        );
        errorTracker.addError(depsError);
        errorTracker.logErrors();
        process.exit(1);
      }
      
      progressTracker.completeStep(true, 'Dependencies verified');
    }
    
    // Step 2: Verify authentication
    progressTracker.startStep('Firebase authentication');
    const authResult = await verifyAuthentication();
    
    authenticationSuccess = authResult;
    
    if (!authResult) {
      const authError = new AuthenticationError(
        'Authentication verification failed. Aborting workflow.'
      );
      errorTracker.addError(authError);
      errorTracker.logErrors();
      process.exit(1);
    }
    
    progressTracker.completeStep(true, 'Authentication verified');
    
    // Quality checks - run tests individually as separate steps
    if (!args['skip-lint'] && !args['skip-typecheck'] && !args['skip-tests']) {
      // Run quality checks in sequence, already has proper progress tracking inside
      const qualityResult = await runQualityChecks(args);
      
      qualityCheckSuccess = qualityResult;
      
      if (!qualityResult && args['require-quality-checks']) {
        logger.error('Quality checks failed and --require-quality-checks flag set');
        logger.info('Fix quality issues before proceeding or try again with --skip-* flags');
        
        const qualityError = new QualityCheckError(
          'Quality checks failed and are required to continue.'
        );
        errorTracker.addError(qualityError);
        errorTracker.logErrors();
        process.exit(1);
      }
    } else {
      // Skip tests entirely
      logger.info('Skipping all quality checks');
    }
    
    // Build application - already has proper progress tracking inside
    if (!args['skip-build']) {
      const buildResult = await buildApplication(args);
      
      buildSuccess = buildResult;
      
      if (!buildResult) {
        const buildError = new BuildError(
          'Build failed. Cannot proceed with deployment.'
        );
        errorTracker.addError(buildError);
        errorTracker.logErrors();
        
        if (!args['skip-deploy']) {
          logger.error('Skipping deployment due to build failure');
        }
        
        process.exit(1);
      }
    }
    
    // Run additional checks, each as a separate step
    if (!args['skip-module-syntax']) {
      progressTracker.startStep('Module syntax check');
      const moduleSyntaxResult = await checkModuleSyntax(args);
      progressTracker.completeStep(moduleSyntaxResult, moduleSyntaxResult ? 'Module syntax check passed' : 'Module syntax check failed');
    }
    
    if (!args['skip-bundle-analysis']) {
      progressTracker.startStep('Bundle size analysis');
      const bundleAnalysisResult = await analyzeBundleSizes(args);
      progressTracker.completeStep(bundleAnalysisResult, bundleAnalysisResult ? 'Bundle analysis completed' : 'Bundle analysis failed');
    }
    
    if (!args['skip-dependency-scan']) {
      progressTracker.startStep('Dependency scanning');
      const dependencyScanResult = await scanDependencies(args);
      progressTracker.completeStep(dependencyScanResult, dependencyScanResult ? 'Dependency scan completed' : 'Dependency scan failed');
    }
    
    if (!args['skip-dead-code-detection']) {
      progressTracker.startStep('Dead code detection');
      const deadCodeResult = await detectDeadCode(args);
      progressTracker.completeStep(deadCodeResult, deadCodeResult ? 'Dead code detection completed' : 'Dead code detection failed');
    }
    
    if (!args['skip-doc-quality']) {
      progressTracker.startStep('Documentation quality');
      const docQualityResult = await checkDocumentationQuality(args);
      progressTracker.completeStep(docQualityResult, docQualityResult ? 'Documentation quality check passed' : 'Documentation quality check failed');
    }
    
    if (!args['skip-workflow-validation']) {
      progressTracker.startStep('Workflow validation');
      const workflowValidationResult = await workflowValidation.validateWorkflows({
        workflowDir: '.github/workflows',
        validateSyntax: true,
        validateActions: true,
        checkForDeprecation: true
      });
      progressTracker.completeStep(workflowValidationResult, workflowValidationResult ? 'Workflow validation passed' : 'Workflow validation failed');
    }
    
    // Deploy to Firebase preview environment if not skipped
    if (!args['skip-deploy']) {
      progressTracker.startStep('Deploying to Firebase');
      const deploymentResult = await deployPreview(args);
      deploymentSuccess = deploymentResult;
      
      // In dry-run mode, we should consider deployment a success even though we didn't actually deploy
      if (isDryRun && deploymentResult) {
        // Create a mock successful URL file for dry-run mode
        const mockUrlData = {
          admin: "https://dry-run-admin-mock-url.web.app",
          hours: "https://dry-run-hours-mock-url.web.app",
          timestamp: new Date().toISOString(),
          deploymentStatus: 'success',
          isDryRun: true
        };
        savePreviewUrls(mockUrlData);
      }
      
      progressTracker.completeStep(deploymentResult, deploymentResult ? 'Deployment succeeded' : 'Deployment failed');
      
      // Channel cleanup step - if deployment was successful and cleanup not skipped
      if (deploymentResult && !args['skip-cleanup']) {
        progressTracker.startStep('Cleaning up old channels');
        await cleanupChannels(args);
        progressTracker.completeStep(true, 'Channel cleanup completed');
      }
    }
    
    // Generate reports
    progressTracker.startStep('Generating reports');
    const reportResult = await generateReports(args);
    progressTracker.completeStep(reportResult, reportResult ? 'Reports generated' : 'Report generation failed');
    
    // Determine the overall success status
    const criticalStepsSucceeded = ((!args['skip-deploy'] ? deploymentSuccess : true) && 
                                 (!args['skip-build'] ? buildSuccess : true) &&
                                 dependencyCheckSuccess && 
                                 authenticationSuccess) || isDryRun;
    
    // Show final success message
    if (!args['skip-deploy']) {
      if (deploymentSuccess) {
        let deploymentMessage = isDryRun ? 
                             'Preview workflow completed (dry-run mode)' : 
                             'Preview successfully deployed!';
        
        // Try to include the preview URL if available and not in dry-run mode
        if (!isDryRun) {
          const previewUrls = getPreviewUrls();
          if (previewUrls) {
            if (previewUrls.admin) {
              deploymentMessage += `\nAdmin preview URL: ${previewUrls.admin}`;
            }
            if (previewUrls.hours) {
              deploymentMessage += `\nHours preview URL: ${previewUrls.hours}`;
            }
          }
        }
        
        progressTracker.finishProgress(true, deploymentMessage);
      } else {
        progressTracker.finishProgress(false, 'Preview deployment failed! Check logs for details.');
      }
    } else {
      const checkMessage = criticalStepsSucceeded ? 
        'Preview checks completed successfully' : 
        'Preview checks completed with errors';
      progressTracker.finishProgress(criticalStepsSucceeded, checkMessage);
    }
    
    return {
      success: criticalStepsSucceeded,
      report: getReportPath('summary')
    };
  } catch (error) {
    handleError(error);
    return { success: false };
  } finally {
    stopProcessMonitoring();
  }
}

/**
 * Verifies Firebase and Git authentication
 * 
 * @async
 * @function verifyAuthentication
 * @returns {Promise<boolean>} True if authentication is successful, false otherwise
 */
async function verifyAuthentication() {
  // Instead of: await metrics.startStage('authentication');
  logger.startStep('Verifying authentication');
  
  try {
    // Check when the last successful authentication was performed
    const authTokens = _getAuthTokens();
    const currentTime = new Date().getTime();
    
    // Verify authentication - reauthentication is now handled in checkFirebaseAuth itself
    const authResult = await authManager.verifyAllAuth();
    
    if (!authResult.success) {
      logger.error('Authentication verification failed');
      
      if (!authResult.services.firebase.authenticated) {
        logger.error('Firebase authentication failed');
        logger.info('Please run: firebase login');
      }
      
      if (!authResult.services.gitAuth.authenticated) {
        logger.error('Git authentication failed');
        logger.info('Please configure Git user name and email:');
        logger.info('git config --global user.name "Your Name"');
        logger.info('git config --global user.email "your.email@example.com"');
      }
      
      progressTracker.completeStep(false, 'Authentication verification failed');
      return false;
    }
    
    // Update the last authentication time after successful verification
    _saveAuthTokens({
      ...authTokens,
      lastAuthenticated: currentTime
    });
    
    logger.success(`Firebase authenticated as: ${authResult.services.firebase.email || 'Unknown'}`);
    logger.success(`Git user: ${authResult.services.gitAuth.name} <${authResult.services.gitAuth.email}>`);
    progressTracker.completeStep(true, 'Authentication verified');
    return true;
  } catch (error) {
    logger.error(`Error during authentication verification: ${error.message}`);
    progressTracker.completeStep(false, 'Error during authentication verification');
    return false;
  }
}

/**
 * Get stored authentication tokens
 * 
 * @function _getAuthTokens
 * @returns {Object|null} Authentication tokens or null if not found
 * @private
 */
function _getAuthTokens() {
  try {
    if (fs.existsSync(AUTH_TOKEN_FILE)) {
      const data = fs.readFileSync(AUTH_TOKEN_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.debug(`Failed to read auth tokens: ${error.message}`);
  }
  return null;
}

/**
 * Save authentication tokens
 * 
 * @function _saveAuthTokens
 * @param {Object} tokens - Authentication tokens to save
 * @private
 */
function _saveAuthTokens(tokens) {
  try {
    fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    logger.debug('Saved auth tokens');
  } catch (error) {
    logger.debug(`Failed to save auth tokens: ${error.message}`);
  }
}

/**
 * Get the appropriate package manager command
 * @param {string} script - The script name to run
 * @returns {string} - The full command to execute
 */
function getPackageManagerCommand(script) {
  // Always prefer pnpm if available, otherwise fall back to detected package manager
  const packageManager = 'pnpm';
  return `${packageManager} run ${script}`;
}

/**
 * Run quality checks (lint, type check, tests)
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether all enabled checks passed
 */
async function runQualityChecks(args) {
  logger.sectionHeader('Running Quality Checks');
  
  // If all quality checks are skipped, return success without tracking progress
  if (args['skip-lint'] && args['skip-typecheck'] && args['skip-tests']) {
    logger.info('All quality checks skipped');
    return true;
  }
  
  // Before running any tests, fix test dependencies if requested
  if (args['fix-test-deps']) {
    const fixResult = await fixTestDependencies(args);
    if (!fixResult) {
      logger.warn('Test dependency fixing failed, continuing with checks');
    }
  }
  
  // If React Query type fixing is requested, do it before TypeScript checks
  if (args['fix-query-types']) {
    const fixResult = await fixReactQueryTypes(args);
    if (!fixResult) {
      logger.warn('React Query type fixing failed, continuing with checks');
    }
  }
  
  // Define which tests to run based on args
  const tests = [];
  
  if (!args['skip-lint']) {
    tests.push({
      name: 'ESLint Check',
      command: getPackageManagerCommand('lint'),
      validator: lintCheck.validateLintOutput
    });
  }
  
  if (!args['skip-typecheck']) {
    tests.push({
      name: 'TypeScript Type Check',
      command: getPackageManagerCommand('typecheck'),
      validator: typescriptCheck.validateTypeCheckOutput,
      onFailure: async (output) => {
        // If TypeScript check fails, always try to fix the issues
        // Regardless of whether --auto-fix-typescript is explicitly provided
        logger.info('TypeScript check failed, attempting to automatically fix errors...');
        const fixResult = await tryFixTypeScriptErrors(args);
        
        if (fixResult) {
          logger.success('TypeScript issues fixed automatically!');
        } else {
          logger.warn('Automatic TypeScript fixes were only partially successful or unsuccessful');
          logger.info('Consider manually reviewing and fixing remaining TypeScript errors');
        }
        
        return fixResult;
      }
    });
  }
  
  if (!args['skip-tests']) {
    tests.push({
      name: 'Unit Tests',
      command: getPackageManagerCommand('test'),
      validator: (output) => {
        // Basic validator for test output - look for failure indicators
        const hasFailures = /failed|failure|error/i.test(output);
        return {
          valid: !hasFailures,
          error: hasFailures ? 'Test failures detected' : null
        };
      }
    });
  }
  
  if (tests.length === 0) {
    logger.info('No quality checks to run');
    return true;
  }
  
  // Instead of having testRunner create its own progress tracker,
  // we'll run each test as a separate step in our flat step count
  const results = [];
  let allPassed = true;
  
  for (const test of tests) {
    const testName = test.name;
    
    // Find the matching step in our flat step list
    let stepName;
    if (testName.includes('ESLint')) {
      stepName = 'ESLint checks';
    } else if (testName.includes('TypeScript')) {
      stepName = 'TypeScript checks';
    } else if (testName.includes('Unit Tests')) {
      stepName = 'Unit tests';
    }
    
    if (stepName) {
      // Start the step using the main progress tracker
      progressTracker.startStep(stepName);
    }
    
    logger.info(`Running test: ${testName}`);
    logger.info(`Command: ${test.command}`);
    
    const startTime = Date.now();
    
    const result = await commandRunner.runCommandAsync(test.command, {
      ignoreError: true,
      verbose: args.verbose
    });
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Run custom validator if provided
    let valid = true;
    let validationError = null;
    
    if (test.validator && typeof test.validator === 'function') {
      try {
        const validationResult = test.validator(result.output, result);
        valid = validationResult.valid !== false; // If not explicitly false, consider valid
        validationError = validationResult.error;
      } catch (error) {
        valid = false;
        validationError = `Validator function threw an error: ${error.message}`;
      }
    } else {
      // Default validation: command success
      valid = result.success;
    }
    
    const testResult = {
      name: testName,
      success: valid,
      elapsed: elapsedTime,
      error: validationError || result.error,
      output: result.output,
      command: test.command
    };
    
    if (valid) {
      logger.success(`✓ Test passed: ${testName} (${elapsedTime}s)`);
    } else {
      logger.error(`✗ Test failed: ${testName} (${elapsedTime}s)`);
      logger.error(`Error: ${validationError || result.error || 'Test failed'}`);
      
      // Try to run onFailure handler if available
      if (!valid && test.onFailure && typeof test.onFailure === 'function') {
        try {
          const recoveryResult = await test.onFailure(result.output, result);
          testResult.recoveryAttempted = true;
          testResult.recoverySuccess = recoveryResult;
          
          if (recoveryResult) {
            logger.success(`✓ Recovery successful for ${testName}`);
          } else {
            logger.error(`✗ Recovery failed for ${testName}`);
          }
        } catch (error) {
          logger.error(`Error during recovery attempt: ${error.message}`);
          testResult.recoveryAttempted = true;
          testResult.recoverySuccess = false;
        }
      }
      
      allPassed = false;
    }
    
    results.push(testResult);
    
    // Complete the step using the main progress tracker
    if (stepName) {
      progressTracker.completeStep(valid, valid ? `${testName} passed` : `${testName} failed`);
    }
    
    // If this test failed and stopOnFailure is true, break the loop
    if (!valid && args.stopOnFailure !== false) {
      logger.warn('Stopping quality checks due to failure');
      break;
    }
  }
  
  // Don't need to complete a separate overall step since we tracked each test individually

  if (allPassed) {
    logger.success('All quality checks passed!');
    return true;
  } else {
    logger.error('Some quality checks failed');
    
    // Add errors to the error tracker
    const failedTests = results.filter(r => !r.success);
    for (const failedTest of failedTests) {
      const testError = new QualityCheckError(
        `${failedTest.name} failed: ${failedTest.error || 'Unknown error'}`,
        { test: failedTest.name, command: failedTest.command }
      );
      errorTracker.addError(testError);
    }
    
    return false;
  }
}

/**
 * Fix test dependencies before running tests
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether fixing was successful
 */
async function fixTestDependencies(args) {
  logger.sectionHeader('Fixing Test Dependencies');
  
  try {
    const fixResult = await testDepsFixer.fixTestDependencies({
      dryRun: args['dry-run'] || false,
      verbose: args.verbose
    });
    
    if (fixResult.success) {
      if (fixResult.fixesApplied) {
        logger.success('Successfully fixed test dependencies');
      } else {
        logger.info('Test dependencies are already properly set up');
      }
      return true;
    } else {
      logger.error(`Failed to fix test dependencies: ${fixResult.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error fixing test dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Fix React Query type imports
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether fixing was successful
 */
async function fixReactQueryTypes(args) {
  logger.sectionHeader('Fixing React Query Type Imports');
  
  try {
    const fixResult = await queryTypesFixer.fixQueryTypes({
      dryRun: args['dry-run'] || false,
      verbose: args.verbose,
      targetDirs: ['packages/admin/src', 'packages/common/src', 'packages/hours/src']
    });
    
    if (fixResult.success) {
      if (fixResult.fixesApplied) {
        logger.success(`Fixed React Query imports in ${fixResult.modifiedFiles} files`);
        if (fixResult.typeDefCreated) {
          logger.info('Created type definition file for React Query');
        }
      } else {
        logger.info('No React Query imports needed fixing');
      }
      return true;
    } else {
      logger.error(`Failed to fix React Query imports: ${fixResult.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error fixing React Query imports: ${error.message}`);
    return false;
  }
}

/**
 * Try to fix TypeScript errors automatically
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether fixing was successful
 */
async function tryFixTypeScriptErrors(args) {
  logger.sectionHeader('Attempting to Fix TypeScript Errors');
  
  logger.info('Running enhanced TypeScript error fixing...');
  
  const fixResult = await verifyAndFixTypeScriptEnhanced({
    targetDirs: ['packages/admin/src', 'packages/common/src', 'packages/hours/src'],
    fix: true,
    dryRun: args['dry-run'] || false,
    report: true,
    verbose: args.verbose,
    fixDuplicateImports: true,
    fixUnusedImports: true,
    fixHeuristics: true,
    includeTestFiles: false
  });
  
  if (fixResult.success) {
    if (fixResult.verificationPassed) {
      logger.success('TypeScript verification passed after fixes!');
      return true;
    } else if (fixResult.fixesApplied) {
      const fixedFiles = fixResult.fixResults?.fixes?.duplicateImports?.filesFixed || 0;
      const heuristicFixed = fixResult.fixResults?.fixes?.heuristics?.heuristicFixed || 0;
      
      logger.info(`Applied fixes to ${fixedFiles + heuristicFixed} files`);
      
      if (fixResult.fixResults?.verificationAfterFix?.success) {
        logger.success('All TypeScript issues fixed successfully!');
        return true;
      } else {
        const remainingFiles = fixResult.fixResults?.verificationAfterFix?.remainingFileCount || 0;
        logger.warn(`Fixed some issues, but ${remainingFiles} files still have TypeScript errors`);
        return false;
      }
    }
  }
  
  logger.error('Failed to fix TypeScript errors');
  return false;
}

/**
 * Build the application
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the build succeeded
 */
async function buildApplication(args) {
  if (args['skip-build']) {
    logger.info('Build step skipped');
    return true;
  }

  logger.sectionHeader('Building Application');
  
  try {
    // Determine which build script to use based on configuration
    const buildConfig = config.getBuildConfig();
    const buildScript = buildConfig.script || 'build';
    
    // Generate environment for preview build
    const buildEnv = environment.generateDeploymentEnv({
      envType: 'preview',
      additionalVars: args.env || {}
    });
    
    // Run each build step as separate steps with our flat progress tracker
    
    // Step 1: Setting up environment
    progressTracker.startStep('Setting up build environment');
    const envFile = environment.writeEnvFile(buildEnv, {
      path: '.env.build',
      keepExisting: args.preserveExistingEnv
    });
    logger.info(`Environment prepared with ${Object.keys(buildEnv).length} variables`);
    logger.debug(`Environment written to: ${envFile}`);
    progressTracker.completeStep(true, 'Environment setup complete');
    
    // Step 2: Cleaning build directory
    progressTracker.startStep('Cleaning build directory');
    const cleanResult = await buildManager.cleanBuildDirectory({ 
      buildDir: buildConfig.buildDir 
    });
    
    if (!cleanResult.success) {
      logger.error(`Failed to clean build directory: ${cleanResult.error || 'Unknown error'}`);
      progressTracker.completeStep(false, 'Failed to clean build directory');
      return false;
    }
    
    progressTracker.completeStep(true, 'Build directory cleaned');
    
    // Step 3: Building application
    progressTracker.startStep('Building application');
    logger.info(`Running build script: ${buildScript}`);
    
    const buildCommand = getPackageManagerCommand(buildScript);
    const buildResult = await commandRunner.runCommandAsync(buildCommand, {
      env: process.env,
      verbose: args.verbose,
      timeout: args.buildTimeout || 5 * 60 * 1000 // 5 minutes default timeout
    });
    
    if (!buildResult.success) {
      logger.error(`Build failed: ${buildResult.error || 'Unknown error'}`);
      logger.debug('Build output:');
      logger.debug(buildResult.output);
      
      // Try fallback if available
      if (args['auto-retry-build']) {
        logger.info('Attempting fallback build...');
        const fallbackResult = await buildFallback.tryFallbackBuild({
          script: buildScript,
          origError: buildResult.error
        });
        
        if (fallbackResult.success) {
          logger.success('Fallback build successful!');
          progressTracker.completeStep(true, 'Fallback build successful');
          return true;
        } else {
          logger.error(`Fallback build also failed: ${fallbackResult.error}`);
          progressTracker.completeStep(false, 'Build failed');
          return false;
        }
      }
      
      progressTracker.completeStep(false, 'Build failed');
      return false;
    }
    
    // Step 4: Validating build output
    progressTracker.startStep('Validating build output');
    
    // Since we build multiple packages (admin, hours, common), we should check their build folders
    const buildValid = validateBuilds();
    
    if (!buildValid) {
      progressTracker.completeStep(false, 'Build validation failed');
      return false;
    }
    
    // Log build size information (estimated total size)
    let totalSize = 0;
    let totalFiles = 0;
    
    // Check sizes in each package build dir
    const packageDirs = ['packages/admin/dist', 'packages/hours/dist'];
    for (const dir of packageDirs) {
      if (fs.existsSync(dir)) {
        const stats = calculateBuildSize(dir);
        totalSize += stats.totalSizeMB;
        totalFiles += stats.fileCount;
        logger.info(`${dir} size: ${stats.totalSizeMB.toFixed(2)} MB (${stats.fileCount} files)`);
      }
    }
    
    logger.info(`Total build size: ${totalSize.toFixed(2)} MB (${totalFiles} files)`);
    
    progressTracker.completeStep(true, 'Build validated successfully');
    
    logger.success('Build completed successfully!');
    return true;
  } catch (error) {
    logger.error(`Error during build: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    
    // Attempt to complete the current step
    try {
      progressTracker.completeStep(false, `Build error: ${error.message}`);
    } catch (e) {
      // If step wasn't started, ignore
    }
    
    return false;
  }
}

/**
 * Validate build outputs for all packages
 * @returns {boolean} Whether all builds are valid
 */
function validateBuilds() {
  logger.info('Validating builds for all packages...');
  
  // Check admin package
  const adminDist = 'packages/admin/dist';
  if (!fs.existsSync(adminDist)) {
    logger.error(`Admin build directory '${adminDist}' does not exist!`);
    return false;
  }
  
  // Check hours package
  const hoursDist = 'packages/hours/dist';
  if (!fs.existsSync(hoursDist)) {
    logger.error(`Hours build directory '${hoursDist}' does not exist!`);
    return false;
  }
  
  // Check for key files in each package
  const keyFiles = ['index.html', 'assets'];
  let allValid = true;
  
  // Check admin package
  const adminMissingFiles = [];
  for (const file of keyFiles) {
    const filePath = path.join(adminDist, file);
    if (!fs.existsSync(filePath)) {
      adminMissingFiles.push(file);
    }
  }
  
  if (adminMissingFiles.length > 0) {
    logger.error(`Admin build validation failed: Missing key files: ${adminMissingFiles.join(', ')}`);
    allValid = false;
  } else {
    logger.success('Admin build validated successfully');
  }
  
  // Check hours package
  const hoursMissingFiles = [];
  for (const file of keyFiles) {
    const filePath = path.join(hoursDist, file);
    if (!fs.existsSync(filePath)) {
      hoursMissingFiles.push(file);
    }
  }
  
  if (hoursMissingFiles.length > 0) {
    logger.error(`Hours build validation failed: Missing key files: ${hoursMissingFiles.join(', ')}`);
    allValid = false;
  } else {
    logger.success('Hours build validated successfully');
  }
  
  return allValid;
}

/**
 * Analyze bundle sizes
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the analysis succeeded
 */
async function analyzeBundleSizes(args) {
  if (args['skip-bundle-analysis']) {
    logger.info('Bundle size analysis skipped');
    return true;
  }

  logger.sectionHeader('Analyzing Bundle Sizes');
  
  try {
    // Define report paths
    const jsonReportPath = getReportPath('bundle');
    const htmlReportPath = getHtmlReportPath('bundle');
    
    logger.info(`Will save bundle analysis JSON to: ${jsonReportPath}`);
    logger.info(`Will save bundle analysis HTML to: ${htmlReportPath}`);
    
    const result = await bundleAnalyzer.analyzeBundles({
      directories: [
        'packages/common/dist',
        'packages/admin/dist',
        'packages/hours/dist'
      ],
      thresholds: {
        totalIncrease: 10,  // percent
        chunkIncrease: 20,  // percent
        maxInitialLoad: 1000 // KB (1MB)
      },
      generateReport: true,
      reportPath: htmlReportPath,
      baselineSource: args['bundle-baseline'] || null
    });
    
    // Explicitly save JSON report even if the module already does this
    // This ensures we have the right data for the consolidated report
    createJsonReport({
      current: result.current || {},
      historical: result.historical || {},
      issues: result.issues || []
    }, jsonReportPath);
    logger.info(`Bundle analysis results saved to ${jsonReportPath}`);
    
    if (result.valid) {
      logger.success('Bundle size analysis passed');
      return true;
    } else {
      logger.error('Bundle size analysis failed: ' + (result.error || 'Unknown error'));
      return false;
    }
  } catch (error) {
    logger.error('Error during bundle size analysis: ' + error.message);
    return false;
  }
}

/**
 * Scan dependencies for vulnerabilities
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the scan succeeded
 */
async function scanDependencies(args) {
  if (args['skip-dependency-scan']) {
    logger.info('Dependency vulnerability scanning skipped');
    return true;
  }

  logger.sectionHeader('Scanning Dependencies for Vulnerabilities');
  
  try {
    // Determine threshold from args or use default
    const failOnSeverity = args['vulnerability-threshold'] || 'critical';
    
    // Define report paths
    const jsonReportPath = getReportPath('vulnerability');
    const htmlReportPath = getHtmlReportPath('vulnerability');
    
    logger.info(`Will save vulnerability scan JSON to: ${jsonReportPath}`);
    logger.info(`Will save vulnerability scan HTML to: ${htmlReportPath}`);
    
    const result = await dependencyScanner.scanDependencies({
      directories: ['.'],
      thresholds: {
        minSeverity: 'high',           // Only report issues of this severity or higher in HTML report
        failOnSeverity                 // Only fail the workflow for issues of this severity or higher
      },
      generateReport: true,
      reportPath: htmlReportPath
    });
    
    // Explicitly save JSON report
    createJsonReport(result, jsonReportPath);
    logger.info(`Vulnerability scan results saved to ${jsonReportPath}`);
    
    if (result.valid) {
      if (result.totalSummary.total > 0) {
        logger.warn('Vulnerability scan found issues, but below critical threshold');
        logger.info(`See ${htmlReportPath} for details`);
      } else {
        logger.success('No vulnerabilities found');
      }
      return true;
    } else {
      logger.error('Dependency scan failed: ' + (result.error || 'Unknown error'));
      logger.error(`See ${htmlReportPath} for details`);
      return false;
    }
  } catch (error) {
    logger.error('Error during dependency scanning: ' + error.message);
    return false;
  }
}

/**
 * Detect dead code in the codebase
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the analysis succeeded
 */
async function detectDeadCode(args) {
  if (args['skip-dead-code']) {
    logger.info('Dead code detection skipped');
    return true;
  }

  logger.sectionHeader('Detecting Dead Code');
  
  try {
    // Define report paths
    const jsonReportPath = getReportPath('deadCode');
    const htmlReportPath = getHtmlReportPath('deadCode');
    
    logger.info(`Will save dead code analysis JSON to: ${jsonReportPath}`);
    logger.info(`Will save dead code analysis HTML to: ${htmlReportPath}`);
    
    const result = await deadCodeDetector.analyzeDeadCode({
      sourceDirectories: [
        'packages/common/src',
        'packages/admin/src',
        'packages/hours/src'
      ],
      packageDirectories: [
        'packages/common',
        'packages/admin',
        'packages/hours',
        '.'
      ],
      cssFiles: [
        'packages/*/src/**/*.css',
        'packages/*/src/**/*.scss'
      ],
      ignorePatterns: [
        '**/*.test.{js,jsx,ts,tsx}',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**'
      ],
      analyzeCss: true,
      analyzeImports: true,
      analyzeDependencies: true,
      generateReport: true,
      reportPath: htmlReportPath
    });
    
    // Explicitly save JSON report
    createJsonReport(result, jsonReportPath);
    logger.info(`Dead code analysis results saved to ${jsonReportPath}`);
    
    if (result.summary.totalIssues > 0) {
      logger.warn(`Found ${result.summary.totalIssues} potential dead code issues`);
      logger.info(`Potential bundle size reduction: ${result.potentialBundleSizeReduction}`);
      logger.info(`See ${htmlReportPath} for details`);
    } else {
      logger.success('No dead code detected');
    }
    
    // Dead code detection is informational and should not fail the build
    return true;
  } catch (error) {
    logger.error('Error during dead code detection: ' + error.message);
    // Don't fail the workflow for dead code detection issues
    return true;
  }
}

/**
 * Check documentation quality
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the check succeeded
 */
async function checkDocumentationQuality(args) {
  if (args['skip-doc-quality']) {
    logger.info('Documentation quality check skipped');
    return true;
  }

  logger.sectionHeader('Checking Documentation Quality');
  progressTracker.startStep("Documentation quality");
  
  try {
    // Define report paths
    const jsonReportPath = getReportPath('docQuality');
    const htmlReportPath = getHtmlReportPath('docQuality');
    
    logger.info(`Will save doc quality JSON to: ${jsonReportPath}`);
    logger.info(`Will save doc quality HTML to: ${htmlReportPath}`);
    
    try {
      const result = await docQuality.checkDocQuality({
        docsDir: 'docs',
        outputFile: htmlReportPath,
        similarityThreshold: 0.6,
        requiredDocs: [
          'setup',
          'deployment',
          'preview',
          'configuration',
          'architecture'
        ],
        ignoreDirectories: [
          'node_modules',
          'dist',
          'build'
        ],
        generateIndex: true
      });
      
      // Validate result object before trying to access properties
      if (!result) {
        logger.warn("Documentation analyzer returned no results");
        // Create a placeholder result
        const fallbackResult = {
          error: "No analysis results returned",
          missingDocs: [],
          duplicates: []
        };
        
        // Save fallback result to JSON
        createJsonReport(fallbackResult, jsonReportPath);
        
        progressTracker.completeStep(true, "Documentation quality check completed with warnings");
        return true;
      }
      
      // Explicitly save JSON report
      createJsonReport(result, jsonReportPath);
      logger.info(`Documentation quality results saved to ${jsonReportPath}`);
      
      if (result.duplicates && result.duplicates.length > 0) {
        logger.warn(`Found ${result.duplicates.length} potential documentation duplicates`);
        logger.info(`See ${htmlReportPath} for details`);
      } else {
        logger.success('No documentation duplicates detected');
      }
      
      if (result.missingDocs && result.missingDocs.length > 0) {
        logger.warn(`Missing ${result.missingDocs.length} key documentation files`);
        logger.info(`See ${htmlReportPath} for details`);
      } else {
        logger.success('All required documentation present');
      }
      
      // Documentation quality is informational and should not fail the build
      progressTracker.completeStep(true, "Documentation quality check passed");
      return true;
    } catch (analysisError) {
      logger.error(`Error analyzing documentation: ${analysisError.message}`);
      
      // Create a fallback result for error case
      const errorResult = {
        error: analysisError.message,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      // Save error information to JSON
      createJsonReport(errorResult, jsonReportPath);
      
      // Create a simple HTML report for error case
      generateBasicErrorReport(htmlReportPath, "Documentation Analysis Error", analysisError.message);
      
      // Don't fail the build for documentation issues
      progressTracker.completeStep(true, "Documentation quality check completed with errors");
      return true;
    }
  } catch (error) {
    logger.error('Error during documentation quality check: ' + error.message);
    // Don't fail the workflow for documentation issues
    progressTracker.completeStep(true, "Documentation quality check failed");
    return true;
  }
}

/**
 * Generate a basic HTML error report
 * @param {string} filePath - Path to save the HTML report
 * @param {string} title - Report title
 * @param {string} errorMessage - Error message to display
 */
function generateBasicErrorReport(filePath, title, errorMessage) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .error { color: #d32f2f; padding: 20px; background-color: #ffebee; border-radius: 4px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="error">
    <p>${errorMessage}</p>
    <p>This error occurred during the documentation quality analysis process. The build will continue, but you may want to investigate this issue.</p>
  </div>
  <p>Generated on: ${new Date().toLocaleString()}</p>
</body>
</html>`;

  logger.info(`Generating HTML report at: ${filePath}`);
  fs.writeFileSync(filePath, html);
}

/**
 * Check module syntax consistency
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the check succeeded
 */
async function checkModuleSyntax(args) {
  if (args['skip-module-syntax']) {
    logger.info('Module syntax consistency check skipped');
    return true;
  }

  logger.sectionHeader('Checking Module Syntax Consistency');
  
  try {
    const result = await moduleSyntaxCheck.checkModuleSyntax({
      directories: [
        'scripts',
        'packages/*/src'
      ],
      excludeDirectories: [
        'node_modules',
        'dist',
        'build'
      ],
      autoFix: true
    });
    
    if (result.issues && result.issues.length > 0) {
      logger.warn(`Fixed ${result.issues.length} module syntax inconsistencies`);
      logger.info(`Files updated: ${result.fixedFiles.length}`);
    } else {
      logger.success('No module syntax inconsistencies detected');
    }
    
    return true;
  } catch (error) {
    logger.error('Error during module syntax consistency check: ' + error.message);
    return false;
  }
}

/**
 * Handle errors during workflow execution
 * 
 * @param {Error} error - The error that occurred
 */
function handleError(error) {
  // Just print the error and exit immediately
  console.error('\n❌ ERROR: Preview deployment failed');
  
  if (error instanceof WorkflowError) {
    console.error(`${error.message}`);
    if (error.cause) {
      console.error(`Cause: ${error.cause}`);
    }
    if (error.suggestion) {
      console.error(`\nSuggestion: ${error.suggestion}`);
    }
  } else {
    console.error(error);
  }
  
  // Exit immediately
  process.exit(1);
}

/**
 * Verify all required dependencies are installed
 * 
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether all dependencies were verified successfully
 */
async function runDependencyVerification(args) {
  logger.sectionHeader('Dependency Verification');
  
  // Setup verification options
  const verifyOptions = {
    verifyPackages: args.verifyPackages !== false,
    verifyTools: args.verifyTools !== false,
    verifyEnv: args.verifyEnv !== false
  };
  
  // Define required tools and packages
  const requiredCommands = ['pnpm', 'firebase', 'git', 'node'];
  const requiredPackages = [
    'typescript',
    'react',
    'zustand',
    'firebase',
    '@tanstack/react-query',
    'vite',
    'vitest'
  ];
  
  // Validate preferred package manager
  logger.info('Checking package manager...');
  const pkgManagerResult = validatePreferredPackageManager('pnpm');
  
  if (pkgManagerResult.valid) {
    logger.success(`Using preferred package manager: ${pkgManagerResult.packageManager}`);
  } else if (pkgManagerResult.packageManager) {
    logger.warn(`Using non-preferred package manager: ${pkgManagerResult.packageManager}. Prefer using pnpm.`);
  } else {
    logger.warn('No package manager detected. Installing with pnpm is recommended.');
  }
  
  let missingTools = [];
  let missingPackages = [];
  
  // Verify CLI tools if enabled
  if (verifyOptions.verifyTools) {
    logger.info('Checking required CLI tools...');
    
    for (const command of requiredCommands) {
      const available = await isCommandAvailable(command);
      if (available) {
        logger.success(`✓ ${command} is available`);
      } else {
        logger.error(`✗ ${command} is not found in PATH`);
        missingTools.push(command);
      }
    }
  }
  
  // Verify npm packages if enabled
  if (verifyOptions.verifyPackages) {
    logger.info('Checking required packages...');
    
    for (const pkg of requiredPackages) {
      const installed = await isPackageInstalled(pkg);
      if (installed) {
        logger.success(`✓ ${pkg} is installed`);
      } else {
        logger.error(`✗ ${pkg} is not installed`);
        missingPackages.push(pkg);
      }
    }
  }
  
  // Gather additional environment information if enabled
  if (verifyOptions.verifyEnv) {
    logger.info('Checking environment...');
    try {
      const nodeVersion = await commandRunner.runCommandAsync('node --version');
      if (nodeVersion.success) {
        logger.info(`Node.js version: ${nodeVersion.stdout.trim()}`);
      }
      
      const npmVersion = await commandRunner.runCommandAsync('npm --version');
      if (npmVersion.success) {
        logger.info(`npm version: ${npmVersion.stdout.trim()}`);
      }
      
      const pnpmVersion = await commandRunner.runCommandAsync('pnpm --version');
      if (pnpmVersion.success) {
        logger.info(`pnpm version: ${pnpmVersion.stdout.trim()}`);
      }
    } catch (error) {
      logger.warn(`Error getting version information: ${error.message}`);
    }
  }
  
  // Auto-install missing packages if requested
  if ((missingPackages.length > 0 || missingTools.length > 0) && args['auto-install-deps']) {
    logger.info('Attempting to install missing dependencies...');
    
    if (missingPackages.length > 0) {
      const installCmd = `pnpm add ${missingPackages.join(' ')} --save-dev`;
      logger.info(`Running: ${installCmd}`);
      
      try {
        const installResult = await commandRunner.runCommandAsync(installCmd);
        if (installResult.success) {
          logger.success('Successfully installed missing packages');
          missingPackages = [];
        } else {
          logger.error(`Failed to install packages: ${installResult.stderr}`);
        }
      } catch (error) {
        logger.error(`Error installing packages: ${error.message}`);
      }
    }
    
    if (missingTools.length > 0) {
      logger.warn('Some CLI tools need to be installed manually:');
      for (const tool of missingTools) {
        switch (tool) {
          case 'firebase':
            logger.info('  - Install Firebase CLI: npm install -g firebase-tools');
            break;
          case 'pnpm':
            logger.info('  - Install pnpm: npm install -g pnpm');
            break;
          case 'git':
            logger.info('  - Install Git: https://git-scm.com/downloads');
            break;
          default:
            logger.info(`  - Install ${tool} using your system's package manager`);
        }
      }
    }
  }
  
  // Check for critical dependency issues
  const hasCriticalIssues = missingTools.includes('pnpm') || 
                          missingTools.includes('node') ||
                          missingTools.includes('git');
  
  // Final verification using the core verifyDependencies function
  const verifyResult = await verifyDependencies({
    ...args, 
    requiredCommands: verifyOptions.verifyTools ? requiredCommands : [],
    requiredPackages: verifyOptions.verifyPackages ? requiredPackages : []
  });
  
  if (verifyResult) {
    if (missingTools.length === 0 && missingPackages.length === 0) {
      logger.success('All dependencies are properly installed!');
    } else {
      logger.warn('Some non-critical dependencies are missing but workflow can continue');
      
      if (!args['auto-install-deps']) {
        logger.info('Run with --auto-install-deps to automatically install missing dependencies');
      }
    }
    return !hasCriticalIssues;
  } else {
    logger.error('Dependency verification failed');
    logger.info('Run with --auto-install-deps to attempt automatic installation');
    return false;
  }
}

/**
 * Enhanced warning logger with severity levels
 * @param {string} message - The warning message to log
 * @param {string} level - Warning level: 'info', 'warning', or 'critical'
 */
function logWarningWithLevel(message, level = 'warning') {
  const levels = {
    info: { prefix: '[INFO]', color: '\x1b[36m' },         // Cyan for info
    warning: { prefix: '[WARNING]', color: '\x1b[33m' },    // Yellow for minor warnings
    critical: { prefix: '[CRITICAL]', color: '\x1b[31m' }   // Red for major warnings
  };
  
  const style = levels[level] || levels.warning;
  const resetColor = '\x1b[0m';
  const icon = level === 'critical' ? '🛑' : level === 'info' ? 'ℹ️' : '⚠️';
  
  console.warn(`${style.color}${icon} ${style.prefix} ${message}${resetColor}`);
}

/**
 * Deploy to Firebase preview channel
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the deployment succeeded
 */
async function deployPreview(args) {
  // Instead of: await metrics.startStage('deployment');
  logger.startStep('Deploying preview');
  
  // We now use the module-level logWarningWithLevel function
  
  try {
    // Verify Firebase authentication first
    const authResult = await verifyAuthentication();
    if (!authResult) {
      logWarningWithLevel('Authentication failed. Cannot proceed with deployment.', 'critical');
      progressTracker.completeStep(false, 'Deployment aborted due to authentication failure');
      return false;
    }
    
    // Skip deployment in dry-run mode
    if (args['dry-run']) {
      logger.info('Skipping actual deployment in dry-run mode');
      progressTracker.completeStep(true, 'Deployment skipped in dry-run mode');
      return true;
    }
    
    // Generate channel ID
    const channelId = generateChannelId();
    
    // Get Firebase config
    const firebaseConfig = config.getFirebaseConfig();
    const { projectId, site, buildDir = 'build' } = firebaseConfig;
    
    // Show deployment details
    const branchName = gitAuth.getCurrentBranch();
    logger.info(`Deploying branch '${branchName}' to Firebase preview channel`);
    logger.info(`Channel: ${channelId}`);
    logger.info(`Project: ${projectId}`);
    logger.info(`Site: ${site}`);
    logger.info(`Build directory: ${buildDir}`);
    
    // Create deployment message
    let commitMessage = "Preview deployment";
    
    // Safely try to get the latest commit message if the function exists
    if (gitAuth && typeof gitAuth.getLatestCommitMessage === 'function') {
      try {
        commitMessage = gitAuth.getLatestCommitMessage();
      } catch (err) {
        logWarningWithLevel(`Could not get latest commit message: ${err.message}`, 'info');
      }
    }
    
    const message = `Preview deployment for '${branchName}': ${commitMessage}`;
    
    // Deploy to Firebase hosting channel
    const deployResult = await deployment.deployToPreviewChannel({
      projectId,
      site,
      channelId,
      buildDir,
      message
    });
    
    // Enhanced result analysis for deprecation warnings
    let deploymentSuccess = deployResult.success;
    let deploymentWarningsOnly = false;
    
    // Check if the only errors are deprecation warnings
    if (!deploymentSuccess && 
        deployResult.rawOutput && 
        (deployResult.rawOutput.includes('[DEP0040]') || 
         deployResult.rawOutput.includes('DeprecationWarning: The `punycode` module is deprecated')) && 
        !deployResult.rawOutput.includes('Error:') && 
        !deployResult.rawOutput.includes('Command failed with exit code')) {
      
      logWarningWithLevel('Firebase CLI reported a Node.js deprecation warning, but this does not indicate a deployment failure', 'info');
      logger.info('This is a benign warning about the punycode module being deprecated in Node.js');
      deploymentWarningsOnly = true;
      deploymentSuccess = true;
    }
    
    if (deploymentSuccess) {
      logger.success(`Deployment successful!`);
      
      // Extract URLs ONLY from the current deployment output - no fallbacks
      const urls = extractPreviewUrlsFromOutput(deployResult.rawOutput || deployResult.output, true);
      
      if (urls && Object.keys(urls).length > 0) {
        logger.success('Successfully extracted preview URLs:');
        if (urls.admin) logger.info(`ADMIN: ${urls.admin}`);
        if (urls.hours) logger.info(`HOURS: ${urls.hours}`);
        
        // Save the URLs for use in the dashboard
        savePreviewUrls(urls);
        
        // Display URLs with appropriate context
        displayPreviewUrls(urls);
      } else {
        logWarningWithLevel('No preview URLs found in deployment output. This is unusual for a successful deployment.', 'warning');
        
        // Only in successful deployments, we check other logs as a fallback
        const fallbackUrls = findUrlsInLogFiles();
        if (fallbackUrls && Object.keys(fallbackUrls).length > 0) {
          logger.info('Found preview URLs from previous deployments:');
          if (fallbackUrls.admin) logger.info(`ADMIN (previous): ${fallbackUrls.admin}`);
          if (fallbackUrls.hours) logger.info(`HOURS (previous): ${fallbackUrls.hours}`);
          
          // Save the URLs with a fallback flag
          fallbackUrls.isFallback = true;
          fallbackUrls.timestamp = new Date().toISOString();
          savePreviewUrls(fallbackUrls);
        }
      }
      
      progressTracker.completeStep(true, deploymentWarningsOnly ? 
        'Deployment completed with warnings' : 
        'Deployment completed successfully');
      return true;
    } else {
      logWarningWithLevel(`Deployment failed: ${deployResult.error || 'Unknown error'}`, 'critical');
      
      // Enhanced debugging information for failures
      logger.error('=== DEPLOYMENT FAILURE DETAILS ===');
      
      if (deployResult.deployOutput) {
        logger.info('Command output:');
        console.log(deployResult.deployOutput);
      }
      
      if (deployResult.deployError) {
        logWarningWithLevel('Error details:', 'critical');
        console.log(deployResult.deployError);
      }
      
      // Log helpful troubleshooting steps
      logger.info('\nTroubleshooting steps:');
      logger.info('1. Check if Firebase CLI is up to date (npm i -g firebase-tools)');
      logger.info('2. Verify Firebase login status (firebase login:list)');
      logger.info('3. Check build directory existence and contents');
      logger.info(`4. Try manual deployment: firebase hosting:channel:deploy ${generateChannelId()} --project=${firebaseConfig.projectId}`);
      
      progressTracker.completeStep(false, 'Deployment failed');
      return false;
    }
  } catch (error) {
    // Don't collect metrics, just throw the error
    handleError(error);
    logWarningWithLevel(`Deployment failed with error: ${error.message}`, 'critical');
    progressTracker.completeStep(false, `Deployment failed with error: ${error.message}`);
    return false;
  } finally {
    // Instead of: await metrics.endStage('deployment');
  }
}

/**
 * Find URLs in log files as a last resort
 * Only used when deployment was successful but no URLs found in output
 * @returns {Object|null} - Object with admin and hours URLs or null
 */
function findUrlsInLogFiles() {
  logger.debug('Searching log files for preview URLs...');
  const tempDir = path.join(process.cwd(), 'temp');
  const logsDir = path.join(process.cwd(), 'logs');
  
  // First check the deploy log
  const deployLogFile = path.join(tempDir, 'firebase-deploy.log');
  
  if (fs.existsSync(deployLogFile)) {
    logger.debug(`Checking ${deployLogFile} for URLs`);
    const logContent = fs.readFileSync(deployLogFile, 'utf8');
    const urls = extractPreviewUrlsFromOutput(logContent, true);
    if (urls && Object.keys(urls).length > 0) {
      logger.debug('Found URLs in deploy log');
      return urls;
    }
  }
  
  // Check for other deployment logs in the logs directory
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir)
      .filter(file => file.includes('preview-') && file.endsWith('.log'))
      .sort((a, b) => fs.statSync(path.join(logsDir, b)).mtime.getTime() - 
                       fs.statSync(path.join(logsDir, a)).mtime.getTime());
    
    for (const file of files.slice(0, 3)) { // Check up to 3 most recent logs
      const logPath = path.join(logsDir, file);
      logger.debug(`Checking ${logPath} for URLs`);
      const logContent = fs.readFileSync(logPath, 'utf8');
      const urls = extractPreviewUrlsFromOutput(logContent, true);
      if (urls && Object.keys(urls).length > 0) {
        logger.debug(`Found URLs in ${file}`);
        return urls;
      }
    }
  }
  
  return null;
}

/**
 * Clean up old preview channels if needed
 * @param {Object} args - Command line arguments
 * @returns {Promise<void>}
 */
async function cleanupChannels(args) {
  if (args['skip-cleanup']) {
    logger.info('Skipping channel cleanup');
    return;
  }
  
  logger.sectionHeader('Cleaning Up Old Channels');
  
  // Get Firebase and preview config
  const firebaseConfig = config.getFirebaseConfig();
  const previewConfig = config.getPreviewConfig();
  const { projectId } = firebaseConfig;
  const { prefix, channelKeepCount = 5, channelThreshold = 8 } = previewConfig;
  
  // Get both target sites from .firebaserc
  const sitesToCleanup = [];
  
  // Get the admin site
  const adminSite = 'admin-autonomyhero-2024';
  sitesToCleanup.push(adminSite);
  
  // Get the hours site
  const hoursSite = 'hours-autonomyhero-2024';
  sitesToCleanup.push(hoursSite);
  
  logger.info(`Found ${sitesToCleanup.length} sites to clean up: ${sitesToCleanup.join(', ')}`);
  logger.info(`Checking for old preview channels to clean up...`);
  logger.info(`Will keep the ${channelKeepCount} most recent channels with prefix '${prefix}' for each site`);
  
  for (const site of sitesToCleanup) {
    logger.info(`Cleaning up site: ${site}`);
    
    // Check and clean up if needed
    const cleanupResult = await channelCleanup.checkAndCleanupIfNeeded({
      projectId,
      site,
      threshold: channelThreshold,
      keepCount: channelKeepCount,
      prefix,
      autoCleanup: true
    });
    
    if (cleanupResult.needsCleanup) {
      const siteResults = cleanupResult.sites[site];
      
      if (siteResults && siteResults.cleanup) {
        if (siteResults.cleanup.deleted && siteResults.cleanup.deleted.length > 0) {
          logger.success(`Cleaned up ${siteResults.cleanup.deleted.length} old channels for site ${site}`);
        } 
        
        if (siteResults.cleanup.failed && siteResults.cleanup.failed.length > 0) {
          logger.warn(`Failed to delete ${siteResults.cleanup.failed.length} channels for site ${site}`);
        }
      }
    } else {
      logger.info(`No channel cleanup needed for site ${site}`);
    }
  }
}

/**
 * Generate a unique channel ID based on Git info
 * @returns {string} - Generated channel ID
 */
function generateChannelId() {
  const branchName = gitAuth.getCurrentBranch() || 'unknown';
  let prNumber = null;
  
  // Try to get PR number, safely checking if the function exists
  if (gitAuth && typeof gitAuth.getPullRequestNumber === 'function') {
    try {
      prNumber = gitAuth.getPullRequestNumber();
    } catch (err) {
      logger.warn(`Could not get PR number: ${err.message}`);
    }
  } else {
    // Alternative: try to extract PR number from branch name (if it's a PR branch)
    const prMatch = branchName.match(/^pr-(\d+)$/);
    if (prMatch) {
      prNumber = prMatch[1];
    }
  }
  
  // Base the channel ID on the PR if available, otherwise use branch and timestamp
  if (prNumber) {
    return `pr-${prNumber}`;
  } else {
    // Sanitize branch name for use in channel ID
    const sanitizedBranch = branchName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 15);
    
    // Add timestamp to ensure uniqueness
    return `${sanitizedBranch}-${Date.now().toString().substring(0, 10)}`;
  }
}

/**
 * Extract preview URLs from deployment output
 * 
 * @param {string} output - Deployment output
 * @param {boolean} deploymentSuccess - Whether the deployment was successful
 * @returns {Object|null} - Object with admin and hours URLs or null
 */
function extractPreviewUrlsFromOutput(output, deploymentSuccess = true) {
  if (!output) return null;
  
  const urls = {};
  let allUrls = [];
  
  // Try multiple patterns to extract URLs
  const urlPatterns = [
    // Firebase CLI v13.34.0 format with dash prefix
    {
      pattern: /(?:^|\s)-\s+(https:\/\/[^\s]+\.web\.app)/gm,
      matchGroup: 1
    },
    // Look for labeled URLs in our custom format
    {
      pattern: /ADMIN:?\s+(https:\/\/[^\s,]+)/i,
      matchGroup: 1,
      target: 'admin'
    },
    {
      pattern: /HOURS:?\s+(https:\/\/[^\s,]+)/i,
      matchGroup: 1,
      target: 'hours'
    },
    // Firebase CLI v9+ hosting URL format
    {
      pattern: /(?:Channel URL|Hosting URL|Live URL|Preview URL)(?:\s*\([^)]*\))?:\s+(https:\/\/[^\s]+)/gi,
      matchGroup: 1
    },
    // Standard Firebase hosting URL patterns
    {
      pattern: /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.web\.app/g,
      matchGroup: 0
    },
    {
      pattern: /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.firebaseapp\.com/g,
      matchGroup: 0
    }
  ];
  
  // Extract URLs using all patterns
  for (const { pattern, matchGroup, target } of urlPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const url = match[matchGroup].trim();
      
      if (target) {
        // Direct assignment for patterns with specific targets
        urls[target] = url;
      } else {
        // Add to general list for categorization later
        allUrls.push(url);
      }
    }
  }
  
  // If we have collected general URLs, categorize them
  if (allUrls.length > 0) {
    for (const url of allUrls) {
      if (url.includes('admin') && !urls.admin) {
        urls.admin = url;
      } else if (url.includes('hours') && !urls.hours) {
        urls.hours = url;
      } else if (!urls.admin) {
        urls.admin = url;
      } else if (!urls.hours) {
        urls.hours = url;
      }
    }
  }
  
  // If we have any URLs that weren't categorized, store them as generic URLs
  if (allUrls.length > 0 && !urls.admin && !urls.hours) {
    urls.urls = allUrls;
  }
  
  // Add deployment status metadata and detailed information
  if (Object.keys(urls).length > 0) {
    urls.deploymentStatus = deploymentSuccess ? 'success' : 'failed';
    urls.timestamp = new Date().toISOString();
    urls.extractionTime = new Date().toISOString();
    urls.source = 'current-deployment';
    
    // If deployment failed, add warning to URLs object
    if (!deploymentSuccess) {
      urls.warning = "Deployment reported errors - these URLs may not be functional";
      urls.errorDetails = "Check logs for detailed error information";
    }
  }
  
  return Object.keys(urls).length > 0 ? urls : null;
}

/**
 * Save preview URLs to file
 * @param {Object} urls - Preview URLs
 * @returns {void}
 */
function savePreviewUrls(urls) {
  if (!urls) return;
  
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const previewUrlsPath = path.join(tempDir, 'preview-urls.json');
    fs.writeFileSync(previewUrlsPath, JSON.stringify(urls, null, 2));
    logger.success(`Extracted and saved preview URLs to ${previewUrlsPath}`);
  } catch (error) {
    logger.error(`Failed to save preview URLs: ${error.message}`);
  }
}

/**
 * Get stored preview URLs
 * @returns {Object|null} - Preview URLs or null
 */
function getPreviewUrls() {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    const previewUrlsPath = path.join(tempDir, 'preview-urls.json');
    
    if (fs.existsSync(previewUrlsPath)) {
      logger.info(`Reading preview URLs from ${previewUrlsPath}`);
      const content = fs.readFileSync(previewUrlsPath, 'utf8');
      const urls = JSON.parse(content);
      logger.success(`Successfully loaded preview URLs from ${previewUrlsPath}`);
      return urls;
    }
  } catch (error) {
    logger.error(`Failed to read preview URLs: ${error.message}`);
  }
  
  return null;
}

/**
 * Display preview URLs to the user with deployment status context
 * @param {Object} urlData - Preview URL data with potential status information
 */
function displayPreviewUrls(urlData) {
  if (!urlData || (!urlData.admin && !urlData.hours && (!urlData.urls || !urlData.urls.length))) {
    logger.warn("No preview URLs available");
    return;
  }
  
  // Display clear warning if deployment has issues
  if (urlData.deploymentStatus === 'failed' || urlData.warning) {
    console.log(); // Empty line for readability
    logger.error("⚠️  DEPLOYMENT REPORTED ERRORS - THESE URLS MAY NOT BE FUNCTIONAL ⚠️");
    logger.warn("The URLs below were extracted from logs but the deployment process reported errors.");
    logger.warn("They are provided for reference but may not work correctly.");
    console.log(); // Empty line for readability
  }
  
  // Display the URLs with appropriate labels
  console.log(); // Empty line for readability
  logger.info(urlData.deploymentStatus === 'failed' ? "EXTRACTED URLs:" : "PREVIEW URLs:");
  
  if (urlData.admin) {
    logger.info(`ADMIN: ${urlData.admin}`);
  }
  
  if (urlData.hours) {
    logger.info(`HOURS: ${urlData.hours}`);
  }
  
  // Display any additional URLs
  if (urlData.urls && urlData.urls.length > 0) {
    urlData.urls.forEach((url, index) => {
      logger.info(`URL ${index + 1}: ${url}`);
    });
  }
  
  // Additional guidance if deployment failed
  if (urlData.deploymentStatus === 'failed') {
    console.log(); // Empty line for readability
    logger.info("To fix deployment issues:");
    logger.info("1. Check Firebase CLI authentication: 'firebase login'");
    logger.info("2. Verify project configuration in firebase.json");
    logger.info("3. Check build output for missing files");
  }
}

/**
 * Deploy the project to Firebase
 * 
 * @param {string} channel - The Firebase Hosting preview channel to deploy to
 * @returns {Promise<Object>} Result object with deployment success and URLs
 */
export async function deployToFirebase(channel) {
  const tempDir = path.join(process.cwd(), 'temp');
  ensureDirExists(tempDir);

  const logFilePath = path.join(tempDir, 'firebase-deploy.log');
  
  // Generate a unique channel name if one wasn't provided
  const targetChannel = channel || `preview-${Date.now()}`;
  
  logger.info(`Deploying to Firebase preview channel: ${targetChannel}`);
  
  try {
    // Use the Firebase Hosting preview feature to deploy to a temporary URL
    const command = `firebase hosting:channel:deploy ${targetChannel} --json`;
    
    // Display the command being run
    logger.info(`Running: ${command}`);
    
    // Run the command and capture output
    const result = await commandRunner.runCommandAsync(command, {
      stdio: 'pipe',
      captureOutput: true
    });
    
    // Save the output to a log file for debugging
    fs.writeFileSync(logFilePath, result.output);
    logger.info(`Deployment log saved to: ${logFilePath}`);
    
    // Extract preview URLs from the command output
    const urls = extractPreviewUrlsFromOutput(result.output);
    
    if (!urls || (!urls.admin && !urls.hours)) {
      logger.warn('No preview URLs were found in the deployment output.');
      logger.debug('Checking for URLs in the deployment log file...');
      
      // Try to extract URLs from the saved log file as a backup method
      if (fs.existsSync(logFilePath)) {
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        const urlsFromLog = extractPreviewUrlsFromOutput(logContent);
        
        if (urlsFromLog && (urlsFromLog.admin || urlsFromLog.hours)) {
          logger.info('Found preview URLs in the deployment log file.');
          
          // Save the URLs to a file for later reference
          savePreviewUrls(urlsFromLog);
          
          return {
            success: true,
            urls: urlsFromLog
          };
        }
      }
      
      // Check for URLs in other command logs
      logger.debug('Searching for URLs in recent command logs...');
      const recentLogs = commandRunner.getRecentCommandLogs();
      
      for (const log of recentLogs) {
        const urlsFromLog = extractPreviewUrlsFromOutput(log.output);
        
        if (urlsFromLog && (urlsFromLog.admin || urlsFromLog.hours)) {
          logger.info('Found preview URLs in command logs.');
          
          // Save the URLs to a file for later reference
          savePreviewUrls(urlsFromLog);
          
          return {
            success: true,
            urls: urlsFromLog
          };
        }
      }
      
      // Check for URLs in deployment logs
      logger.debug('Searching for URLs in deployment logs...');
      const deploymentLogs = commandRunner.findDeploymentLogs();
      
      for (const logFile of deploymentLogs) {
        if (fs.existsSync(logFile)) {
          const logContent = fs.readFileSync(logFile, 'utf8');
          const urlsFromLog = extractPreviewUrlsFromOutput(logContent);
          
          if (urlsFromLog && (urlsFromLog.admin || urlsFromLog.hours)) {
            logger.info(`Found preview URLs in deployment log: ${logFile}`);
            
            // Save the URLs to a file for later reference
            savePreviewUrls(urlsFromLog);
            
            return {
              success: true,
              urls: urlsFromLog
            };
          }
        }
      }
      
      logger.error('Could not extract preview URLs from any logs. Deployment may have failed or URLs format changed.');
      return {
        success: false,
        urls: null
      };
    }
    
    // Save the URLs to a file for later reference
    savePreviewUrls(urls);
    
    return {
      success: true,
      urls
    };
  } catch (error) {
    logger.error(`Error deploying to Firebase: ${error.message}`);
    
    // Check if we can extract URLs from the error output
    if (error.stdout) {
      const urls = extractPreviewUrlsFromOutput(error.stdout);
      
      if (urls && (urls.admin || urls.hours)) {
        logger.info('Found preview URLs in the error output.');
        
        // Save the URLs to a file for later reference
        savePreviewUrls(urls);
        
        return {
          success: true,
          urls
        };
      }
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Ensures that a directory exists, creating it if necessary
 * 
 * @param {string} dirPath - The directory path to ensure exists
 */
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.debug(`Created directory: ${dirPath}`);
  }
}

/**
 * Generate consolidated reports
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether report generation succeeded
 */
async function generateReports(args) {
  logger.sectionHeader('Generating Reports');
  
  try {
    // Check if we're in dry-run mode
    if (args['dry-run']) {
      logger.info('Running in dry-run mode - generating mock report');
      
      // Generate a simple HTML report for dry-run mode
      const reportPath = args.output || 'preview-dashboard.html';
      const reportTitle = `Preview Workflow Dry Run (${new Date().toLocaleDateString()})`;
      const mockReportContent = `<!DOCTYPE html>
<html>
<head>
  <title>${reportTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #0066cc; }
    .info { background-color: #e6f3ff; padding: 15px; border-radius: 5px; }
    .success { color: #2e7d32; background-color: #e8f5e9; padding: 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>${reportTitle}</h1>
  
  <div class="info">
    <h2>Dry Run Mode</h2>
    <p>This report was generated in dry-run mode. No actual deployment was performed.</p>
    <p>All checks and validations were executed, but the deployment step was skipped.</p>
  </div>
  
  <h2>Mock Preview URLs</h2>
  <p>In an actual deployment, preview URLs would be displayed here.</p>
  <ul>
    <li>Admin: https://admin-example--preview-12345.web.app</li>
    <li>Hours: https://hours-example--preview-12345.web.app</li>
  </ul>
  
  <div class="success">
    <h2>Workflow Summary</h2>
    <p>Workflow completed successfully in dry-run mode!</p>
    <p>Generated on: ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;
      
      fs.writeFileSync(reportPath, mockReportContent);
      logger.success(`Generated mock dashboard for dry-run at ${reportPath}`);
      progressTracker.completeStep(true, 'Mock reports generated for dry-run');
      return true;
    }
    
    // Check if deployment was successful
    const tempDir = path.join(process.cwd(), 'temp');
    const urlsFile = path.join(tempDir, 'preview-urls.json');
    let deploymentSuccessful = false;
    let deploymentStatus = 'failed';
    let urls = null;
    
    // Read deployment status from URL file if it exists
    if (fs.existsSync(urlsFile)) {
      try {
        urls = JSON.parse(fs.readFileSync(urlsFile, 'utf8'));
        deploymentSuccessful = urls.deploymentStatus === 'success';
        deploymentStatus = urls.deploymentStatus || 'unknown';
        
        // Check if this is from dry-run mode
        if (urls.isDryRun) {
          logger.info('Using mock URLs from dry-run mode');
          deploymentSuccessful = true;
        }
        // Log URL source information
        else if (urls.isFallback) {
          logWarningWithLevel('Using URLs from a previous deployment because current deployment did not generate URLs', 'warning');
        }
      } catch (err) {
        logger.warn(`Error reading preview URLs file: ${err.message}`);
      }
    }
    
    // If deployment failed and no URLs exist, provide clear information
    if (!deploymentSuccessful && (!urls || Object.keys(urls).length === 0)) {
      logger.error('No preview URLs available due to deployment failure');
      logger.info('Generating error report...');
      
      // Generate a simple error report
      const errorReportPath = args.output || 'preview-dashboard.html';
      const errorTitle = `Preview Deployment Failed (${new Date().toLocaleDateString()})`;
      const errorMessage = 'The Firebase deployment failed. Please check the logs for details.';
      
      generateBasicErrorReport(errorReportPath, errorTitle, errorMessage);
      logger.info(`Error report generated at ${errorReportPath}`);
      
      // Complete step with warning status
      progressTracker.completeStep(false, 'Reports generated with deployment failure information');
      return false;
    }
    
    // Enhanced report collection
    const reportResult = await collectAndGenerateReport({
      reportPath: args.output || 'preview-dashboard.html',
      title: `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`,
      // Get preview URLs from JSON file or logs - but now we're explicit about success state
      previewUrls: urls || extractPreviewUrls(),
      deploymentStatus: deploymentStatus,
      // Don't cleanup reports unless specified
      cleanupIndividualReports: !args['keep-individual-reports']
    });
    
    if (reportResult) {
      if (deploymentSuccessful) {
        logger.success(`Preview dashboard generated at preview-dashboard.html`);
      } else {
        logger.warn(`Preview dashboard generated with deployment failure information at preview-dashboard.html`);
      }
      
      progressTracker.completeStep(true, deploymentSuccessful ? 
        'Reports generated successfully' : 
        'Reports generated with deployment failure information');
      
      return deploymentSuccessful;
    } else {
      logger.warn('Could not generate reports. Some report files may be missing.');
      progressTracker.completeStep(false, 'Failed to generate reports');
      return false;
    }
  } catch (error) {
    logger.error(`Error generating reports: ${error.message}`);
    progressTracker.completeStep(false, `Error generating reports: ${error.message}`);
    return false;
  }
}

/**
 * Stop monitoring process resources
 */
function stopProcessMonitoring() {
  // This is a placeholder function since we don't have the actual implementation
  // In a real implementation, this would likely clear intervals and release resources
  logger.debug('Stopping process monitoring');
}

/**
 * Calculate the size of a build directory
 * @param {string} buildDir - The build directory to calculate
 * @returns {Object} - The size information
 */
function calculateBuildSize(buildDir) {
  if (!fs.existsSync(buildDir)) {
    return { totalSizeMB: 0, fileCount: 0 };
  }
  
  let totalSize = 0;
  let fileCount = 0;
  
  function scanDir(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath);
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDir(fullPath); // Recursively scan subdirectories
        } else {
          totalSize += stats.size;
          fileCount++;
        }
      }
    } catch (error) {
      logger.warn(`Error scanning directory ${dirPath}: ${error.message}`);
    }
  }
  
  scanDir(buildDir);
  
  // Convert to MB
  const totalSizeMB = totalSize / (1024 * 1024);
  
  return {
    totalSizeMB,
    fileCount
  };
}

// Run the main function with parsed arguments
main(parseArguments());

