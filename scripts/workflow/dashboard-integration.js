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
import process from 'process';

/**
 * Generates a dashboard from workflow state
 * 
 * This function extracts the current state from a workflow instance and passes it
 * to the DashboardGenerator to create a visual representation of the workflow execution.
 * 
 * @param {Object} workflowData - The workflow instance containing execution state
 * @param {Map<string,Object>} workflowData.workflowSteps - Map of workflow steps with their status
 * @param {Array<Error>} workflowData.workflowErrors - Array of errors encountered during workflow execution
 * @param {Array<Object>} workflowData.workflowWarnings - Array of warnings encountered during workflow execution
 * @param {Object} workflowData.metrics - Metrics collected during execution
 * @param {number} workflowData.metrics.duration - Total duration of the workflow
 * @param {Object} workflowData.metrics.phaseDurations - Duration of each phase
 * @param {Object} workflowData.metrics.buildPerformance - Build performance metrics
 * @param {Object} workflowData.metrics.packageMetrics - Package-specific metrics
 * @param {Object} workflowData.metrics.testResults - Test execution results
 * @param {Object} workflowData.metrics.deploymentStatus - Status of deployments
 * @param {Object} workflowData.metrics.channelCleanup - Channel cleanup status
 * @param {string} workflowData.metrics.dashboardPath - Path to the generated dashboard
 * @param {Object} workflowData.previewUrls - URLs for preview environments
 * @param {string} workflowData.previewUrls.admin - Admin preview URL
 * @param {string} workflowData.previewUrls.hours - Hours preview URL
 * @param {Object} workflowData.advancedCheckResults - Results from advanced checks
 * @param {Object} workflowData.options - Workflow configuration options
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
export async function generateWorkflowDashboard(workflowData, options = {}) {
  try {
    // ---> LOGGING OF RAW INPUT ('workflowData' argument) <-----
    logger.debug('--- Raw Data Received by generateWorkflowDashboard ---');
    // Check properties directly on the received workflowData object
    if (workflowData && Array.isArray(workflowData.steps)) {
        logger.debug(`Received Steps Array (${workflowData.steps.length}):`);
        workflowData.steps.forEach((step, index) => {
            logger.debug(`  - Step [${index}]: name=${step?.name}, success=${step?.success}, error=${step?.error}`);
        });
    } else {
        logger.warn('Received workflowData.steps is not an Array or is missing.');
    }
    if (workflowData && Array.isArray(workflowData.warnings)) {
        logger.debug(`Received Warnings Array (${workflowData.warnings.length}):`);
        workflowData.warnings.forEach((warning, index) => {
             logger.debug(`  - Warning [${index}]: msg="${warning?.message?.substring(0,100)}...", severity=${warning?.severity}, phase=${warning?.phase}, step=${warning?.step}`);
        });
    } else {
        logger.warn('Received workflowData.warnings is not an Array or is missing.');
    }
     if (workflowData && Array.isArray(workflowData.errors)) {
        logger.debug(`Received Errors Array (${workflowData.errors.length})`);
    } else {
        logger.warn('Received workflowData.errors is not an Array or is missing.');
    }
     if (workflowData && workflowData.metrics) {
        logger.debug(`Received Metrics Keys: ${Object.keys(workflowData.metrics).join(', ')}`);
    } else {
        logger.warn('Received workflowData.metrics is missing.');
    }
    logger.debug('----------------------------------------------------');
    // ---> END LOGGING <-----

    // Construct the object holding the actual workflow results
    const dataForGenerator = {
      steps: Array.isArray(workflowData.steps) ? workflowData.steps : [], 
      errors: Array.isArray(workflowData.errors) ? workflowData.errors : [],
      warnings: Array.isArray(workflowData.warnings) ? workflowData.warnings : [],
      metrics: workflowData.metrics || { phaseDurations: {}, packageMetrics: {}, testResults: {}, buildPerformance: {} },
      preview: workflowData.previewUrls ? { 
        admin: {
          url: workflowData.previewUrls.admin || '',
          status: workflowData.errors?.some(e => e.phase === 'Deploy') ? 'error' : 'success' 
        },
        hours: {
          url: workflowData.previewUrls.hours || '',
          status: workflowData.errors?.some(e => e.phase === 'Deploy') ? 'error' : 'success'
        }
      } : { admin: { url: '', status: 'pending'}, hours: { url: '', status: 'pending'} }, 
      advancedChecks: workflowData.advancedCheckResults || {},
      options: {
        ...(workflowData.options || {}),
      },
      status: workflowData.status || (workflowData.errors?.length > 0 ? 'failed' : 'success'),
      startTime: workflowData.startTime,
      endTime: workflowData.endTime,
      channelId: workflowData.channelId
    };

    // *** FIX: Explicitly copy previousPreviewData if it exists ***
    if (workflowData.previousPreviewData) {
      dataForGenerator.previousPreviewData = workflowData.previousPreviewData;
      logger.debug('Copied previousPreviewData to dataForGenerator.');
    } else {
      logger.debug('previousPreviewData not found in workflowData, not copying.');
    }

    // ---> ADD LOGGING BEFORE PASSING TO GENERATOR <-----
    logger.debug('--- Data Prepared FOR DashboardGenerator ---');
    logger.debug(`Steps Count: ${dataForGenerator.steps?.length}`);
    logger.debug(`Errors Count: ${dataForGenerator.errors?.length}`);
    logger.debug(`Warnings Count: ${dataForGenerator.warnings?.length}`);
    logger.debug(`Preview Status Admin: ${dataForGenerator.preview?.admin?.status}`);
    logger.debug(`Preview Status Hours: ${dataForGenerator.preview?.hours?.status}`);
    logger.debug(`Advanced Checks Keys: ${Object.keys(dataForGenerator.advancedChecks || {}).join(', ')}`);
    logger.debug('-------------------------------------------');
    // ---> END LOGGING <-----

    // *** FIX: Instantiate generator correctly and CALL initialize() ***
    
    // 1. Instantiate the generator, passing only relevant generator options
    const generatorOptions = {
        verbose: options.verbose || workflowData.options?.verbose || false,
        outputPath: options.outputPath || null
    };
    const generator = new DashboardGenerator(generatorOptions); 

    // 2. Initialize the generator with the prepared workflow data object
    // This calls normalizeData internally and sets generator.data
    await generator.initialize(dataForGenerator); 

    // DEBUG: Log the generator data state AFTER initialization
    try {
      logger.debug('[DEBUG] Generator data state AFTER initialize:', JSON.stringify(generator.data, null, 2));
    } catch (e) {
      logger.error('[DEBUG] Failed to stringify generator.data after initialize:', e.message);
      logger.debug('[DEBUG] Raw generator.data:', generator.data); // Log raw object if stringify fails
    }
    // END DEBUG

    // 3. Now generate HTML *and save the file* using the initialized generator
    //    The generate() method handles saving internally.
    await generator.generate(); 

    // --- FIX: Get the path from the generator's instance property --- 
    const reportPath = generator.outputPath; 

    // Check if reportPath is a valid string before proceeding
    if (typeof reportPath !== 'string' || !reportPath) {
        throw new Error('Failed to get a valid report path from the generator.');
    }

    // --- REMOVE getGenerationTime for now --- 
    logger.success(`✓ Dashboard generated successfully at ${reportPath}`);

    // Open the report if not in CI and not explicitly skipped
    if (!options.isCI && !options.noOpen) {
      try {
        // Normalize path for file URL
        const normalizedPath = reportPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedPath}`; // Ensure three slashes for file URLs
        logger.debug(`Attempting to open report URL: ${fileUrl}`);
        await open(fileUrl);
        logger.info('Dashboard opened in browser successfully');
      } catch (openError) {
        logger.warn(`Could not automatically open dashboard: ${openError.message}`);
        logger.warn(`Please open manually: ${reportPath}`);
      }
    }

    return { success: true, reportPath };
  } catch (error) {
    logger.error(`Failed to initialize or generate dashboard: ${error.stack || error.message}`);
    return { success: false, error };
  }
} 