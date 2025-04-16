/**
 * Dashboard Integration Module
 * 
 * This module integrates with the workflow system to extract state and generate dashboards.
 * It serves as the bridge between the workflow execution and the dashboard generation.
 * 
 * The module handles:
 * - Workflow state extraction and normalization
 * - Metrics collection and formatting
 * - Preview URL management
 * - Dashboard generation and browser opening
 * 
 * @module dashboard-integration
 */

import { DashboardGenerator } from './dashboard-generator.js';
import { logger } from '../core/logger.js';
import open from 'open';

/**
 * Generates a dashboard from workflow state
 * 
 * This function extracts the current state from a workflow instance and passes it
 * to the DashboardGenerator to create a visual representation of the workflow execution.
 * 
 * @param {Object} workflow - The workflow instance containing execution state
 * @param {Map<string,Object>} workflow.workflowSteps - Map of workflow steps with their status
 * @param {Array<Error>} workflow.workflowErrors - Array of errors encountered during workflow execution
 * @param {Array<Object>} workflow.workflowWarnings - Array of warnings encountered during workflow execution
 * @param {Object} workflow.metrics - Metrics collected during execution
 * @param {number} workflow.metrics.duration - Total duration of the workflow
 * @param {Object} workflow.metrics.phaseDurations - Duration of each phase
 * @param {Object} workflow.metrics.buildPerformance - Build performance metrics
 * @param {Object} workflow.metrics.packageMetrics - Package-specific metrics
 * @param {Object} workflow.metrics.testResults - Test execution results
 * @param {Object} workflow.metrics.deploymentStatus - Status of deployments
 * @param {Object} workflow.metrics.channelCleanup - Channel cleanup status
 * @param {string} workflow.metrics.dashboardPath - Path to the generated dashboard
 * @param {Object} workflow.previewUrls - URLs for preview environments
 * @param {string} workflow.previewUrls.admin - Admin preview URL
 * @param {string} workflow.previewUrls.hours - Hours preview URL
 * @param {Object} workflow.advancedCheckResults - Results from advanced checks
 * @param {Object} workflow.options - Workflow configuration options
 * @param {Object} options - Additional options for dashboard generation
 * @param {boolean} [options.isCI=false] - Whether the dashboard is being generated in a CI environment
 * @param {boolean} [options.noOpen=false] - Whether to open the dashboard in a browser
 * @param {string} [options.outputPath] - Custom path to save the dashboard
 * @returns {Promise<Object>} - Result of dashboard generation
 * @returns {boolean} result.success - Whether the dashboard was generated successfully
 * @returns {string} [result.path] - Path to the generated dashboard file
 * @returns {Error} [result.error] - Error object if generation failed
 * @throws {Error} If dashboard generation fails
 */
export async function generateWorkflowDashboard(workflow, options = {}) {
  try {
    // Add debug logs for metrics values
    logger.info(`DEBUG: Raw workflow metrics before dashboard generation:`);
    logger.info(`  - Duration: ${workflow.metrics?.duration || 'undefined'} ms`);
    logger.info(`  - Setup start: ${workflow.metrics?.setupStart ? new Date(workflow.metrics.setupStart).toISOString() : 'undefined'}`);
    logger.info(`  - Phase durations: Setup=${workflow.metrics?.phaseDurations?.setup || 0}, Validation=${workflow.metrics?.phaseDurations?.validation || 0}, Build=${workflow.metrics?.phaseDurations?.build || 0}`);
    
    if (!workflow.metrics || typeof workflow.metrics.duration !== 'number' || workflow.metrics.duration === 0) {
      logger.warn(`WARNING: workflow.metrics.duration is ${workflow.metrics?.duration}. Calculating from start/end times.`);
      
      // Try to recreate duration from more reliable sources
      if (workflow.startTime) {
        const calculatedDuration = Date.now() - workflow.startTime;
        logger.info(`  - Calculated duration from workflow.startTime: ${calculatedDuration} ms`);
        
        // If metrics exists but duration is zero, update it
        if (workflow.metrics) {
          workflow.metrics.duration = calculatedDuration;
          logger.info(`  - Updated workflow.metrics.duration to ${workflow.metrics.duration} ms`);
        }
      }
    }
    
    // Extract and normalize workflow state
    const workflowState = {
      steps: Array.isArray(workflow.workflowSteps) ? workflow.workflowSteps :
             workflow.workflowSteps instanceof Map ? Array.from(workflow.workflowSteps.values()) : [],
      errors: Array.isArray(workflow.workflowErrors) ? workflow.workflowErrors : [],
      warnings: Array.isArray(workflow.workflowWarnings) ? workflow.workflowWarnings : [],
      metrics: {
        ...workflow.metrics,
        duration: workflow.metrics?.duration || 0,
        phaseDurations: workflow.metrics?.phaseDurations || {},
        buildPerformance: workflow.metrics?.buildPerformance || {},
        packageMetrics: {},  // Initialize as empty object that we'll properly fill
        testResults: workflow.metrics?.testResults || {
          totalTests: 0,
          passedTests: 0
        },
        deploymentStatus: workflow.metrics?.deploymentStatus || null,
        channelCleanup: workflow.metrics?.channelCleanup || null,
        dashboardPath: workflow.metrics?.dashboardPath || null
      },
      preview: workflow.previewUrls ? {
        admin: {
          url: workflow.previewUrls.admin || '',
          status: (workflow.metrics?.deploymentStatus?.status || 'success')
        },
        hours: {
          url: workflow.previewUrls.hours || '',
          status: (workflow.metrics?.deploymentStatus?.status || 'success')
        }
      } : null,
      advancedChecks: workflow.advancedCheckResults || {},
      buildMetrics: workflow.metrics?.buildPerformance || {},
      options: {
        ...workflow.options,
        ...options
      }
    };
    
    // Properly extract and normalize package metrics
    if (workflow.metrics?.packageMetrics && typeof workflow.metrics.packageMetrics === 'object') {
      Object.keys(workflow.metrics.packageMetrics).forEach(pkgName => {
        const pkgMetrics = workflow.metrics.packageMetrics[pkgName];
        
        if (pkgMetrics && typeof pkgMetrics === 'object') {
          // Create normalized package metrics with consistent property names and proper fallbacks
          workflowState.metrics.packageMetrics[pkgName] = {
            success: pkgMetrics.success === true,
            duration: typeof pkgMetrics.duration === 'number' ? pkgMetrics.duration : 0,
            
            // Handle both totalSize and size property names
            totalSize: typeof pkgMetrics.totalSize === 'number' ? pkgMetrics.totalSize :
                       typeof pkgMetrics.size === 'number' ? pkgMetrics.size : 0,
                       
            // Handle sizeBytes as well
            sizeBytes: typeof pkgMetrics.sizeBytes === 'number' ? pkgMetrics.sizeBytes :
                       typeof pkgMetrics.totalSize === 'number' ? pkgMetrics.totalSize :
                       typeof pkgMetrics.size === 'number' ? pkgMetrics.size : 0,
                       
            fileCount: typeof pkgMetrics.fileCount === 'number' ? pkgMetrics.fileCount : 0,
            
            // Handle preformatted sizes
            formattedSize: pkgMetrics.formattedSize || null,
            
            // Pass through errors and warnings
            error: pkgMetrics.error || null,
            warnings: Array.isArray(pkgMetrics.warnings) ? pkgMetrics.warnings : []
          };
        }
      });
    }
    
    // Add debug logging to help diagnose issues
    logger.debug('Normalized packageMetrics for dashboard:');
    logger.debug(JSON.stringify(workflowState.metrics.packageMetrics, null, 2));
    
    // Process steps to extract proper status
    workflowState.steps = workflowState.steps.map(step => {
      // Check if step has a name that indicates success in the log
      const stepName = step.name || '';
      const stepStatus = step.status || '';
      const stepLog = step.log || '';
      const stepResult = step.result || {};
      
      // If step has explicit success in result, always use that first
      if (stepResult.success === true) {
        return { ...step, status: 'success' };
      }
      
      // If step has explicit failure in result, always use that first
      if (stepResult.success === false) {
        return { ...step, status: 'error' };
      }
      
      // If step has a checkmark in the log or contains "complete" or "success", mark as success
      if (stepName.includes('✓') || stepName.includes('complete') || 
          stepName.includes('success') || stepStatus.includes('success') ||
          stepLog.includes('✓') || stepLog.includes('complete') || 
          stepLog.includes('success') || 
          stepName.includes('Phase') || // All phases are completed
          step.duration > 0) { // Any step with a duration has completed
        return { ...step, status: 'success' };
      }
      
      // If step has an error, mark as error
      if (stepName.includes('✗') || stepName.includes('error') || 
          stepName.includes('failed') || stepStatus.includes('error') ||
          stepLog.includes('✗') || stepLog.includes('error') || 
          stepLog.includes('failed')) {
        return { ...step, status: 'error' };
      }
      
      // If step has a warning, mark as warning
      if (stepName.includes('⚠') || stepName.includes('warning') || 
          stepStatus.includes('warning') ||
          stepLog.includes('⚠') || stepLog.includes('warning')) {
        return { ...step, status: 'warning' };
      }
      
      // Default to pending if no status indicators found
      return { ...step, status: 'pending' };
    });
    
    // Filter out informational messages treated as warnings
    workflowState.warnings = workflowState.warnings.filter(warning => {
      // Keep warnings that don't have severity 'info'
      return warning.severity !== 'info';
    });
    
    // Process advanced checks to ensure they have proper status
    if (workflowState.advancedChecks) {
      Object.entries(workflowState.advancedChecks).forEach(([name, check]) => {
        // Convert to proper status based on success flag
        if (check.success === true) {
          workflowState.advancedChecks[name].status = 'success';
        } else if (check.success === false) {
          workflowState.advancedChecks[name].status = 'error';
        } else if (check.warnings && check.warnings.length > 0) {
          workflowState.advancedChecks[name].status = 'warning';
        } else if (check.issues && check.issues.length > 0) {
          workflowState.advancedChecks[name].status = 'error';
        }
      });
    }
    
    // ---> Add debug logging before passing state to generator <-----
    logger.debug('--- Data passed to DashboardGenerator ---');
    logger.debug(`Steps Count: ${workflowState.steps?.length}`);
    logger.debug(`Errors Count: ${workflowState.errors?.length}`);
    logger.debug(`Warnings Count: ${workflowState.warnings?.length}`);
    logger.debug(`Preview URLs Present: ${!!workflowState.preview}`);
    logger.debug(`Metrics Keys: ${Object.keys(workflowState.metrics || {}).join(', ')}`);
    logger.debug(`Metrics.buildPerformance: ${JSON.stringify(workflowState.metrics?.buildPerformance)}`);
    logger.debug(`Advanced Checks Keys: ${Object.keys(workflowState.advancedChecks || {}).join(', ')}`);
    // ---> End debug log <-----
    
    // Initialize dashboard generator
    const generator = new DashboardGenerator({
      verbose: workflowState.options.verbose || false,
      outputPath: options.outputPath
    });
    
    // Initialize with workflow state
    await generator.initialize(workflowState);
    
    // Generate dashboard
    const result = await generator.generate();
    
    if (!result.success) {
      throw new Error(`Failed to generate dashboard: ${result.error?.message || 'Unknown error'}`);
    }
    
    // Open in browser if not in CI and not explicitly disabled
    const isCI = options.isCI || false;
    const shouldOpen = !isCI && !options.noOpen;
    
    if (shouldOpen && result.path) {
      try {
        const openResult = await generator.openInBrowser();
        if (!openResult.success) {
          logger.warn('Failed to open dashboard in browser:', openResult.error?.message || 'Unknown error');
        }
      } catch (error) {
        logger.warn('Failed to open dashboard in browser:', error.message);
        // Don't fail the whole process if browser opening fails
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to generate dashboard:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
} 