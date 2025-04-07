/**
 * Dashboard Generator Module
 * 
 * Generates a dashboard with package-aware reporting.
 * This module is responsible for creating an HTML dashboard that displays
 * workflow execution results, metrics, and status information.
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
    this.workflowState = workflowState;
    this.data = this.normalizeData(workflowState);
    this.outputPath = this.options.outputPath || join(__dirname, '../../dashboard.html');
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
    
    // Normalize steps to ensure they have proper status
    const normalizedSteps = data.steps.map(step => ({
      ...step,
      status: step.status || 'pending',
      duration: step.duration || 0
    }));
    
    // Normalize metrics
    const normalizedMetrics = {
      ...data.metrics,
      duration: data.metrics?.duration || 0,
      phaseDurations: data.metrics?.phaseDurations || {},
      buildPerformance: data.metrics?.buildPerformance || {},
      packageMetrics: data.metrics?.packageMetrics || {},
      testResults: data.metrics?.testResults || {},
      deploymentStatus: data.metrics?.deploymentStatus || null,
      channelCleanup: data.metrics?.channelCleanup || null,
      dashboardPath: data.metrics?.dashboardPath || null
    };
    
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
    }
    
    return {
      steps: normalizedSteps,
      errors: data.errors || [],
      warnings: data.warnings || [],
      metrics: normalizedMetrics,
      preview: normalizedPreview,
      advancedChecks: normalizedAdvancedChecks,
      buildMetrics: data.buildMetrics || {},
      options: data.options || {}
    };
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
            <link rel="stylesheet" href="./dashboard.css">
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
    if (!preview || typeof preview !== 'object') return '';
    
    // Extract preview data with proper validation
    const adminStatus = preview.admin?.status ? preview.admin.status.toLowerCase() : 'pending';
    const hoursStatus = preview.hours?.status ? preview.hours.status.toLowerCase() : 'pending';
    const adminStatusClass = ['success', 'error', 'warning', 'pending'].includes(adminStatus) ? adminStatus : 'pending';
    const hoursStatusClass = ['success', 'error', 'warning', 'pending'].includes(hoursStatus) ? hoursStatus : 'pending';
    const adminUrl = preview.admin?.url || '';
    const hoursUrl = preview.hours?.url || '';
    
    // If we have URLs, the deployment was successful
    const finalAdminStatus = adminUrl ? 'success' : adminStatus;
    const finalHoursStatus = hoursUrl ? 'success' : hoursStatus;
    
    return `
      <section class="preview-channels">
        <h2>Preview Channels</h2>
        <div class="preview-grid">
          <div class="preview-card">
            <h3>Admin Preview</h3>
            <p class="status status-${finalAdminStatus}">${finalAdminStatus}</p>
            ${adminUrl ? `<a href="${this.escapeHtml(adminUrl)}" target="_blank" class="preview-link">${this.escapeHtml(adminUrl)}</a>` : ''}
          </div>
          <div class="preview-card">
            <h3>Hours Preview</h3>
            <p class="status status-${finalHoursStatus}">${finalHoursStatus}</p>
            ${hoursUrl ? `<a href="${this.escapeHtml(hoursUrl)}" target="_blank" class="preview-link">${this.escapeHtml(hoursUrl)}</a>` : ''}
          </div>
        </div>
      </section>
    `;
  }

  generateOverallStatus() {
    const { metrics, errors, warnings } = this.data;
    if (!metrics || typeof metrics !== 'object') return '';
    
    // Calculate total issues with proper validation
    const errorCount = Array.isArray(errors) ? errors.length : 0;
    const warningCount = Array.isArray(warnings) ? warnings.length : 0;
    const totalIssues = errorCount + warningCount;
    
    // Format duration with proper validation
    const duration = typeof metrics.duration === 'number' ? this.formatDuration(metrics.duration) : '0s';

    return `
      <section class="overall-status">
        <h2>Overall Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <h4>Total Duration</h4>
            <p class="value">${duration}</p>
          </div>
          <div class="status-item">
            <h4>Total Issues</h4>
            <p class="value">${totalIssues}</p>
          </div>
          <div class="status-item">
            <h4>Errors</h4>
            <p class="value">${errorCount}</p>
          </div>
          <div class="status-item">
            <h4>Warnings</h4>
            <p class="value">${warningCount}</p>
          </div>
        </div>
      </section>
    `;
  }

  generateIssues() {
    const { errors, warnings, metrics } = this.data;
    if ((!errors || !errors.length) && (!warnings || !warnings.length)) return '';
    
    // Filter out build output from warnings
    const actualWarnings = warnings.filter(warning => {
      const message = typeof warning === 'string' ? warning : warning.message || '';
      return !message.includes('Build output:') && 
             !message.includes('Building package:') &&
             !message.includes('Starting build for packages:');
    });
    
    // Calculate total duration from metrics
    const totalDuration = metrics?.duration || 0;
    
    return `
      <section class="issues">
        <h2>Issues</h2>
        ${errors && errors.length > 0 ? `
          <div class="errors">
            <h3>Errors</h3>
            <ul>
              ${errors.map(error => {
                const message = error instanceof Error ? error.message : 
                              typeof error === 'string' ? error : 
                              error.message || 'Unknown error';
                const suggestion = error.suggestion ? 
                  `<p class="suggestion">Suggestion: ${this.escapeHtml(error.suggestion)}</p>` : '';
                return `
                  <li>
                    <p class="error">${this.escapeHtml(message)}</p>
                    ${suggestion}
                  </li>
                `;
              }).join('\n')}
            </ul>
          </div>
        ` : ''}
        
        ${actualWarnings && actualWarnings.length > 0 ? `
          <div class="warnings">
            <h3>Warnings</h3>
            <ul>
              ${actualWarnings.map(warning => {
                const message = typeof warning === 'string' ? warning : 
                              warning.message || 'Unknown warning';
                const suggestion = warning.suggestion ? 
                  `<p class="suggestion">Suggestion: ${this.escapeHtml(warning.suggestion)}</p>` : '';
                return `
                  <li>
                    <p class="warning">${this.escapeHtml(message)}</p>
                    ${suggestion}
                  </li>
                `;
              }).join('\n')}
            </ul>
          </div>
        ` : ''}
      </section>
    `;
  }

  generateTimeline() {
    const { steps } = this.data;
    if (!steps || !Array.isArray(steps) || steps.length === 0) return '';
    
    return `
      <section class="timeline">
        <h2>Workflow Timeline</h2>
        <div class="timeline-container">
          ${steps.map(step => {
            // Extract status from step result
            let status = 'pending';
            if (step.result) {
              if (step.result.success === true) status = 'success';
              else if (step.result.success === false) status = 'error';
              else if (step.result.warning) status = 'warning';
            }
            
            // Format duration
            const duration = step.duration ? this.formatDuration(step.duration) : '0s';
            
            // Get error message if any
            const error = step.result?.error ? 
              `<p class="error">${this.escapeHtml(step.result.error)}</p>` : '';
            
            return `
              <div class="timeline-item">
                <div class="timeline-dot status-${status}"></div>
                <div class="timeline-content">
                  <h3>${this.escapeHtml(step.name)}</h3>
                  <p class="status status-${status}">${status}</p>
                  <p class="duration">Duration: ${duration}</p>
                  ${error}
                </div>
              </div>
            `;
          }).join('\n')}
        </div>
      </section>
    `;
  }

  generateAdvancedChecks() {
    const { advancedChecks } = this.data;
    if (!advancedChecks || Object.keys(advancedChecks).length === 0) return '';
    
    return `
      <section class="advanced-checks">
        <h2>Advanced Checks</h2>
        <div class="checks-grid">
          ${Object.entries(advancedChecks).map(([name, check]) => {
            // Ensure check is a valid object
            if (!check || typeof check !== 'object') {
              return `
                <div class="check-card">
                  <h3>${name}</h3>
                  <p class="status status-error">Invalid check data</p>
                </div>
              `;
            }
            
            // Extract check details with proper validation
            const status = check.status ? check.status.toLowerCase() : 'pending';
            const statusClass = ['success', 'error', 'warning', 'pending'].includes(status) ? status : 'pending';
            const details = check.details || '';
            const suggestion = check.suggestion || '';
            
            return `
              <div class="check-card">
                <h3>${name}</h3>
                <p class="status status-${statusClass}">${status}</p>
                ${details ? `<p class="details">${details}</p>` : ''}
                ${suggestion ? `<p class="suggestion">Suggestion: ${suggestion}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  generateWorkflowOptions() {
    const { options } = this.data;
    if (!options || typeof options !== 'object' || Object.keys(options).length === 0) return '';

    return `
      <section class="workflow-options">
        <h2>Workflow Options</h2>
        <ul class="options-list">
          ${Object.entries(options).map(([key, value]) => {
            // Format value based on type
            let formattedValue;
            if (value === null || value === undefined) {
              formattedValue = 'Not set';
            } else if (typeof value === 'boolean') {
              formattedValue = value ? 'Yes' : 'No';
            } else if (typeof value === 'object') {
              try {
                formattedValue = JSON.stringify(value);
              } catch (e) {
                formattedValue = '[Object]';
              }
            } else {
              formattedValue = String(value);
            }
            
            return `
              <li>
                <strong>${key}:</strong> ${formattedValue}
              </li>
            `;
          }).join('')}
        </ul>
      </section>
    `;
  }

  generateChannelCleanup() {
    const { metrics } = this.data;
    const cleanup = metrics?.channelCleanup;
    if (!cleanup || typeof cleanup !== 'object') return '';
    
    // Extract cleanup data with proper validation
    const status = cleanup.status ? cleanup.status.toLowerCase() : 'pending';
    const statusClass = ['success', 'error', 'warning', 'pending'].includes(status) ? status : 'pending';
    const cleanedChannels = typeof cleanup.cleanedChannels === 'number' ? cleanup.cleanedChannels : 0;
    const failedChannels = typeof cleanup.failedChannels === 'number' ? cleanup.failedChannels : 0;
    const error = cleanup.error ? this.escapeHtml(cleanup.error) : '';
    
    return `
      <section class="channel-cleanup">
        <h2>Channel Cleanup</h2>
        <div class="cleanup-status">
          <p class="status status-${statusClass}">${status}</p>
          <div class="cleanup-details">
            <p>Cleaned channels: ${cleanedChannels}</p>
            <p>Failed channels: ${failedChannels}</p>
            ${error ? `<p class="error">${error}</p>` : ''}
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
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
} 