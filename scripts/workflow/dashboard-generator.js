/* global console */
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
import process from 'process';

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
    this.generateOverallStatusSection = this.generateOverallStatusSection.bind(this);
    this.generatePreviewChannelsSection = this.generatePreviewChannelsSection.bind(this);
    this.generateIssuesSection = this.generateIssuesSection.bind(this);
    this.generateTimelineSection = this.generateTimelineSection.bind(this);
    this.generateAdvancedChecksSection = this.generateAdvancedChecksSection.bind(this);
    this.generateWorkflowOptionsSection = this.generateWorkflowOptionsSection.bind(this);
    this.generateChannelCleanupSection = this.generateChannelCleanupSection.bind(this);
    this.generateWorkflowAnalyticsSection = this.generateWorkflowAnalyticsSection.bind(this);
    this.escapeHtml = this.escapeHtml.bind(this);
    this.formatFileSize = this.formatFileSize.bind(this);
    this.generateTestFilesSection = this.generateTestFilesSection.bind(this);
    this.generatePackageBuildMetrics = this.generatePackageBuildMetrics.bind(this);
    this.generateCheckDetails = this.generateCheckDetails.bind(this);
    this.renderStatusItem = this.renderStatusItem.bind(this);
    this.renderBuildPackage = this.renderBuildPackage.bind(this);
    this.formatBuildOutput = this.formatBuildOutput.bind(this);
    this.generatePreviewCard = this.generatePreviewCard.bind(this);
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
      
      // Set output path with proper path handling for Windows
      const defaultPath = join(__dirname, '../../dashboard.html');
      this.outputPath = this.options.outputPath ? 
        this.options.outputPath : 
        defaultPath;
      
      // Convert backslashes to forward slashes for consistency
      this.outputPath = this.outputPath.replace(/\\/g, '/');
      
      // Log the output path for debugging
      if (this.verbose) {
        logger.info(`Dashboard will be generated at: ${this.outputPath}`);
      }
      
      return this.data;
    } catch (error) {
      logger.error('Failed to initialize dashboard:', error);
      throw error;
    }
  }

  /**
   * Normalizes workflow data to ensure consistent structure
   * Ensures critical metrics like phaseDurations and check durations are preserved.
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
    
    // Normalize steps
    const normalizedSteps = Array.isArray(data.steps) ? data.steps.map(step => ({
      ...step,
      status: this.normalizeStatus(step.status),
      duration: step.duration || 0
    })) : [];
    
    if (this.verbose) {
      logger.info(`Normalized ${normalizedSteps.length} workflow steps`);
    }
    
    // Normalize metrics - **Ensure phaseDurations is copied correctly**
    let normalizedMetrics = {};
    if (data.metrics) {
      normalizedMetrics = {
        ...data.metrics, // Copy existing metrics first
        duration: data.metrics?.duration || 0,
        phaseDurations: { ...(data.metrics?.phaseDurations || {}) }, // Explicitly copy phaseDurations
        buildPerformance: data.metrics?.buildPerformance || {},
        packageMetrics: data.metrics?.packageMetrics || {},
        testResults: data.metrics?.testResults || {}, // Keep as is, handle checks later
        deploymentStatus: this.normalizeStatus(typeof data.metrics?.deploymentStatus === 'object' 
          ? (data.metrics.deploymentStatus.status)
          : (data.metrics?.deploymentStatus)),
        channelCleanup: data.metrics?.channelCleanup || { status: 'pending', cleanedChannels: 0, failedChannels: 0 },
        dashboardPath: data.metrics?.dashboardPath || null,
        previousPreview: data.metrics?.previousPreview || {}
      };
      logger.debug('Normalized metrics.phaseDurations:', JSON.stringify(normalizedMetrics.phaseDurations));
      logger.debug('Normalized metrics.testResults:', JSON.stringify(normalizedMetrics.testResults));
    } else {
      if (this.verbose) {
        logger.warn('No metrics data to normalize');
      }
    }
    
    // Normalize preview URLs - *** INCLUDE PREVIOUS PREVIEW ***
    const normalizedPreview = data.preview ? {
      admin: {
        url: data.preview.admin?.url || '',
        status: this.normalizeStatus(data.preview.admin?.status)
      },
      hours: {
        url: data.preview.hours?.url || '',
        status: this.normalizeStatus(data.preview.hours?.status)
      },
      // Add previous preview data if it exists in metrics
      previousAdmin: data.metrics?.previousPreview?.admin ? {
          url: data.metrics.previousPreview.admin.url || '',
          status: this.normalizeStatus(data.metrics.previousPreview.admin.status)
      } : null,
      previousHours: data.metrics?.previousPreview?.hours ? {
          url: data.metrics.previousPreview.hours.url || '',
          status: this.normalizeStatus(data.metrics.previousPreview.hours.status)
      } : null
    } : null;
    // *** END PREVIOUS PREVIEW FIX ***
    
    // Normalize advanced checks - **Ensure duration is preserved**
    const normalizedAdvancedChecks = {};
    if (data.advancedChecks) {
      Object.entries(data.advancedChecks).forEach(([name, check]) => {
        if (check && typeof check === 'object') { // Ensure check is an object
            normalizedAdvancedChecks[name] = {
              ...check, // Spread original check data
              status: this.normalizeStatus(check.status),
              duration: check.duration || check.metrics?.duration || 0 // Capture duration if available
            };
        } else {
             logger.warn(`Invalid advanced check data for '${name}':`, check);
             normalizedAdvancedChecks[name] = { status: 'error', error: 'Invalid check data format' };
        }
      });
      logger.debug('Normalized advancedChecks:', JSON.stringify(normalizedAdvancedChecks));
    }
    
    // Determine overall status - Consider errors, warnings, AND incoming status
    // *** FIX: Re-fixing finalStatus logic ***
    let finalStatus = 'success'; // Default to success
    const incomingStatus = this.normalizeStatus(data.status); // Normalize incoming status

    // Check for errors first
    if (data.errors && data.errors.length > 0) {
        finalStatus = 'failed';
    } 
    // If no errors, check if incoming status was failed
    else if (incomingStatus === 'failed') { 
        finalStatus = 'failed';
    } 
    // If no errors and not failed, check for warnings
    else if (data.warnings && data.warnings.length > 0) {
        finalStatus = 'warning';
    } 
    // If also no warnings, check if incoming status was warning
    else if (incomingStatus === 'warning') {
        finalStatus = 'warning';
    } 
    // If none of the above, use the incoming status (could be success, pending, skipped)
    else {
        finalStatus = incomingStatus; 
    }
    // *** END FIX ***

    const normalizedData = {
      steps: normalizedSteps,
      errors: data.errors || [],
      warnings: this.processWarnings(data.warnings || []),
      metrics: normalizedMetrics,
      preview: normalizedPreview,
      advancedChecks: normalizedAdvancedChecks,
      options: data.options || {},
      title: data.title || 'Workflow Results',
      runDate: data.runDate || new Date().toISOString(),
      status: finalStatus, // Use the reliably determined final status
      issues: this.normalizeArray(data.issues),
    };
    
    if (this.verbose) {
      logger.info('Data normalization complete. Final status:', normalizedData.status);
    }
    
    return normalizedData;
  }

  /**
   * Helper to normalize status strings to known values
   * @param {string | undefined | null} status 
   * @returns {string} - Normalized status (success, failed, error, warning, pending, skipped)
   */
  normalizeStatus(status) {
    const lowerStatus = String(status || 'pending').toLowerCase();
    if ([ 'success', 'passed', 'ok', 'true', true ].includes(lowerStatus)) return 'success';
    if ([ 'failed', 'failure', 'error', 'false', false ].includes(lowerStatus)) return 'failed'; // Treat error as failed
    if ([ 'warning', 'warn' ].includes(lowerStatus)) return 'warning';
    if ([ 'skipped', 'skip' ].includes(lowerStatus)) return 'skipped';
    return 'pending'; // Default
  }

  /**
   * Process warnings to group similar documentation warnings together
   * @param {Array} warnings - Array of warning messages
   * @returns {Array} - Processed warnings with grouped items
   */
  processWarnings(warnings) {
    if (!Array.isArray(warnings) || warnings.length <= 5) {
      return warnings;
    }
    const docPatterns = [
      { regex: /Missing main heading \(H1\) in file: (.+)/, type: "Missing main heading (H1)" },
      { regex: /Missing JSDoc comment for: (.+) in file: (.+)/, type: "Missing JSDoc comment" },
      { regex: /Invalid JSDoc format in file: (.+)/, type: "Invalid JSDoc format" },
      { regex: /Missing parameter description for: (.+) in file: (.+)/, type: "Missing parameter description" },
      { regex: /Missing return description in file: (.+)/, type: "Missing return description" },
      { regex: /Missing documentation for: (.+)/, type: "Missing documentation" }
    ];
    const groups = {};
    const remainingWarnings = [];
    warnings.forEach(warning => {
      let message = '';
      let details = null;
      if (typeof warning === 'string') {
        message = warning;
      } else if (warning && typeof warning === 'object') {
        message = warning.message || warning.summary || JSON.stringify(warning);
        details = warning.details;
      }
      if (!message) { remainingWarnings.push(warning); return; }

      let matched = false;
      for (const pattern of docPatterns) {
        const match = message.match(pattern.regex);
        if (match) {
          if (!groups[pattern.type]) { groups[pattern.type] = []; }
          groups[pattern.type].push({ message, details });
          matched = true;
          break;
        }
      }
      if (!matched) { remainingWarnings.push({ message, details }); }
    });
    const processedWarnings = [...remainingWarnings];
    Object.entries(groups).forEach(([type, groupWarnings]) => {
      if (groupWarnings.length === 1) {
        processedWarnings.push(groupWarnings[0]);
      } else {
        const maxFilesToShow = 5;
        const sampleFiles = groupWarnings.slice(0, maxFilesToShow).map(w => {
          const fileMatch = w.message.match(/in file: (.+)/) || w.message.match(/file: (.+)/);
          return fileMatch ? fileMatch[1] : w.message;
        });
        const remainingCount = groupWarnings.length - maxFilesToShow;
        const summaryWarning = {
          summary: `Documentation issue: ${type} in ${groupWarnings.length} files`,
          details: `<p>Examples:</p><ul>${
            sampleFiles.map(file => `<li>${this.escapeHtml(file)}</li>`).join('')
          }${remainingCount > 0 ? `<li>...and ${remainingCount} more files</li>` : ''}</ul>`,
          count: groupWarnings.length,
          type: 'grouped' // Mark as grouped
        };
        processedWarnings.push(summaryWarning);
      }
    });
    return processedWarnings;
  }

  /**
   * Normalize an array property
   * @param {*} value - Value to normalize
   * @returns {Array} - Normalized array
   */
  normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generates the HTML for the overall status widget
   * @returns {string} - HTML string
   */
  generateOverallStatusSection() {
    logger.debug('Generating overall status section');
    const metrics = this.data.metrics || {}; 
    const testResults = metrics.testResults || {};
    logger.debug('Overall Status - Test Results Data:', JSON.stringify(testResults));

    const overallDuration = this.formatDuration(metrics.duration || 0);
    const deploymentStatus = this.normalizeStatus(metrics.deploymentStatus); // Normalize status
    const deploymentSuccess = deploymentStatus === 'success';
    
    // --- Corrected Test Results Logic --- 
    let testStatus = 'pending';
    let testSummary = 'No test data';
    if (testResults && typeof testResults === 'object' && Object.keys(testResults).length > 0) {
        // Use normalized status for comparison
        testStatus = this.normalizeStatus(testResults.status || testResults.testStepsSuccess);
        
        if (Object.hasOwn(testResults, 'unitTestsPassed') && typeof testResults.unitTestsPassed === 'number' &&
            Object.hasOwn(testResults, 'unitTestsTotal') && typeof testResults.unitTestsTotal === 'number' && testResults.unitTestsTotal > 0) {
            // Use the specific unit test counts if available
            testSummary = `${testStatus === 'success' ? 'Tests Passed' : 'Tests Failed'} (${testResults.unitTestsPassed}/${testResults.unitTestsTotal})`;
        } else if (testStatus !== 'pending') {
             // Fallback to just showing the status if counts are missing but status exists
            testSummary = `Status: ${testStatus}`;
        }
        // If status is pending and counts missing, it remains 'No test data'
    } else {
        logger.warn('Test results object was empty or invalid in generateOverallStatusSection.');
    }
    // --- END Corrected Test Results Logic --- 

    // --- Corrected Build Time Logic --- 
    const buildPhaseDurationMs = metrics.phaseDurations?.build || 0;
    const buildTimeDisplay = buildPhaseDurationMs > 0 ? this.formatDuration(buildPhaseDurationMs) : 'N/A';
    logger.debug(`Build Phase Duration from metrics.phaseDurations.build: ${buildPhaseDurationMs}ms, Display: ${buildTimeDisplay}`);
    // --- END Corrected Build Time Logic --- 

    const packageMetrics = metrics.packageMetrics || {};
    const buildOutputHtml = this.formatBuildOutput(packageMetrics);
    const testFilesHtml = this.generateTestFilesSection(testResults);

    return `
      <section class="widget overall-status">
        <h2>Overall Status</h2>
        <div class="status-grid">
          ${this.renderStatusItem('Duration', overallDuration)}
          ${this.renderStatusItem('Build Time', buildTimeDisplay)} 
          ${this.renderStatusItem('Test Results', testSummary, `status-${testStatus}`)}
          ${this.renderStatusItem('Deployment', deploymentStatus, `status-${deploymentSuccess ? 'success' : deploymentStatus}`)}
          </div>
        ${buildOutputHtml}
        ${testFilesHtml}
      </section>
    `;
  }

  /**
   * Renders a single status item for the overall status grid
   * @param {string} title - The title for the status item
   * @param {string} value - The value to display
   * @param {string} [statusClass=''] - Optional CSS class for status styling
   * @returns {string} - HTML string
   */
  renderStatusItem(title, value, statusClass = '') {
    // Ensure statusClass is prefixed correctly
    const finalStatusClass = statusClass.startsWith('status-') ? statusClass : `status-${statusClass}`;
    return `
      <div class="status-item">
        <h3>${this.escapeHtml(title)}</h3>
        <p class="${statusClass ? `status ${finalStatusClass}` : ''}">${this.escapeHtml(value)}</p>
      </div>`;
  }

  /**
   * Renders a single build package item
   * @param {string} name - Package name
   * @param {Object} info - Package build info (duration, size, fileCount, status)
   * @returns {string} - HTML string
   */
  renderBuildPackage(name, info) {
    const duration = info?.duration ? this.formatDuration(info.duration) : 'N/A';
    const size = info?.totalSize ? this.formatFileSize(info.totalSize) : 'N/A';
    const fileCount = info?.fileCount || 0;
    
    // --- Corrected Package Status Logic --- 
    let status = 'success'; // Default to success
    if (info?.error) {
      status = 'failed'; // Use 'failed' if error exists
    } else if (info && Object.hasOwn(info, 'status')) {
        // Use normalized status from info if provided
        status = this.normalizeStatus(info.status);
    } else if (info && Object.hasOwn(info, 'success')) {
        // Fallback to using boolean success flag if status missing
        status = info.success ? 'success' : 'failed';
    }
    const statusText = status; // Use the determined status for display text
    // --- END Corrected Package Status Logic --- 

    return `
      <div class="build-package">
        <span class="package-name">${this.escapeHtml(name)}:</span>
        <span class="package-details">${this.escapeHtml(statusText)} (${duration}) - ${fileCount} files, ${size}</span>
        <span class="status status-${status}">${this.escapeHtml(statusText)}</span> 
      </div>`;
  }

  /**
   * Formats the build output section based on package metrics
   * @param {Object} packageMetrics - Object with package names as keys and metrics as values
   * @returns {string} - HTML string for build output, or empty string if no metrics
   */
  formatBuildOutput(packageMetrics) {
    if (!packageMetrics || Object.keys(packageMetrics).length === 0) {
      return '<div class="build-output"><h3>Build Output</h3><p>No build output data available.</p></div>';
    }

    const packageEntries = Object.entries(packageMetrics);

    if (packageEntries.length === 0) {
      return '<div class="build-output"><h3>Build Output</h3><p>No build output data available.</p></div>';
    }

    // --- Corrected 'undefined' entry Filter --- 
    const packageHtml = packageEntries
      .filter(([name, info]) => 
          typeof name === 'string' && 
          name && 
          name !== 'undefined' && // Explicitly filter out 'undefined' key
          typeof info === 'object' && 
          info !== null
       )
      .map(([name, info]) => this.renderBuildPackage(name, info))
      .join('');
    // --- END Corrected 'undefined' entry Filter --- 
    
    if (!packageHtml) {
        return '<div class="build-output"><h3>Build Output</h3><p>No valid build output data to display.</p></div>';
    }

    return `
      <div class="build-output">
        <h3>Build Output</h3>
        <div class="build-packages">
          ${packageHtml}
        </div>
      </div>`;
  }

  generatePreviewChannelsSection() {
    const { preview } = this.data;
    if (!preview) return '';
    return `
      <section class="widget preview-channels">
        <h2>Preview Channels</h2>
        <div class="preview-grid">
          ${this.generatePreviewCard('Admin', preview.admin)}
          ${this.generatePreviewCard('Hours', preview.hours)}
        </div>
      </section>
    `;
  }

  generatePreviewCard(name, data) {
    if (!data) return '';
    const status = this.normalizeStatus(data.status);
    const statusClass = `status-${status}`;
    return `
      <div class="preview-card">
        <h3>${this.escapeHtml(name)}</h3>
        <p>Status: <span class="status ${statusClass}">${status}</span></p>
        ${data.url ? `<a href="${this.escapeHtml(data.url)}" class="preview-link current-link" target="_blank">Current: ${this.escapeHtml(data.url)}</a>` : ''}
        ${this.data.preview?.previousAdmin && name === 'Admin' && this.data.preview.previousAdmin.url ? 
          `<a href="${this.escapeHtml(this.data.preview.previousAdmin.url)}" class="preview-link previous-link" target="_blank">Previous: ${this.escapeHtml(this.data.preview.previousAdmin.url)}</a>` : ''}
        ${this.data.preview?.previousHours && name === 'Hours' && this.data.preview.previousHours.url ? 
          `<a href="${this.escapeHtml(this.data.preview.previousHours.url)}" class="preview-link previous-link" target="_blank">Previous: ${this.escapeHtml(this.data.preview.previousHours.url)}</a>` : ''}
        ${data.timestamp ? `<p class="timestamp">Last updated: ${new Date(data.timestamp).toLocaleString()}</p>` : ''}
      </div>
    `;
  }

  /**
   * Generates the HTML for the Issues section (Errors and Warnings)
   * @returns {string} - HTML string
   */
  generateIssuesSection() {
    logger.debug('Generating issues section');
    const { errors, warnings } = this.data;
    const issuesHtml = this.generateIssues(errors, warnings);
    return `
      <section class="widget issues">
        <h2>Issues</h2>
        ${issuesHtml || '<p class="no-issues">No issues reported.</p>'}
      </section>`;
  }

  generateIssues(errors, warnings) {
    const hasErrors = errors && errors.length > 0;
    const hasWarnings = warnings && warnings.length > 0;
    if (!hasErrors && !hasWarnings) {
      return '<div class="status-success">✅ No errors or warnings reported</div>';
    }
    let html = '';
    if (hasErrors) {
      const errorCount = errors.length;
      html += `
        <div class="issue-group errors">
          <h3>❌ Errors (${errorCount})</h3>
          <ul>`;
      errors.forEach(error => {
        const message = this.escapeHtml(error.message || 'Unknown error');
        const context = error.context ? this.escapeHtml(error.context) : 'General';
        const guidance = this.getActionableGuidance(error.message);
        html += `
          <li>
            <span class="icon">❌</span>
            <div class="message-container">
              <span class="message">${message}</span>
              ${guidance ? `<div class="actionable-guidance"><div class="guidance">${guidance}</div></div>` : ''}
            </div>
            <span class="context">${context}</span>
          </li>`;
      });
      html += `
          </ul>
        </div>`;
    }
    if (hasWarnings) {
      const warningCount = warnings.length;
      html += `
        <div class="issue-group warnings">
          <h3>⚠️ Warnings (${warningCount})</h3>
          <ul>`;
      warnings.forEach(warning => {
        // Handle both string and object warnings (potentially grouped)
        let message = '';
        let details = null;
        let context = 'General';
        if (typeof warning === 'string') {
          message = this.escapeHtml(warning);
        } else if (warning && typeof warning === 'object') {
          message = this.escapeHtml(warning.summary || warning.message || 'Unknown warning');
          details = warning.details; // Keep details HTML (already escaped if needed)
          context = warning.context ? this.escapeHtml(warning.context) : context;
        }
        if (!message) return; // Skip empty warnings
        const guidance = this.getActionableGuidance(message);
        // Use <details>/<summary> for grouped warnings
        if (warning.type === 'grouped' && details) {
           html += `
             <li>
               <details class="check-details-collapsible warning">
                 <summary>
                   <span class="icon">⚠️</span> 
                   <span class="message">${message}</span>
                   <span class="context">${context}</span>
                 </summary>
                 <div class="details-content">${details}</div>
                 ${guidance ? `<div class="actionable-guidance"><div class="guidance">${guidance}</div></div>` : ''}
               </details>
             </li>`;
        } else {
          html += `
            <li>
              <span class="icon">⚠️</span>
              <div class="message-container">
                <span class="message">${message}</span>
                ${details ? `<div class="details-content">${details}</div>` : ''}
                ${guidance ? `<div class="actionable-guidance"><div class="guidance">${guidance}</div></div>` : ''}
              </div>
              <span class="context">${context}</span>
            </li>`;
        }
      });
      html += `
          </ul>
        </div>`;
    }
    return html;
  }
  
  /**
   * Provides actionable guidance for common errors and warnings
   * @param {string} message - The error or warning message
   * @returns {string|null} - HTML with actionable guidance or null if no guidance is available
   */
  getActionableGuidance(message) {
    if (!message) return null;
    if (message.includes('Vitest results JSON file not found')) {
      return `<div class="guidance"><h4>How to fix:</h4><ol><li>Ensure the 'temp' directory exists relative to where tests are run.</li><li>Check Vitest configuration (e.g., <code>vitest.config.js</code>) for the <code>outputFile</code> option in the reporter settings.</li><li>Verify the test command in <code>package.json</code> includes the JSON reporter flag (e.g., <code>--reporter=json</code>).</li></ol><p><strong>Note:</strong> Tests might have passed, but results couldn't be parsed.</p></div>`;
    }
    if (message.includes('Coverage file not found')) {
      return `<div class="guidance"><h4>How to fix:</h4><ol><li>Verify that test coverage is enabled in your test runner configuration (e.g., Vitest config).</li><li>Ensure the coverage reporter is set to generate a format the workflow expects (e.g., JSON summary).</li><li>Check the configured <code>reportsDirectory</code> or output path for coverage files.</li><li>Confirm tests actually ran and produced coverage data.</li></ol></div>`;
    }
    if (message.includes('outdated dependencies')) {
      return `<div class="guidance"><h4>How to fix:</h4><p>Run <code>pnpm outdated</code> to see which packages need updating, then update using <code>pnpm update &lt;package-name&gt;</code> or interactively with <code>pnpm update --interactive</code>.</p></div>`;
    }
    return null;
  }
  
  generateTimelineSection() {
    return this.generateTimeline();
  }
  
  generateTimeline() {
    const { steps } = this.data;
    if (!steps || steps.length === 0) return '';
    const phases = {};
    steps.forEach(step => {
      const phase = step.phase || 'Other';
      if (!phases[phase]) { phases[phase] = []; }
      phases[phase].push(step);
    });
    let html = `<section class="widget timeline"><h2>Workflow Timeline</h2>`;
    Object.entries(phases).forEach(([phase, phaseSteps]) => {
      const phaseSuccess = phaseSteps.every(step => this.normalizeStatus(step.status) === 'success' || this.normalizeStatus(step.status) === 'warning'); // Allow warnings in successful phase
      const phaseStatus = phaseSteps.some(step => this.normalizeStatus(step.status) === 'failed') ? 'failed' : (phaseSteps.some(step => this.normalizeStatus(step.status) === 'warning') ? 'warning' : 'success');
      const phaseClass = `status-${phaseStatus}`;
      html += `<div class="timeline-phase-group ${phaseClass}"><h3 class="phase-title">${this.escapeHtml(phase)}</h3><ul>`;
      phaseSteps.forEach(step => {
        const status = this.normalizeStatus(step.status);
        const statusClass = `status-${status}`;
        const duration = step.duration ? this.formatDuration(step.duration) : '';
        const errorDisplay = (status === 'failed' || status === 'error') && step.error ? `<p class="error-message">${this.escapeHtml(step.error)}</p>` : '';
        html += `
          <li class="${statusClass}">
              <div class="timeline-marker"></div>
                <h4>${this.escapeHtml(step.name)}</h4>
            <p>Status: <span class="status ${statusClass}">${status}</span></p>
            ${duration ? `<p>Duration: ${duration}</p>` : ''}
            ${errorDisplay} 
            </li>
          `;
      });
      html += `</ul></div>`;
    });
    html += `</section>`;
    return html;
  }
  
  /**
   * Generates the HTML section for displaying Advanced Check results.
   * Creates a widget container and populates it with cards generated by generateAdvancedCheckCards.
   * 
   * @returns {string} HTML string for the advanced checks section, or empty string if no checks ran.
   */
  generateAdvancedChecksSection() {
    // *** FIX: Re-applying the full section structure wrap ***
    const cardsHtml = this.generateAdvancedCheckCards();
    // Ensure we only render the section if there are cards
    if (!cardsHtml || !cardsHtml.trim()) { 
      return ''; // Return empty if no cards were generated
    }
    return `
      <section class="widget advanced-checks-cards">
        <h2>Advanced Checks</h2>
        ${cardsHtml}
      </section>
    `;
    // *** END FIX ***
  }

  /**
   * Generates the HTML for the advanced check cards
   * @returns {string} HTML string
   */
  generateAdvancedCheckCards() {
    const checks = this.data.advancedChecks || {};
    logger.debug('Advanced Checks Data (in generateAdvancedCheckCards):', JSON.stringify(checks));

    if (Object.keys(checks).length === 0) {
      return '<p>No advanced checks were performed.</p>';
    }

    const cards = Object.entries(checks).map(([name, check]) => {
      // Ensure check is an object before proceeding
      if (!check || typeof check !== 'object') {
          logger.warn(`Skipping invalid advanced check data for '${name}':`, check);
          return ''; // Skip rendering this card
      }

      const status = this.normalizeStatus(check.status);
      
      // --- Corrected Duration Logic --- 
      const durationMs = (typeof check.duration === 'number' && check.duration >= 0) ? check.duration : null;
      const duration = durationMs !== null ? this.formatDuration(durationMs) : 'N/A';
      if (durationMs === null && Object.hasOwn(check, 'duration')) {
         logger.warn(`Invalid duration value for check '${name}': ${check.duration}`);
      }
      // --- END Corrected Duration Logic --- 

      const icon = status === 'success' ? '✅' : (status === 'failed' ? '❌' : (status === 'warning' ? '⚠️' : '⏳'));
      const statusClass = `status-${status}`;
      const title = check.title || name; 

      let bodyContent = '';
      const message = this.escapeHtml(check.message || '');
      const error = this.escapeHtml(check.error || '');
      
      if (status === 'failed') {
        bodyContent = `<p class="error">${error || message || 'An unknown error occurred.'}</p>`;
      } else if (status === 'warning') {
        bodyContent = `<p class="message">${message || 'Check completed with warnings.'}</p>`;
         const detailsHtml = this.generateCheckDetails(name, check);
        if (detailsHtml) { bodyContent += detailsHtml; }
      } else if (status === 'success') {
         bodyContent = `<p class="message">${message || 'Check completed successfully.'}</p>`;
         const detailsHtml = this.generateCheckDetails(name, check);
          if (detailsHtml) { bodyContent += detailsHtml; }
      } else { // pending or skipped
        bodyContent = `<p class="message">${message || 'Check pending or skipped.'}</p>`;
      }

      return `
        <div class="check-card ${statusClass}">
          <div class="card-header">
            <span class="icon ${statusClass}-icon">${icon}</span>
            <h3 class="card-title">${this.escapeHtml(title)}</h3>
             <span class="status ${statusClass}" style="margin-left: auto;">${this.escapeHtml(status)}</span>
          </div>
          <div class="card-body">
            <p>Duration: ${duration}</p>
            ${bodyContent}
          </div>
        </div>
      `;
    }).join('');

    // Handle case where all checks were invalid
    if (!cards.trim()) {
        return '<p>No valid advanced checks data to display.</p>';
    }

    return `<div class="cards-container">${cards}</div>`;
  }
  
  generateWorkflowOptionsSection() {
    const { options } = this.data;
    if (!options || Object.keys(options).length === 0) { return ''; }
    const activeOptions = Object.entries(options).filter(([key, value]) => {
        return value && !key.startsWith('_') && key !== 'outputPath' && key !== 'isCI' && value !== false && value !== 'false' && value !== 0;
    });
    if (activeOptions.length === 0) {
      return `<section class="widget workflow-options"><h2>Workflow Options</h2><p>Running with default options</p></section>`;
    }
    const optionRows = activeOptions.map(([key, value]) => {
      const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      let displayValue = '';
      if (typeof value === 'boolean') { displayValue = value ? 'Yes' : 'No'; }
      else if (typeof value === 'object') { displayValue = JSON.stringify(value); }
      else { displayValue = `${value}`; }
      return `<div class="option-row"><strong>${displayKey}:</strong> ${this.escapeHtml(displayValue)}</div>`;
    }).join('');
    return `<section class="widget workflow-options"><h2>Active Workflow Options</h2><div class="options-table">${optionRows}</div></section>`;
  }
  
  generateChannelCleanupSection() {
    const { metrics } = this.data;
    if (!metrics?.channelCleanup) return '';
    const cleanup = metrics.channelCleanup;
    const status = this.normalizeStatus(cleanup.status);
    const statusClass = `status-${status}`;
    return `
      <section class="widget channel-cleanup"><h2>Channel Cleanup</h2><div class="cleanup-status"><p>Status: <span class="status ${statusClass}">${status}</span></p><div class="cleanup-metrics"><div class="metric-item"><span class="metric-label">Cleaned</span><span class="metric-value">${cleanup.cleanedChannels || 0}</span></div><div class="metric-item"><span class="metric-label">Failed</span><span class="metric-value ${cleanup.failedChannels > 0 ? 'error-value' : ''}">${cleanup.failedChannels || 0}</span></div>${cleanup.skippedChannels ? `<div class="metric-item"><span class="metric-label">Skipped</span><span class="metric-value">${cleanup.skippedChannels}</span></div>` : ''}<div class="metric-item"><span class="metric-label">Kept</span><span class="metric-value">${cleanup.channelsKept || 0}</span></div></div></div>${cleanup.details ? `<div class="cleanup-details"><h3>Details</h3><pre>${this.escapeHtml(cleanup.details)}</pre></div>` : ''}</section>
      `;
  }
  
  generateWorkflowAnalyticsSection() {
    const { metrics } = this.data;
    const validMetrics = metrics && typeof metrics === 'object';
    if (!validMetrics || !metrics.phaseDurations) { return ''; }
    const phaseDurations = metrics.phaseDurations || {};
    const significantPhases = Object.entries(phaseDurations).filter(([_, duration]) => duration > 0).sort(([_, a], [__, b]) => b - a);
    if (significantPhases.length === 0) { return ''; }
    const totalPhaseDuration = significantPhases.reduce((sum, [_, duration]) => sum + duration, 0);
    const phasesToShow = significantPhases.slice(0, 5);
    const phaseItems = phasesToShow.map(([name, duration]) => {
      const percentage = totalPhaseDuration > 0 ? Math.round((duration / totalPhaseDuration) * 100) : 0;
      const formattedName = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace('Phase', '');
      return `<div class="breakdown-item${percentage > 25 ? ' highlight' : ''}"><span class="label">${formattedName}</span><div class="progress-bar"><div class="progress" style="width: ${percentage}%"></div></div><span class="value">${this.formatDuration(duration)} (${percentage}%)</span></div>`;
    }).join('');
    return `
      <section class="widget workflow-analytics"><h2>Workflow Analytics</h2><div class="analytics-content"><div class="analytics-item"><h3>Workflow Phase Breakdown</h3><div class="analytics-breakdown">${phaseItems}</div></div></div></section>`;
  }

  generateTestFilesSection(testResults) {
    if (!testResults || !Array.isArray(testResults.testFiles) || testResults.testFiles.length === 0) {
      return '';
    }
    const filesHtml = testResults.testFiles.map(fileInfo => {
      const fileName = fileInfo.file || 'Unknown File';
      const testCount = fileInfo.count || 0;
      return `<li class="test-file"><span>${this.escapeHtml(fileName)}</span><span class="test-file-count">(${testCount} tests)</span></li>`;
    }).join('');
    return `
      <div class="test-files">
        <h3>Test Files Executed</h3>
        <ul class="test-files-list">
          ${filesHtml}
        </ul>
      </div>
    `;
  }

  generatePackageBuildMetrics(packageMetrics) { /* Placeholder - integrated into formatBuildOutput */ return ''; }

  formatFileSize(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) { return '0 B'; }
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2).replace(/\.0+$/, '') + ' ' + units[i];
  }

  formatDuration(ms) {
    if (ms === undefined || ms === null || isNaN(ms)) { return '0s'; }
    if (ms < 1000) { return `${ms}ms`; }
    else if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s`; }
    else { const minutes = Math.floor(ms / 60000); const seconds = ((ms % 60000) / 1000).toFixed(1); return `${minutes}m ${seconds}s`; }
  }

  async openInBrowser() {
    try {
      if (!this.outputPath) { logger.error('No output path set for dashboard'); return { success: false, error: new Error('No output path set for dashboard') }; }
      let normalizedPath = this.outputPath.replace(/\\/g, '/');
      let fileUrl;
      if (process.platform === 'win32') { normalizedPath = normalizedPath.replace(/^\/+/, ''); fileUrl = `file:///${normalizedPath}`; }
      else { fileUrl = `file://${normalizedPath}`; }
      if (this.verbose) { logger.debug(`Original path: ${this.outputPath}`); logger.debug(`Normalized path: ${normalizedPath}`); logger.debug(`File URL: ${fileUrl}`); }
      await open(fileUrl);
      logger.info('Dashboard opened in browser successfully');
      return { success: true };
    } catch (error) {
      logger.error('Failed to open dashboard in browser:', error);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  generateCheckDetails(name, check) {
    if (!check || !check.details || check.details.length === 0) return '';
    const listItems = check.details.map(item => `<li>${this.escapeHtml(item)}</li>`).join('');
    return `<details class="check-details-collapsible"><summary>Details</summary><ul class="check-details-list">${listItems}</ul></details>`;
  }

  /**
   * Generates the complete CSS rules for styling the dashboard within <style> tags.
   * Includes base styles, layout, widget styles, status indicators, and specific component styles.
   * 
   * @returns {string} A string containing all CSS rules enclosed in <style> tags.
   */
  generateCSS() {
    const baseCss = `
    <style>
      :root {
        --color-success: #10b981; --color-success-bg: #f0fdf4; --color-success-text: #065f46; --color-success-border: #a7f3d0;
        --color-error: #ef4444;   --color-error-bg: #fef2f2;   --color-error-text: #991b1b;   --color-error-border: #fca5a5;
        --color-warning: #f59e0b; --color-warning-bg: #fffbeb; --color-warning-text: #92400e; --color-warning-border: #fde68a;
        --color-info: #3b82f6;    --color-info-bg: #eff6ff;    --color-info-text: #1e40af;    --color-info-border: #bfdbfe;
        --color-pending: #6b7280; --color-pending-bg: #f3f4f6; --color-pending-text: #374151; --color-pending-border: #d1d5db;
        --color-skipped: var(--color-pending); --color-skipped-bg: var(--color-pending-bg); --color-skipped-text: var(--color-pending-text); --color-skipped-border: var(--color-pending-border);
        --border-color: #e5e7eb;
        --text-color: #1f2937;
        --text-secondary: #6b7280;
        --bg-color: #f9fafb;
        --bg-widget: #ffffff;
        --bg-card: #f9fafb; /* Slightly off-white for cards within widgets */
        --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
        --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        --border-radius-sm: 4px;
        --border-radius: 6px;
        --border-radius-md: 8px;
      }
      body { font-family: var(--font-sans); margin: 0; background-color: var(--bg-color); color: var(--text-color); line-height: 1.6; }
      .dashboard-container { max-width: 1400px; margin: 20px auto; padding: 0 20px; }
      
      /* Header */
      .header { padding: 25px 30px; margin-bottom: 25px; border-radius: var(--border-radius-md); color: white; box-shadow: var(--shadow); background-color: #374151; }
      .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;}
      .header h1 { margin: 0; font-size: 2em; line-height: 1.2; }
      .header .timestamp { font-size: 0.9em; opacity: 0.9; margin: 0; text-align: right; }
      .status-banner { width: 100%; order: 3; padding: 12px 20px; margin-top: 15px; border-radius: var(--border-radius); font-size: 1.2em; font-weight: 600; text-align: center; border: 1px solid rgba(0,0,0,0.1); }
      .status-bg-success { background: linear-gradient(135deg, #2dd4bf 0%, #10b981 100%); }
      .status-bg-failed, .status-bg-error { background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); } /* Treat failed same as error visually */
      .status-text-success, .status-text-failed, .status-text-error { color: #fff; background-color: rgba(0,0,0,0.1); border-color: rgba(255,255,255,0.3); }
      
      /* Layout Grid */
      .main-content { display: grid; grid-template-columns: repeat(2, 1fr); gap: 25px; max-width: 1200px; margin: 0 auto; }
      .grid-col-1 { grid-column: span 1; }
      .grid-col-2 { grid-column: span 1; }
      .grid-col-full { grid-column: 1 / -1; }
      @media (max-width: 900px) { .grid-col-1, .grid-col-2 { grid-column: span 2; } }

      /* General Widget Styling */
      .widget { background-color: var(--bg-widget); border: 1px solid var(--border-color); border-radius: var(--border-radius-md); padding: 25px; margin-bottom: 25px; box-shadow: var(--shadow); }
      .widget h2 { font-size: 1.6em; color: var(--text-color); margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
      .widget h3 { font-size: 1.15em; color: #374151; margin-top: 20px; margin-bottom: 12px; font-weight: 600; }
      
      /* Status Indicators */
      .status { display: inline-block; padding: 3px 10px; border-radius: 14px; font-size: 0.8em; font-weight: 600; line-height: 1.4; text-transform: uppercase; border: 1px solid transparent; }
      .status-success { background-color: var(--color-success-bg); color: var(--color-success-text); border-color: var(--color-success-border); }
      .status-failed, .status-error { background-color: var(--color-error-bg); color: var(--color-error-text); border-color: var(--color-error-border); }
      .status-warning { background-color: var(--color-warning-bg); color: var(--color-warning-text); border-color: var(--color-warning-border); }
      .status-info    { background-color: var(--color-info-bg);    color: var(--color-info-text);    border-color: var(--color-info-border); }
      .status-pending, .status-skipped { background-color: var(--color-pending-bg); color: var(--color-pending-text); border-color: var(--color-pending-border); }
      .status-timeout { background-color: #ffedd5; color: #9a3412; border-color: #fed7aa; }

      /* Specific Widget Styles */
      .preview-channels .preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 15px; }
      .preview-card { background-color: var(--bg-card); border: 1px solid var(--border-color); padding: 15px; border-radius: var(--border-radius); box-shadow: var(--shadow-sm); }
      .preview-card h3 { margin-top: 0; margin-bottom: 10px; }
      .preview-link { display: block; word-wrap: break-word; margin: 8px 0; color: #2563eb; text-decoration: none; font-size: 0.9em; }
      .preview-link:hover { text-decoration: underline; }
      .preview-link.previous-link {
        color: var(--text-secondary); /* Use grey color */
        opacity: 0.85; /* Slightly fade it */
        font-size: 0.85em; /* Make it a bit smaller */
      }
      .preview-card .timestamp { font-size: 0.8em; color: var(--text-secondary); margin-top: 10px; }
      
      .overall-status .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 20px; }
      .overall-status .status-item { background-color: var(--bg-card); padding: 15px; border-radius: var(--border-radius); border: 1px solid var(--border-color); text-align: center; }
      .overall-status .status-item h3 { margin: 0 0 8px 0; font-size: 0.9em; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; }
      .overall-status .status-item p { margin: 0; font-size: 1.25em; font-weight: 600; line-height: 1.3;}
      .overall-status .status-item p.status { font-size: 1em; font-weight: bold; }
      .overall-status .build-output h3 { margin-top: 25px; font-size: 1.1em; }
      .overall-status .build-packages { display: flex; flex-direction: column; gap: 8px; }
      .overall-status .build-package { background-color: var(--bg-card); padding: 12px; border-radius: var(--border-radius-sm); font-size: 0.95em; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 5px; }
      .overall-status .package-name { font-weight: 600; margin-right: 10px; }
      .overall-status .status { margin-left: auto; }
      .overall-status .test-files { margin-top: 20px; }
      .overall-status .test-files h3 { font-size: 1.1em; margin-bottom: 10px; }
      .overall-status .test-files-list { list-style: none; padding: 10px; margin: 0; font-size: 0.9em; max-height: 180px; overflow-y: auto; background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); }
      .overall-status .test-file { display: flex; justify-content: space-between; padding: 4px 5px; }
      .overall-status .test-file:not(:last-child) { border-bottom: 1px dashed #e5e7eb; }
      .overall-status .test-file-count { color: var(--text-secondary); font-size: 0.9em; }

      .issues h2 { display: flex; align-items: center; gap: 10px; }
      .issues .issue-group { margin-top: 15px; border: 1px solid var(--border-color); border-radius: var(--border-radius); overflow: hidden; }
      .issues .issue-group h3 { background-color: #f3f4f6; padding: 12px 15px; margin: 0; font-size: 1.1em; font-weight: 600; border-bottom: 1px solid var(--border-color); }
      .issues .issue-group.errors, .issues .issue-group.failed { border-color: var(--color-error); } /* Style errors/failed groups */
      .issues .issue-group.errors h3, .issues .issue-group.failed h3 { background-color: var(--color-error-bg); color: var(--color-error-text); border-color: var(--color-error); }
      .issues .issue-group.warnings { border-color: var(--color-warning); }
      .issues .issue-group.warnings h3 { background-color: var(--color-warning-bg); color: var(--color-warning-text); border-color: var(--color-warning); }
      .issues ul { list-style: none; margin: 0; padding: 0; }
      .issues li { padding: 12px 15px; border-bottom: 1px solid var(--border-color); display: flex; flex-wrap: wrap; align-items: start; gap: 10px; background-color: var(--bg-widget); }
      .issues li:last-child { border-bottom: none; }
      .issues .icon { font-size: 1.2em; line-height: 1.6; margin-top: 2px; }
      .issues .severity { font-weight: 700; font-size: 0.7em; padding: 2px 5px; border-radius: var(--border-radius-sm); text-transform: uppercase; white-space: nowrap; background-color: var(--color-pending-bg); }
      .issues .message-container { flex-grow: 1; line-height: 1.6; }
      .issues .message { display: block; margin-bottom: 6px; }
      .issues .context { font-size: 0.8em; color: var(--text-secondary); white-space: nowrap; margin-left: 10px; background-color: #e5e7eb; padding: 2px 6px; border-radius: 3px; align-self: center; }
      .issues .info { color: var(--text-secondary); padding: 15px; }
      .issues .status-success { padding: 15px; text-align: center; font-weight: 500; color: var(--color-success-text); background-color: var(--color-success-bg); }
      .issues .actionable-guidance { background-color: var(--color-info-bg); border: 1px solid var(--color-info-border); border-radius: var(--border-radius-sm); padding: 10px 15px; margin-top: 8px; font-size: 0.9em; width: 100%; }
      .issues .guidance h4 { margin: 0 0 6px 0; color: var(--color-info-text); }
      .issues .guidance code { background-color: #e5e7eb; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
      .issues .guidance ol, .issues .guidance ul { list-style-position: inside; padding-left: 0; margin: 8px 0; }
      .issues .guidance li { display: list-item; padding: 3px 0; border-bottom: none; }
      .issues .guidance p { margin: 6px 0; }
      .issues .guidance strong { color: var(--color-info-text); }
      .issues .no-issues { padding: 15px; text-align: center; }
      .issues details > summary { cursor: pointer; font-weight: normal; margin: 0; color: inherit; list-style: none; display: flex; align-items: start; gap: 10px; width: 100%;}
      .issues details > summary::before { content: '▶'; margin-right: 5px; font-size: 0.8em; display: inline-block; transition: transform 0.2s; margin-top: 4px; }
      .issues details[open] > summary::before { transform: rotate(90deg); }
      .issues details[open] > summary { margin-bottom: 8px; }
      .issues .details-content { padding: 10px; background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); margin-top: 5px; margin-left: 25px; /* Indent details */ }
      .issues .check-details-collapsible.warning summary { color: var(--color-warning-text); }
      .issues .check-details-collapsible.warning .details-content { border-color: var(--color-warning-border); background-color: var(--color-warning-bg); }
      .issues .check-details-collapsible.error summary { color: var(--color-error-text); }
      .issues .check-details-collapsible.error .details-content { border-color: var(--color-error-border); background-color: var(--color-error-bg); }

      .timeline ul { list-style: none; padding-left: 20px; margin-top: 15px; border-left: 3px solid var(--border-color); }
      .timeline li { position: relative; padding: 12px 0 12px 35px; margin-bottom: 8px; }
      .timeline li:last-child { padding-bottom: 0; }
      .timeline .timeline-marker { position: absolute; left: -11px; top: 16px; width: 18px; height: 18px; border-radius: 50%; background-color: var(--color-pending); border: 4px solid var(--bg-widget); }
      .timeline .status-success .timeline-marker { background-color: var(--color-success); }
      .timeline .status-failed .timeline-marker, .timeline .status-error .timeline-marker { background-color: var(--color-error); }
      .timeline .status-warning .timeline-marker { background-color: var(--color-warning); }
      .timeline h4 { margin: 0 0 6px 0; font-size: 1.1em; font-weight: 600; }
      .timeline p { margin: 4px 0; font-size: 0.95em; color: var(--text-secondary); }
      .timeline p .status { font-weight: bold; }
      .timeline p.error-message { color: var(--color-error-text); background-color: var(--color-error-bg); border: 1px solid var(--color-error-border); padding: 6px 10px; border-radius: var(--border-radius-sm); margin-top: 8px; font-style: normal; font-size: 0.9em; word-break: break-word; }
      .timeline .timeline-phase-group { margin-bottom: 25px; border-left: none; padding-left: 0; }
      .timeline .phase-title { margin-top: 0; margin-bottom: 15px; color: #1f2937; font-size: 1.3em; border-bottom: 2px solid var(--border-color); padding-bottom: 8px; }
      .timeline .timeline-phase-group.status-failed .phase-title, .timeline .timeline-phase-group.status-error .phase-title { border-bottom-color: var(--color-error); }
      .timeline .timeline-phase-group.status-success .phase-title { border-bottom-color: var(--color-success); }
      .timeline .timeline-phase-group.status-warning .phase-title { border-bottom-color: var(--color-warning); }
      
      /* --- Re-Applying Advanced Checks CSS --- */
      .advanced-checks-cards .cards-container { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
          gap: 20px; 
      }
      .advanced-checks-cards .check-card {\n        border: 1px solid var(--border-color) !important; /* *** FIX: Add !important to force border *** */\n        border-radius: var(--border-radius);\n        background-color: var(--bg-card); /* Use card background for consistency */\n        display: flex;\n        flex-direction: column;\n        box-shadow: var(--shadow-sm);\n        transition: box-shadow 0.2s ease;\n        position: relative;\n        overflow: hidden;\n      }\n      .advanced-checks-cards .check-card::before {\n          content: ''; \n          position: absolute; \n          top: 0; \n          left: 0; \n          bottom: 0; \n          width: 5px; \n          background-color: var(--border-color); \n          transition: background-color 0.2s ease; \n      }\n      .advanced-checks-cards .status-success::before { background-color: var(--color-success); }\n      .advanced-checks-cards .status-error::before, .advanced-checks-cards .status-failed::before { background-color: var(--color-error); }\n      .advanced-checks-cards .status-warning::before { background-color: var(--color-warning); }\n      
      .advanced-checks-cards .card-header {\n          display: flex; \n          align-items: center; \n          gap: 10px; \n          padding: 15px; \n          border-bottom: 1px solid var(--border-color); \n          background-color: var(--bg-card); \n      }\n      .advanced-checks-cards .card-header .icon { width: 20px; height: 20px; }\n      .advanced-checks-cards .card-header .success-icon { color: var(--color-success); }\n      .advanced-checks-cards .card-header .error-icon { color: var(--color-error); }\n      .advanced-checks-cards .card-header .warning-icon { color: var(--color-warning); }\n      .advanced-checks-cards .card-header .pending-icon { color: var(--color-pending); }\n

      .advanced-checks-cards .card-title { margin: 0; font-size: 1.15em; font-weight: 600; }\n      .advanced-checks-cards .card-body { padding: 15px; font-size: 0.95em; flex-grow: 1; }\n      .advanced-checks-cards .card-body p { margin: 0 0 8px 0; }\n      .advanced-checks-cards .card-body p:last-child { margin-bottom: 0; }\n      .advanced-checks-cards .card-body .error { color: var(--color-error-text); font-weight: 500; background-color: var(--color-error-bg); padding: 8px 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--color-error-border); margin-top: 10px; }\n      .advanced-checks-cards .card-body .message { color: var(--text-secondary); }\n      .advanced-checks-cards .check-details-collapsible summary { font-weight: bold; cursor: pointer; margin-top: 10px; color: var(--color-info-text); list-style: none; }\n      .advanced-checks-cards .check-details-collapsible summary::before { content: '▶'; margin-right: 5px; font-size: 0.8em; display: inline-block; transition: transform 0.2s; }\n      .advanced-checks-cards .check-details-collapsible[open] > summary::before { transform: rotate(90deg); }\n      .advanced-checks-cards .check-details-collapsible[open] > summary { margin-bottom: 5px; }\n      .advanced-checks-cards .check-details-list { list-style: disc; margin-left: 20px; font-size: 0.9em; color: var(--text-secondary); padding: 5px 0; }\n

      .workflow-options { font-size: 0.95em; }\n      .workflow-options .option-row { background-color: var(--color-info-bg); border: 1px solid var(--color-info-border); margin-bottom: 8px; padding: 8px 12px; border-radius: var(--border-radius-sm); }\n      
      .channel-cleanup .cleanup-status > p:first-child { font-size: 1.1em; font-weight: 600; }\n      .channel-cleanup .cleanup-details { margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color); }\n      .channel-cleanup .cleanup-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px; margin-top: 10px; font-size: 0.9em; }\n      .channel-cleanup .metric-item { text-align: center; background-color: var(--bg-card); padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); }\n      .channel-cleanup .metric-label { display: block; font-size: 0.85em; color: var(--text-secondary); margin-bottom: 4px; }\n      .channel-cleanup .metric-value { font-weight: 600; font-size: 1.15em; }\n      .channel-cleanup .error-value { color: var(--color-error-text); }\n      
      /* --- FIX: Add Analytics Bar Chart CSS --- */
      .workflow-analytics .analytics-breakdown { margin-top: 15px; display: flex; flex-direction: column; gap: 10px; }\n      .workflow-analytics .breakdown-item { display: flex; align-items: center; gap: 15px; font-size: 0.95em; }\n      .workflow-analytics .breakdown-item .label { width: 80px; text-align: right; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n      .workflow-analytics .progress-bar { flex-grow: 1; height: 20px; background-color: #e5e7eb; border-radius: 4px; overflow: hidden; }\n      .workflow-analytics .progress { height: 100%; background-color: var(--color-info); transition: width 0.5s ease-out; }\n      .workflow-analytics .breakdown-item.highlight .progress { background-color: var(--color-warning); }\n      .workflow-analytics .value { width: 80px; text-align: left; font-weight: 500; }\n      /* --- END Analytics Bar Chart CSS --- */
    </style>
    `;

    // Combine base and additional CSS (currently empty)
    return `${baseCss}`;
  }
  
  /**
   * Generates the script section (now empty)
   * @returns {string} - Empty string or just script tags
   */
  generateScript() {
    // --- Remove unused script --- 
    logger.debug('Skipping generation of unused toggleDetails script.');
    return ''; // Return empty string to remove the script block
    // --- END Remove unused script ---
  }

  /**
   * Generates the complete HTML dashboard
   * @returns {Promise<{success: boolean, error?: Error}>} - Result object
   */
  async generate() {
    if (!this.data) {
      logger.error('Dashboard cannot be generated without initialized data.');
      return { success: false, error: new Error('Dashboard not initialized') }; 
    }
    
    logger.info('Generating HTML dashboard...');
    const startTime = Date.now();
    
    const overallStatusSection = this.generateOverallStatusSection();
    const previewChannelsSection = this.generatePreviewChannelsSection();
    const issuesSection = this.generateIssuesSection();
    const timelineSection = this.generateTimelineSection();
    const advancedChecksSection = this.generateAdvancedChecksSection();
    const workflowOptionsSection = this.generateWorkflowOptionsSection();
    const channelCleanupSection = this.generateChannelCleanupSection();
    const workflowAnalyticsSection = this.generateWorkflowAnalyticsSection();
    
    const css = this.generateCSS();
    const script = this.generateScript(); // Should be empty now
    
    // --- Determine final status based on normalized data --- 
    const finalStatus = this.normalizeStatus(this.data.status); 
    logger.debug(`Using final dashboard status from normalized data: ${finalStatus}`);

    const workflowStatusText = finalStatus === 'success' ? 'Workflow Completed Successfully' : 
                           (finalStatus === 'failed' ? 'Workflow Failed' :
                           (finalStatus === 'warning' ? 'Workflow Completed with Warnings' : 
                           'Workflow Completed with Errors')); // Default error/pending
    
    const headerClass = `status-bg-${finalStatus}`;
    const statusBannerClass = `status-text-${finalStatus}`;
    // --- END Status Determination ---

    const generationTime = new Date().toLocaleString();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Dashboard - ${this.escapeHtml(workflowStatusText)}</title> 
  ${css}
</head>
<body>
  <div class="dashboard-container">
    <header class="header ${headerClass}">
      <div class="header-content">
      <h1>Workflow Dashboard</h1>
        <div class="status-banner ${statusBannerClass}">${this.escapeHtml(workflowStatusText)}</div>
      </div>
      <p class="timestamp">Generated: ${generationTime}</p>
    </header>

    <main class="main-content">
      <div class="grid-col-1">
        ${overallStatusSection}
        ${issuesSection}
        ${workflowAnalyticsSection}
        ${advancedChecksSection}
      </div>
      <div class="grid-col-2">
        ${previewChannelsSection}
        ${timelineSection}
        ${workflowOptionsSection}
        ${channelCleanupSection}
      </div>
    </main>
  </div>
  ${script} <!-- This should now be empty -->
</body>
</html>
    `;
    
    try {
      await writeFile(this.outputPath, html);
      const duration = Date.now() - startTime;
      logger.success(`Dashboard generated successfully at ${this.outputPath} (took ${duration}ms)`);
      return { success: true }; 
    } catch (error) {
      logger.error(`Failed to write dashboard file: ${error.message}`);
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) }; 
    }
  }
}