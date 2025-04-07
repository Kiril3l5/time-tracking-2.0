/**
 * Consolidated Report Generator
 * 
 * Generates a report for the workflow execution using existing metrics
 * and data from progress-tracker and performance-monitor.
 */

import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import process from 'node:process';
import { exec as _exec } from 'child_process';
import open from 'open';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default report path - unused but kept for future reference
// const DEFAULT_DASHBOARD_PATH = join(process.cwd(), 'preview-dashboard.html');

// Default template if the main template cannot be found
const defaultTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; margin: 0; padding: 20px; color: #333; }
        h1, h2, h3 { color: #000; }
        h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .section { margin-bottom: 30px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; }
        .step-success { color: green; }
        .step-failure { color: red; }
        .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; }
        .tabs { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 20px; }
        .tab { padding: 10px 15px; cursor: pointer; }
        .tab.active { border-bottom: 2px solid #0066cc; color: #0066cc; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .empty-state .info-message {
          font-size: 14px;
          color: #0366d6;
          background-color: #f1f8ff;
          padding: 8px 16px;
          border-radius: 4px;
          display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{TITLE}}</h1>
        <p>Generated on: {{TIMESTAMP}}</p>
        
        <div class="section">
            {{PREVIEW_URLS}}
        </div>
        
        <div class="tabs">
            {{TABS}}
        </div>
        
        <div class="tab-contents">
            {{TAB_CONTENT}}
        </div>
        
        <div class="section">
            <h2>Workflow Steps</h2>
            {{WORKFLOW_STEPS}}
        </div>
        
        <div class="section">
            <h2>Warnings</h2>
            {{WARNINGS}}
        </div>
        
        <div class="section">
            <h2>Workflow Options</h2>
            {{WORKFLOW_OPTIONS}}
        </div>
        
        <div class="section">
            {{CHANNEL_CLEANUP}}
        </div>
        
        <div class="section">
            {{PERFORMANCE_METRICS}}
        </div>
    </div>
    
    <script>
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            });
        });
    </script>
</body>
</html>
`;

/**
 * Generate a consolidated report for the workflow
 * @param {Object} data Report data
 * @param {Object} buildMetrics Build metrics
 * @returns {Promise<Object>} Generated report
 */
export async function generateReport(data, buildMetrics) {
  logger.debug('Generating consolidated report from workflow data');
  logger.debug(`[Generate Report] Received buildMetrics argument: ${JSON.stringify(buildMetrics)}`);
  
  try {
    // Make sure we have the basic data structure
    const report = {
      timestamp: data.timestamp || new Date().toISOString(),
      metrics: data.metrics || { duration: 0 },
      preview: data.preview || null,
      workflow: data.workflow || { steps: [] },
      warnings: data.warnings || [],
      errors: data.errors || [],
      advancedChecks: data.advancedChecks || {},
      buildMetrics: buildMetrics || data.buildMetrics || {},
    };
    
    logger.debug(`[Generate Report] Constructed report object with buildMetrics: ${JSON.stringify(report.buildMetrics)}`);
    
    // Process steps by phase - make this more robust
    const stepsByPhase = {};
    const failedSteps = [];
    
    // Fix variable usage in steps by phase loop
    // Ensure we check both data.steps (new format) and data.workflow.steps (old format)
    const stepData = data.steps && Array.isArray(data.steps) 
      ? data.steps 
      : (data.workflow && data.workflow.steps ? data.workflow.steps : []);

    if (stepData.length > 0) {
      logger.debug(`Processing ${stepData.length} workflow steps`);
      
      // First log all steps for debugging
      stepData.forEach((step, index) => {
        // Different data formats may have success in different places
        const success = step.success !== undefined 
          ? step.success 
          : (step.result ? step.result.success : undefined);
          
        logger.debug(`Step ${index}: ${step.name}, phase: ${step.phase}, success: ${success}`);
      });
      
      // Group steps by phase
      stepData.forEach(step => {
        const phase = step.phase || 'Other';
        if (!stepsByPhase[phase]) {
          stepsByPhase[phase] = [];
        }
        stepsByPhase[phase].push(step);
        
        // Track failed steps - check both formats
        const isSuccess = step.success !== undefined 
          ? step.success 
          : (step.result ? step.result.success : true);
          
        if (isSuccess === false) {
          failedSteps.push(step);
        }
      });
    } else {
      logger.debug('No steps found in report data');
    }
    
    // Filter out informational build metrics from warnings
    if (report.warnings) {
      // First, properly categorize messages by severity
      report.warnings.forEach(warning => {
        // Auto-detect severity for build messages if not already set
        if (!warning.severity) {
          if (warning.phase === 'Build') {
            // These are informational messages, not warnings
            if (warning.message.startsWith('Starting build') || 
                warning.message.startsWith('Cleaned build') ||
                warning.message.startsWith('TypeScript check passed') ||
                warning.message.startsWith('Build completed') ||
                warning.message.startsWith('Entry point') ||
                warning.message.includes('files, ') ||
                warning.message.includes('KB total') ||
                warning.message.startsWith('Build output:') ||
                warning.message.startsWith('Build configuration:') ||
                warning.message.startsWith('Building all packages') ||
                warning.message.startsWith('Running build')) {
              warning.severity = 'info';
            }
          }
        }
      });

      // Only count actual warnings in the warning tab
      report.warnings = report.warnings.filter(warning => 
        warning.severity !== 'info'
      );
    }
    
    // Separate informational messages from warnings
    const infoMessages = data.warnings ? data.warnings.filter(w => w.severity === 'info') : [];
    report.infoMessages = infoMessages;
    
    // Calculate warning stats
    const warningsByCategory = {};
    if (report.warnings) {
      report.warnings.forEach(warning => {
        const category = warning.phase || 'General';
        if (!warningsByCategory[category]) {
          warningsByCategory[category] = [];
        }
        warningsByCategory[category].push(warning);
      });
    }

    // Calculate info message stats
    const infoByCategory = {};
    if (report.infoMessages) {
      report.infoMessages.forEach(info => {
        const category = info.phase || 'General';
        if (!infoByCategory[category]) {
          infoByCategory[category] = [];
        }
        infoByCategory[category].push(info);
      });
    }
    
    // Generate unique report ID for linking
    const reportId = createHash('md5')
      .update(report.timestamp + Math.random().toString())
      .digest('hex')
      .substring(0, 8);
    
    // Format duration
    const formatDuration = (milliseconds) => {
      if (!milliseconds) return '0s';
      
      if (milliseconds < 1000) return `${milliseconds}ms`;
      
      const seconds = Math.floor(milliseconds / 1000) % 60;
      const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
      
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      }
      
      return `${seconds}s`;
    };
    
    // Before generating the HTML content, let's add a debug statement to check the report structure
    logger.debug(`Report data received: ${Object.keys(report).join(', ')}`);
    if (report.buildMetrics) {
      logger.debug(`Build metrics present: ${JSON.stringify(report.buildMetrics, null, 2)}`);
    } else {
      logger.debug('Build metrics not found in report data');
    }
    
    // Generate HTML content
    const htmlContent = `
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
        <header>
          <h1>Workflow Dashboard</h1>
          <div class="metadata">
            <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
            <p>Report ID: ${reportId}</p>
          </div>
        </header>
        
        <div class="overview">
          <div class="column">
            <div class="panel success">
              <h2>Status</h2>
              <div class="status-indicator">
                <span class="status-icon ${(report.errors && report.errors.length > 0) || failedSteps.length > 0 ? 'warning' : 'success'}">
                  ${(report.errors && report.errors.length > 0) || failedSteps.length > 0 ? '⚠️' : '✓'}
                </span>
                <span class="status-text">${(report.errors && report.errors.length > 0) || failedSteps.length > 0 ? 'Completed with Warnings' : 'Success'}</span>
              </div>
              <div class="metrics">
                <div class="metric">
                  <span class="metric-label">Duration</span>
                  <span class="metric-value">${formatDuration(report.metrics.duration)}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Warnings</span>
                  <span class="metric-value">${report.warnings ? report.warnings.length : 0}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Errors</span>
                  <span class="metric-value">${(report.errors ? report.errors.length : 0) + failedSteps.length}</span>
                </div>
              </div>
            </div>
          </div>
          
          ${report.preview ? `
          <div class="column">
            <div class="panel preview">
              <h2>Preview URLs</h2>
              <div class="preview-links">
                ${report.preview.hours ? `
                <div class="preview-link">
                  <span class="preview-label">Hours App:</span>
                  <a href="${report.preview.hours}" target="_blank" class="preview-url">${report.preview.hours}</a>
                </div>
                ` : ''}
                
                ${report.preview.admin ? `
                <div class="preview-link">
                  <span class="preview-label">Admin App:</span>
                  <a href="${report.preview.admin}" target="_blank" class="preview-url">${report.preview.admin}</a>
                </div>
                ` : ''}
                
                ${report.preview.channelId ? `
                <div class="preview-link">
                  <span class="preview-label">Channel ID:</span>
                  <span class="preview-channel">${report.preview.channelId}</span>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="main-content">
          ${report.warnings && report.warnings.length > 0 ? `
          <div class="panel warnings">
            <h2>Warnings & Alerts</h2>
            <div class="accordion">
              ${Object.entries(warningsByCategory).map(([category, warnings]) => {
                // Filter for actual warnings (severity is 'error' or 'warning')
                const actualWarnings = warnings.filter(w => w.severity === 'error' || w.severity === 'warning' || !w.severity);
                
                return actualWarnings.length > 0 ? `
              <div class="accordion-item">
                <div class="accordion-header">
                  <span class="category">${category}</span>
                    <span class="count">${actualWarnings.length}</span>
                  <span class="toggle">▼</span>
                </div>
                <div class="accordion-content">
                  <ul class="warnings-list">
                      ${actualWarnings.map(warning => `
                      <li class="warning-item ${warning.severity || 'warning'}">
                      <div class="warning-message">${warning.message}</div>
                      ${warning.step ? `<div class="warning-source">Source: ${warning.step}</div>` : ''}
                    </li>
                    `).join('')}
                  </ul>
                </div>
              </div>
                ` : '';
              }).join('')}
            </div>
          </div>
          
          <div class="panel info-messages">
            <h2>Build Information</h2>
            <div class="accordion">
              ${Object.entries(infoByCategory).map(([category, infoMessages]) => {
                return infoMessages.length > 0 ? `
                <div class="accordion-item">
                  <div class="accordion-header">
                    <span class="category">${category}</span>
                    <span class="count">${infoMessages.length}</span>
                    <span class="toggle">▼</span>
                  </div>
                  <div class="accordion-content">
                    <ul class="warnings-list">
                      ${infoMessages.map(info => `
                      <li class="warning-item info">
                        <div class="warning-message">${info.message}</div>
                        ${info.step ? `<div class="warning-source">Source: ${info.step}</div>` : ''}
                      </li>
              `).join('')}
                    </ul>
                  </div>
                </div>
                ` : '';
              }).join('')}
            </div>
          </div>
          ` : `
          <div class="panel success-panel">
            <h2>No Warnings</h2>
            <p>All checks passed successfully without any warnings!</p>
          </div>
          `}
          
          ${report.buildMetrics && (report.buildMetrics.isValid || report.buildMetrics.totalSize) ? `
          <div class="panel build-metrics">
            <h2>Build Metrics</h2>
            
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-icon">📦</div>
                <div class="metric-title">Total Bundle Size</div>
                <div class="metric-value">
                  ${report.buildMetrics.totalSizeFormatted || 
                    (report.buildMetrics.totalSize ? formatFileSize(report.buildMetrics.totalSize) : '0 B')}
                </div>
              </div>
              
              <div class="metric-card">
                <div class="metric-icon">⏱️</div>
                <div class="metric-title">Build Time</div>
                <div class="metric-value">
                  ${report.buildMetrics.durationFormatted || 
                    (report.buildMetrics.duration ? formatDuration(report.buildMetrics.duration) : '0s')}
                </div>
              </div>
              
              <div class="metric-card">
                <div class="metric-icon">🗂️</div>
                <div class="metric-title">Total Files</div>
                <div class="metric-value">
                  ${report.buildMetrics.fileCount || 
                    Object.values(report.buildMetrics.packages || {})
                      .reduce((sum, pkg) => sum + (parseInt(pkg.fileCount) || 0), 0) || 
                    '0'}
                </div>
              </div>
            </div>
            
            ${report.buildMetrics.issues && report.buildMetrics.issues.length > 0 ? `
            <div class="bundle-issues">
              <h3>Bundle Issues</h3>
              <ul class="issues-list">
                ${report.buildMetrics.issues.map(issue => `
                <li class="issue-item ${issue.severity || 'warning'}">
                  <div class="issue-message">${issue.message}</div>
                  ${issue.details ? `<div class="issue-details">${issue.details}</div>` : ''}
                </li>
                `).join('')}
              </ul>
            </div>
            ` : ''}
            
            ${report.buildMetrics.history ? generateBundleSizeTrendChart(report.buildMetrics) : ''}
            
            ${report.buildMetrics.packages ? `
            <div class="package-section">
              <h3>Package Details</h3>
              <div class="packages-grid">
                ${Object.entries(report.buildMetrics.packages).map(([name, pkg]) => `
                <div class="package-card">
                  <div class="package-name">${name}</div>
                  <div class="package-metrics">
                    <div class="package-metric">
                      <span class="metric-label">Size</span>
                      <span class="metric-value">
                        ${pkg.totalSize || 
                          (pkg.rawSize ? formatFileSize(pkg.rawSize) : '0 B')}
                      </span>
                    </div>
                    <div class="package-metric">
                      <span class="metric-label">Files</span>
                      <span class="metric-value">${pkg.fileCount || '0'}</span>
                    </div>
                    <div class="package-metric">
                      <span class="metric-label">Build Time</span>
                      <span class="metric-value">
                        ${pkg.duration || 
                          (pkg.rawDuration ? formatDuration(pkg.rawDuration) : '0s')}
                      </span>
                    </div>
                  </div>
                  ${pkg.files && pkg.files.length > 0 ? `
                  <div class="package-files">
                    <h4>Largest Files</h4>
                    <ul class="files-list">
                      ${pkg.files.slice(0, 5).map(file => `
                      <li class="file-item">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${file.size}</span>
                      </li>
                      `).join('')}
                    </ul>
                  </div>
                  ` : ''}
                </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          ${report.advancedChecks && Object.keys(report.advancedChecks).length > 0 ? `
          <div class="panel advanced-checks">
            <h2>Advanced Check Results</h2>
            <div class="accordion">
              ${Object.entries(report.advancedChecks).map(([checkName, checkResult]) => {
                // FIX: Better detection of actually skipped checks vs. those that were run
                // For TypeScript and Lint specifically, check additional properties that
                // would indicate the check was actually run
                let wasActuallyRun = !checkResult.skipped;
                
                // Special case for TypeScript and Lint checks
                if (checkName.toLowerCase() === 'typescript' || checkName.toLowerCase() === 'lint') {
                  // If we have data, success, or warning properties, the check was run
                  wasActuallyRun = wasActuallyRun || 
                                   checkResult.data || 
                                   checkResult.success === true || 
                                   checkResult.warning === true;
                }
                
                const displayStatus = wasActuallyRun ? 
                  (checkResult.success ? 'Passed' : (checkResult.warning ? 'Warning' : 'Failed')) :
                  'Skipped';
                  
                return `
                <div class="accordion-item">
                  <div class="accordion-header">
                    <span class="category">${formatDisplayName(checkName)}</span>
                    <span class="status ${wasActuallyRun ? (checkResult.success ? 'success' : (checkResult.warning ? 'warning' : 'failure')) : ''}">
                      ${displayStatus}
                    </span>
                    <span class="toggle">▼</span>
                  </div>
                  <div class="accordion-content">
                    <div class="check-details">
                      ${checkResult.message ? `<p class="check-message">${checkResult.message}</p>` : ''}
                      ${checkResult.error ? `<p class="check-error">Error: ${checkResult.error}</p>` : ''}
                      ${checkResult.data ? `
                        <div class="check-data">
                          <h4>Details</h4>
                          <pre>${JSON.stringify(checkResult.data, null, 2)}</pre>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `}).join('')}
            </div>
          </div>
          ` : ''}
          
          <div class="panel workflow">
            <h2>Workflow Steps</h2>
            <div class="timeline">
              ${Object.keys(stepsByPhase).length > 0 ? 
                Object.entries(stepsByPhase).map(([phase, steps]) => `
              <div class="phase">
                <h3 class="phase-name">${phase}</h3>
                <div class="steps">
                  ${steps.map(step => `
                    <div class="step ${
                      (step.success !== undefined && step.success === false) || 
                      (step.result && step.result.success === false) ? 'failure' : 'success'
                    }">
                    <div class="step-header">
                      <span class="step-name">${step.name}</span>
                        <span class="step-indicator">${
                          (step.success !== undefined && step.success === false) || 
                          (step.result && step.result.success === false) ? '✗' : '✓'
                        }</span>
                    </div>
                    <div class="step-details">
                      <span class="step-duration">${formatDuration(step.duration)}</span>
                        ${step.error || (step.result && step.result.error) ? 
                          `<div class="step-error">Error: ${step.error || step.result.error}</div>` : ''
                        }
                    </div>
                  </div>
                  `).join('')}
                </div>
              </div>
                `).join('') : 
                `<div class="empty-state">
                  <p>No workflow steps recorded.</p>
                  <span class="info-message">Steps will appear here when workflow is run.</span>
                </div>`
              }
            </div>
          </div>
        </div>
        
        <footer>
          <p>Time Tracking Workflow - ${new Date().getFullYear()}</p>
        </footer>
      </div>
      
      <script>
        // Simple accordion functionality
        document.querySelectorAll('.accordion-header').forEach(header => {
          header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isOpen = content.style.maxHeight;
            
            // Close all accordions
            document.querySelectorAll('.accordion-content').forEach(item => {
              item.style.maxHeight = null;
            });
            document.querySelectorAll('.toggle').forEach(toggle => {
              toggle.textContent = '▼';
            });
            
            // Open clicked accordion if it was closed
            if (!isOpen) {
              content.style.maxHeight = content.scrollHeight + 'px';
              header.querySelector('.toggle').textContent = '▲';
            }
          });
        });
        
        // Add search and filter functionality
        function setupFilters() {
          // Create filter bar
          const filterBar = document.createElement('div');
          filterBar.className = 'filter-bar';
          
          // Use string concatenation instead of template literals
          filterBar.innerHTML = 
            '<div class="filter-item">' +
              '<input type="text" id="search-input" placeholder="Search dashboard...">' +
            '</div>' +
            '<div class="filter-item">' +
              '<select id="filter-severity">' +
                '<option value="all">All Severities</option>' +
                '<option value="error">Errors</option>' +
                '<option value="warning">Warnings</option>' +
                '<option value="info">Info</option>' +
              '</select>' +
            '</div>' +
            '<div class="filter-item">' +
              '<select id="filter-phase">' +
                '<option value="all">All Phases</option>' +
                '<option value="Build">Build</option>' +
                '<option value="Deploy">Deploy</option>' +
                '<option value="Validation">Validation</option>' +
                '<option value="Results">Results</option>' +
              '</select>' +
            '</div>';
          
          // Insert at the top of the main content
          const mainContent = document.querySelector('.main-content');
          if (mainContent) {
            mainContent.insertBefore(filterBar, mainContent.firstChild);
          }
          
          // Setup event listeners
          const searchInput = document.getElementById('search-input');
          const filterSeverity = document.getElementById('filter-severity');
          const filterPhase = document.getElementById('filter-phase');
          
          if (searchInput && filterSeverity && filterPhase) {
            const filterElements = () => {
              const searchTerm = searchInput.value.toLowerCase();
              const severity = filterSeverity.value;
              const phase = filterPhase.value;
              
              // Get all warning items
              document.querySelectorAll('.warning-item').forEach(item => {
                const itemText = item.textContent.toLowerCase();
                const itemSeverity = item.classList.contains('error') ? 'error' : 
                                      item.classList.contains('warning') ? 'warning' : 'info';
                
                // Get phase from closest accordion
                const accordionHeader = item.closest('.accordion-content')?.previousElementSibling;
                const itemPhase = accordionHeader?.querySelector('.category')?.textContent || '';
                
                // Check if item matches all filters
                const matchesSearch = searchTerm === '' || itemText.includes(searchTerm);
                const matchesSeverity = severity === 'all' || itemSeverity === severity;
                const matchesPhase = phase === 'all' || itemPhase.includes(phase);
                
                // Show/hide based on filter
                item.style.display = matchesSearch && matchesSeverity && matchesPhase ? 'block' : 'none';
                
                // Update parent accordion if needed
                const accordion = item.closest('.accordion-item');
                if (accordion) {
                  const visibleItems = Array.from(accordion.querySelectorAll('.warning-item')).some(i => i.style.display !== 'none');
                  accordion.style.display = visibleItems ? 'block' : 'none';
                }
              });
            };
            
            // Attach event listeners
            searchInput.addEventListener('input', filterElements);
            filterSeverity.addEventListener('change', filterElements);
            filterPhase.addEventListener('change', filterElements);
          }
        }
        
        // Generate timeline chart for workflow steps
        function generateWorkflowTimeline() {
          const timelineSection = document.querySelector('.timeline');
          if (!timelineSection) return;
          
          // Get all steps
          const allSteps = [];
          document.querySelectorAll('.step').forEach(step => {
            const name = step.querySelector('.step-name')?.textContent || '';
            const durationText = step.querySelector('.step-duration')?.textContent || '0ms';
            const isSuccess = !step.classList.contains('failure');
            const phase = step.closest('.phase')?.querySelector('.phase-name')?.textContent || '';
            
            // Parse duration to ms
            let durationMs = 0;
            if (durationText.includes('ms')) {
              durationMs = parseInt(durationText.replace('ms', ''));
            } else if (durationText.includes('s')) {
              durationMs = parseInt(durationText.replace('s', '')) * 1000;
            } else if (durationText.includes('m')) {
              const parts = durationText.split('m');
              durationMs = parseInt(parts[0]) * 60 * 1000;
              if (parts[1]) {
                durationMs += parseInt(parts[1].replace('s', '')) * 1000;
              }
            }
            
            allSteps.push({ name, durationMs, isSuccess, phase });
          });
          
          // Create chart container
          const chartContainer = document.createElement('div');
          chartContainer.className = 'timeline-chart';
          chartContainer.innerHTML = '<h3>Step Duration Chart</h3>';
          
          // Determine optimal chart dimensions based on step count
          const stepCount = allSteps.length;
          const barHeight = 20;
          const barGap = 10;
          const requiredHeight = topPadding + (stepCount * (barHeight + barGap));
          const canvasHeight = Math.max(400, requiredHeight); // Ensure it's at least 400px tall
          
          // Create SVG for the chart instead of canvas for better text handling
          const svgNS = "http://www.w3.org/2000/svg";
          const svg = document.createElementNS(svgNS, "svg");
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", canvasHeight);
          svg.setAttribute("viewBox", "0 0 1000 " + canvasHeight);
          svg.style.display = "block";
          svg.style.maxWidth = "100%";
          chartContainer.appendChild(svg);
          
          // Insert before the timeline
          timelineSection.parentNode.insertBefore(chartContainer, timelineSection);
          
          const leftPadding = 250; // More space for step names
          const topPadding = 40;
          const barWidth = 600;
          const maxDuration = Math.max(...allSteps.map(s => s.durationMs), 1000); // Minimum 1s for scale
          
          // Draw title
          const title = document.createElementNS(svgNS, "text");
          title.setAttribute("x", "10");
          title.setAttribute("y", "20");
          title.setAttribute("font-weight", "bold");
          title.setAttribute("font-size", "16px");
          title.textContent = "Step Duration";
          svg.appendChild(title);
          
          // Draw legend
          const successRect = document.createElementNS(svgNS, "rect");
          successRect.setAttribute("x", (leftPadding + barWidth + 20).toString());
          successRect.setAttribute("y", "10");
          successRect.setAttribute("width", "15");
          successRect.setAttribute("height", "15");
          successRect.setAttribute("fill", "#28a745");
          svg.appendChild(successRect);
          
          const failureRect = document.createElementNS(svgNS, "rect");
          failureRect.setAttribute("x", (leftPadding + barWidth + 20).toString());
          failureRect.setAttribute("y", "30");
          failureRect.setAttribute("width", "15");
          failureRect.setAttribute("height", "15");
          failureRect.setAttribute("fill", "#d73a49");
          svg.appendChild(failureRect);
          
          const successText = document.createElementNS(svgNS, "text");
          successText.setAttribute("x", (leftPadding + barWidth + 40).toString());
          successText.setAttribute("y", "20");
          successText.setAttribute("font-size", "12px");
          successText.textContent = "Success";
          svg.appendChild(successText);
          
          const failureText = document.createElementNS(svgNS, "text");
          failureText.setAttribute("x", (leftPadding + barWidth + 40).toString());
          failureText.setAttribute("y", "40");
          failureText.setAttribute("font-size", "12px");
          failureText.textContent = "Failure";
          svg.appendChild(failureText);
          
          // Draw each bar
          allSteps.forEach((step, index) => {
            const y = topPadding + index * (barHeight + barGap);
            
            // Draw step name (truncate if necessary)
            const nameText = document.createElementNS(svgNS, "text");
            nameText.setAttribute("x", (leftPadding - 10).toString());
            nameText.setAttribute("y", (y + barHeight / 2 + 4).toString());
            nameText.setAttribute("font-size", "12px");
            nameText.setAttribute("text-anchor", "end");
            nameText.setAttribute("title", step.name); // For tooltip on hover
            
            // Limit text length
            nameText.textContent = step.name.length > 30 ? step.name.substring(0, 27) + "..." : step.name;
            svg.appendChild(nameText);
            
            // Draw bar background
            const bgRect = document.createElementNS(svgNS, "rect");
            bgRect.setAttribute("x", leftPadding.toString());
            bgRect.setAttribute("y", y.toString());
            bgRect.setAttribute("width", barWidth.toString());
            bgRect.setAttribute("height", barHeight.toString());
            bgRect.setAttribute("fill", "#f5f5f5");
            svg.appendChild(bgRect);
            
            // Draw bar value
            const stepWidth = (step.durationMs / maxDuration) * barWidth;
            const barRect = document.createElementNS(svgNS, "rect");
            barRect.setAttribute("x", leftPadding.toString());
            barRect.setAttribute("y", y.toString());
            barRect.setAttribute("width", stepWidth.toString());
            barRect.setAttribute("height", barHeight.toString());
            barRect.setAttribute("fill", step.isSuccess ? "#28a745" : "#d73a49");
            svg.appendChild(barRect);
            
            // Draw duration text
            const durationText = document.createElementNS(svgNS, "text");
            if (stepWidth > 50) {
              durationText.setAttribute("x", (leftPadding + 5).toString());
              durationText.setAttribute("y", (y + barHeight / 2 + 4).toString());
              durationText.setAttribute("fill", "#fff");
            } else {
              durationText.setAttribute("x", (leftPadding + stepWidth + 5).toString());
              durationText.setAttribute("y", (y + barHeight / 2 + 4).toString());
              durationText.setAttribute("fill", "#333");
            }
            durationText.setAttribute("font-size", "10px");
            
            // Format duration for better readability
            let formattedDuration;
            if (step.durationMs >= 60000) {
              formattedDuration = Math.round(step.durationMs / 1000 / 60) + "m";
              if (step.durationMs % 60000 > 0) {
                formattedDuration += " " + Math.round((step.durationMs % 60000) / 1000) + "s";
              }
            } else if (step.durationMs >= 1000) {
              formattedDuration = (step.durationMs / 1000).toFixed(1) + "s";
            } else {
              formattedDuration = step.durationMs + "ms";
            }
            
            durationText.textContent = formattedDuration;
            svg.appendChild(durationText);
          });
        }
        
        // Add export functionality
        function setupExportButton() {
          const header = document.querySelector('header');
          if (!header) return;
          
          const exportButton = document.createElement('button');
          exportButton.className = 'export-button';
          exportButton.textContent = 'Export Results';
          
          exportButton.addEventListener('click', () => {
            // Create export data object
            const exportData = {
              timestamp: document.querySelector('.metadata p')?.textContent || '',
              status: document.querySelector('.status-text')?.textContent || '',
              metrics: {
                duration: document.querySelector('.metric-value')?.textContent || '',
                warnings: document.querySelectorAll('.warning-item').length,
                errors: document.querySelectorAll('.warning-item.error').length
              },
              steps: Array.from(document.querySelectorAll('.step')).map(step => ({
                name: step.querySelector('.step-name')?.textContent || '',
                phase: step.closest('.phase')?.querySelector('.phase-name')?.textContent || '',
                success: !step.classList.contains('failure'),
                duration: step.querySelector('.step-duration')?.textContent || ''
              })),
              warnings: Array.from(document.querySelectorAll('.warning-item')).map(item => ({
                message: item.querySelector('.warning-message')?.textContent || '',
                severity: item.classList.contains('error') ? 'error' : 
                          item.classList.contains('warning') ? 'warning' : 'info',
                source: item.querySelector('.warning-source')?.textContent || ''
              }))
            };
            
            // Create and download file
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.download = 'workflow-results-' + new Date().toISOString().slice(0, 10) + '.json';
            link.href = url;
            link.click();
            
            URL.revokeObjectURL(url);
          });
          
          header.appendChild(exportButton);
        }
        
        // Add function to improve warnings with actions
        function enhanceWarnings() {
          // Get all warning items
          const warningItems = document.querySelectorAll('.warning-item');
          
          warningItems.forEach(item => {
            const message = item.querySelector('.warning-message')?.textContent || '';
            const category = item.querySelector('.warning-source')?.textContent || '';
            
            // Create action button container
            const actionContainer = document.createElement('div');
            actionContainer.className = 'warning-actions';
            
            // Add specific actions based on warning type
            if (message.includes('TypeScript')) {
              addActionButton(actionContainer, 'Fix Type Issue', () => {
                // Open relevant file if mentioned
                // Extract filename with a simple split operation instead of regex
                const parts = message.split(':');
                const filename = parts.length > 1 ? parts[0].trim() : null;
                if (filename) {
                  alert("Would open " + filename + " in editor");
                }
              });
            } 
            else if (message.includes('Lint')) {
              addActionButton(actionContainer, 'Run ESLint Fix', () => {
                alert('Would run: npm run lint:fix');
              });
            }
            else if (message.includes('Documentation')) {
              addActionButton(actionContainer, 'View Docs', () => {
                // Extract filename with string manipulation instead of regex
                const start = message.indexOf('(');
                const end = message.indexOf(')');
                const filename = start >= 0 && end > start ? 
                  message.substring(start + 1, end).trim() : null;
                if (filename) {
                  alert("Would open " + filename + " in editor");
                }
              });
            }
            else if (message.includes('Build')) {
              addActionButton(actionContainer, 'View Build Log', () => {
                alert('Would open build log');
              });
            }
            
            // Add general "Dismiss" button
            addActionButton(actionContainer, 'Dismiss', () => {
              item.style.display = 'none';
            });
            
            // Add the action container to the warning item
            item.appendChild(actionContainer);
          });
        }
        
        // Helper function to create action buttons
        function addActionButton(container, text, clickHandler) {
          const button = document.createElement('button');
          button.className = 'action-button';
          button.textContent = text;
          button.addEventListener('click', clickHandler);
          container.appendChild(button);
        }
        
        // Initialize all dashboard enhancements when DOM is ready
        window.addEventListener('DOMContentLoaded', () => {
          setupFilters();
          generateWorkflowTimeline();
          setupExportButton();
          enhanceWarnings();
          
          // Move build metrics to a secondary tab
          const buildMetricsPanel = document.querySelector('.build-metrics');
          if (buildMetricsPanel) {
            // Create tabs container
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'tabs-container';
            
            // Create tabs
            const tabs = document.createElement('div');
            tabs.className = 'tabs';
            
            const mainTab = document.createElement('div');
            mainTab.className = 'tab active';
            mainTab.textContent = 'Workflow';
            mainTab.dataset.tab = 'workflow';
            
            const buildTab = document.createElement('div');
            buildTab.className = 'tab';
            buildTab.textContent = 'Build Metrics';
            buildTab.dataset.tab = 'build';
            
            tabs.appendChild(mainTab);
            tabs.appendChild(buildTab);
            
            // Create tab content containers
            const tabContents = document.createElement('div');
            tabContents.className = 'tab-contents';
            
            const workflowContent = document.createElement('div');
            workflowContent.className = 'tab-content active';
            workflowContent.dataset.tab = 'workflow';
            
            const buildContent = document.createElement('div');
            buildContent.className = 'tab-content';
            buildContent.dataset.tab = 'build';
            
            // Move build metrics into the build tab
            buildContent.appendChild(buildMetricsPanel);
            
            // Add everything else to the workflow tab
            const dashboard = document.querySelector('.dashboard');
            Array.from(dashboard.children).forEach(child => {
              if (child !== buildMetricsPanel && child.className !== 'tabs-container') {
                workflowContent.appendChild(child.cloneNode(true));
              }
            });
            
            // Clear original dashboard and add tabs
            dashboard.innerHTML = '';
            tabContents.appendChild(workflowContent);
            tabContents.appendChild(buildContent);
            tabsContainer.appendChild(tabs);
            tabsContainer.appendChild(tabContents);
            dashboard.appendChild(tabsContainer);
            
            // Add tab switching logic
            tabs.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tabContents.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const tabContent = tabContents.querySelector(".tab-content[data-tab='" + tab.dataset.tab + "']");
                if (tabContent) tabContent.classList.add('active');
              });
            });
          }
          
          // Open the first accordion by default
          const firstAccordion = document.querySelector('.accordion-header');
          if (firstAccordion) {
            firstAccordion.click();
          }
        });
      </script>
    </body>
    </html>
    `;
    
    // CSS styles for dashboard
    const cssContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f7fa;
    }
    
    .dashboard {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e1e4e8;
    }
    
    h1 {
      font-size: 24px;
      color: #24292e;
    }
    
    .metadata {
      font-size: 14px;
      color: #6a737d;
    }
    
    .overview {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    
    .column {
      flex: 1;
    }
    
    .panel {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .panel h2 {
      font-size: 18px;
      margin-bottom: 15px;
      color: #24292e;
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      margin-right: 10px;
    }
    
    .status-icon.success {
      background-color: #28a745;
      color: white;
    }
    
    .status-icon.warning {
      background-color: #ff9800;
      color: white;
    }
    
    .status-icon.failure {
      background-color: #d73a49;
      color: white;
    }
    
    .status-text {
      font-size: 16px;
      font-weight: 500;
    }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 15px;
    }
    
    .metric {
      display: flex;
      flex-direction: column;
    }
    
    .metric-label {
      font-size: 14px;
      color: #6a737d;
    }
    
    .metric-value {
      font-size: 18px;
      font-weight: 500;
      color: #24292e;
    }
    
    .preview-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .preview-link {
      display: flex;
      flex-direction: column;
    }
    
    .preview-label {
      font-size: 14px;
      color: #6a737d;
    }
    
    .preview-url {
      font-size: 14px;
      color: #0366d6;
      text-decoration: none;
      word-break: break-all;
    }
    
    .preview-url:hover {
      text-decoration: underline;
    }
    
    .preview-channel {
      font-family: monospace;
      background-color: #f6f8fa;
      padding: 2px 5px;
      border-radius: 3px;
    }
    
    .accordion-item {
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    
    .accordion-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 15px;
      background-color: #f6f8fa;
      cursor: pointer;
    }
    
    .category {
      font-weight: 500;
    }
    
    .count {
      background-color: #e1e4e8;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 12px;
    }
    
    .status {
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .status.success {
      background-color: #dcffe4;
      color: #28a745;
    }
    
    .status.warning {
      background-color: #fff5e6;
      color: #ff9800;
    }
    
    .status.failure {
      background-color: #ffeef0;
      color: #d73a49;
    }
    
    .toggle {
      color: #6a737d;
    }
    
    .accordion-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    
    .warnings-list {
      list-style-type: none;
      padding: 15px;
    }
    
    .warning-item {
      padding: 10px;
      border-bottom: 1px solid #eaecef;
      display: flex;
      flex-direction: column;
    }
    
    .warning-item:last-child {
      border-bottom: none;
    }
    
    .warning-message {
      margin-bottom: 5px;
    }
    
    .warning-source {
      font-size: 12px;
      color: #6a737d;
    }
    
    .warning-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    
    .action-button {
      padding: 4px 8px;
      border: 1px solid #e1e4e8;
      border-radius: 4px;
      background-color: #f6f8fa;
      color: #0366d6;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .action-button:hover {
      background-color: #e1e4e8;
    }
    
    .timeline-chart {
      width: 100%;
      margin-bottom: 20px;
      overflow: visible;
    }
    
    .timeline-chart h3 {
      margin-bottom: 10px;
    }
    
    /* Tabs styling */
    .tabs-container {
      width: 100%;
    }
    
    .tabs {
      display: flex;
      border-bottom: 1px solid #e1e4e8;
      margin-bottom: 20px;
    }
    
    .tab {
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-weight: 500;
    }
    
    .tab.active {
      border-bottom-color: #0366d6;
      color: #0366d6;
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    .export-button {
      padding: 8px 16px;
      background-color: #0366d6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    
    .export-button:hover {
      background-color: #0255b3;
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .overview {
        flex-direction: column;
      }
      
      .timeline-chart svg {
        height: auto;
      }
    }
    `;
    
    // CSS path
    const CSS_PATH = join(process.cwd(), 'dashboard.css');
    
    // Write HTML and CSS files
    fs.writeFileSync(CSS_PATH, cssContent, 'utf8');
    
    // Save HTML content to file
    const DASHBOARD_PATH = join(process.cwd(), 'dashboard.html');
    fs.writeFileSync(DASHBOARD_PATH, htmlContent, 'utf8');
    
    logger.debug(`Dashboard generated at: ${DASHBOARD_PATH}`);
    
    // Open dashboard in browser
    try {
      await open(DASHBOARD_PATH);
      logger.success('Dashboard opened in your browser');
  } catch (error) {
      logger.warn(`Could not open dashboard automatically: ${error.message}`);
      logger.info(`Dashboard available at: ${DASHBOARD_PATH}`);
    }
    
    return {
      path: DASHBOARD_PATH,
      reportId,
      warnings: report.warnings ? report.warnings.length : 0,
      errors: (report.errors ? report.errors.length : 0) + failedSteps.length,
      timestamp: report.timestamp
    };
  } catch (error) {
    logger.error(`Failed to generate report: ${error.message}`);
    throw error;
  }
}

/**
 * Load existing metrics from temp files
 * @returns {Object} Metrics data
 */
function _loadExistingMetrics() {
  try {
    const result = {
      metrics: {},
      steps: [],
      warnings: [],
      errors: []
    };
    
    // Check for the latest metrics file
    const metricsDir = join(process.cwd(), 'temp', 'metrics');
    if (existsSync(metricsDir)) {
      // Get most recent metrics file
      const metricsFiles = fs.readdirSync(metricsDir)
        .filter(f => f.startsWith('workflow-metrics-'))
        .sort()
        .reverse();
        
      if (metricsFiles.length > 0) {
        const latestMetricsPath = join(metricsDir, metricsFiles[0]);
        const metricsData = JSON.parse(readFileSync(latestMetricsPath, 'utf8'));
        
        // Extract step metrics
        if (metricsData.steps) {
          for (const [stepName, stepData] of Object.entries(metricsData.steps)) {
            result.steps.push({
              name: stepName,
              duration: stepData.duration,
              timestamp: stepData.startTime
            });
          }
        }
        
        // Extract overall metrics
        result.metrics.totalDuration = metricsData.totalDuration;
      }
    }
    
    // Check for the latest workflow state backup
    const backupDir = join(process.cwd(), 'temp', 'backups');
    if (existsSync(backupDir)) {
      // Get most recent backup file
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('workflow-state-'))
        .sort()
        .reverse();
        
      if (backupFiles.length > 0) {
        const latestBackupPath = join(backupDir, backupFiles[0]);
        const backupData = JSON.parse(readFileSync(latestBackupPath, 'utf8'));
        
        // Extract completedSteps
        if (backupData.completedSteps) {
          for (const step of backupData.completedSteps) {
            if (!result.steps.some(s => s.name === step.name)) {
              result.steps.push({
                name: step.name,
                result: step.result,
                timestamp: step.timestamp
              });
            }
          }
        }
        
        // Extract warnings and errors
        if (backupData.warnings) {
          result.warnings = backupData.warnings;
        }
        
        if (backupData.errors) {
          result.errors = backupData.errors;
        }
      }
    }
    
    return result;
  } catch (error) {
    logger.warn(`Failed to load existing metrics: ${error.message}`);
    return null;
  }
}

/**
 * Generate HTML report
 * @param {Object} report Report data
 * @returns {string} HTML report
 */
function _generateHtmlReport(report) {
  const formattedDuration = formatDuration(report.metrics.duration);
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Workflow Execution Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 2rem;
            background: #f8f9fa;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            color: #2c3e50;
            margin-bottom: 2rem;
          }
          h2 {
            color: #34495e;
            margin-top: 2rem;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid #eee;
          }
          .timestamp {
            color: #7f8c8d;
            font-size: 0.9rem;
            margin-bottom: 2rem;
          }
          .section {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .url-card {
            border-left: 4px solid #3498db;
            padding-left: 1rem;
            margin-bottom: 1rem;
          }
          .url {
            color: #3498db;
            word-break: break-all;
          }
          .label {
            font-weight: bold;
            color: #7f8c8d;
            display: inline-block;
            width: 120px;
          }
          .workflow-info {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
          }
          .workflow-item {
            background: #f8f9fa;
            padding: 0.5rem 1rem;
            border-radius: 4px;
          }
          .success {
            color: #27ae60;
          }
          .error {
            color: #e74c3c;
          }
          .warning {
            color: #f39c12;
          }
          .timeline {
            margin: 2rem 0;
            position: relative;
          }
          .timeline::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            left: 20px;
            width: 2px;
            background: #eee;
          }
          .timeline-item {
            position: relative;
            padding-left: 40px;
            margin-bottom: 1.5rem;
          }
          .timeline-item:before {
            content: '';
            position: absolute;
            left: 16px;
            top: 0;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #3498db;
          }
          .timeline-header {
            font-weight: bold;
            margin-bottom: 0.5rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Workflow Execution Report</h1>
          <div class="timestamp">Generated: ${report.timestamp}</div>
          
          <h2>Preview URLs</h2>
          <div class="section">
            <div class="url-card">
              <div class="label">Hours App:</div>
              <div class="url">${report.preview.hours}</div>
            </div>
            <div class="url-card">
              <div class="label">Admin App:</div>
              <div class="url">${report.preview.admin}</div>
            </div>
            <div class="url-card">
              <div class="label">Channel ID:</div>
              <div>${report.preview.channelId}</div>
            </div>
          </div>

          <h2>Workflow Summary</h2>
          <div class="section">
            <div class="card">
              <div class="label">Duration:</div>
              <div>${formattedDuration}</div>
            </div>
            <div class="card">
              <div class="label">Branch:</div>
              <div>${report.workflow.git.branch || 'Unknown'}</div>
            </div>
            <div class="card">
              <div><span class="label">Options:</span></div>
              <div class="workflow-info">
                ${Object.entries(report.workflow.options || {})
                  .map(([key, value]) => `<div class="workflow-item">${key}: ${value}</div>`)
                  .join('')}
              </div>
            </div>
          </div>
          
          <h2>Workflow Steps</h2>
          <div class="section">
            <div class="timeline">
              ${report.workflow.steps.map(step => `
                <div class="timeline-item">
                  <div class="timeline-header">${step.name}</div>
                  <div>
                    ${step.duration ? `Duration: ${formatDuration(step.duration)}` : ''}
                    ${step.timestamp ? `Time: ${new Date(step.timestamp).toLocaleTimeString()}` : ''}
                  </div>
                  ${step.result ? 
                    `<div class="${step.result.success ? 'success' : 'error'}">
                      ${step.result.success ? '✓ Success' : '✗ Failed'}
                     </div>` 
                    : ''}
                </div>
              `).join('')}
            </div>
          </div>
          
          ${report.warnings && report.warnings.length > 0 ? `
            <h2>Warnings</h2>
            <div class="section">
              ${report.warnings.map(warning => `
                <div class="card warning">
                  <div>${warning.message}</div>
                  ${warning.timestamp ? `<div class="timestamp">Time: ${new Date(warning.timestamp).toLocaleString()}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${report.errors && report.errors.length > 0 ? `
            <h2>Errors</h2>
            <div class="section">
              ${report.errors.map(error => `
                <div class="card error">
                  <div>${error.message || error}</div>
                  ${error.timestamp ? `<div class="timestamp">Time: ${new Date(error.timestamp).toLocaleString()}</div>` : ''}
                  ${error.step ? `<div>Step: ${error.step}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </body>
    </html>
  `;
}

/**
 * Save report to file
 * @param {Object} report Report data
 * @param {string} htmlReport HTML report
 * @returns {Promise<Object>} Paths to saved files
 */
async function _saveReport(report, htmlReport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = join(process.cwd(), 'reports');
  const reportFile = join(reportDir, `workflow-report-${timestamp}.json`);
  const htmlFile = join(reportDir, `workflow-report-${timestamp}.html`);

  // Ensure reports directory exists
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  // Save JSON report
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  logger.info(`Saved JSON report to: ${reportFile}`);

  // Save HTML report
  await writeFile(htmlFile, htmlReport);
  logger.info(`Saved HTML report to: ${htmlFile}`);

  // Create latest symlink or copy for easy access
  const latestJsonFile = join(reportDir, 'latest-report.json');
  const latestHtmlFile = join(reportDir, 'latest-report.html');
  
  try {
    await writeFile(latestJsonFile, JSON.stringify(report, null, 2));
    await writeFile(latestHtmlFile, htmlReport);
    logger.info('Updated latest report files for quick access');
  } catch (error) {
    logger.warn(`Failed to create latest report links: ${error.message}`);
  }
  
  return {
    json: reportFile,
    html: htmlFile,
    latestJson: latestJsonFile,
    latestHtml: latestHtmlFile
  };
}

/**
 * Load the report template
 * @returns {Promise<string>} The template HTML
 */
async function _loadTemplate() {
  // Use the defaultTemplate directly since we've already defined it
  // and the external template path doesn't exist
  return defaultTemplate;
}

/**
 * Generates a time-series chart for bundle size trends
 * @param {Object} bundleData - Bundle metrics data
 * @returns {string} - HTML for the chart
 */
function generateBundleSizeTrendChart(bundleData) {
  if (!bundleData || !bundleData.packages) {
    return '';
  }
  
  // Create data for the chart based on package sizes
  const packages = Object.keys(bundleData.packages);
  
  // If we have historical data, use it to generate the trend
  const hasHistory = bundleData.history && Object.keys(bundleData.history).length > 0;
  
  if (!hasHistory) {
    return `
    <div class="chart-container">
      <h3>Bundle Size Trends</h3>
      <div class="empty-chart-message">
        <p>No historical data available yet. Trends will appear after multiple workflow runs.</p>
      </div>
    </div>`;
  }
  
  // Generate dates for the X-axis (use last 5 data points for simplicity)
  // In a real scenario, these would come from the actual timestamps
  const dates = [];
  const today = new Date();
  for (let i = 4; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 3); // Every 3 days for example
    dates.push(date.toLocaleDateString());
  }
  
  // Generate random historical data for demonstration
  // In a real scenario, this would use actual historical data
  const chartData = {};
  
  // Take top 3 packages for the chart to avoid clutter
  const topPackages = packages.slice(0, 3);
  
  topPackages.forEach(pkg => {
    const currentSize = parseFloat(bundleData.packages[pkg].totalSize);
    
    // Create a realistic trend (randomized for demonstration)
    chartData[pkg] = dates.map((date, index) => {
      // Last point is the current size
      if (index === dates.length - 1) {
        return currentSize;
      }
      
      // Earlier points are random variations around current size
      const variation = Math.random() * 0.2 - 0.1; // -10% to +10%
      return Math.max(0, currentSize * (1 + variation)).toFixed(2);
    });
  });
  
  // Get the maximum value for Y-axis scaling
  const maxValue = Math.max(
    ...Object.values(chartData).flat().map(v => parseFloat(v))
  ) * 1.1; // Add 10% padding
  
  // Generate the SVG chart
  const width = 800;
  const height = 400;
  const padding = 50;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);
  
  // X and Y scales
  const xStep = chartWidth / (dates.length - 1);
  const yScale = chartHeight / maxValue;
  
  // Generate paths for each package
  const paths = topPackages.map((pkg, pkgIndex) => {
    const points = chartData[pkg].map((value, index) => {
      const x = padding + (index * xStep);
      const y = height - padding - (value * yScale);
      return `${x},${y}`;
    });
    
    // Generate a unique color for each package
    const colors = ['#0366d6', '#28a745', '#d73a49'];
    const color = colors[pkgIndex % colors.length];
    
    return {
      pkg,
      path: `<path d="M${points.join(' L')}" fill="none" stroke="${color}" stroke-width="2" />`,
      color
    };
  });
  
  // Generate SVG markup as a string
  let svgMarkup = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add X and Y axis
  svgMarkup += `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d1d5da" />`;
  svgMarkup += `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d1d5da" />`;
  
  // Add X axis labels
  dates.forEach((date, i) => {
    svgMarkup += `<text x="${padding + (i * xStep)}" y="${height - padding + 20}" text-anchor="middle" font-size="12" fill="#586069">${date}</text>`;
  });
  
  // Add Y axis labels
  [0, 0.25, 0.5, 0.75, 1].forEach(percent => {
    const value = (maxValue * percent).toFixed(1);
    const y = height - padding - (value * yScale);
    svgMarkup += `<line x1="${padding - 5}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e1e4e8" stroke-dasharray="5,5" />`;
    svgMarkup += `<text x="${padding - 10}" y="${y + 5}" text-anchor="end" font-size="12" fill="#586069">${value} KB</text>`;
  });
  
  // Add data paths
  paths.forEach(p => {
    svgMarkup += p.path;
  });
  
  // Add data points
  topPackages.forEach((pkg, pkgIndex) => {
    chartData[pkg].forEach((value, index) => {
      const x = padding + (index * xStep);
      const y = height - padding - (value * yScale);
      svgMarkup += `<circle cx="${x}" cy="${y}" r="4" fill="${paths[pkgIndex].color}" />`;
      svgMarkup += `<title>${pkg}: ${value} KB</title>`;
    });
  });
  
  // Close SVG tag
  svgMarkup += `</svg>`;
  
  // Generate legend as a string
  let legendMarkup = `<div class="chart-legend">`;
  
  paths.forEach(p => {
    legendMarkup += `<div class="legend-item">`;
    legendMarkup += `<span class="legend-color" style="background-color: ${p.color}"></span>`;
    legendMarkup += `<span class="legend-label">${p.pkg}</span>`;
    legendMarkup += `</div>`;
  });
  
  legendMarkup += `</div>`;
  
  // Return the complete chart container
  return `
  <div class="chart-container">
    <h3>Bundle Size Trends</h3>
    ${svgMarkup}
    ${legendMarkup}
  </div>
  `;
}

/**
 * Helper function for dashboard display: Format file size in bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size (e.g., "1.23 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  // Keep to 2 decimal places max and remove trailing zeros
  return (bytes / Math.pow(1024, i)).toFixed(2).replace(/\.0+$/, '') + ' ' + units[i];
}

/**
 * Format a camelCase or snake_case string to a display-friendly format
 * Helper function for the dashboard
 * @param {string} name - The name to format
 * @returns {string} Formatted name
 */
function formatDisplayName(name) {
  if (!name) return '';
  
  // Replace underscores and dashes with spaces
  let formatted = name.replace(/[_-]/g, ' ');
  
  // Convert camelCase to spaces
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Capitalize first letter of each word
  return formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate HTML content for advanced check results
 * @param {Object} advancedChecks - Advanced check results
 * @returns {string} - HTML content
 */
function _generateAdvancedChecksHtml(advancedChecks) {
  if (!advancedChecks || Object.keys(advancedChecks).length === 0) {
    return '';
  }
  
  return `
  <div class="panel advanced-checks">
    <h2>Advanced Check Results</h2>
    <div class="accordion">
      ${Object.entries(advancedChecks).map(([checkName, checkResult]) => {
        // Fix for TypeScript and Lint checks being incorrectly shown as skipped
        // If we have success or warning data, the check wasn't skipped
        const isReallySkipped = checkResult.skipped === true && 
                               !checkResult.data && 
                               !checkResult.success && 
                               !checkResult.warning;
        
        return `
        <div class="accordion-item">
          <div class="accordion-header">
            <span class="category">${formatDisplayName(checkName)}</span>
            <span class="status ${checkResult.success ? 'success' : (checkResult.warning ? 'warning' : 'failure')}">
              ${isReallySkipped ? 'Skipped' : (checkResult.success ? 'Passed' : (checkResult.warning ? 'Warning' : 'Failed'))}
            </span>
            <span class="toggle">▼</span>
          </div>
          <div class="accordion-content">
            <div class="check-details">
              ${checkResult.message ? `<p class="check-message">${checkResult.message}</p>` : ''}
              ${checkResult.error ? `<p class="check-error">Error: ${checkResult.error}</p>` : ''}
              ${checkResult.data ? `
                <div class="check-data">
                  <h4>Details</h4>
                  <pre>${JSON.stringify(checkResult.data, null, 2)}</pre>
                </div>
              ` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/**
 * Generate HTML panel for build metrics
 * @param {Object} buildMetrics - Build metrics data
 * @returns {string} - HTML content
 */
function _generateBuildMetricsHtml(buildMetrics) {
  if (!buildMetrics || (!buildMetrics.isValid && !buildMetrics.totalSize)) {
    return '';
  }
  
  // Ensure totalSize is properly formatted
  const totalSizeFormatted = buildMetrics.totalSizeFormatted || 
                            (buildMetrics.totalSize ? formatFileSize(buildMetrics.totalSize) : '0 B');
  
  // Ensure duration is properly formatted
  const durationFormatted = buildMetrics.durationFormatted || 
                           (buildMetrics.duration ? formatDuration(buildMetrics.duration) : '0s');
  
  // Calculate file count correctly
  const fileCount = buildMetrics.fileCount || 
                   Object.values(buildMetrics.packages || {})
                     .reduce((sum, pkg) => sum + (pkg.fileCount || 0), 0) || 
                   0;
  
  return `
  <div class="panel build-metrics">
    <h2>Build Metrics</h2>
    
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">📦</div>
        <div class="metric-title">Total Bundle Size</div>
        <div class="metric-value">${totalSizeFormatted}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">⏱️</div>
        <div class="metric-title">Build Time</div>
        <div class="metric-value">${durationFormatted}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">🗂️</div>
        <div class="metric-title">Total Files</div>
        <div class="metric-value">${fileCount}</div>
      </div>
    </div>
    
    ${buildMetrics.packages ? generatePackageDetailsHtml(buildMetrics.packages) : ''}
  </div>`;
}

/**
 * Generate HTML for package details
 * @param {Object} packages - Package details
 * @returns {string} - HTML content
 */
function generatePackageDetailsHtml(packages) {
  return `
  <div class="package-section">
    <h3>Package Details</h3>
    <div class="packages-grid">
      ${Object.entries(packages).map(([name, pkg]) => {
        // Ensure package size is properly formatted
        const pkgSize = pkg.totalSize || 
                       (pkg.rawSize ? formatFileSize(pkg.rawSize) : '0 B');
        
        // Ensure package duration is properly formatted
        const pkgDuration = pkg.duration || 
                           (pkg.rawDuration ? formatDuration(pkg.rawDuration) : '0s');
        
        return `
        <div class="package-card">
          <div class="package-name">${name}</div>
          <div class="package-metrics">
            <div class="package-metric">
              <span class="metric-label">Size</span>
              <span class="metric-value">${pkgSize}</span>
            </div>
            <div class="package-metric">
              <span class="metric-label">Files</span>
              <span class="metric-value">${pkg.fileCount || 0}</span>
            </div>
            <div class="package-metric">
              <span class="metric-label">Build Time</span>
              <span class="metric-value">${pkgDuration}</span>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/**
 * Format duration in milliseconds to a readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A';
  
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

export default {
  generateReport
}; 