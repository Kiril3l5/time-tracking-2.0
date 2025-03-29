/**
 * Dashboard Generator Module
 * 
 * Handles the dashboard generation step of the workflow, integrating
 * with the consolidated-report.js module for final reporting.
 */

import * as logger from '../core/logger.js';
import * as consolidatedReport from './consolidated-report.js';

/**
 * Generate the dashboard with all workflow results
 * 
 * @param {Object} options - Dashboard generation options
 * @param {Object} options.previewUrls - Preview URLs to include in the dashboard
 * @param {boolean} options.openInBrowser - Whether to open the dashboard in the browser
 * @param {boolean} options.verbose - Whether to show verbose output
 * @returns {Promise<{success: boolean, dashboardPath: string}>} - Result
 */
export async function generateDashboard(options = {}) {
  logger.info("Generating preview dashboard...");
  
  try {
    // Call the consolidated report generator
    const result = await consolidatedReport.generateConsolidatedReport({
      previewUrls: options.previewUrls,
      openInBrowser: options.openInBrowser
    });
    
    if (result.success) {
      logger.success("Dashboard generated successfully!");
      return {
        success: true,
        dashboardPath: result.dashboardPath
      };
    } else {
      logger.error(`Failed to generate dashboard: ${result.error}`);
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    logger.error(`Dashboard generation error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean up dashboard and report files
 * 
 * @returns {Promise<{success: boolean}>} - Result
 */
export async function cleanupDashboard() {
  logger.info("Cleaning up dashboard and report files...");
  
  try {
    const result = await consolidatedReport.cleanupReports();
    
    if (result.success) {
      logger.success("Dashboard and reports cleaned up successfully!");
      return { success: true };
    } else {
      logger.error(`Failed to clean up dashboard: ${result.error}`);
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    logger.error(`Dashboard cleanup error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save preview URLs to be used later in dashboard generation
 * 
 * @param {Object} urls - Preview URLs to save
 * @returns {boolean} - Success flag
 */
export function savePreviewUrls(urls) {
  try {
    consolidatedReport.savePreviewUrls(urls);
    return true;
  } catch (error) {
    logger.error(`Error saving preview URLs: ${error.message}`);
    return false;
  }
}

/**
 * Load saved preview URLs
 * 
 * @returns {Object} - Saved preview URLs
 */
export function loadPreviewUrls() {
  try {
    return consolidatedReport.loadPreviewUrls();
  } catch (error) {
    logger.error(`Error loading preview URLs: ${error.message}`);
    return {};
  }
}

export default {
  generateDashboard,
  cleanupDashboard,
  savePreviewUrls,
  loadPreviewUrls
}; 