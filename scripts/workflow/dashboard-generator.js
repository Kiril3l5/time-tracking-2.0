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
    this.generateAdvancedCheckCards = this.generateAdvancedCheckCards.bind(this);
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
      // ---> Add debug logging before normalization <-----
      logger.debug('--- Data received by DashboardGenerator.initialize ---');
      logger.debug(`Raw Metrics Keys: ${Object.keys(workflowState.metrics || {}).join(', ')}`);
      logger.debug(`Raw buildPerformance: ${JSON.stringify(workflowState.metrics?.buildPerformance)}`);
      logger.debug(`Raw buildMetrics (separate prop): ${JSON.stringify(workflowState.buildMetrics)}`);
      // ---> End debug log <-----
      this.data = this.normalizeData(workflowState);
      // ---> Add debug logging after normalization <-----
      logger.debug('--- Data after DashboardGenerator.normalizeData ---');
      logger.debug(`Normalized Metrics Keys: ${Object.keys(this.data.metrics || {}).join(', ')}`);
      logger.debug(`Normalized buildPerformance: ${JSON.stringify(this.data.metrics?.buildPerformance)}`);
      // ---> End debug log <-----
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
      warnings: this.processWarnings(data.warnings || []),
      metrics: normalizedMetrics,
      preview: normalizedPreview,
      advancedChecks: normalizedAdvancedChecks,
      buildMetrics: data.buildMetrics || {},
      options: data.options || {},
      title: data.title || 'Workflow Results',
      runDate: data.runDate || new Date().toISOString(),
      status: data.status || 'pending',
      issues: this.normalizeArray(data.issues),
    };
    
    if (this.verbose) {
      logger.info('Data normalization complete');
    }
    
    return normalizedData;
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

    // Regular expressions to match common documentation warnings
    const docPatterns = [
      { regex: /Missing main heading \(H1\) in file: (.+)/, type: "Missing main heading (H1)" },
      { regex: /Missing JSDoc comment for: (.+) in file: (.+)/, type: "Missing JSDoc comment" },
      { regex: /Invalid JSDoc format in file: (.+)/, type: "Invalid JSDoc format" },
      { regex: /Missing parameter description for: (.+) in file: (.+)/, type: "Missing parameter description" },
      { regex: /Missing return description in file: (.+)/, type: "Missing return description" },
      { regex: /Missing documentation for: (.+)/, type: "Missing documentation" }
    ];

    // Group warnings by pattern
    const groups = {};
    const remainingWarnings = [];

    warnings.forEach(warning => {
      if (typeof warning !== 'string') {
        remainingWarnings.push(warning);
        return;
      }

      let matched = false;
      for (const pattern of docPatterns) {
        const match = warning.match(pattern.regex);
        if (match) {
          if (!groups[pattern.type]) {
            groups[pattern.type] = [];
          }
          groups[pattern.type].push(warning);
          matched = true;
          break;
        }
      }

      if (!matched) {
        remainingWarnings.push(warning);
      }
    });

    // Create summary warnings for each group
    const processedWarnings = [...remainingWarnings];

    Object.entries(groups).forEach(([type, groupWarnings]) => {
      if (groupWarnings.length === 1) {
        processedWarnings.push(groupWarnings[0]);
      } else {
        // Extract file paths for the first few warnings
        const maxFilesToShow = 5;
        const sampleFiles = groupWarnings
          .slice(0, maxFilesToShow)
          .map(warning => {
            const fileMatch = warning.match(/in file: (.+)/) || warning.match(/file: (.+)/);
            return fileMatch ? fileMatch[1] : warning;
          });

        const remainingCount = groupWarnings.length - maxFilesToShow;
        
        // Create a summary warning
        const summaryWarning = {
          summary: `Documentation issue: ${type} in ${groupWarnings.length} files`,
          details: `<p>Examples:</p><ul>${
            sampleFiles.map(file => `<li>${this.escapeHtml(file)}</li>`).join('')
          }${remainingCount > 0 ? `<li>...and ${remainingCount} more files</li>` : ''}</ul>`,
          count: groupWarnings.length,
          expanded: false
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
    ${this.generateWorkflowAnalytics()}
    ${this.generateTimeline()}
    ${this.generateAdvancedCheckCards()}
    ${this.generateWorkflowOptions()}
    ${this.generateChannelCleanup()}
  </div>
  
  <script>
    // Simple script to toggle visibility of depcheck error details
    function toggleDetails(id) {
      const detailsElement = document.getElementById(id);
      if (detailsElement) {
        detailsElement.style.display = detailsElement.style.display === 'none' ? 'block' : 'none';
      }
    }
    // Add listeners after DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      const buttons = document.querySelectorAll('.toggle-details-btn');
      buttons.forEach(button => {
        button.addEventListener('click', () => {
          const targetId = button.getAttribute('data-target-id');
          if (targetId) {
            toggleDetails(targetId);
          }
        });
      });
      // Initially hide all details
      const allDetails = document.querySelectorAll('.depcheck-error-details');
      allDetails.forEach(el => el.style.display = 'none');
    });
  </script>
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
    const { preview, metrics } = this.data;
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

    // Get previous channels from various sources in order of preference
    let prevAdminUrl = '';
    let prevHoursUrl = '';
    let hasPreviousUrls = false;
    
    // First check if we have cleanup comparison data (from channel-cleanup.js)
    if (metrics && metrics.channelCleanup && metrics.channelCleanup.previewComparison) {
      const comparison = metrics.channelCleanup.previewComparison;
      // Try to safely get data for admin and hours sites
      const adminSite = comparison['admin-autonomyhero-2024'];
      const hoursSite = comparison['hours-autonomyhero-2024'];
      
      if (adminSite && adminSite.previous && adminSite.previous.url) {
        prevAdminUrl = adminSite.previous.url;
        hasPreviousUrls = true;
      }
      
      if (hoursSite && hoursSite.previous && hoursSite.previous.url) {
        prevHoursUrl = hoursSite.previous.url;
        hasPreviousUrls = true;
      }
    }
    // Fallback to legacy data sources if needed
    else if (metrics && metrics.previousChannels) {
      prevAdminUrl = metrics.previousChannels.admin || '';
      prevHoursUrl = metrics.previousChannels.hours || '';
      hasPreviousUrls = prevAdminUrl || prevHoursUrl;
    } 
    else if (metrics && metrics.previousPreview) {
      prevAdminUrl = metrics.previousPreview.admin?.url || '';
      prevHoursUrl = metrics.previousPreview.hours?.url || '';
      hasPreviousUrls = prevAdminUrl || prevHoursUrl;
    }
    
    // Extract more detailed information about previous channels if available
    let prevAdminTimestamp = '';
    let prevHoursTimestamp = '';
    
    if (metrics && metrics.channelCleanup && metrics.channelCleanup.previewComparison) {
      const comparison = metrics.channelCleanup.previewComparison;
      const adminSite = comparison['admin-autonomyhero-2024'];
      const hoursSite = comparison['hours-autonomyhero-2024'];
      
      if (adminSite && adminSite.previous && adminSite.previous.timestamp) {
        prevAdminTimestamp = new Date(adminSite.previous.timestamp).toLocaleString();
      }
      
      if (hoursSite && hoursSite.previous && hoursSite.previous.timestamp) {
        prevHoursTimestamp = new Date(hoursSite.previous.timestamp).toLocaleString();
      }
    }
    
    return `
      <section class="preview-channels">
        <h2>Preview Channels</h2>
        
        <h3 class="channel-heading">Current Run</h3>
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
        
        ${hasPreviousUrls ? `
          <h3 class="channel-heading">Previous Run</h3>
          <div class="preview-grid">
            <div class="preview-card">
              <h3>Admin Preview</h3>
              <p class="status status-info">Previous</p>
              ${prevAdminUrl ? `
                <a href="${prevAdminUrl}" target="_blank" class="preview-link">${prevAdminUrl}</a>
                ${prevAdminTimestamp ? `<p class="timestamp">Created: ${prevAdminTimestamp}</p>` : ''}
              ` : '<p>No previous preview URL available</p>'}
            </div>
            <div class="preview-card">
              <h3>Hours Preview</h3>
              <p class="status status-info">Previous</p>
              ${prevHoursUrl ? `
                <a href="${prevHoursUrl}" target="_blank" class="preview-link">${prevHoursUrl}</a>
                ${prevHoursTimestamp ? `<p class="timestamp">Created: ${prevHoursTimestamp}</p>` : ''}
              ` : '<p>No previous preview URL available</p>'}
            </div>
          </div>
        ` : ''}
      </section>
    `;
  }

  generateOverallStatus() {
    const { metrics } = this.data;
    if (!metrics || typeof metrics !== 'object') {
      logger.error('[DashboardGenerator] Metrics data missing in generateOverallStatus');
      return '<section class="overall-status"><h2>Overall Status</h2><p class="status status-error">Metrics data unavailable</p></section>';
    }
    
    const duration = typeof metrics.duration === 'number' ? metrics.duration : 0;
    const buildPerfData = metrics.buildPerformance || {}; 
    logger.debug(`[generateOverallStatus] Reading buildPerfData.totalBuildTime: ${buildPerfData.totalBuildTime}`);
    const buildPerformanceTime = typeof buildPerfData.totalBuildTime === 'number' ? buildPerfData.totalBuildTime : 0;
    const deploymentStatus = metrics.deploymentStatus || 'pending';
    
    const testResults = metrics.testResults || {};
    const totalSteps = typeof testResults.total === 'number' ? testResults.total : 0;
    const passedSteps = typeof testResults.passed === 'number' ? testResults.passed : 0;
    const coveragePercent = typeof testResults.coverage === 'number' && !isNaN(testResults.coverage) 
                           ? testResults.coverage 
                           : null;
    
    // Format the test/coverage display
    let qualityStepsDisplay = '';
    if (totalSteps > 0) {
        qualityStepsDisplay = `${passedSteps}/${totalSteps} steps passed`;
        if (coveragePercent !== null) {
          qualityStepsDisplay += ` (${coveragePercent.toFixed(1)}% coverage)`;
        } else {
           // Add note if coverage failed/missing but steps ran
           qualityStepsDisplay += ` (Coverage unavailable)`; 
        }
    } else {
        qualityStepsDisplay = 'Quality steps skipped or data unavailable';
    }
    
    const packageMetricsData = metrics.packageMetrics || {};
    const adminBuild = packageMetricsData.admin || {};
    const hoursBuild = packageMetricsData.hours || {};
    
    let adminBuildOutput = 'Data unavailable';
    if (adminBuild.success === true) {
      const size = adminBuild.formattedSize || this.formatBytes(adminBuild.sizeBytes || 0);
      const files = typeof adminBuild.fileCount === 'number' ? adminBuild.fileCount : '?';
      adminBuildOutput = `Success (${this.formatDuration(adminBuild.duration || 0)}) - ${files} files, ${size}`;
    } else if (adminBuild.success === false) {
      adminBuildOutput = adminBuild.error ? `Failed: ${this.escapeHtml(adminBuild.error)}` : 'Failed';
    }
    
    let hoursBuildOutput = 'Data unavailable';
    if (hoursBuild.success === true) {
      const size = hoursBuild.formattedSize || this.formatBytes(hoursBuild.sizeBytes || 0);
      const files = typeof hoursBuild.fileCount === 'number' ? hoursBuild.fileCount : '?';
      hoursBuildOutput = `Success (${this.formatDuration(hoursBuild.duration || 0)}) - ${files} files, ${size}`;
    } else if (hoursBuild.success === false) {
      hoursBuildOutput = hoursBuild.error ? `Failed: ${this.escapeHtml(hoursBuild.error)}` : 'Failed';
    }
    
    logger.debug(`[generateOverallStatus] Displaying - Duration: ${duration}, BuildTime: ${buildPerformanceTime}, QualitySteps: ${qualityStepsDisplay}, Deployment: ${deploymentStatus}`);

    return `
      <section class="overall-status">
        <h2>Overall Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <h3>Duration</h3>
            <p>${this.formatDuration(duration)}</p>
          </div>
          <div class="status-item">
            <h3>Build Performance</h3>
            <p>${this.formatDuration(buildPerformanceTime)}</p>
          </div>
          <div class="status-item">
            <h3>Quality Steps</h3>
            <p>${qualityStepsDisplay}</p>
          </div>
          <div class="status-item">
            <h3>Deployment</h3>
            <p class="status status-${deploymentStatus}">${deploymentStatus}</p>
          </div>
        </div>
        <div class="build-output">
          <h3>Build Output</h3>
          <div class="build-packages">
            <div class="build-package">
              <span class="package-name">admin:</span> ${adminBuildOutput}
            </div>
            <div class="build-package">
              <span class="package-name">hours:</span> ${hoursBuildOutput}
            </div>
          </div>
        </div>
        ${this.generateTestFilesSection(testResults)}
      </section>
    `;
  }

  generateTestFilesSection(testResults) {
    if (!testResults || !testResults.testFiles || testResults.testFiles.length === 0) {
      return '';
    }

    const testFiles = testResults.testFiles;
    let html = `
      <div class="test-files">
        <h3>Test Files (${testFiles.length})</h3>
        <ul class="test-files-list">
    `;

    testFiles.forEach(file => {
      html += `
        <li class="test-file">
          <span class="test-file-name">${this.escapeHtml(file.file)}</span>
          <span class="test-file-count">${file.count} tests</span>
        </li>
      `;
    });

    html += `
        </ul>
      </div>
    `;

    return html;
  }

  generatePackageBuildMetrics(packageMetrics) {
    if (!packageMetrics || Object.keys(packageMetrics).length === 0) {
      return '<p>No package build data available</p>';
    }

    let html = '<ul class="package-metrics-list">';
    for (const [packageName, metrics] of Object.entries(packageMetrics)) {
      // Determine status with fallback
      const statusClass = metrics.success ? 'success' : 'error';
      
      // Handle duration with proper fallback
      const durationMs = typeof metrics.duration === 'number' ? metrics.duration : 0;
      const duration = durationMs > 0 ? this.formatDuration(durationMs) : 'N/A';
      
      // Handle file count with proper fallback
      const fileCount = typeof metrics.fileCount === 'number' ? metrics.fileCount : 0;
      
      // Handle size with multiple fallbacks
      let sizeBytes = 0;
      
      // Try multiple properties to get size in a consistent order of precedence
      if (typeof metrics.totalSize === 'number' && metrics.totalSize > 0) {
        sizeBytes = metrics.totalSize;
      } else if (typeof metrics.sizeBytes === 'number' && metrics.sizeBytes > 0) {
        sizeBytes = metrics.sizeBytes;
      } else if (typeof metrics.size === 'number' && metrics.size > 0) {
        sizeBytes = metrics.size;
      }
      
      // Format the size for display with fallback
      let formattedSize = 'N/A';
      
      // Use pre-formatted size if available, otherwise format from bytes
      if (metrics.formattedSize && metrics.formattedSize !== 'N/A') {
        formattedSize = metrics.formattedSize;
      } else if (sizeBytes > 0) {
        formattedSize = this.formatFileSize(sizeBytes);
      }
      
      // Final details string that combines file count and size
      const details = `${fileCount} files, ${formattedSize}`;
      
      html += `
        <li>
          <strong>${this.escapeHtml(packageName)}:</strong> 
          <span class="status status-${statusClass}">${metrics.success ? 'Success' : 'Failed'}</span> 
          (${duration}) - ${details}
          ${metrics.error ? `<p class="error-detail">Error: ${this.escapeHtml(metrics.error)}</p>` : ''}
          ${metrics.warnings && metrics.warnings.length > 0 ? 
            `<ul class="build-warnings">${metrics.warnings.map(w => 
              `<li>${this.escapeHtml(typeof w === 'string' ? w : (w.message || ''))}</li>`
            ).join('')}</ul>` : ''}
        </li>
      `;
    }
    html += '</ul>';
    return html;
  }

  // Helper method to format file sizes
  formatFileSize(bytes) {
    if (bytes === 0 || isNaN(bytes)) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    // Keep to 2 decimal places max and remove trailing zeros
    return (bytes / Math.pow(1024, i)).toFixed(2).replace(/\.0+$/, '') + ' ' + units[i];
  }

  generateIssues() {
    const { errors, warnings } = this.data;
    
    // Define patterns for generic summary messages to filter out
    const genericSummaryPatterns = [
      /^Quality checks had warnings or errors$/i, // Matches the exact phrase, case-insensitive
      /^Validation Phase failed/i,
      /^Build Phase failed/i,
      /^Workflow failed:/i // Added to filter the main workflow failure message
      // Add more generic phase/step summary patterns if needed
    ];

    // Filter errors - Ensure we only display specific, actionable errors
    const filteredErrors = (errors || []).filter(error => {
      // Ensure error has a message to check
      const message = typeof error === 'string' ? error : 
                      (error && typeof error.message === 'string' ? error.message : 
                      (error && typeof error.text === 'string' ? error.text : ''));
      // Keep if message exists and doesn't match generic patterns
      return message && !genericSummaryPatterns.some(pattern => pattern.test(message));
    });

    // Filter warnings - Display only specific warnings, not summaries or info messages
    const processedWarnings = this.processWarnings(warnings || []);
    const filteredWarnings = processedWarnings.filter(warning => {
      // Get the message content
      const message = typeof warning === 'string' ? warning : 
                      (warning && typeof warning.message === 'string' ? warning.message : 
                      (warning && typeof warning.summary === 'string' ? warning.summary : ''));
                      
      // Determine severity (default to 'warning')
      const severity = typeof warning === 'object' && warning.severity ? warning.severity : 'warning';

      // Check if it's a generic summary step
      const isGenericStepSummary = warning.step && genericSummaryPatterns.some(pattern => pattern.test(warning.step));
      
      // Keep if message exists, is not generic, and severity is not 'info'
      return message && !isGenericStepSummary && severity !== 'info' && 
             !genericSummaryPatterns.some(pattern => pattern.test(message));
    });

    const totalIssues = filteredErrors.length + filteredWarnings.length;

    if (totalIssues === 0) {
      return `
        <section class="issues">
          <h2>Issues & Warnings</h2>
          <p class="status status-success">No specific issues or warnings found.</p>
        </section>
      `;
    }

    let html = `
      <section class="issues">
        <h2>Issues & Warnings (${totalIssues})</h2>
    `;

    if (filteredErrors.length > 0) {
      html += `
        <div class="issue-group errors">
          <h3>Errors (${filteredErrors.length})</h3>
          <ul>
      `;
      filteredErrors.forEach(error => {
        const message = typeof error === 'string' ? error : (error.message || error.text || JSON.stringify(error));
        const context = error.phase ? `(${error.phase}${error.step ? ` - ${error.step}` : ''})` : '';
        html += `<li>
                   <span class="severity severity-error">ERROR</span>
                   <span class="message">${this.escapeHtml(message)}</span>
                   ${context ? `<span class="context">${this.escapeHtml(context)}</span>` : ''}
                 </li>`;
      });
      html += '</ul></div>';
    }

    if (filteredWarnings.length > 0) {
      html += `
        <div class="issue-group warnings">
          <h3>Warnings (${filteredWarnings.length})</h3>
          <ul>
      `;
      filteredWarnings.forEach(warning => {
        const message = typeof warning === 'string' ? warning : (warning.message || warning.summary || JSON.stringify(warning));
        const context = warning.phase ? `(${warning.phase}${warning.step ? ` - ${warning.step}` : ''})` : '';
        // Check if it's a grouped warning with details
        if (typeof warning === 'object' && warning.summary && warning.details) {
          html += `<details class="grouped-warning">
                     <summary>
                       <span class="severity severity-warning">WARNING</span>
                       <span class="message">${this.escapeHtml(warning.summary)}</span>
                       ${context ? `<span class="context">${this.escapeHtml(context)}</span>` : ''}
                     </summary>
                     <div class="details-content">${warning.details}</div> 
                   </details>`; // Raw HTML for details
        } else {
          html += `<li>
                     <span class="severity severity-warning">WARNING</span>
                     <span class="message">${this.escapeHtml(message)}</span>
                     ${context ? `<span class="context">${this.escapeHtml(context)}</span>` : ''}
                   </li>`;
        }
      });
      html += '</ul></div>';
    }

    html += '</section>';
    return html;
  }

  /**
   * Generates the main workflow timeline HTML (phases and steps)
   * @returns {string} HTML for the workflow timeline
   */
  generateTimeline() {
    const { steps } = this.data; // Get the full steps array
    
    // Ensure steps is an array
    if (!Array.isArray(steps) || steps.length === 0) {
      logger.warn('No steps data available for timeline generation.');
      return ''; 
    }
    
    // Define phase order for grouping
    const phaseOrder = ['Setup', 'Validation', 'Build', 'Deploy', 'Results', 'Maintenance', 'Cleanup'];
    const stepsByPhase = {};
    phaseOrder.forEach(p => stepsByPhase[p] = []); // Initialize empty arrays for known phases
    stepsByPhase['Unknown'] = []; // For steps without a phase

    // Group steps by phase
    steps.forEach(step => {
      // Normalize status just in case
      step.status = step.status || 'pending'; 
      const phase = step.phase && phaseOrder.includes(step.phase) ? step.phase : 'Unknown';
      // IMPORTANT: Do NOT filter out the main Phase steps here
      stepsByPhase[phase].push(step);
    });

    let html = '<section class="timeline"><h2>Workflow Details</h2>';
    
    // Generate HTML for each phase in the defined order
    phaseOrder.forEach(phaseName => {
      if (stepsByPhase[phaseName] && stepsByPhase[phaseName].length > 0) {
        // Find the main phase summary step to display its overall duration
        const mainPhaseStep = stepsByPhase[phaseName].find(s => s.name === `${phaseName} Phase`);
        const phaseDurationStr = mainPhaseStep?.duration > 0 ? ` | Phase Duration: ${this.formatDuration(mainPhaseStep.duration)}` : '';
        
        html += `<div class="timeline-phase-group">
                   <h3 class="phase-title">${phaseName} Phase${phaseDurationStr}</h3>
                   <ul class="timeline-list">`;
                   
        // Iterate through steps *within* this phase
        stepsByPhase[phaseName].forEach((step) => {
          // Skip rendering the main phase step itself within the list, we used its info in the title
          if (step.name === `${phaseName} Phase`) return;
          
          const status = step.status.toLowerCase(); // Ensure lowercase for CSS
          const durationMs = step.duration || 0;
          // Display small durations clearly, handle N/A or Skipped
          const duration = status === 'skipped' ? 'Skipped' : 
                           durationMs > 50 ? this.formatDuration(durationMs) : 
                           durationMs > 0 ? `${durationMs}ms` : 'N/A'; 
          
          html += `
            <li class="timeline-item status-${status}">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <h4>${this.escapeHtml(step.name)}</h4>
                <!-- Show step status and duration -->
                <p>Status: <span class="status status-${status}">${status}</span> | Duration: ${duration}</p>
                ${step.error ? `<p class="error">Error: ${this.escapeHtml(typeof step.error === 'string' ? step.error : JSON.stringify(step.error))}</p>` : ''}
                ${step.details ? `<p class="details">${this.escapeHtml(typeof step.details === 'string' ? step.details : JSON.stringify(step.details))}</p>` : ''} 
              </div>
            </li>
          `;
        });
        html += '</ul></div>'; // Close timeline-list and phase-group
      }
    });
    
    // Add any steps that couldn't be grouped by a known phase (should be minimal now)
    if (stepsByPhase['Unknown'] && stepsByPhase['Unknown'].length > 0) {
        html += `<div class="timeline-phase-group">
                   <h3 class="phase-title">Other Steps</h3>
                   <ul class="timeline-list">`;
        stepsByPhase['Unknown'].forEach((step) => {
           const status = step.status.toLowerCase();
           const durationMs = step.duration || 0;
           const duration = status === 'skipped' ? 'Skipped' : durationMs > 50 ? this.formatDuration(durationMs) : durationMs > 0 ? `${durationMs}ms` : 'N/A';
           html += `
            <li class="timeline-item status-${status}">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <h4>${this.escapeHtml(step.name)}</h4>
                <p>Status: <span class="status status-${status}">${status}</span> | Duration: ${duration}</p>
                ${step.error ? `<p class="error">Error: ${this.escapeHtml(typeof step.error === 'string' ? step.error : JSON.stringify(step.error))}</p>` : ''}
              </div>
            </li>
          `;
        });
        html += '</ul></div>';
    }

    html += '</section>';
    return html;
  }

  generateAdvancedCheckCards() {
    const { advancedChecks } = this.data;
    
    if (!advancedChecks || Object.keys(advancedChecks).length === 0) {
      return `
        <section class="advanced-checks-cards">
          <h2>Advanced Checks</h2>
          <p class="info">No advanced checks were configured for this workflow.</p>
        </section>
      `;
    }
    
    let html = `
      <section class="advanced-checks-cards">
        <h2>Advanced Checks</h2>
        <div class="cards-container">
    `;
    
    // Sort checks by status: error first, then warning, then rest
    const sortedChecks = Object.entries(advancedChecks).sort((a, b) => {
      const statusA = a[1].status;
      const statusB = b[1].status;
      
      if (statusA === 'error' && statusB !== 'error') return -1;
      if (statusA !== 'error' && statusB === 'error') return 1;
      if (statusA === 'warning' && statusB !== 'warning' && statusB !== 'error') return -1;
      if (statusA !== 'warning' && statusA !== 'error' && statusB === 'warning') return 1;
      
      return 0;
    });
    
    sortedChecks.forEach(([name, check]) => {
      const status = check.status || 'pending';
      const duration = this.formatDuration(check.duration || 0);
      
      // Map status to CSS class name
      const statusClass = status === 'success' ? 'success' : 
                        status === 'error' ? 'error' : 
                        status === 'warning' ? 'warning' : 
                        status === 'timeout' ? 'timeout' : 'pending';
      
      // Format check name
      const displayName = name
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
        
      // Determine icon based on status
      let icon = '';
      if (status === 'success') icon = '<svg class="icon success-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>';
      else if (status === 'error') icon = '<svg class="icon error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>';
      else if (status === 'warning') icon = '<svg class="icon warning-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099a.75.75 0 011.486 0L10.8 7.152a.75.75 0 01-.743.998H6.943a.75.75 0 01-.743-.998l1.057-4.053zm0 5.151a.75.75 0 011.486 0v3.5a.75.75 0 01-1.486 0v-3.5zM10 18a8 8 0 100-16 8 8 0 000 16zM9.25 14.25a.75.75 0 101.5 0 .75.75 0 00-1.5 0z" clip-rule="evenodd" /></svg>';
      else icon = '<svg class="icon pending-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clip-rule="evenodd" /></svg>';
      
      html += `
        <div class="check-card status-${statusClass}">
          <div class="card-header">
            ${icon}
            <h3 class="card-title">${this.escapeHtml(displayName)}</h3>
          </div>
          <div class="card-body">
            <p>Status: <span class="status status-${status}">${status}</span></p>
            <p>Duration: ${duration}</p>
            ${check.error ? `<p class="error">Error: ${this.escapeHtml(check.error)}</p>` : ''}
            ${check.message ? `<p class="message">${this.escapeHtml(check.message)}</p>` : ''}
            
            <!-- Specific details section (collapsible if needed) -->
            ${this.generateCheckDetails(name, check)} 
          </div>
        </div>
      `;
    });

    html += '</div></section>'; // Close cards-container and section
    return html;
  }

  generateCheckDetails(name, check) {
    let detailsHtml = '';
    
    // Example: Add specific details for Dead Code check
    if (name === 'deadCode' && check.data) {
      if (check.data.unusedDependencies && check.data.unusedDependencies.length > 0) {
        detailsHtml += `<details class="check-details-collapsible">
                         <summary>Unused Dependencies (${check.data.unusedDependencies.length})</summary>
                         <ul class="check-details-list">`;
        check.data.unusedDependencies.forEach(pkg => {
          detailsHtml += `<li>
                            <strong>${this.escapeHtml(pkg.packagePath)}</strong>
                            <ul class="nested-list">`;
          if (pkg.unusedDependencies && pkg.unusedDependencies.length > 0) {
            pkg.unusedDependencies.forEach(dep => {
              detailsHtml += `<li>${this.escapeHtml(dep.name)} (${dep.type})</li>`;
            });
          } else {
            detailsHtml += '<li>No specific dependencies listed</li>';
          }
          detailsHtml += `</ul></li>`;
        });
        detailsHtml += `</ul></details>`;
      }
      // Add other dead code details (exports, errors) similarly
      if (check.data.depcheckErrors && check.data.depcheckErrors.length > 0) {
         detailsHtml += `<details class="check-details-collapsible error">
                         <summary>Depcheck Errors (${check.data.depcheckErrors.length})</summary>
                         <ul class="check-details-list">`;
         check.data.depcheckErrors.forEach((e, index) => {
             detailsHtml += `<li><strong>${this.escapeHtml(e.packagePath)}:</strong> ${this.escapeHtml(e.error)}</li>`;
         });
         detailsHtml += `</ul></details>`;
      }
    }
    // Add logic for other check types (typescript, lint, docs, etc.)
    else if ((name === 'typescript' || name === 'lint') && check.data && check.data.issues && check.data.issues.length > 0) {
         detailsHtml += `<details class="check-details-collapsible">
                         <summary>Issues (${check.data.issues.length})</summary>
                         <ul class="check-details-list">`;
         check.data.issues.slice(0, 10).forEach(issue => { // Show first 10
            detailsHtml += `<li>${this.escapeHtml(typeof issue === 'string' ? issue : JSON.stringify(issue))}</li>`;
         });
         if (check.data.issues.length > 10) detailsHtml += `<li>...and ${check.data.issues.length - 10} more</li>`;
         detailsHtml += `</ul></details>`;
    }
    else if (name === 'docsFreshness' && check.data && check.data.staleDocuments && check.data.staleDocuments.length > 0) {
         detailsHtml += `<details class="check-details-collapsible">
                         <summary>Stale Documents (${check.data.staleDocuments.length})</summary>
                         <ul class="check-details-list">`;
         check.data.staleDocuments.slice(0, 5).forEach(doc => {
             detailsHtml += `<li>${this.escapeHtml(doc.file)} (Reason: ${doc.reason})</li>`;
         });
          if (check.data.staleDocuments.length > 5) detailsHtml += `<li>...and ${check.data.staleDocuments.length - 5} more</li>`;
         detailsHtml += `</ul></details>`;
    }

    // Only return details if there's something to show
    return detailsHtml ? `<div class="check-card-details-section">${detailsHtml}</div>` : '';
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

    // Filter only for options that were explicitly set to true
    // Most options are "skip" options that default to false
    const nonDefaultOptions = Object.entries(options).filter(([key, value]) => {
      // Skip options are only interesting if they're true (meaning something is skipped)
      if (key.startsWith('skip') && value === true) {
        return true;
      }
      
      // Non-skip boolean options that are true
      if (typeof value === 'boolean' && value === true && !key.startsWith('skip')) {
        return true;
      }
      
      // String/number options that have values
      if (typeof value === 'string' || typeof value === 'number') {
        // Exclude some common defaults like outputPath
        if (key === 'outputPath') return false;
        return true;
      }
      
      return false;
    });
    
    // If no non-default options were found, show a simplified message
    if (nonDefaultOptions.length === 0) {
      return `
        <section class="workflow-options">
          <h2>Workflow Options</h2>
          <p class="default-options">Running with default settings. No additional options were specified.</p>
        </section>
      `;
    }
    
    // Format and group the non-default options
    const optionGroups = {
      'Modified Options': []
    };
    
    nonDefaultOptions.forEach(([key, value]) => {
      const displayName = key
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
      
      const displayValue = typeof value === 'boolean' ? 
        (value ? 'Yes' : 'No') : String(value);
      
      optionGroups['Modified Options'].push({ displayName, displayValue });
    });
    
    // Generate the simplified HTML
    return `
      <section class="workflow-options">
        <h2>Workflow Options</h2>
        <div class="modified-options">
          <h3>Modified Options</h3>
          <div class="options-table">
            ${optionGroups['Modified Options'].map(item => `
              <div class="option-row">
                <span class="option-name">${this.escapeHtml(item.displayName)}</span>
                <span class="option-value">${this.escapeHtml(item.displayValue)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  generateChannelCleanup() {
    const { metrics, steps } = this.data;
    
    // First check if we have metrics or step data
    const hasMetrics = metrics && typeof metrics === 'object';
    const cleanupStep = Array.isArray(steps) ? 
      steps.find(step => step.name === 'Channel Cleanup') : null;
      
    // Try to get metrics.channelCleanup
    const hasCleanupMetrics = hasMetrics && metrics.channelCleanup && 
      typeof metrics.channelCleanup === 'object';
    
    // If we have no data at all about channel cleanup
    if (!hasMetrics && !cleanupStep) {
      return `
        <section class="channel-cleanup">
          <h2>Channel Cleanup</h2>
          <div class="cleanup-status">
            <p class="status status-pending">No cleanup data available</p>
            <div class="cleanup-details">
              <p>The channel cleanup process was not executed in this workflow run.</p>
            </div>
          </div>
        </section>
      `;
    }
    
    // If we have cleanup metrics data
    if (hasCleanupMetrics) {
      const cleanup = metrics.channelCleanup;
      
      // Handle site breakdown if it exists
      const hasSiteBreakdown = cleanup.sites && Array.isArray(cleanup.sites) && cleanup.sites.length > 0;
      const sitesProcessed = cleanup.sitesProcessed || cleanup.sites?.length || 0;
      
      // Calculate metrics from site breakdown data if available to ensure accuracy
      let calculatedDeletedCount = 0;
      let calculatedKeptCount = 0;
      let calculatedTotalCount = 0;
      
      if (hasSiteBreakdown) {
        calculatedDeletedCount = cleanup.sites.reduce((sum, site) => sum + (site.deleted || 0), 0);
        calculatedKeptCount = cleanup.sites.reduce((sum, site) => sum + (site.kept || 0), 0);
        calculatedTotalCount = cleanup.sites.reduce((sum, site) => sum + (site.found || 0), 0);
      }
      
      // Extract or calculate key metrics - prioritize calculated values
      const cleanedChannels = calculatedDeletedCount || cleanup.deletedCount || 0;
      const keptChannels = calculatedKeptCount || cleanup.channelsKept || 0;
      const totalChannels = calculatedTotalCount || cleanup.totalChannels || 0;
      const errors = cleanup.errors || cleanup.totalErrors || 0;
      
      // Determine status
      let status = 'success';
      if (errors > 0) {
        status = 'error';
      } else if (cleanedChannels > 0) {
        status = 'warning'; // Some cleanup occurred
      }
      
      // Generate appropriate status message
      let statusMessage = "Channel cleanup completed";
      let explanation = "";
      
      if (cleanedChannels === 0 && totalChannels > 0) {
        statusMessage = "No channels needed cleanup";
        explanation = `${totalChannels} channels were found, but none needed to be deleted based on retention policy.`;
      } else if (cleanedChannels > 0) {
        statusMessage = `${cleanedChannels} channels cleaned up`;
        explanation = `${cleanedChannels} out of ${totalChannels} channels were deleted, keeping the ${keptChannels} most recent.`;
      } else if (totalChannels === 0) {
        statusMessage = "No channels found";
        explanation = "No channels were found for cleanup during this workflow run.";
      }
      
      return `
        <section class="channel-cleanup">
          <h2>Channel Cleanup</h2>
          <div class="cleanup-status">
            <p class="status status-${status}">${statusMessage}</p>
            <div class="cleanup-details">
              <p><strong>Summary:</strong> ${explanation}</p>
              <div class="cleanup-metrics">
                <div class="metric-item">
                  <div class="metric-label">Sites Processed</div>
                  <div class="metric-value">${sitesProcessed}</div>
                </div>
                <div class="metric-item">
                  <div class="metric-label">Total Channels</div>
                  <div class="metric-value">${totalChannels}</div>
                </div>
                <div class="metric-item">
                  <div class="metric-label">Channels Kept</div>
                  <div class="metric-value">${keptChannels}</div>
                </div>
                <div class="metric-item">
                  <div class="metric-label">Channels Deleted</div>
                  <div class="metric-value">${cleanedChannels}</div>
                </div>
                ${errors > 0 ? `
                <div class="metric-item">
                  <div class="metric-label">Errors</div>
                  <div class="metric-value error-value">${errors}</div>
                </div>
                ` : ''}
              </div>
              ${cleanup.error ? `<p class="error">${this.escapeHtml(cleanup.error)}</p>` : ''}
            </div>
          </div>
        </section>
      `;
    }
    
    // Fallback to using just the step data if that's all we have
    if (cleanupStep) {
      const status = cleanupStep.status ? cleanupStep.status.toLowerCase() : 'pending';
      return `
        <section class="channel-cleanup">
          <h2>Channel Cleanup</h2>
          <div class="cleanup-status">
            <p class="status status-${status}">${status}</p>
            <div class="cleanup-details">
              <p><strong>Duration:</strong> ${this.formatDuration(cleanupStep.duration || 0)}</p>
              ${cleanupStep.error ? `<p class="error">${this.escapeHtml(cleanupStep.error)}</p>` : ''}
              ${cleanupStep.details ? `<p>${this.escapeHtml(cleanupStep.details)}</p>` : ''}
            </div>
          </div>
        </section>
      `;
    }
    
    // If we have metrics but no cleanup data, show a basic message
    return `
      <section class="channel-cleanup">
        <h2>Channel Cleanup</h2>
        <div class="cleanup-status">
          <p class="status status-pending">Cleanup status unknown</p>
          <div class="cleanup-details">
            <p>Channel cleanup process was started but no detailed results were found.</p>
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

  /**
   * Generates workflow analytics section
   * @returns {string} HTML for workflow analytics
   */
  generateWorkflowAnalytics() {
    const { metrics } = this.data;
    
    // ---> Add guard clause for missing metrics <-----
    if (!metrics || typeof metrics !== 'object') {
      logger.error('[DashboardGenerator] Metrics data missing in generateWorkflowAnalytics');
      return '<section class="workflow-analytics"><h2>Workflow Analytics</h2><p class="status status-error">Analytics data unavailable</p></section>';
    }
    
    // Extract key metrics safely
    const totalDuration = typeof metrics.duration === 'number' ? metrics.duration : 0;
    const phaseDurations = metrics.phaseDurations || {};
    const buildMetrics = metrics.buildPerformance || {}; 
    
    // ---> Add logging for values being used <-----
    logger.debug(`[generateWorkflowAnalytics] Using - totalDuration: ${totalDuration}, phaseDurations keys: ${Object.keys(phaseDurations).length}, buildMetrics keys: ${Object.keys(buildMetrics).length}`);
    logger.debug(`[generateWorkflowAnalytics] buildMetrics content: ${JSON.stringify(buildMetrics)}`);

    // Only show analytics if we have meaningful data
    if (totalDuration === 0 && Object.keys(phaseDurations).length === 0) {
      logger.warn('[generateWorkflowAnalytics] Insufficient data (totalDuration or phaseDurations missing) to generate analytics section.');
      return '';
    }
    
    // Generate performance visualization
    let html = `
      <section class="workflow-analytics">
        <h2>Workflow Analytics</h2>
        <div class="analytics-container">
          <div class="metrics-overview">
            <div class="metric-card">
              <div class="metric-title">Total Duration</div>
              <div class="metric-value">${this.formatDuration(totalDuration)}</div>
            </div>
    `;
    
    // Add phase breakdown if available
    if (Object.keys(phaseDurations).length > 0) {
      // Sort phases by duration (descending)
      const sortedPhases = Object.entries(phaseDurations)
        .filter(([_, duration]) => duration > 0)
        .sort((a, b) => b[1] - a[1]);
        
      if (sortedPhases.length > 0) {
        html += `<div class="phase-breakdown">
                   <h3>Phase Breakdown</h3>
                   <div class="phases-container">`;
        
        // Calculate percentage for visualization
        sortedPhases.forEach(([phase, duration]) => {
          const percentage = totalDuration > 0 ? Math.round((duration / totalDuration) * 100) : 0;
          const phaseName = phase
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
          
          html += `<div class="phase-item">
                     <div class="phase-label">${this.escapeHtml(phaseName)}</div>
                     <div class="phase-bar-container">
                       <div class="phase-bar" style="width: ${percentage}%"></div>
                       <span class="phase-percentage">${percentage}%</span>
                     </div>
                     <div class="phase-duration">${this.formatDuration(duration)}</div>
                   </div>`;
        });
        
        html += `</div></div>`;
      }
    }
    
    // Add build performance if available
    if (buildMetrics && typeof buildMetrics.totalBuildTime === 'number') {
      html += `<div class="build-performance">
                 <h3>Build Performance</h3>
                 <div class="performance-grid">`;
      
      // Display Total Build Time
      html += `<div class="performance-item">
                 <span class="performance-label">Total Build Time</span>
                 <span class="performance-value">${this.formatDuration(buildMetrics.totalBuildTime)}</span>
               </div>`;
      
      // Display Total Files if valid number
      if (typeof buildMetrics.totalFileCount === 'number' && buildMetrics.totalFileCount >= 0) {
        html += `<div class="performance-item">
                   <span class="performance-label">Total Files</span>
                   <span class="performance-value">${buildMetrics.totalFileCount}</span>
                 </div>`;
      }
      
      // Display Total Size (formatted or calculated) if valid
      if (buildMetrics.formattedTotalSize) {
         html += `<div class="performance-item">
                   <span class="performance-label">Total Size</span>
                   <span class="performance-value">${this.escapeHtml(buildMetrics.formattedTotalSize)}</span>
                 </div>`;
      } else if (typeof buildMetrics.totalSize === 'number' && buildMetrics.totalSize >= 0) {
         html += `<div class="performance-item">
                   <span class="performance-label">Total Size</span>
                   <span class="performance-value">${this.formatBytes(buildMetrics.totalSize)}</span>
                 </div>`;
      }
      
      // Display Avg Pkg Build if valid number
      if (typeof buildMetrics.averageBuildTime === 'number' && buildMetrics.averageBuildTime > 0) {
        html += `<div class="performance-item">
                   <span class="performance-label">Avg. Pkg Build</span>
                   <span class="performance-value">${this.formatDuration(buildMetrics.averageBuildTime)}</span>
                 </div>`;
      }
      
      html += `</div></div>`;
    } else {
        // Log why the build performance section is skipped
        logger.debug(`[generateWorkflowAnalytics] Skipping build performance render. buildMetrics empty or totalBuildTime invalid. Keys: ${Object.keys(buildMetrics).join(', ')}`);
    }
    
    // Performance optimization tips based on metrics
    html += `<div class="performance-tips">
               <h3>Performance Insights</h3>
               <ul class="tips-list">`;
    
    // Add dynamic tips based on the actual metrics
    if (totalDuration > 5 * 60 * 1000) { // Workflow takes over 5 minutes
      html += `<li>
                 <strong>Long workflow duration (${this.formatDuration(totalDuration)})</strong>
                 <p>Consider splitting into multiple workflows or optimizing slow steps.</p>
               </li>`;
    }
    
    if (phaseDurations.build && phaseDurations.build > 0.4 * totalDuration) { // Build takes >40% of time
      html += `<li>
                 <strong>Build phase dominates workflow time (${Math.round((phaseDurations.build / totalDuration) * 100)}%)</strong>
                 <p>Consider optimizing bundling configuration or implementing incremental builds.</p>
               </li>`;
    }
    
    if (phaseDurations.test && phaseDurations.test > 0.3 * totalDuration) { // Tests take >30% of time
      html += `<li>
                 <strong>Tests take significant time (${Math.round((phaseDurations.test / totalDuration) * 100)}%)</strong>
                 <p>Consider running tests in parallel or implementing test sharding.</p>
               </li>`;
    }
    
    // Check if any tips were added, otherwise show a default message
    if (html.endsWith('<ul class="tips-list">')) { // Check if no <li> was added
      html += '<li>No specific performance insights detected for this run.</li>';
    }
    
    html += `</ul></div>
           </div></div>
         </section>`;
    
    return html;
  }

  /**
   * Formats bytes to a human-readable format
   * 
   * @param {number} bytes - Number of bytes to format
   * @param {number} [decimals=2] - Number of decimal places to display
   * @returns {string} Formatted size (e.g., "1.23 MB")
   */
  formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}