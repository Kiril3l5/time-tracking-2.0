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
 * @returns {Promise<Object>} Generated report
 */
export async function generateReport(data) {
  logger.debug('Generating consolidated report from workflow data');
  
  try {
    // Make sure we have the basic data structure
    const report = {
      timestamp: data.timestamp || new Date().toISOString(),
      metrics: data.metrics || { duration: 0 },
      preview: data.preview || null,
      workflow: data.workflow || { steps: [] },
      warnings: data.warnings || [],
      errors: data.errors || [],
      advancedChecks: data.advancedChecks || {}
    };
    
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
      report.warnings = report.warnings.filter(warning => 
        !(warning.phase === 'Build' && 
          (warning.message.includes('package:') || 
           warning.message.includes('large file:') ||
           warning.message.includes('bundle size:') ||
           warning.message.includes('Build process completed') ||
           warning.message.includes('Largest files'))));
    }
    
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
            <h2>Warnings & Suggestions (${report.warnings.length})</h2>
            <div class="accordion">
              ${Object.entries(warningsByCategory).map(([category, warnings]) => `
              <div class="accordion-item">
                <div class="accordion-header">
                  <span class="category">${category}</span>
                  <span class="count">${warnings.length}</span>
                  <span class="toggle">▼</span>
                </div>
                <div class="accordion-content">
                  <ul class="warnings-list">
                    ${warnings.map(warning => `
                    <li class="warning-item ${warning.severity || 'warning'}">
                      <div class="warning-message">${warning.message}</div>
                      ${warning.step ? `<div class="warning-source">Source: ${warning.step}</div>` : ''}
                    </li>
                    `).join('')}
                  </ul>
                </div>
              </div>
              `).join('')}
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
                <div class="metric-value">${report.buildMetrics.totalSize}</div>
              </div>
              
              <div class="metric-card">
                <div class="metric-icon">⏱️</div>
                <div class="metric-title">Build Time</div>
                <div class="metric-value">${formatDuration(report.buildMetrics.duration)}</div>
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
            
            ${report.buildMetrics.packages ? `
            <div class="package-section">
              <h3>Package Details</h3>
              <div class="packages-bar-chart">
                ${Object.entries(report.buildMetrics.packages).map(([name, pkg]) => {
                  const maxSize = Math.max(
                    ...Object.values(report.buildMetrics.packages)
                      .map(p => p.size || 0)
                  );
                  const percentage = maxSize > 0 ? (pkg.size / maxSize) * 100 : 0;
                  return `
                  <div class="package-bar">
                    <div class="package-name">${name}</div>
                    <div class="bar-container">
                      <div class="bar" style="width: ${percentage}%"></div>
                      <span class="bar-label">${pkg.sizeFormatted}</span>
                    </div>
                  </div>
                  `;
                }).join('')}
              </div>
              
              <div class="files-section">
                <h3>Largest Files</h3>
                <div class="files-table">
                  <div class="table-header">
                    <div class="col file-name">Filename</div>
                    <div class="col file-size">Size</div>
                    <div class="col file-package">Package</div>
                  </div>
                  ${Object.entries(report.buildMetrics.packages).flatMap(([pkgName, pkg]) => 
                    (pkg.largestFiles || []).map(file => `
                      <div class="table-row">
                        <div class="col file-name">${file.name}</div>
                        <div class="col file-size">${file.sizeFormatted}</div>
                        <div class="col file-package">${pkgName}</div>
                      </div>
                    `)
                  ).join('')}
                </div>
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
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background-color: #f6f8fa;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      transition: transform 0.2s;
    }

    .metric-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }

    .metric-icon {
      font-size: 28px;
      margin-bottom: 10px;
    }

    .metric-title {
      font-size: 14px;
      color: #6a737d;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 22px;
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

    .packages-bar-chart {
      margin-bottom: 25px;
    }

    .package-bar {
      margin-bottom: 12px;
    }

    .package-name {
      font-size: 14px;
      margin-bottom: 4px;
      color: #24292e;
    }

    .bar-container {
      height: 24px;
      background-color: #f6f8fa;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .bar {
      height: 100%;
      background-color: #0366d6;
      border-radius: 4px;
    }

    .bar-label {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 12px;
      color: #24292e;
      font-weight: 600;
    }

    .files-section {
      background-color: #f6f8fa;
      border-radius: 8px;
      padding: 15px;
    }

    .files-table {
      width: 100%;
    }

    .table-header {
      display: flex;
      padding: 10px 0;
      border-bottom: 1px solid #e1e4e8;
      font-weight: 600;
      font-size: 14px;
      color: #24292e;
    }

    .table-row {
      display: flex;
      padding: 10px 0;
      border-bottom: 1px solid #e1e4e8;
      font-size: 14px;
    }

    .col {
      padding: 0 10px;
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

    .file-package {
      flex: 1;
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
 * Generate a beautiful dashboard HTML
 * @param {Object} report Report data
 * @returns {string} Dashboard HTML
 */
function generateDashboardHtml(report) {
  // Group warnings by category
  const warningsByCategory = {};
  
  if (report.warnings && report.warnings.length > 0) {
    // Debug output for troubleshooting
    logger.debug(`Processing ${report.warnings.length} warnings for dashboard`);
    
    report.warnings.forEach(warning => {
      let category = warning.phase || 'General';
      const message = warning.message || warning;
      
      // Create category if it doesn't exist
      if (!warningsByCategory[category]) {
        warningsByCategory[category] = [];
      }
      
      // Add warning to category
      warningsByCategory[category].push(warning);
      
      // Debug each warning
      logger.debug(`Added warning to ${category}: ${message.substring(0, 60)}${message.length > 60 ? '...' : ''}`);
    });
  }
  
  // Map for workflow phases - for categorizing steps 
  const phaseMap = {
    'Setup': ['auth-refresh', 'authentication', 'setup', 'init'],
    'Validation': ['analyze', 'validation', 'check', 'lint', 'test'],
    'Build': ['build', 'compile', 'transpile', 'bundle'],
    'Deploy': ['deploy', 'publish', 'upload', 'firebase'],
    'Results': ['report', 'result', 'generate', 'dashboard', 'channel', 'cleanup']
  };
  
  // Function to determine the phase of a step
  function determinePhase(stepName) {
    const lowerStepName = stepName.toLowerCase();
    for (const [phase, keywords] of Object.entries(phaseMap)) {
      if (keywords.some(keyword => lowerStepName.includes(keyword))) {
        return phase;
      }
    }
    return 'Other';
  }
  
  // Process timeline data - prioritize using actual steps from the report
  const timelineSteps = [];
  
  if (report.workflow.steps && report.workflow.steps.length > 0) {
    // Sort steps by timestamp
    const sortedSteps = [...report.workflow.steps].sort((a, b) => {
      const timestampA = new Date(a.timestamp || 0).getTime();
      const timestampB = new Date(b.timestamp || 0).getTime();
      return timestampA - timestampB;
    });
    
    // Process each step with phase categorization
    sortedSteps.forEach(step => {
      const stepTime = new Date(step.timestamp || new Date());
      const duration = step.duration ? formatDuration(step.duration) : 'N/A';
      const phase = step.phase || determinePhase(step.name);
      
      timelineSteps.push({
        ...step,
        phase,
        formattedTime: stepTime.toLocaleString(),
        duration
      });
    });
  }
  
  // Count completed steps
  const completedSteps = timelineSteps.filter(step => step.result && step.result.success).length;
  const totalSteps = timelineSteps.length;
  
  // Extract error information for better display
  const errorSummary = {
    count: report.errors ? report.errors.length : 0,
    criticalCount: 0,
    byStep: {},
    criticalSteps: []
  };
  
  if (report.errors && report.errors.length > 0) {
    report.errors.forEach(error => {
      const step = error.step || 'Unknown';
      
      if (!errorSummary.byStep[step]) {
        errorSummary.byStep[step] = [];
      }
      
      errorSummary.byStep[step].push(error);
      
      // Track critical errors
      if (error.critical) {
        errorSummary.criticalCount++;
        if (!errorSummary.criticalSteps.includes(step)) {
          errorSummary.criticalSteps.push(step);
        }
      }
    });
  }
  
  // Count warnings by category for the summary
  let totalWarnings = 0;
  
  if (report.warnings && report.warnings.length > 0) {
    report.warnings.forEach(warning => {
      totalWarnings++;
      const category = warning.phase || 'General';
      
      if (!warningsByCategory[category]) {
        warningsByCategory[category] = [];
      }
      
      warningsByCategory[category].push(warning);
    });
  }
  
  // Generate suggestions for common warnings
  function generateSuggestion(warning) {
    const message = warning.message || warning;
    const lowerMessage = message.toLowerCase();
    
    // Channel cleanup suggestions
    if (lowerMessage.includes('channel cleanup') || lowerMessage.includes('firebase') && lowerMessage.includes('channel')) {
      return "Consider running 'firebase hosting:channel:list' to check available channels and manually delete some if needed.";
    }
    
    // Linting suggestions
    if (lowerMessage.includes('lint') || lowerMessage.includes('eslint')) {
      return "Run 'pnpm lint --fix' to automatically fix linting issues where possible.";
    }
    
    // TypeScript suggestions
    if (lowerMessage.includes('typescript') || lowerMessage.includes('type') && lowerMessage.includes('error')) {
      return "Check for proper type definitions and add missing type imports.";
    }
    
    // Testing suggestions
    if (lowerMessage.includes('test') && (lowerMessage.includes('fail') || lowerMessage.includes('error'))) {
      return "Run tests individually with 'pnpm test -- -t \"testName\"' to debug specific test failures.";
    }
    
    // Build suggestions
    if (lowerMessage.includes('build') && lowerMessage.includes('fail')) {
      return "Try running 'pnpm clean' followed by 'pnpm install' before building again.";
    }
    
    // Deployment suggestions
    if (lowerMessage.includes('deploy') || lowerMessage.includes('firebase')) {
      return "Ensure you have proper Firebase permissions and check connection with 'firebase login:list'.";
    }
    
    // Generic suggestion
    return "Review the related code and configuration files for potential issues.";
  }
  
  // Determine if we need to show the errors panel at the top
  const hasErrors = errorSummary.count > 0;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Dashboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f9fafb;
    }
    .timeline-item:not(:last-child):after {
      content: '';
      position: absolute;
      left: 1.25rem;
      top: 2.5rem;
      height: calc(100% - 1rem);
      width: 2px;
      background-color: #e5e7eb;
    }
    .warning-item {
      border-left: 4px solid #f59e0b;
      padding-left: 1rem;
      margin-bottom: 1rem;
    }
    .suggestion-item {
      background-color: #ecfdf5;
      border-left: 4px solid #10b981;
      padding: 0.5rem 1rem;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container mx-auto px-4 py-8 max-w-6xl">
    <!-- Header with summary stats -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Workflow Dashboard</h1>
        <p class="text-gray-600">${new Date(report.timestamp).toLocaleString()}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3 mt-4 md:mt-0">
        <div class="bg-indigo-100 text-indigo-800 rounded-lg px-3 py-1 text-sm font-medium">
          <span class="font-bold">${completedSteps}</span>/${totalSteps} Steps
        </div>
        <div class="bg-${totalWarnings > 0 ? 'amber' : 'green'}-100 text-${totalWarnings > 0 ? 'amber' : 'green'}-800 rounded-lg px-3 py-1 text-sm font-medium">
          <span class="font-bold">${totalWarnings}</span> Warnings
        </div>
        <div class="bg-${hasErrors ? 'red' : 'green'}-100 text-${hasErrors ? 'red' : 'green'}-800 rounded-lg px-3 py-1 text-sm font-medium">
          <span class="font-bold">${errorSummary.count}</span> Errors
        </div>
        <div class="bg-blue-100 text-blue-800 rounded-lg px-3 py-1 text-sm font-medium">
          Duration: ${formatDuration(report.metrics?.duration || 0)}
        </div>
      </div>
    </div>

    ${hasErrors ? `
    <!-- Error Panel - only shown if there are errors -->
    <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-8">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-lg font-medium text-red-800">
            Workflow completed with ${errorSummary.count} errors
          </h3>
          <div class="mt-2 text-red-700">
            <ul class="list-disc pl-5 space-y-1">
              ${Object.entries(errorSummary.byStep).map(([step, errors]) => `
                <li>${step}: ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}
                  <ul class="list-disc pl-5 text-sm text-red-600 mt-1">
                    ${errors.map(error => `<li>${error.message || error}</li>`).join('')}
                  </ul>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- Main Content Column -->
      <div class="md:col-span-3 space-y-8">
        <!-- Preview URLs -->
        ${report.preview ? `
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600">
            <h2 class="text-xl font-bold text-white">Preview URLs</h2>
          </div>
          <div class="p-6">
            <div class="flex flex-wrap gap-8">
              <div class="flex-1 min-w-[300px]">
                <div class="flex items-center">
                  <svg class="h-5 w-5 text-indigo-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                  <h3 class="text-lg font-medium text-gray-900">Hours App</h3>
                </div>
                <a href="${report.preview.hours}" target="_blank" class="block mt-1 text-indigo-600 hover:text-indigo-800 truncate">
                  ${report.preview.hours}
                </a>
              </div>
              <div class="flex-1 min-w-[300px]">
                <div class="flex items-center">
                  <svg class="h-5 w-5 text-indigo-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
                  </svg>
                  <h3 class="text-lg font-medium text-gray-900">Admin App</h3>
                </div>
                <a href="${report.preview.admin}" target="_blank" class="block mt-1 text-indigo-600 hover:text-indigo-800 truncate">
                  ${report.preview.admin}
                </a>
              </div>
              <div class="flex items-center text-sm text-gray-500">
                Channel ID: <span class="font-mono text-gray-700 ml-2">${report.preview.channelId}</span>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Workflow Timeline -->
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600">
            <h2 class="text-xl font-bold text-white">Workflow Timeline</h2>
          </div>
          <div class="p-6">
            <div class="relative">
              ${timelineSteps.map((step, index) => `
                <div class="ml-10 relative pb-8 timeline-item">
                  <div class="absolute -left-10 top-1">
                    <span class="h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                      step.result && step.result.success 
                        ? 'bg-green-500' 
                        : step.error 
                          ? 'bg-red-500' 
                          : 'bg-gray-400'
                    }">
                      ${
                        step.result && step.result.success 
                          ? `<svg class="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                            </svg>`
                          : step.error 
                            ? `<svg class="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                              </svg>`
                            : `<svg class="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
                              </svg>`
                      }
                    </span>
                  </div>
                  <div>
                    <div class="flex justify-between">
                      <h3 class="text-lg font-medium text-gray-900">${step.name}</h3>
                      <span class="text-sm text-gray-500">${step.formattedTime}</span>
                    </div>
                    <div class="mt-1 flex text-sm">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${
                        step.phase === 'Setup' ? 'blue' : 
                        step.phase === 'Validation' ? 'yellow' : 
                        step.phase === 'Build' ? 'purple' :
                        step.phase === 'Deploy' ? 'green' : 
                        step.phase === 'Results' ? 'indigo' : 'gray'
                      }-100 text-${
                        step.phase === 'Setup' ? 'blue' : 
                        step.phase === 'Validation' ? 'yellow' : 
                        step.phase === 'Build' ? 'purple' :
                        step.phase === 'Deploy' ? 'green' : 
                        step.phase === 'Results' ? 'indigo' : 'gray'
                      }-800 mr-3">
                        ${step.phase}
                      </span>
                      <span class="text-gray-500">Duration: ${step.duration}</span>
                    </div>
                    ${step.error ? `
                      <div class="mt-2 p-3 bg-red-50 text-red-700 rounded-md">
                        ${step.error}
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Workflow Options -->
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="px-6 py-4 bg-gradient-to-r from-gray-500 to-gray-600">
            <h2 class="text-xl font-bold text-white">Workflow Settings</h2>
          </div>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Workflow Options</h3>
                <dl class="divide-y divide-gray-200">
                  ${Object.entries(report.workflow.options || {}).map(([key, value]) => `
                    <div class="py-3 flex justify-between">
                      <dt class="text-sm font-medium text-gray-500">${key}</dt>
                      <dd class="text-sm text-gray-900 text-right">${value === true ? 'Yes' : value === false ? 'No' : value || 'N/A'}</dd>
                    </div>
                  `).join('')}
                </dl>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Git Information</h3>
                <dl class="divide-y divide-gray-200">
                  ${Object.entries(report.workflow.git || {}).map(([key, value]) => `
                    <div class="py-3 flex justify-between">
                      <dt class="text-sm font-medium text-gray-500">${key}</dt>
                      <dd class="text-sm text-gray-900 text-right">${value || 'N/A'}</dd>
                    </div>
                  `).join('')}
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Warnings and Suggestions Section - Full width below main content -->
    <div class="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
      <div class="px-6 py-4 bg-gradient-to-r from-amber-500 to-yellow-500">
        <h2 class="text-xl font-bold text-white">Warnings & Suggestions</h2>
      </div>
      <div class="p-6">
        ${Object.keys(warningsByCategory).length > 0 ? `
          <div class="space-y-8">
            ${Object.entries(warningsByCategory).map(([category, warnings]) => `
              <div>
                <h3 class="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">${category} (${warnings.length})</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  ${warnings.map(warning => `
                    <div class="warning-item">
                      <div class="text-gray-700 font-medium">${warning.message || warning}</div>
                      ${warning.step ? `<div class="text-sm text-gray-500 mt-1">Step: ${warning.step}</div>` : ''}
                      <div class="suggestion-item mt-2">
                        <div class="text-sm font-medium text-green-800">Suggestion:</div>
                        <div class="text-sm text-gray-700">${generateSuggestion(warning)}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="text-center py-6">
            <svg class="mx-auto h-12 w-12 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">No warnings</h3>
            <p class="mt-1 text-sm text-gray-500">Everything looks good!</p>
          </div>
        `}
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-8 text-center text-gray-500 text-sm">
      Generated at ${new Date(report.timestamp).toLocaleString()} • Workflow Duration: ${formatDuration(report.metrics?.duration || 0)}
    </div>
  </div>

  <script>
    // Simple script to enable collapsible sections
    document.addEventListener('DOMContentLoaded', function() {
      const collapsibles = document.querySelectorAll('[data-collapsible]');
      collapsibles.forEach(el => {
        el.addEventListener('click', function() {
          const target = document.querySelector(this.dataset.collapsible);
          if (target) {
            target.classList.toggle('hidden');
          }
        });
      });
    });
  </script>
</body>
</html>
`;
}

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
 * Format duration in milliseconds to human-readable form
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  
  return `${seconds}s`;
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

export default {
  generateReport
}; 