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
        packageMetrics: workflow.metrics?.packageMetrics || {},
        testResults: workflow.metrics?.testResults || {},
        deploymentStatus: workflow.metrics?.deploymentStatus || null,
        channelCleanup: workflow.metrics?.channelCleanup || null,
        dashboardPath: workflow.metrics?.dashboardPath || null
      },
      preview: workflow.previewUrls ? {
        admin: {
          url: workflow.previewUrls.admin || '',
          status: workflow.metrics?.deploymentStatus?.admin || 'pending'
        },
        hours: {
          url: workflow.previewUrls.hours || '',
          status: workflow.metrics?.deploymentStatus?.hours || 'pending'
        }
      } : null,
      advancedChecks: workflow.advancedCheckResults || {},
      buildMetrics: workflow.metrics?.buildPerformance || {},
      options: {
        ...workflow.options,
        ...options
      }
    };
    
    // Process steps to extract proper status
    workflowState.steps = workflowState.steps.map(step => {
      // Check if step has a name that indicates success in the log
      const stepName = step.name || '';
      const stepStatus = step.status || '';
      const stepLog = step.log || '';
      
      // If step has a checkmark in the log or contains "complete" or "success", mark as success
      if (stepName.includes('✓') || stepName.includes('complete') || 
          stepName.includes('success') || stepStatus.includes('success') ||
          stepLog.includes('✓') || stepLog.includes('complete') || 
          stepLog.includes('success')) {
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
    
    // Filter out build output from warnings
    workflowState.warnings = workflowState.warnings.filter(warning => {
      const message = warning.message || '';
      return !message.includes('Build output:') && 
             !message.includes('Building package:') &&
             !message.includes('Starting build for packages:');
    });
    
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