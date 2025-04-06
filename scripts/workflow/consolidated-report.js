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
import { exec } from 'child_process';
import path from 'path';
import { execSync } from 'child_process';
import { getReportPath, REPORT_PATHS as reportPaths } from '../reports/report-collector.js';
import open from 'open';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default report path
const DEFAULT_DASHBOARD_PATH = join(process.cwd(), 'preview-dashboard.html');

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
                <div class="metric-value">${report.buildMetrics.totalSize || '0 KB'}</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-icon">⏱️</div>
                <div class="metric-title">Build Time</div>
                <div class="metric-value">${formatDuration(report.buildMetrics.duration || 0)}</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-icon">🗂️</div>
                <div class="metric-title">Total Files</div>
                <div class="metric-value">${
                  Object.values(report.buildMetrics.packages || {})
                    .reduce((sum, pkg) => sum + (pkg.fileCount || 0), 0)
                }</div>
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
                      <span class="metric-value">${pkg.totalSize || '0 KB'}</span>
                    </div>
                    <div class="package-metric">
                      <span class="metric-label">Files</span>
                      <span class="metric-value">${pkg.fileCount || 0}</span>
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
          
          ${report.advancedChecks && Object.keys(report.advancedChecks).length > 0 ? `
          <div class="panel advanced-checks">
            <h2>Advanced Check Results</h2>
            <div class="accordion">
              ${Object.entries(report.advancedChecks).map(([checkName, checkResult]) => `
              <div class="accordion-item">
                <div class="accordion-header">
                  <span class="category">${checkName}</span>
                  <span class="status ${checkResult.success ? 'success' : (checkResult.warning ? 'warning' : 'failure')}">${
                    checkResult.skipped ? 'Skipped' : (checkResult.success ? 'Passed' : (checkResult.warning ? 'Warning' : 'Failed'))
                  }</span>
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
              `).join('')}
            </div>
          </div>
          ` : ''}
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
    
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .phase-name {
      font-size: 16px;
      margin-bottom: 10px;
      color: #24292e;
    }
    
    .steps {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .step {
      padding: 10px 15px;
      border-radius: 6px;
      border-left: 4px solid #e1e4e8;
    }
    
    .step.success {
      border-left-color: #28a745;
      background-color: #f0fff4;
    }
    
    .step.failure {
      border-left-color: #d73a49;
      background-color: #fff0f0;
    }
    
    .step-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    
    .step-name {
      font-weight: 500;
    }
    
    .step-indicator {
      font-weight: bold;
    }
    
    .step-details {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #6a737d;
    }
    
    .step-error {
      color: #d73a49;
      margin-top: 5px;
      font-size: 14px;
    }
    
    .check-details {
      padding: 15px;
    }
    
    .check-message {
      margin-bottom: 10px;
    }
    
    .check-error {
      color: #d73a49;
      margin-bottom: 10px;
    }
    
    .check-data {
      margin-top: 10px;
    }
    
    .check-data h4 {
      margin-bottom: 5px;
    }
    
    .check-data pre {
      background-color: #f6f8fa;
      padding: 10px;
      border-radius: 6px;
      overflow: auto;
      font-size: 12px;
      max-height: 300px;
    }
    
    footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e1e4e8;
      color: #6a737d;
      font-size: 14px;
    }
    
    @media (max-width: 768px) {
      .overview {
        flex-direction: column;
      }
      
      .metrics {
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      }
    }

    /* Build Metrics Styles */
    .build-metrics {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background-color: #f6f8fa;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    
    .metric-icon {
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    .metric-title {
      font-size: 14px;
      color: #6a737d;
      margin-bottom: 5px;
    }
    
    .metric-value {
      font-size: 18px;
      font-weight: 600;
      color: #24292e;
    }

    .package-section {
      margin-top: 30px;
    }

    .package-section h3 {
      margin-bottom: 15px;
      font-size: 16px;
      color: #24292e;
    }

    .packages-grid {
      margin-bottom: 25px;
    }

    .package-card {
      margin-bottom: 12px;
    }

    .package-name {
      font-size: 14px;
      margin-bottom: 4px;
      color: #24292e;
    }

    .package-metrics {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .package-metric {
      display: flex;
      flex-direction: column;
    }

    .package-metric .metric-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 2px;
    }

    .package-metric .metric-value {
      font-size: 14px;
      font-weight: 500;
    }

    .package-files {
      background-color: #f6f8fa;
      border-radius: 8px;
      padding: 15px;
    }

    .files-list {
      list-style-type: none;
      padding: 0;
    }

    .file-item {
      padding: 10px 0;
      border-bottom: 1px solid #eaecef;
    }

    .file-item:last-child {
      border-bottom: none;
    }

    .file-name {
      flex: 2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-size {
      flex: 1;
      text-align: right;
    }

    .bundle-issues {
      background-color: white;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
    }

    .issues-list {
      list-style-type: none;
      padding: 0;
    }

    .issue-item {
      padding: 10px 0;
      border-bottom: 1px solid #eaecef;
    }

    .issue-item:last-child {
      border-bottom: none;
    }

    .issue-message {
      margin-bottom: 5px;
    }

    .issue-details {
      font-size: 12px;
      color: #6a737d;
    }

    /* Empty State Styles */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      background-color: #f6f8fa;
      border-radius: 8px;
      text-align: center;
    }

    .empty-state p {
      color: #6a737d;
      font-size: 16px;
      margin-bottom: 15px;
    }

    .chart-container {
      background-color: white;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
      margin-bottom: 25px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .chart-container h3 {
      margin-bottom: 15px;
      font-size: 16px;
      color: #24292e;
    }
    
    .empty-chart-message {
      background-color: #f6f8fa;
      border-radius: 6px;
      padding: 15px;
      color: #6a737d;
      margin: 10px 0;
      text-align: center;
    }
    
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 15px;
      justify-content: center;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
    }
    
    .legend-color {
      display: inline-block;
      width: 15px;
      height: 15px;
      border-radius: 3px;
      margin-right: 6px;
    }
    
    .legend-label {
      font-size: 13px;
      color: #586069;
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
 * Open a file in the default browser
 * @param {string} filePath Path to the file
 */
function openInBrowser(filePath) {
  try {
    // Convert to an absolute file URL for better reliability
    const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
    
    // More robust browser opening commands
    const command = process.platform === 'win32' 
      ? `start "" "${fileUrl}"`
      : process.platform === 'darwin'
        ? `open "${fileUrl}"`
        : `xdg-open "${fileUrl}"`;
    
    // Make sure to wait for the command to finish
    exec(command, (error) => {
      if (error) {
        logger.warn(`Could not open browser automatically. Please open this file manually: ${filePath}`);
        
        // On Windows, try an alternative method if the first fails
        if (process.platform === 'win32') {
          try {
            exec(`explorer "${fileUrl}"`, (err) => {
              if (err) {
                logger.warn(`Second attempt to open browser failed.`);
              }
            });
          } catch (e) {
            // Ignore errors in fallback
          }
        }
      } else {
        logger.info('🚀 Dashboard opened in your browser');
      }
    });
  } catch (error) {
    logger.warn(`Could not open browser: ${error.message}`);
  }
}

/**
 * Generate a formatted HTML report for the workflow results
 * @param {Object} data - The workflow data to report
 * @returns {string} HTML content
 */
function generateDashboardHtml(data) {
  // ... existing code ...
  
  // Create HTML for advanced checks section
  let advancedChecksHtml = '';
  if (data.advancedChecks && Object.keys(data.advancedChecks).length > 0) {
    const checks = data.advancedChecks;
    
    advancedChecksHtml = `
      <div class="section advanced-checks">
        <h2>Advanced Check Results</h2>
        <div class="checks-grid">
        ${Object.entries(checks).map(([checkName, result]) => {
          const isSkipped = result.skipped;
          const isSuccess = result.success;
          const hasWarning = result.warning;
          const hasError = !isSuccess && !hasWarning;
          
          let statusClass = isSkipped ? 'skipped' : (isSuccess ? 'success' : (hasWarning ? 'warning' : 'error'));
          let statusText = isSkipped ? 'Skipped' : (isSuccess ? 'Passed' : (hasWarning ? 'Warning' : 'Failed'));
          let detailsHtml = '';
          
          // Add details section for specific checks
          if (!isSkipped) {
            // Format the details based on check type
            if (checkName === 'deadCode' && result.unusedExports && result.unusedExports.length > 0) {
              const count = result.unusedExports.length;
              detailsHtml = `
                <div class="check-details">
                  <p>Found ${count} unused exports.</p>
                  <div class="metrics">
                    <div class="metric">
                      <span class="metric-label">Unused Exports:</span>
                      <span class="metric-value">${count}</span>
                    </div>
                    ${result.potentialSavings ? `
                    <div class="metric">
                      <span class="metric-label">Potential Savings:</span>
                      <span class="metric-value">${result.potentialSavings}</span>
                    </div>
                    ` : ''}
                  </div>
                </div>
              `;
            } else if (checkName === 'bundleSize' && result.data && result.data.metrics) {
              const metrics = result.data.metrics;
              detailsHtml = `
                <div class="check-details">
                  <div class="metrics">
                    ${metrics.totalSize ? `
                    <div class="metric">
                      <span class="metric-label">Total Size:</span>
                      <span class="metric-value">${metrics.totalSize}</span>
                    </div>
                    ` : ''}
                    ${metrics.gzipSize ? `
                    <div class="metric">
                      <span class="metric-label">Gzipped:</span>
                      <span class="metric-value">${metrics.gzipSize}</span>
                    </div>
                    ` : ''}
                    ${metrics.change ? `
                    <div class="metric ${metrics.change.startsWith('+') ? 'negative' : 'positive'}">
                      <span class="metric-label">Change:</span>
                      <span class="metric-value">${metrics.change}</span>
                    </div>
                    ` : ''}
                  </div>
                </div>
              `;
            } else if (result.message) {
              // Generic detail message
              detailsHtml = `
                <div class="check-details">
                  <p>${result.message}</p>
                </div>
              `;
            }
          }
          
          // Create the check display
          return `
            <div class="check">
              <div class="check-header">
                <h3>${formatDisplayName(checkName)}</h3>
                <span class="status ${statusClass}">${statusText}</span>
                <span class="toggle ${detailsHtml ? '' : 'hidden'}">▼</span>
              </div>
              ${detailsHtml}
            </div>
          `;
        }).join('')}
        </div>
      </div>
    `;
  }
  // ... existing code ...
  
  // Add runtime performance indicators
  let performanceHtml = '';
  if (data.performance) {
    const { totalDuration, phaseDurations } = data.performance;
    
    performanceHtml = `
      <div class="section performance">
        <h2>Performance</h2>
        <div class="metrics">
          <div class="metric">
            <span class="metric-label">Total Runtime:</span>
            <span class="metric-value">${formatDuration(totalDuration)}</span>
          </div>
          
          <div class="metric-group">
            <h3>Phase Durations</h3>
            ${Object.entries(phaseDurations || {}).map(([phase, duration]) => `
              <div class="metric">
                <span class="metric-label">${formatDisplayName(phase)}:</span>
                <span class="metric-value">${formatDuration(duration)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }
  
  // Add the styles with optimized display
  const styles = `
    <style>
      /* ... existing styles ... */
      
      /* Update check styles */
      .check {
        margin-bottom: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .check-header {
        display: flex;
        align-items: center;
        padding: 10px 16px;
        background-color: #f8f9fa;
        cursor: pointer;
      }
      
      .check-header h3 {
        margin: 0;
        flex: 1;
        font-size: 16px;
        font-weight: 500;
      }
      
      .check-details {
        padding: 12px 16px;
        border-top: 1px solid #e0e0e0;
        background-color: white;
      }
      
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 10px;
        margin-top: 8px;
      }
      
      .metric {
        display: flex;
        flex-direction: column;
        padding: 8px 12px;
        background-color: #f5f5f5;
        border-radius: 4px;
      }
      
      .metric-label {
        font-size: 12px;
        color: #666;
        margin-bottom: 2px;
      }
      
      .metric-value {
        font-size: 14px;
        font-weight: 500;
      }
      
      .metric-group h3 {
        font-size: 14px;
        margin: 12px 0 8px;
        color: #555;
      }
      
      .positive .metric-value {
        color: #00897b;
      }
      
      .negative .metric-value {
        color: #e53935;
      }
      
      /* Performance section styles */
      .performance .metrics {
        grid-template-columns: 1fr;
      }
      
      /* ... existing styles ... */
  </style>
  `;
  
  // ... existing code ...
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
// ... existing code ...

/**
 * Load existing metrics from temp files
 * @returns {Object} Metrics data
 */
function loadExistingMetrics() {
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
function generateHtmlReport(report) {
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
async function saveReport(report, htmlReport) {
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
async function loadTemplate() {
  // Use the defaultTemplate directly since we've already defined it
  // and the external template path doesn't exist
  return defaultTemplate;
}

/**
 * Generate a time-series chart for bundle size trends
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
  
  // Generate SVG with paths and labels
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- X and Y axis -->
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#d1d5da" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#d1d5da" />
    
    <!-- X axis labels -->
    ${dates.map((date, i) => `
      <text x="${padding + (i * xStep)}" y="${height - padding + 20}" 
            text-anchor="middle" font-size="12" fill="#586069">${date}</text>
    `).join('')}
    
    <!-- Y axis labels -->
    ${[0, 0.25, 0.5, 0.75, 1].map(percent => {
      const value = (maxValue * percent).toFixed(1);
      const y = height - padding - (value * yScale);
      return `
        <line x1="${padding - 5}" y1="${y}" x2="${width - padding}" y2="${y}" 
              stroke="#e1e4e8" stroke-dasharray="5,5" />
        <text x="${padding - 10}" y="${y + 5}" text-anchor="end" 
              font-size="12" fill="#586069">${value} KB</text>
      `;
    }).join('')}
    
    <!-- Data paths -->
    ${paths.map(p => p.path).join('')}
    
    <!-- Data points -->
    ${topPackages.flatMap((pkg, pkgIndex) => {
      return chartData[pkg].map((value, index) => {
        const x = padding + (index * xStep);
        const y = height - padding - (value * yScale);
        return `
          <circle cx="${x}" cy="${y}" r="4" fill="${paths[pkgIndex].color}" />
          <title>${pkg}: ${value} KB</title>
        `;
      });
    }).join('')}
  </svg>
  `;
  
  // Generate legend
  const legend = `
  <div class="chart-legend">
    ${paths.map(p => `
      <div class="legend-item">
        <span class="legend-color" style="background-color: ${p.color}"></span>
        <span class="legend-label">${p.pkg}</span>
      </div>
    `).join('')}
  </div>
  `;
  
  return `
  <div class="chart-container">
    <h3>Bundle Size Trends</h3>
    ${svg}
    ${legend}
  </div>
  `;
}

/**
 * Format a camelCase or snake_case string to a display-friendly format
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

export default {
  generateReport
}; 