/**
 * Workflow Engine Module
 * 
 * Orchestrates the entire workflow process by coordinating multiple modules.
 * Acts as the main controller for the improved workflow system.
 */

import * as logger from '../core/logger.js';
import * as stepRunner from './step-runner.js';
import * as branchManager from './branch-manager.js';
import * as qualityChecker from './quality-checker.js';
import * as advancedChecker from './advanced-checker.js';
import * as deploymentManager from './deployment-manager.js';
import * as dashboardGenerator from './dashboard-generator.js';
import * as prManager from '../github/pr-manager.js';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Track workflow progress
const workflowState = {
  startTime: 0,
  endTime: 0,
  stepsCompleted: [],
  stepsSkipped: [],
  stepsFailed: [],
  branchName: '',
  previewUrls: null,
  prUrl: null,
  hasChanges: false,
  isNewBranch: false
};

/**
 * Format duration in milliseconds to human readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds} seconds`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

/**
 * Run the workflow with all configured steps
 * @param {Object} options - Workflow options
 * @param {Function} promptFn - Function to prompt the user
 * @param {Object} config - Configuration options
 * @returns {Promise<{success: boolean, state: Object}>} - Workflow result
 */
export async function runWorkflow(options, promptFn, config = {}) {
  // Initialize workflow state
  workflowState.startTime = Date.now();
  workflowState.branchName = '';
  
  // Display welcome message
  logger.info('');
  logger.sectionHeader('WORKFLOW AUTOMATION');
  logger.info(`Welcome to the modular workflow automation system!`);
  logger.info('');
  
  // Initialize progress tracking (unless in quick mode)
  if (!options.quick) {
    logger.info('Workflow steps:');
    stepRunner.WORKFLOW_STEPS.forEach(step => {
      logger.info(`  ${step.id}. ${step.name} - ${step.description}`);
    });
    logger.info('');
  }
  
  // STEP 1: AUTHENTICATION & BRANCH MANAGEMENT
  const authSuccess = await stepRunner.runWorkflowStep(
    1, 
    async () => {
      // Skip auth if requested
      if (options.skipAuth) {
        logger.info("Skipping authentication verification as requested.");
        return true;
      }
      
      // Verify authentication
      const authResult = await deploymentManager.verifyAuthentication(promptFn);
      if (!authResult) {
        return false;
      }
      
      // Handle branch management
      const currentBranch = branchManager.getCurrentBranch();
      workflowState.branchName = currentBranch;
      
      // If branch specified via option, use it
      if (options.branch) {
        workflowState.branchName = options.branch;
        const branchExists = branchManager.getLocalBranches().includes(workflowState.branchName);
        
        if (branchExists && currentBranch !== workflowState.branchName) {
          const switchResult = await branchManager.switchBranch(
            workflowState.branchName, 
            currentBranch, 
            promptFn
          );
          if (!switchResult) {
            return false;
          }
        } else if (!branchExists) {
          logger.info(`Creating new branch: ${workflowState.branchName}`);
          const createResult = branchManager.createFeatureBranch(workflowState.branchName);
          if (!createResult) {
            return false;
          }
          workflowState.isNewBranch = true;
        }
      } else if (!options.skipBranchQuestions) {
        // Interactive branch handling
        logger.info(`Currently on branch: ${currentBranch}`);
        
        if (currentBranch === 'main' || currentBranch === 'master') {
          // On main branch, create a new feature branch
          const createNewBranch = await promptFn(
            "Would you like to create a new feature branch? (Y/n)",
            "Y"
          );
          
          if (createNewBranch.toLowerCase() !== 'n') {
            const description = await promptFn(
              "Enter description for the new branch (will be converted to kebab-case)"
            );
            
            if (!description) {
              logger.error("Branch description is required.");
              return false;
            }
            
            workflowState.branchName = branchManager.createBranchName(description);
            const createResult = branchManager.createFeatureBranch(workflowState.branchName);
            if (!createResult) {
              return false;
            }
            workflowState.isNewBranch = true;
          }
        } else if (!branchManager.isFeatureBranch(currentBranch)) {
          // On non-feature branch, warn user
          logger.warn(`Current branch '${currentBranch}' does not follow feature branch naming conventions.`);
          const continueAnyway = await promptFn(
            "Continue on this branch anyway? (y/N)",
            "N"
          );
          
          if (continueAnyway.toLowerCase() !== 'y') {
            logger.info("Please switch to or create a feature branch before continuing.");
            return false;
          }
        }
      }
      
      return true;
    },
    workflowState,
    false,
    promptFn
  );
  
  if (!authSuccess) {
    logger.error("Branch management failed. Please resolve the issues and try again.");
    return { success: false, state: workflowState };
  }
  
  workflowState.stepsCompleted.push("Branch Management");
  
  // STEP 2: CODE CHANGES
  if (!options.skipCodeChanges) {
    const codeChangesSuccess = await stepRunner.runWorkflowStep(
      2,
      async () => {
        // Check for uncommitted changes
        workflowState.hasChanges = branchManager.hasUncommittedChanges();
        
        if (!workflowState.hasChanges) {
          logger.info("No uncommitted changes detected.");
          
          // If on a feature branch and no changes, ask if the user wants to continue
          if (branchManager.isFeatureBranch(workflowState.branchName) && !options.prOnly && !options.previewOnly) {
            const continueAnyway = await promptFn(
              "No code changes detected. Continue with workflow anyway? (y/N)",
              "N"
            );
            
            if (continueAnyway.toLowerCase() !== 'y') {
              logger.info("Make some changes before running the workflow.");
              return false;
            }
          }
          
          return true;
        }
        
        // Handle uncommitted changes
        if (!options.skipCommit) {
          const commitResult = await branchManager.commitChanges(
            workflowState.branchName,
            promptFn
          );
          
          if (!commitResult.success) {
            logger.error("Failed to commit changes.");
            return false;
          }
          
          if (commitResult.message) {
            logger.success(`Changes committed with message: "${commitResult.message}"`);
          }
        } else {
          logger.info("Skipping commit as requested. Running with uncommitted changes.");
        }
        
        return true;
      },
      workflowState,
      false,
      promptFn
    );
    
    if (!codeChangesSuccess) {
      logger.error("Code changes step failed. Please commit or stash your changes before proceeding.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Code Changes");
  } else {
    logger.info("Skipping code changes check as requested.");
    workflowState.stepsSkipped.push("Code Changes");
  }
  
  // STEP 3: QUALITY CHECKS
  if (!options.skipQualityChecks) {
    const qualitySuccess = await stepRunner.runWorkflowStep(
      3,
      async () => {
        // Show appropriate sub-step progress
        stepRunner.showSubStepProgress(
          stepRunner.SUB_STEPS.QUALITY_CHECKS,
          3,
          1
        );
        
        const qualityOptions = {
          ...options,
          promptFn,
          ignoreLintFailure: options.skipLint,
          ignoreTypeScriptFailure: options.skipTypeCheck,
          ignoreTestFailure: options.skipTests
        };
        
        const qualityResult = await qualityChecker.runAllQualityChecks(qualityOptions);
        
        if (!qualityResult.success) {
          logger.warn("Quality checks found issues that need to be fixed.");
          const continueAnyway = await promptFn(
            "Continue with workflow despite quality issues? (y/N)",
            "N"
          );
          
          return continueAnyway.toLowerCase() === 'y';
        }
        
        return true;
      },
      workflowState,
      true,
      promptFn
    );
    
    if (!qualitySuccess) {
      logger.error("Quality checks failed. Please fix quality issues before proceeding.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Quality Checks");
  } else {
    logger.info("Skipping quality checks as requested.");
    workflowState.stepsSkipped.push("Quality Checks");
  }
  
  // STEP 4: AUTO FIXES
  const shouldRunAutoFixes = options.fixTypeScript || options.fixQueryTypes || options.fixTestDeps;
  
  if (shouldRunAutoFixes) {
    const fixesSuccess = await stepRunner.runWorkflowStep(
      4,
      async () => {
        // Show appropriate sub-step progress
        stepRunner.showSubStepProgress(
          stepRunner.SUB_STEPS.AUTO_FIXES,
          4,
          1
        );
        
        const fixesResult = await qualityChecker.runAllFixes({
          ...options,
          promptFn
        });
        
        if (!fixesResult.success) {
          logger.warn("Some automatic fixes could not be applied completely.");
          const continueAnyway = await promptFn(
            "Continue with workflow despite incomplete fixes? (y/N)",
            "N"
          );
          
          return continueAnyway.toLowerCase() === 'y';
        }
        
        return true;
      },
      workflowState,
      true,
      promptFn
    );
    
    if (!fixesSuccess) {
      logger.error("Auto-fix step failed. Please manually fix issues before proceeding.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Auto Fixes");
  } else {
    workflowState.stepsSkipped.push("Auto Fixes");
  }
  
  // STEP 5: ADVANCED ANALYSIS
  if (!options.skipAdvancedChecks) {
    const advancedSuccess = await stepRunner.runWorkflowStep(
      5,
      async () => {
        // Show appropriate sub-step progress
        stepRunner.showSubStepProgress(
          stepRunner.SUB_STEPS.ADVANCED_ANALYSIS,
          5,
          1
        );
        
        const advancedResult = await advancedChecker.runAllAdvancedChecks({
          ...options,
          promptFn
        });
        
        if (!advancedResult.success) {
          logger.warn("Advanced checks found issues that should be reviewed.");
          const continueAnyway = await promptFn(
            "Continue with workflow despite advanced checks issues? (y/N)",
            "N"
          );
          
          return continueAnyway.toLowerCase() === 'y';
        }
        
        return true;
      },
      workflowState,
      true,
      promptFn
    );
    
    if (!advancedSuccess) {
      logger.error("Advanced analysis failed. Please address the issues or re-run with --skip-advanced-checks.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Advanced Analysis");
  } else {
    logger.info("Skipping advanced checks as requested.");
    workflowState.stepsSkipped.push("Advanced Analysis");
  }
  
  // STEP 6: BUILD APPLICATION
  if (!options.skipBuild && !options.prOnly) {
    const buildSuccess = await stepRunner.runWorkflowStep(
      6,
      async () => {
        logger.info("Building application for deployment...");
        
        try {
          // Run build command
          execSync('pnpm run build:all', { stdio: 'inherit' });
          
          // Verify build output exists
          const buildDirExists = existsSync(config.buildDir);
          if (!buildDirExists) {
            logger.error("Build directory not found after build. Check build configuration.");
            return false;
          }
          
          logger.success("Application built successfully!");
          return true;
        } catch (error) {
          logger.error(`Build error: ${error.message}`);
          return false;
        }
      },
      workflowState,
      false,
      promptFn
    );
    
    if (!buildSuccess) {
      logger.error("Build failed. Please fix build issues before proceeding.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Build Application");
  } else {
    logger.info("Skipping build step as requested.");
    workflowState.stepsSkipped.push("Build Application");
  }
  
  // STEP 7: DEPLOYMENT
  if (!options.skipDeploy && !options.prOnly) {
    const deploySuccess = await stepRunner.runWorkflowStep(
      7,
      async () => {
        // Show appropriate sub-step progress
        stepRunner.showSubStepProgress(
          stepRunner.SUB_STEPS.DEPLOYMENT,
          7,
          1
        );
        
        // Deploy to preview
        const deployResult = await deploymentManager.deployToPreview({
          branchName: workflowState.branchName,
          skipBuild: options.skipBuild,
          verbose: options.verbose,
          promptFn
        });
        
        if (!deployResult.success) {
          return false;
        }
        
        // Store preview URLs
        workflowState.previewUrls = deployResult.previewUrls;
        
        // Save preview URLs for dashboard
        if (workflowState.previewUrls) {
          dashboardGenerator.savePreviewUrls(workflowState.previewUrls);
        }
        
        // Handle channel cleanup if requested
        if (options.cleanupChannels) {
          await deploymentManager.cleanupPreviewChannels({
            auto: options.autoCleanup,
            verbose: options.verbose,
            promptFn
          });
        }
        
        return true;
      },
      workflowState,
      false,
      promptFn
    );
    
    if (!deploySuccess) {
      logger.error("Deployment failed. Please check deployment logs for details.");
      return { success: false, state: workflowState };
    }
    
    workflowState.stepsCompleted.push("Deployment");
  } else {
    logger.info("Skipping deployment as requested.");
    workflowState.stepsSkipped.push("Deployment");
  }
  
  // STEP 8: REPORTS
  if (!options.skipDashboard) {
    const dashboardSuccess = await stepRunner.runWorkflowStep(
      8,
      async () => {
        // Show appropriate sub-step progress
        stepRunner.showSubStepProgress(
          stepRunner.SUB_STEPS.REPORTS,
          8,
          1
        );
        
        // Generate dashboard
        const dashboardResult = await dashboardGenerator.generateDashboard({
          previewUrls: workflowState.previewUrls,
          openInBrowser: !options.skipOpen,
          verbose: options.verbose
        });
        
        return dashboardResult.success;
      },
      workflowState,
      false,
      promptFn
    );
    
    if (!dashboardSuccess) {
      logger.warn("Dashboard generation failed, but continuing with workflow.");
    } else {
      workflowState.stepsCompleted.push("Reports");
    }
  } else {
    logger.info("Skipping dashboard generation as requested.");
    workflowState.stepsSkipped.push("Reports");
  }
  
  // STEP 9: PULL REQUEST
  if (!options.previewOnly) {
    const prSuccess = await stepRunner.runWorkflowStep(
      9,
      async () => {
        logger.info("Preparing to create or update pull request...");
        
        // Check if PR module is available
        if (typeof prManager.createPullRequest !== 'function') {
          logger.error("PR creation module not available.");
          return false;
        }
        
        // Create PR
        const prResult = await prManager.createPullRequest({
          branch: workflowState.branchName,
          title: options.message || null,
          draft: options.draft || false,
          previewUrls: workflowState.previewUrls,
          verbose: options.verbose
        });
        
        if (!prResult.success) {
          logger.error(`PR creation failed: ${prResult.error}`);
          return false;
        }
        
        // Store PR URL
        workflowState.prUrl = prResult.prUrl;
        logger.success(`Pull request created/updated: ${workflowState.prUrl}`);
        return true;
      },
      workflowState,
      false,
      promptFn
    );
    
    if (prSuccess) {
      workflowState.stepsCompleted.push("Pull Request");
    } else {
      logger.warn("Pull request creation failed, but workflow will continue.");
      workflowState.stepsFailed.push("Pull Request");
    }
  } else {
    logger.info("Skipping pull request creation as requested (--preview-only).");
    workflowState.stepsSkipped.push("Pull Request");
  }
  
  // Workflow complete - display summary
  workflowState.endTime = Date.now();
  const durationMillis = workflowState.endTime - workflowState.startTime;
  
  logger.sectionHeader('WORKFLOW SUMMARY');
  logger.success(`Workflow completed in ${formatDuration(durationMillis)}`);
  
  logger.info('\nSteps completed:');
  workflowState.stepsCompleted.forEach(step => {
    logger.success(`- ${step}`);
  });
  
  if (workflowState.stepsSkipped.length > 0) {
    logger.info('\nSteps skipped:');
    workflowState.stepsSkipped.forEach(step => {
      logger.warn(`- ${step}`);
    });
  }
  
  if (workflowState.stepsFailed.length > 0) {
    logger.info('\nSteps with warnings/failures:');
    workflowState.stepsFailed.forEach(step => {
      logger.error(`- ${step}`);
    });
  }
  
  // Display useful next steps
  logger.info('\nNext steps:');
  
  if (workflowState.previewUrls) {
    if (workflowState.previewUrls.admin) {
      logger.info(`- View admin preview: ${workflowState.previewUrls.admin}`);
    }
    if (workflowState.previewUrls.hours) {
      logger.info(`- View hours preview: ${workflowState.previewUrls.hours}`);
    }
  }
  
  if (workflowState.prUrl) {
    logger.info(`- Review pull request: ${workflowState.prUrl}`);
  }
  
  logger.info(`- View dashboard: npm run dashboard:open`);
  logger.info(`- Clean up: npm run workflow:modular --cleanup-channels`);
  
  return { 
    success: true, 
    state: workflowState 
  };
}

export default {
  runWorkflow,
  formatDuration
}; 