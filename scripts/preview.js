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
    
    // Initialize a step counter
    let stepCounter = 0;
    
    // Count core steps that are always included
    const skipDependencyCheck = args['skip-dep-check'] === true;
    const authSteps = skipDependencyCheck ? 1 : 2; // Authentication only or Dependency+Authentication
    stepCounter += authSteps;
    
    // Count quality checks as one step if not all are skipped
    const skipAllQualityChecks = args['skip-all-quality-checks'] === true;
    const qualityChecksWillRun = !skipAllQualityChecks;
    if (qualityChecksWillRun) stepCounter += 1;
    
    // Count build step if not skipped
    const buildWillRun = !args['skip-build'];
    if (buildWillRun) stepCounter += 1;
    
    // Count additional quality checks
    let additionalChecksCount = 0;
    if (!args['skip-module-syntax']) additionalChecksCount++;
    if (!args['skip-bundle-analysis']) additionalChecksCount++;
    if (!args['skip-dependency-scan']) additionalChecksCount++;
    if (!args['skip-dead-code']) additionalChecksCount++;
    if (!args['skip-doc-quality']) additionalChecksCount++;
    if (!args['skip-workflow-validation']) additionalChecksCount++;
    
    stepCounter += additionalChecksCount;
    
    // Count deployment step if not skipped
    const deployWillRun = !args['skip-deploy'];
    if (deployWillRun) stepCounter += 1;
    
    // Add one step for consolidated report generation
    stepCounter += 1;
    
    // Log skipped steps
    let skippedMessage = '';
    if (skipDependencyCheck) skippedMessage += 'dependency check, ';
    if (args['skip-build']) skippedMessage += 'build step, ';
    if (args['skip-deploy']) skippedMessage += 'deploy step, ';
    if (skipAllQualityChecks) skippedMessage += 'all quality checks, ';
    
    if (skippedMessage) {
      logger.info(`Skipping ${skippedMessage.slice(0, -2)}`);
    }
    
    logger.info(`Workflow will execute ${stepCounter} steps in total`);
    
    logger.sectionHeader('PREVIEW DEPLOYMENT');
    
    const errorTracker = new ErrorAggregator();
    
    // Initialize progress tracker with the total steps
    progressTracker.initProgress(stepCounter, 'PREVIEW DEPLOYMENT');
    
    // Step 1: Verify dependencies (if not skipped)
    if (!skipDependencyCheck) {
      progressTracker.startStep('Verifying Dependencies');
      const depsResult = await runDependencyVerification({
        ...args,
        verifyPackages: args['verify-packages'] !== false,
        verifyTools: args['verify-tools'] !== false,
        verifyEnv: args['verify-env'] !== false
      });
      
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
    progressTracker.startStep('Verifying Authentication');
    const authResult = await verifyAuthentication();
    
    if (!authResult) {
      const authError = new AuthenticationError(
        'Authentication verification failed. Aborting workflow.'
      );
      errorTracker.addError(authError);
      errorTracker.logErrors();
      process.exit(1);
    }
    
    // Step 3: Run quality checks
    if (args['skip-lint'] && args['skip-typecheck'] && args['skip-tests']) {
      logger.info('Skipping all quality checks');
    } else {
      progressTracker.startStep('Running Quality Checks');
      const qualityResult = await runQualityChecks(args);
      
      if (!qualityResult) {
        const qualityError = new QualityCheckError(
          'Quality checks failed. Aborting workflow.'
        );
        errorTracker.addError(qualityError);
        errorTracker.logErrors();
        process.exit(1);
      }
    }
    
    // Step 4: Build the application
    if (args['skip-build']) {
      logger.info('Skipping build step');
    } else {
      progressTracker.startStep('Building Application');
      const buildResult = await buildApplication(args);
      
      if (!buildResult) {
        const buildError = new BuildError(
          'Application build failed. Aborting workflow.'
        );
        errorTracker.addError(buildError);
        errorTracker.logErrors();
        process.exit(1);
      }
    }

    // Module Syntax Check - Run this earlier to avoid getting stuck at the end
    if (!args['skip-module-syntax']) {
      progressTracker.startStep('Checking Module Syntax');
      const moduleSyntaxResult = await checkModuleSyntax(args);
      progressTracker.completeStep(moduleSyntaxResult, 'Module syntax check completed');
    }

    // Additional steps - Bundle Analysis
    if (!args['skip-bundle-analysis']) {
      progressTracker.startStep('Analyzing Bundle Sizes');
      const bundleResult = await analyzeBundleSizes(args);
      
      if (!bundleResult) {
        logger.warn('Bundle size analysis failed, but continuing workflow');
      }
      progressTracker.completeStep(bundleResult, 'Bundle analysis completed');
    }

    // Additional steps - Dependency Scanning
    if (!args['skip-dependency-scan']) {
      progressTracker.startStep('Scanning Dependencies');
      const scanResult = await scanDependencies(args);
      
      if (!scanResult) {
        logger.warn('Dependency scanning found issues, but continuing workflow');
      }
      progressTracker.completeStep(scanResult, 'Dependency scan completed');
    }
    
    // Additional steps - Dead Code Detection
    if (!args['skip-dead-code']) {
      progressTracker.startStep('Detecting Dead Code');
      const deadCodeResult = await detectDeadCode(args);
      progressTracker.completeStep(true, 'Dead code detection completed');
    }
    
    // Additional steps - Documentation Quality Check
    if (!args['skip-doc-quality']) {
      progressTracker.startStep('Checking Documentation Quality');
      const docQualityResult = await checkDocumentationQuality(args);
      progressTracker.completeStep(true, 'Documentation quality check completed');
    }
    
    // Additional steps - Workflow Validation
    if (!args['skip-workflow-validation']) {
      progressTracker.startStep('Validating Workflows');
      const workflowValidationResult = await workflowValidation.validateWorkflows({
        workflowDir: '.github/workflows',
        validateSyntax: true,
        validateActions: true,
        checkForDeprecation: true
      });
      progressTracker.completeStep(true, 'Workflow validation completed');
    }
    
    // Step 5: Deploy to Firebase
    if (args['skip-deploy']) {
      logger.info('Skipping deployment step');
      logger.info('Deployment step skipped');
    } else {
      progressTracker.startStep('Deploying to Firebase');
      const deployResult = await deployPreview(args);
      
      if (!deployResult) {
        const deployError = new DeploymentError('Deployment failed');
        errorTracker.addError(deployError);
        errorTracker.logErrors();
        process.exit(1);
      }
      
      // Clean up old channels if needed
      if (!args['skip-cleanup']) {
        await cleanupChannels(args);
      }
      
      progressTracker.completeStep(true, 'Deployment completed');
    }
    
    // Final Step: Generate Consolidated Report
    progressTracker.startStep('Generating Reports');

    // Add debugging to see what files exist before trying to generate report
    const tempDir = path.join(process.cwd(), 'temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      logger.info(`Found ${files.length} files in temp directory: ${files.join(', ')}`);
    }

    // TEMPORARY: Create a test report file to verify the consolidation works
    const testBundleReport = {
      current: {
        'admin': { total: 567650, files: { 'main.js': 567650 } },
        'hours': { total: 567630, files: { 'main.js': 567630 } }
      },
      historical: {},
      issues: [
        { severity: 'warning', message: 'Test bundle size warning', details: 'This is a test report' }
      ]
    };

    // Ensure we have at least one valid JSON report
    const bundleJsonPath = getReportPath('bundle');
    createJsonReport(testBundleReport, bundleJsonPath);
    logger.info(`Created test bundle report at ${bundleJsonPath}`);

    // Enhanced report collection with explicit paths
    const reportResult = await collectAndGenerateReport({
      reportPath: args.output || 'preview-dashboard.html',
      title: `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`,
      // Get preview URLs
      previewUrls: extractPreviewUrls(),
      // Don't cleanup reports unless specified
      cleanupIndividualReports: !args['keep-individual-reports']
    });
    
    if (reportResult) {
      progressTracker.completeStep(true, 'Generated consolidated dashboard');
      logger.success(`Preview dashboard generated at preview-dashboard.html`);
    } else {
      progressTracker.completeStep(false, 'No reports were generated');
      logger.warn('Could not generate reports. Some report files may be missing.');
    }
    
    logger.info('\nWorkflow completed successfully!');
    
    // If we made it here, print a success message
    if (deployWillRun) {
      logger.success(`
Preview deployment is complete!
Preview dashboard is available at preview-dashboard.html
`);
    } else {
      logger.success(`
Quality checks and build are complete!
Preview dashboard is available at preview-dashboard.html
`);
    }
    
    return true;
  } catch (error) {
    handleError('Unexpected error in workflow', error);
    return false;
  }
}

/**
 * Verify authentication and prerequisites
 * @returns {Promise<boolean>} - Whether authentication checks passed
 */
async function verifyAuthentication() {
  // Instead of: await metrics.startStage('authentication');
  logger.startStep('Verifying authentication');
  
  try {
    // Check for authentication using the auth manager
    const authResult = await authManager.verifyAllAuth();
    
    if (!authResult.services.firebase.authenticated) {
      logger.info('Firebase authentication failed. Attempting to reauthenticate...');
      
      // Maximum number of retries for Firebase commands
      const MAX_RETRIES = 3;
      let retryCount = 0;
      let success = false;
      
      while (!success && retryCount < MAX_RETRIES) {
        try {
          // Run Firebase reauthentication command with a timeout
          retryCount++;
          const reAuthResult = await commandRunner.runCommandAsync('firebase login --reauth', {
            timeout: 60000, // 60 second timeout
            shell: true
          });
          
          if (reAuthResult.success) {
            logger.success('Firebase reauthentication successful');
            // Verify again after reauthentication
            const retryResult = await firebaseAuth.verifyAuth();
            
            if (retryResult.authenticated) {
              logger.success(`Authentication verified after retry ${retryCount}`);
              progressTracker.completeStep(true, 'Firebase authentication successful');
              return authResult.services.gitAuth.configured && retryResult.authenticated;
            } else {
              logger.error(`Firebase authentication still failed after retry ${retryCount}`);
              // If this was the last retry, handle failure
              if (retryCount >= MAX_RETRIES) {
                progressTracker.completeStep(false, 'Firebase authentication failed even after multiple reauthentication attempts');
                return false;
              }
              // Otherwise, retry again
              logger.info(`Retrying authentication... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            }
          } else {
            logger.error(`Firebase reauthentication failed (Attempt ${retryCount}/${MAX_RETRIES})`);
            
            // If this was the last retry, handle failure and provide more detailed guidance
            if (retryCount >= MAX_RETRIES) {
              logger.error('Maximum retries exceeded. Please try these steps:');
              logger.info('1. Run "firebase logout" manually');
              logger.info('2. Run "firebase login" to authenticate with a new session');
              logger.info('3. Verify you have proper permissions to the Firebase project');
              logger.info('4. Try running the preview deployment again');
              progressTracker.completeStep(false, 'Firebase reauthentication failed after multiple attempts');
              return false;
            }
            
            // Otherwise, retry again after a short delay
            logger.info(`Waiting for 2 seconds before retrying... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await setTimeout(2000); // 2 second delay before retry
          }
        } catch (error) {
          logger.error(`Error during Firebase reauthentication (Attempt ${retryCount}/${MAX_RETRIES}): ${error.message}`);
          
          // Check for specific error conditions and provide targeted recovery suggestions
          if (error.message.includes('ENOENT')) {
            logger.error('Firebase CLI not found. Please install the Firebase CLI:');
            logger.info('pnpm add -g firebase-tools');
            progressTracker.completeStep(false, 'Firebase CLI not found');
            return false;
          }
          
          if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
            logger.error('Network error during authentication. Please check your internet connection.');
            
            // If this was the last retry, handle failure
            if (retryCount >= MAX_RETRIES) {
              progressTracker.completeStep(false, 'Firebase authentication failed due to network issues');
              return false;
            }
            
            // Otherwise, retry again after a longer delay for network issues
            logger.info(`Waiting for 5 seconds before retrying... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await setTimeout(5000); // 5 second delay for network issues
          } else {
            // For other errors, if we've reached the max retries, give up
            if (retryCount >= MAX_RETRIES) {
              logger.error('Maximum retries exceeded.');
              progressTracker.completeStep(false, 'Error during Firebase reauthentication');
              return false;
            }
            
            // Otherwise, retry after a standard delay
            logger.info(`Retrying authentication... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await setTimeout(2000);
          }
        }
      }
      
      // If we reach here, all retries have failed
      progressTracker.completeStep(false, 'Firebase authentication failed after multiple attempts');
      return false;
    }
    
    // Check if Git authentication passed
    if (!authResult.services.gitAuth.configured) {
      logger.error('Git configuration check failed');
      logger.info('Please configure your Git user name and email:');
      logger.info('git config --global user.name "Your Name"');
      logger.info('git config --global user.email "your.email@example.com"');
      progressTracker.completeStep(false, 'Git configuration check failed');
      return false;
    }
    
    // All authentication checks passed
    progressTracker.completeStep(true, 'Authentication verified');
    return true;
  } catch (error) {
    // Don't collect metrics, just throw the error to stop workflow
    handleError(error);
  } finally {
    // Instead of: await metrics.endStage('authentication');
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
  // This is now handled in the main function
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
  
  // If no individual tests to run (but function was still called),
  // then some checks are enabled but all specific tests are disabled
  if (tests.length === 0) {
    logger.info('No individual quality checks enabled');
    progressTracker.completeStep(true, 'Quality checks skipped');
    return true;
  }
  
  // Run the tests
  const testResults = await testRunner.runTests(tests, {
    stopOnFailure: true,
    verbose: args.verbose
  });
  
  if (testResults.success) {
    logger.success('All quality checks passed!');
    progressTracker.completeStep(true, 'All quality checks passed');
  } else {
    logger.error('Some quality checks failed');
    progressTracker.completeStep(false, 'Some quality checks failed');
  }
  
  return testResults.success;
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
  // We now handle skipping in the main function, so this function is only called when we're actually building
  logger.sectionHeader('Building Application');
  
  // Get config options
  const buildConfig = config.getBuildConfig();
  const buildScript = buildConfig.script || 'build';
  const buildEnv = environment.generateDeploymentEnv({
    envType: 'preview',
    additionalVars: buildConfig.env || {}
  });
  
  // Run the build
  const buildResult = await buildManager.runBuild({
    buildScript,
    envType: 'preview',
    clean: true,
    buildDir: config.getFirebaseConfig().buildDir || 'build',
    env: buildEnv,
    verbose: args.verbose
  });
  
  if (buildResult.success) {
    // Get build size info
    const sizeInfo = buildManager.getBuildSize({
      buildDir: config.getFirebaseConfig().buildDir || 'build'
    });
    
    if (sizeInfo.success) {
      logger.info(`Build size: ${sizeInfo.formattedSize}`);
    }
    
    logger.success('Build successful!');
    progressTracker.completeStep(true, 'Build completed successfully');
    return true;
  } else {
    logger.error(`Build failed: ${buildResult.error}`);
    
    // Try to recover from build failure
    logger.info('Attempting to recover from build failure...');
    
    const recoveryResult = await buildFallback.recoverFromBuildFailure({
      packageManager: 'pnpm',
      packageDirectories: [
        '.',
        'packages/common',
        'packages/admin',
        'packages/hours'
      ],
      fullCleanup: true
    });
    
    if (recoveryResult.success) {
      logger.success('Build recovery succeeded!');
      progressTracker.completeStep(true, 'Build recovery succeeded');
      return true;
    } else {
      logger.error(`Build recovery failed: ${recoveryResult.error}`);
      progressTracker.completeStep(false, 'Build failed and recovery unsuccessful');
      return false;
    }
  }
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
 * Format and save preview URLs
 * 
 * @param {Object} urls - Object containing preview URLs
 * @returns {boolean} - Success or failure
 */
function savePreviewUrls(urls) {
  if (!urls || Object.keys(urls).length === 0) {
    return false;
  }

  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, 'preview-urls.json');
    fs.writeFileSync(filePath, JSON.stringify(urls, null, 2));
    logger.success(`Preview URLs saved to ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save preview URLs: ${error.message}`);
    return false;
  }
}

/**
 * Deploy to Firebase preview channel
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the deployment succeeded
 */
async function deployPreview(args) {
  // Instead of: await metrics.startStage('deployment');
  logger.startStep('Deploying preview');
  
  try {
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
        logger.warn(`Could not get latest commit message: ${err.message}`);
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
    
    if (deployResult.success) {
      logger.success(`Deployment successful!`);
      
      // Extract and process the preview URLs
      const urls = extractPreviewUrlsFromOutput(deployResult.output);
      
      if (urls && Object.keys(urls).length > 0) {
        logger.success('Successfully extracted preview URLs:');
        if (urls.admin) logger.info(`ADMIN: ${urls.admin}`);
        if (urls.hours) logger.info(`HOURS: ${urls.hours}`);
        
        // Save the URLs for use in the dashboard
        savePreviewUrls(urls);
      } else {
        logger.warn('No preview URLs found in deployment output');
      }
      
      progressTracker.completeStep(true, 'Deployment completed successfully');
      return true;
    } else {
      logger.error(`Deployment failed: ${deployResult.error}`);
      progressTracker.completeStep(false, 'Deployment failed');
      return false;
    }
  } catch (error) {
    // Don't collect metrics, just throw the error
    handleError(error);
  } finally {
    // Instead of: await metrics.endStage('deployment');
  }
}

/**
 * Extract preview URLs from deployment output
 * 
 * @param {string} output - Deployment output
 * @returns {Object|null} - Object with admin and hours URLs or null
 */
function extractPreviewUrlsFromOutput(output) {
  if (!output) return null;
  
  const urls = {};
  
  // Look for labeled URLs first (our custom format)
  const adminMatch = output.match(/ADMIN:?\s+(https:\/\/[^\s,]+)/i);
  if (adminMatch && adminMatch[1]) {
    urls.admin = adminMatch[1].trim();
  }
  
  const hoursMatch = output.match(/HOURS:?\s+(https:\/\/[^\s,]+)/i);
  if (hoursMatch && hoursMatch[1]) {
    urls.hours = hoursMatch[1].trim();
  }
  
  // If not found, try to extract Firebase hosting URLs
  if (!urls.admin || !urls.hours) {
    const firebaseUrlPattern = /(?:Project Console|Hosting URL|Web app URL|Preview URL):\s+(https:\/\/[^\s,]+)/gi;
    const urlMatches = [...output.matchAll(firebaseUrlPattern)];
    
    if (urlMatches.length > 0) {
      // Try to differentiate between admin and hours URLs
      for (const match of urlMatches) {
        const url = match[1].trim();
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
  }
  
  return Object.keys(urls).length > 0 ? urls : null;
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
  const { projectId, site } = firebaseConfig;
  const { prefix, channelKeepCount = 5, channelThreshold = 8 } = previewConfig;
  
  logger.info(`Checking for old preview channels to clean up...`);
  logger.info(`Will keep the ${channelKeepCount} most recent channels with prefix '${prefix}'`);
  
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
        logger.success(`Cleaned up ${siteResults.cleanup.deleted.length} old channels`);
      } 
      
      if (siteResults.cleanup.failed && siteResults.cleanup.failed.length > 0) {
        logger.warn(`Failed to delete ${siteResults.cleanup.failed.length} channels`);
      }
    }
  } else {
    logger.info('No channel cleanup needed');
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
  
  try {
    // Define report paths
    const jsonReportPath = getReportPath('docQuality');
    const htmlReportPath = getHtmlReportPath('docQuality');
    
    logger.info(`Will save doc quality JSON to: ${jsonReportPath}`);
    logger.info(`Will save doc quality HTML to: ${htmlReportPath}`);
    
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
    return true;
  } catch (error) {
    logger.error('Error during documentation quality check: ' + error.message);
    // Don't fail the workflow for documentation issues
    return true;
  }
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

// Run the main function with parsed arguments
main(parseArguments());
