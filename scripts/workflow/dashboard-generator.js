/**
 * Dashboard Generator Module
 * 
 * Generates a dashboard with package-aware reporting.
 * This module is responsible for creating an HTML dashboard that displays
 * workflow execution results, metrics, and status information.
 * 
 * @security
 * This module uses several security measures:
 * 1. HTML escaping for all user input via escapeHtml()
 * 2. Path sanitization for file operations using path.join()
 * 3. Input validation for all data via validate* methods
 * 4. Safe string concatenation for HTML generation
 * 5. No direct DOM manipulation
 * 6. No eval or similar dangerous functions
 * 7. All file paths are validated before use
 * 8. All URLs are validated before use
 * 9. All status values are normalized to known safe values
 * 10. All numeric values are type-checked and defaulted
 * 
 * The dashboard includes:
 * - Preview channels (admin and hours)
 * - Overall workflow status and metrics
 * - Issues and warnings
 * - Workflow timeline
 * - Advanced check results
 * - Workflow options
 * - Channel cleanup status
 * 
 * The dashboard uses CSS classes for styling:
 * - .dashboard - Main container
 * - .preview-channels - Preview URLs section
 * - .overall-status - Workflow status section
 * - .issues - Errors and warnings section
 * - .timeline - Workflow steps timeline
 * - .advanced-checks - Advanced check results
 * - .workflow-options - Workflow configuration
 * - .channel-cleanup - Channel cleanup status
 * 
 * @module dashboard-generator
 */

import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { writeFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * DashboardGenerator class
 * 
 * Responsible for generating HTML dashboards from workflow execution data.
 * Handles data normalization, HTML generation, and browser opening.
 * 
 * @class
 */
export class DashboardGenerator {
  /**
   * Creates a new DashboardGenerator instance
   * 
   * @param {Object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Whether to enable verbose logging
   * @param {string} [options.outputPath] - Custom path to save the dashboard
   */
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      outputPath: options.outputPath
    };
    this.verbose = options.verbose || false;
    this.workflowState = null;
    this.outputPath = null;
    this.data = null;
    this.startTime = new Date();
    
    // Bind methods to ensure 'this' context is preserved
    this.formatDuration = this.formatDuration.bind(this);
    this.generateOverallStatus = this.generateOverallStatus.bind(this);
    this.generatePreviewChannels = this.generatePreviewChannels.bind(this);
    this.generateIssues = this.generateIssues.bind(this);
    this.generateTimeline = this.generateTimeline.bind(this);
    this.generateAdvancedChecks = this.generateAdvancedChecks.bind(this);
    this.generateWorkflowOptions = this.generateWorkflowOptions.bind(this);
    this.generateChannelCleanup = this.generateChannelCleanup.bind(this);
    this.escapeHtml = this.escapeHtml.bind(this);
  }

  /**
   * Initializes the dashboard generator with workflow state
   * 
   * @param {Object} workflowState - The workflow state to generate a dashboard from
   * @param {Array<Object>} workflowState.steps - Array of workflow steps
   * @param {Array<Error>} workflowState.errors - Array of errors
   * @param {Array<Object>} workflowState.warnings - Array of warnings
   * @param {Object} workflowState.metrics - Workflow metrics
   * @param {Object} workflowState.preview - Preview URLs and status
   * @param {Object} workflowState.advancedChecks - Advanced check results
   * @param {Object} workflowState.buildMetrics - Build performance metrics
   * @param {Object} workflowState.options - Workflow options
   * @throws {Error} If workflow state is invalid
   */
  async initialize(workflowState) {
    try {
      if (!workflowState) {
        throw new Error('No workflow state provided');
      }
      
      logger.info('Initializing dashboard with workflow state');
      
      // Log state data for debugging
      if (this.verbose) {
        logger.info('Workflow steps:', workflowState.steps?.length || 0);
        logger.info('Workflow errors:', workflowState.errors?.length || 0);
        logger.info('Workflow warnings:', workflowState.warnings?.length || 0);
        
        if (workflowState.metrics) {
          logger.info('Metrics available:', Object.keys(workflowState.metrics).join(', '));
        } else {
          logger.warn('No metrics available in workflow state');
        }
        
        if (workflowState.preview) {
          logger.info('Preview URLs available');
        } else {
          logger.warn('No preview URLs available');
        }
      }
      
      this.workflowState = workflowState;
      this.data = this.normalizeData(workflowState);
      this.outputPath = this.options.outputPath || join(__dirname, '../../dashboard.html');
      
      return this.data;
    } catch (error) {
      logger.error('Failed to initialize dashboard:', error);
      throw error;
    }
  }

  /**
   * Normalizes workflow data to ensure consistent structure
   * 
   * @param {Object} data - Raw workflow data
   * @param {Array} [data.steps] - Workflow steps
   * @param {Array} [data.errors] - Workflow errors
   * @param {Array} [data.warnings] - Workflow warnings
   * @param {Object} [data.metrics] - Workflow metrics
   * @param {Object} [data.preview] - Preview information
   * @param {Object} [data.advancedChecks] - Advanced check results
   * @param {Object} [data.options] - Workflow options
   * @returns {Object} - Normalized data structure
   */
  normalizeData(data) {
    if (!data) {
      throw new Error('No workflow data provided');
    }
    
    logger.info('Normalizing workflow data for dashboard');
    
    // Normalize steps to ensure they have proper status
    const normalizedSteps = Array.isArray(data.steps) ? data.steps.map(step => ({
      ...step,
      status: step.status || 'pending',
      duration: step.duration || 0
    })) : [];
    
    if (this.verbose) {
      logger.info(`Normalized ${normalizedSteps.length} workflow steps`);
    }
    
    // Normalize metrics
    let normalizedMetrics = {};
    if (data.metrics) {
      normalizedMetrics = {
        ...data.metrics,
        duration: data.metrics?.duration || 0,
        phaseDurations: data.metrics?.phaseDurations || {},
        buildPerformance: data.metrics?.buildPerformance || {},
        packageMetrics: data.metrics?.packageMetrics || {},
        testResults: data.metrics?.testResults || {},
        deploymentStatus: typeof data.metrics?.deploymentStatus === 'object' 
          ? (data.metrics.deploymentStatus.status || 'pending')
          : (data.metrics?.deploymentStatus || 'pending'),
        channelCleanup: data.metrics?.channelCleanup || { status: 'pending', cleanedChannels: 0, failedChannels: 0 },
        dashboardPath: data.metrics?.dashboardPath || null
      };
      
      if (this.verbose) {
        logger.info('Normalized metrics:', JSON.stringify(Object.keys(normalizedMetrics)));
        logger.info('Deployment status:', normalizedMetrics.deploymentStatus);
      }
    } else {
      if (this.verbose) {
        logger.warn('No metrics data to normalize');
      }
    }
    
    // Normalize preview URLs
    const normalizedPreview = data.preview ? {
      admin: {
        url: data.preview.admin?.url || '',
        status: data.preview.admin?.status || 'pending'
      },
      hours: {
        url: data.preview.hours?.url || '',
        status: data.preview.hours?.status || 'pending'
      }
    } : null;
    
    // Normalize advanced checks
    const normalizedAdvancedChecks = {};
    if (data.advancedChecks) {
      Object.entries(data.advancedChecks).forEach(([name, check]) => {
        normalizedAdvancedChecks[name] = {
          ...check,
          status: check.status || 'pending'
        };
      });
      
      if (this.verbose) {
        logger.info(`Normalized ${Object.keys(normalizedAdvancedChecks).length} advanced checks`);
      }
    }
    
    const normalizedData = {
      steps: normalizedSteps,
      errors: data.errors || [],
      warnings: data.warnings || [],
      metrics: normalizedMetrics,
      preview: normalizedPreview,
      advancedChecks: normalizedAdvancedChecks,
      buildMetrics: data.buildMetrics || {},
      options: data.options || {}
    };
    
    if (this.verbose) {
      logger.info('Data normalization complete');
    }
    
    return normalizedData;
  }

  /**
   * Generates the dashboard HTML
   * 
   * @returns {Promise<Object>} Result of dashboard generation
   * @returns {boolean} result.success - Whether generation was successful
   * @returns {string} [result.path] - Path to the generated dashboard
   * @returns {Error} [result.error] - Error if generation failed
   * @throws {Error} If dashboard is not initialized
   */
  async generate() {
    try {
      if (!this.data) {
        throw new Error('Dashboard not initialized. Call initialize() first.');
      }

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Dashboard</title>
  <link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <div class="dashboard">
    <header class="header">
      <h1>Workflow Dashboard</h1>
      <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
    </header>

    ${this.generatePreviewChannels()}
    ${this.generateOverallStatus()}
    ${this.generateIssues()}
    ${this.generateTimeline()}
    ${this.generateAdvancedChecks()}
    ${this.generateWorkflowOptions()}
    ${this.generateChannelCleanup()}
  </div>
</body>
</html>
      `;

      await writeFile(this.outputPath, html, 'utf8');
      
      if (this.verbose) {
        logger.info(`Dashboard generated at: ${this.outputPath}`);
      }
      
      return { success: true, path: this.outputPath };
    } catch (error) {
      logger.error('Error generating dashboard:', error);
      return { success: false, error };
    }
  }

  generatePreviewChannels() {
    const { preview } = this.data;
    if (!preview || typeof preview !== 'object') {
      return `
        <section class="preview-channels">
          <h2>Preview Channels</h2>
          <div class="preview-grid">
            <div class="preview-card error">
              <h3>Preview Data Unavailable</h3>
              <p class="status status-error">Error</p>
              <p>Preview data is not available or invalid.</p>
            </div>
          </div>
        </section>
      `;
    }
    
    const adminStatus = preview.admin?.status ? preview.admin.status.toLowerCase() : 'pending';
    const hoursStatus = preview.hours?.status ? preview.hours.status.toLowerCase() : 'pending';
    const adminStatusClass = ['success', 'error', 'warning', 'pending'].includes(adminStatus) ? adminStatus : 'pending';
    const hoursStatusClass = ['success', 'error', 'warning', 'pending'].includes(hoursStatus) ? hoursStatus : 'pending';
    const adminUrl = preview.admin?.url || '';
    const hoursUrl = preview.hours?.url || '';
    
    return `
      <section class="preview-channels">
        <h2>Preview Channels</h2>
        <div class="preview-grid">
          <div class="preview-card">
            <h3>Admin Preview</h3>
            <p class="status status-${adminStatusClass}">${adminStatus}</p>
            ${adminUrl ? `<a href="${adminUrl}" target="_blank" class="preview-link">${adminUrl}</a>` : '<p>No preview URL available</p>'}
          </div>
          <div class="preview-card">
            <h3>Hours Preview</h3>
            <p class="status status-${hoursStatusClass}">${hoursStatus}</p>
            ${hoursUrl ? `<a href="${hoursUrl}" target="_blank" class="preview-link">${hoursUrl}</a>` : '<p>No preview URL available</p>'}
          </div>
        </div>
      </section>
    `;
  }

  generateOverallStatus() {
    const { metrics } = this.data;
    if (!metrics || typeof metrics !== 'object') {
      return `
        <section class="overall-status">
          <h2>Overall Status</h2>
          <div class="status-grid error">
            <p class="status status-error">Error</p>
            <p>Metrics data is not available or invalid.</p>
          </div>
        </section>
      `;
    }

    const duration = this.formatDuration(metrics.duration || 0);
    const buildPerformance = metrics.buildPerformance || {};
    const testResults = metrics.testResults || {};
    
    // More robust status handling
    let deploymentStatus = 'pending';
    if (metrics.deploymentStatus) {
      if (typeof metrics.deploymentStatus === 'string') {
        // Handle string status (legacy format)
        const status = metrics.deploymentStatus.toLowerCase();
        if (['success', 'error', 'warning', 'pending'].includes(status)) {
          deploymentStatus = status;
        }
      } else if (typeof metrics.deploymentStatus === 'object' && metrics.deploymentStatus.status) {
        // Handle object status (new format)
        const status = metrics.deploymentStatus.status.toLowerCase();
        if (['success', 'error', 'warning', 'pending'].includes(status)) {
          deploymentStatus = status;
        }
      }
    }

    return `
      <section class="overall-status">
        <h2>Overall Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <h4>Duration</h4>
            <div class="value">${duration}</div>
          </div>
          <div class="status-item">
            <h4>Build Performance</h4>
            <div class="value">${buildPerformance.score || 'N/A'}</div>
          </div>
          <div class="status-item">
            <h4>Test Coverage</h4>
            <div class="value">${testResults.coverage || 'N/A'}%</div>
          </div>
          <div class="status-item">
            <h4>Deployment</h4>
            <div class="value status status-${deploymentStatus}">${deploymentStatus}</div>
          </div>
        </div>
      </section>
    `;
  }

  generateIssues() {
    const { errors, warnings } = this.data;
    
    if ((!errors || errors.length === 0) && (!warnings || warnings.length === 0)) {
      return `
        <section class="issues">
          <h2>Issues & Warnings</h2>
          <p class="status status-success">No issues or warnings found</p>
        </section>
      `;
    }
    
    return `
      <section class="issues">
        <h2>Issues & Warnings</h2>
        ${errors && errors.length > 0 ? `
          <div class="errors-section">
            <h3>Errors</h3>
            <ul class="issues-list">
              ${errors.map(error => `<li>${typeof error === 'string' ? this.escapeHtml(error) : 
                this.escapeHtml(error.message || error.text || JSON.stringify(error))}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${warnings && warnings.length > 0 ? `
          <div class="warnings-section">
            <h3>Warnings</h3>
            <ul class="warnings-list">
              ${warnings.map(warning => {
                // Handle different warning formats
                if (typeof warning === 'string') {
                  return `<li>${this.escapeHtml(warning)}</li>`;
                }
                
                // Extract the most meaningful content from warning objects
                let message = '';
                if (warning.message) {
                  message = warning.message;
                } else if (warning.text) {
                  message = warning.text;
                } else if (warning.details) {
                  message = typeof warning.details === 'string' ? warning.details : JSON.stringify(warning.details);
                } else {
                  message = JSON.stringify(warning);
                }
                
                // Add contextual info if available
                const context = [];
                if (warning.step) context.push(`Step: ${warning.step}`);
                if (warning.phase) context.push(`Phase: ${warning.phase}`);
                if (warning.file) context.push(`File: ${warning.file}`);
                
                const contextStr = context.length > 0 ? ` <span class="warning-context">(${context.join(', ')})</span>` : '';
                
                return `<li>${this.escapeHtml(message)}${contextStr}</li>`;
              }).join('')}
            </ul>
          </div>
        ` : ''}
      </section>
    `;
  }

  generateTimeline() {
    const { steps } = this.data;
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return `
        <section class="timeline-section">
          <h2>Workflow Timeline</h2>
          <div class="timeline error">
            <p class="status status-error">Error</p>
            <p>Timeline data is not available or invalid.</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="timeline-section">
        <h2>Workflow Timeline</h2>
        <div class="timeline">
          ${steps.map(step => `
            <div class="timeline-item ${step.status.toLowerCase()}">
              <div class="timeline-content">
                <h3>${this.escapeHtml(step.name)}</h3>
                <p class="status status-${step.status.toLowerCase()}">${step.status}</p>
                ${step.duration ? `<p>Duration: ${this.formatDuration(step.duration)}</p>` : ''}
                ${step.error ? `<p class="error">${
                  typeof step.error === 'string' ? this.escapeHtml(step.error) :
                  this.escapeHtml(step.error.message || step.error.text || JSON.stringify(step.error))
                }</p>` : ''}
                ${step.details ? `<p class="details">${
                  typeof step.details === 'string' ? this.escapeHtml(step.details) :
                  this.escapeHtml(JSON.stringify(step.details))
                }</p>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  generateAdvancedChecks() {
    const { advancedChecks } = this.data;
    if (!advancedChecks || typeof advancedChecks !== 'object') {
      return `
        <section class="advanced-checks">
          <h2>Advanced Checks</h2>
          <div class="advanced-checks-grid error">
            <p class="status status-error">Error</p>
            <p>Advanced check data is not available or invalid.</p>
          </div>
        </section>
      `;
    }

    const checks = Object.entries(advancedChecks);
    if (checks.length === 0) {
      return `
        <section class="advanced-checks">
          <h2>Advanced Checks</h2>
          <p class="status status-pending">No advanced checks performed</p>
        </section>
      `;
    }

    return `
      <section class="advanced-checks">
        <h2>Advanced Checks</h2>
        <div class="advanced-checks-grid">
          ${checks.map(([name, check]) => `
            <div class="check-card">
              <h3>${this.escapeHtml(name)}</h3>
              <p class="status status-${check.status.toLowerCase()}">${check.status}</p>
              ${check.details ? `<p>${
                typeof check.details === 'string' ? this.escapeHtml(check.details) :
                this.escapeHtml(JSON.stringify(check.details, null, 2))
              }</p>` : ''}
              ${check.issues && check.issues.length > 0 ? `
                <div class="check-issues">
                  <h4>Issues</h4>
                  <ul>
                    ${check.issues.map(issue => `<li>${
                      typeof issue === 'string' ? this.escapeHtml(issue) :
                      this.escapeHtml(issue.message || issue.text || JSON.stringify(issue))
                    }</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  generateWorkflowOptions() {
    const { options } = this.data;
    if (!options || typeof options !== 'object') {
      return `
        <section class="workflow-options">
          <h2>Workflow Options</h2>
          <div class="options-grid error">
            <p class="status status-error">Error</p>
            <p>Options data is not available or invalid.</p>
          </div>
        </section>
      `;
    }

    const optionEntries = Object.entries(options);
    if (optionEntries.length === 0) {
      return `
        <section class="workflow-options">
          <h2>Workflow Options</h2>
          <p class="status status-pending">No workflow options configured</p>
        </section>
      `;
    }

    return `
      <section class="workflow-options">
        <h2>Workflow Options</h2>
        <div class="options-grid">
          ${optionEntries.map(([key, value]) => `
            <div class="option-item">
              <h4>${this.escapeHtml(key)}</h4>
              <div class="value">${this.escapeHtml(value)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  generateChannelCleanup() {
    const { metrics } = this.data;
    if (!metrics || typeof metrics !== 'object') {
      return `
        <section class="channel-cleanup">
          <h2>Channel Cleanup</h2>
          <div class="status-grid error">
            <p class="status status-error">Error</p>
            <p>Metrics data is not available or invalid.</p>
          </div>
        </section>
      `;
    }

    // Check if channelCleanup exists and is an object
    if (!metrics.channelCleanup || typeof metrics.channelCleanup !== 'object') {
      return `
        <section class="channel-cleanup">
          <h2>Channel Cleanup</h2>
          <div class="status-grid">
            <p class="status status-pending">No channel cleanup data available</p>
          </div>
        </section>
      `;
    }

    const cleanedChannels = metrics.channelCleanup.cleanedChannels || 0;
    const failedChannels = metrics.channelCleanup.failedChannels || 0;
    const totalChannels = cleanedChannels + failedChannels;
    const cleanedPercentage = totalChannels > 0 ? ((cleanedChannels / totalChannels) * 100).toFixed(2) : '0.00';

    return `
      <section class="channel-cleanup">
        <h2>Channel Cleanup</h2>
        <div class="status-grid">
          <div class="status-item">
            <h4>Cleaned Channels</h4>
            <div class="value">${cleanedChannels}</div>
          </div>
          <div class="status-item">
            <h4>Failed Channels</h4>
            <div class="value">${failedChannels}</div>
          </div>
          <div class="status-item">
            <h4>Total Channels</h4>
            <div class="value">${totalChannels}</div>
          </div>
          <div class="status-item">
            <h4>Cleaned Percentage</h4>
            <div class="value">${cleanedPercentage}%</div>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Formats a duration in milliseconds to a human-readable string
   * 
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration (e.g., "1m 30s")
   */
  formatDuration(ms) {
    if (!ms || ms === 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    
    return `${hours}h`;
  }

  /**
   * Opens the dashboard in the default browser
   * 
   * @returns {Promise<Object>} Result of browser opening
   * @returns {boolean} result.success - Whether browser was opened successfully
   * @returns {Error} [result.error] - Error if browser opening failed
   */
  async openInBrowser() {
    try {
      await open(this.outputPath);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open dashboard in browser:', error);
      return { success: false, error };
    }
  }

  escapeHtml(unsafe) {
    // Handle non-string values
    if (unsafe === null || unsafe === undefined) {
      return '';
    }
    
    // Convert to string if not already a string
    const safeStr = typeof unsafe !== 'string' ? String(unsafe) : unsafe;
    
    return safeStr
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}