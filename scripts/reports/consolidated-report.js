#!/usr/bin/env node

/**
 * Consolidated Report Dashboard Generator
 * 
 * This module generates a unified HTML dashboard for the preview workflow that combines
 * multiple report types and provides a beautiful, interactive interface for the entire workflow.
 * 
 * @module reports/consolidated-report
 */

import fs from 'fs';
import _path from 'path';
import process from 'node:process';
import { logger } from '../core/logger.js';
import { execSync } from 'child_process';
import { getCurrentBranch } from '../workflow/branch-manager.js';
import { QualityChecker } from '../workflow/quality-checker.js';
import { deployPackage } from '../workflow/deployment-manager.js';
import { WORKFLOW_STEPS } from '../workflow/step-runner.js';

// Default report path
const DEFAULT_REPORT_PATH = 'preview-dashboard.html';

/**
 * Open the dashboard in the default browser
 * @param {string} dashboardPath - Path to the dashboard file
 */
async function openDashboard(dashboardPath) {
  try {
    // Try different commands based on the platform
    const platform = process.platform;
    let command;
    
    switch (platform) {
      case 'darwin': // macOS
        command = `open "${dashboardPath}"`;
        break;
      case 'win32': // Windows
        command = `start "" "${dashboardPath}"`;
        break;
      default: // Linux and others
        command = `xdg-open "${dashboardPath}"`;
    }
    
    execSync(command, { stdio: 'pipe' });
    logger.success('Dashboard opened in your default browser');
  } catch (error) {
    logger.warn('Could not open dashboard automatically. Please open preview-dashboard.html in your browser.');
  }
}

/**
 * Main function to generate a consolidated dashboard
 * 
 * @param {Object} options - Options for report generation
 * @param {string} [options.reportPath] - Path to save the report
 * @param {Object} [options.bundleData] - Bundle analysis data
 * @param {Object} [options.docQualityData] - Documentation quality data
 * @param {Object} [options.deadCodeData] - Dead code analysis data
 * @param {Object} [options.vulnerabilityData] - Dependency vulnerability data
 * @param {Object} [options.performanceData] - Performance metrics data
 * @param {Object} [options.previewUrls] - Preview URLs
 * @param {string} [options.title] - Dashboard title
 * @param {boolean} [options.openInBrowser] - Whether to open the dashboard in browser
 * @returns {Promise<boolean>} - Whether the report was generated successfully
 */
export async function generateConsolidatedReport(options = {}) {
  try {
    const {
      reportPath = DEFAULT_REPORT_PATH,
      bundleData = null,
      docQualityData = null, 
      deadCodeData = null,
      vulnerabilityData = null,
      performanceData = null,
      previewUrls = null,
      title = `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`,
      openInBrowser = true
    } = options;
    
    logger.info(`Generating enhanced dashboard at ${reportPath}...`);
    
    // Collect additional data
    const gitData = await getCurrentBranch();
    const qualityChecker = new QualityChecker();
    const qualityData = await qualityChecker.runQualityChecks();
    const deploymentData = await deployPackage('preview');
    const stepData = await WORKFLOW_STEPS;
    
    // Generate HTML content
    const html = generateHtml({
      title,
      bundleData,
      docQualityData,
      deadCodeData,
      vulnerabilityData,
      performanceData,
      previewUrls,
      gitData,
      qualityData,
      deploymentData,
      stepData
    });
    
    // Write to file
    fs.writeFileSync(reportPath, html);
    logger.success(`Enhanced dashboard generated at ${reportPath}`);
    
    // Open in browser if requested
    if (openInBrowser) {
      await openDashboard(reportPath);
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to generate dashboard: ${error.message}`);
    return false;
  }
}

/**
 * Generate the enhanced HTML content
 */
function generateHtml(data) {
  const { 
    title, 
    bundleData, 
    docQualityData, 
    deadCodeData, 
    vulnerabilityData,
    performanceData,
    previewUrls,
    gitData,
    qualityData,
    deploymentData,
    stepData
  } = data;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --color-primary: #0066cc;
      --color-primary-light: #e6f0ff;
      --color-secondary: #00994d;
      --color-secondary-light: #e6fff0;
      --color-warning: #cc3300;
      --color-warning-light: #fff0e6;
      --color-border: #dddddd;
      --color-text: #333;
      --color-text-light: #777777;
      --color-background: #f9f9f9;
      --color-bg-light: #f8f8f8;
      --color-bg-dark: #f0f0f0;
      --border-radius: 8px;
      --shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: var(--color-text);
      max-width: 1200px;
      margin: 0;
      padding: 20px;
      background-color: #fff;
    }
    h1 {
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
      color: var(--color-text);
    }
    h2 {
      margin-top: 30px;
      color: var(--color-primary);
      border-left: 4px solid var(--color-primary);
      padding-left: 10px;
    }
    h3 {
      color: var(--color-secondary);
      margin-top: 25px;
    }
    .report-container {
      margin-bottom: 40px;
    }
    .tab-container {
      margin-top: 30px;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 20px;
      overflow-x: auto;
    }
    .tab {
      padding: 10px 20px;
      cursor: pointer;
      background: white;
      border: 1px solid var(--color-border);
      border-bottom: none;
      border-radius: 8px 8px 0 0;
      margin-right: 4px;
      font-weight: 500;
      position: relative;
      bottom: -1px;
    }
    .tab.active {
      background: var(--color-primary-light);
      border-bottom: 1px solid var(--color-primary-light);
      color: var(--color-primary);
      font-weight: bold;
    }
    .tab-content {
      display: none;
      background: white;
      padding: 20px;
      border-radius: 0 0 8px 8px;
      border: 1px solid var(--color-border);
      border-top: none;
    }
    .tab-content.active {
      display: block;
    }
    .status-panel {
      margin: 20px 0;
      padding: 15px;
      background-color: white;
      border-radius: var(--border-radius);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow);
    }
    .status-panel h3 {
      margin-top: 0;
    }
    .status-item {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      padding: 8px;
      border-radius: 4px;
      background-color: #f5f5f5;
    }
    .status-label {
      font-weight: 500;
      margin-right: 10px;
      min-width: 200px;
    }
    .status-value {
      flex-grow: 1;
    }
    .status-value.success {
      color: var(--color-secondary);
    }
    .status-value.warning {
      color: orange;
    }
    .status-value.error {
      color: var(--color-warning);
    }
    .preview-urls-panel {
      border: 2px solid var(--color-primary);
      border-radius: 8px;
      padding: 15px 20px;
      margin: 0 0 25px 0;
      background-color: var(--color-primary-light);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    .preview-urls-panel h2 {
      color: var(--color-primary);
      margin-top: 0;
      border-bottom: 1px solid var(--color-primary);
      padding-bottom: 8px;
    }
    .preview-url-item {
      display: flex;
      align-items: center;
      margin: 10px 0;
      padding: 10px;
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    .preview-url-label {
      font-weight: bold;
      min-width: 120px;
      color: var(--color-primary);
    }
    .preview-url-value {
      word-break: break-all;
    }
    .preview-url-value a {
      color: var(--color-primary);
      text-decoration: none;
      word-break: break-all;
      padding: 5px 10px;
      border: 1px solid var(--color-primary);
      border-radius: 4px;
      display: inline-block;
      transition: all 0.2s ease;
    }
    .preview-url-value a:hover {
      background-color: var(--color-primary);
      color: white;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      border: 1px solid var(--color-border);
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
      font-weight: 500;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .summary-card {
      background: white;
      border-radius: var(--border-radius);
      padding: 15px;
      box-shadow: var(--shadow);
      border: 1px solid var(--color-border);
    }
    .summary-card h3 {
      margin-top: 0;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 5px;
    }
    .badge.success { background-color: var(--color-secondary-light); color: var(--color-secondary); }
    .badge.warning { background-color: #fff3e0; color: #e65100; }
    .badge.error { background-color: var(--color-warning-light); color: var(--color-warning); }
    .empty-message {
      padding: 20px;
      text-align: center;
      color: var(--color-text-light);
      font-style: italic;
      background-color: #f5f5f5;
      border-radius: var(--border-radius);
      margin: 20px 0;
    }
    @media (max-width: 768px) {
      .summary-cards {
        grid-template-columns: 1fr;
      }
    }

    /* Missing URLs Panel */
    .missing-urls {
      border-color: var(--color-warning);
      background-color: var(--color-warning-light);
    }

    .missing-urls h2 {
      color: var(--color-warning);
      border-bottom-color: var(--color-warning);
    }

    .missing-urls ul {
      margin-left: 20px;
      padding-left: 10px;
    }

    .missing-urls li {
      margin-bottom: 5px;
    }

    /* Add new styles for quick actions */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    
    .quick-action-card {
      background: white;
      border-radius: var(--border-radius);
      padding: 15px;
      box-shadow: var(--shadow);
      border: 1px solid var(--color-border);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .quick-action-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .quick-action-card h3 {
      margin: 0 0 10px 0;
      color: var(--color-primary);
    }
    
    .quick-action-card p {
      margin: 0;
      font-size: 0.9em;
      color: var(--color-text-light);
    }
    
    /* Add styles for deployment info */
    .deployment-info {
      background: var(--color-primary-light);
      border-radius: var(--border-radius);
      padding: 15px;
      margin: 20px 0;
    }
    
    .deployment-info h2 {
      margin-top: 0;
      color: var(--color-primary);
    }
    
    .deployment-info ul {
      margin: 0;
      padding-left: 20px;
    }
    
    .deployment-info li {
      margin-bottom: 5px;
    }
    
    /* Add styles for next steps */
    .next-steps {
      background: var(--color-secondary-light);
      border-radius: var(--border-radius);
      padding: 15px;
      margin: 20px 0;
    }
    
    .next-steps h2 {
      margin-top: 0;
      color: var(--color-secondary);
    }
    
    .next-steps ol {
      margin: 0;
      padding-left: 20px;
    }
    
    .next-steps li {
      margin-bottom: 10px;
    }

    /* New styles for workflow status */
    .workflow-status {
      background: white;
      border-radius: var(--border-radius);
      padding: 20px;
      margin: 20px 0;
      box-shadow: var(--shadow);
    }
    
    .status-timeline {
      display: flex;
      justify-content: space-between;
      margin-top: 15px;
      position: relative;
    }
    
    .status-timeline::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--color-border);
      z-index: 1;
    }
    
    .status-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      z-index: 2;
      background: white;
      padding: 0 10px;
    }
    
    .step-icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--color-bg-light);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 5px;
      font-weight: bold;
    }
    
    .status-step.completed .step-icon {
      background: var(--color-secondary);
      color: white;
    }
    
    .status-step.current .step-icon {
      background: var(--color-primary);
      color: white;
    }
    
    .step-label {
      font-size: 0.9em;
      color: var(--color-text-light);
    }
    
    /* Branch info styles */
    .branch-info {
      background: var(--color-bg-light);
      border-radius: var(--border-radius);
      padding: 15px;
      margin: 20px 0;
    }
    
    .branch-info ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
    }
    
    .branch-info li {
      padding: 10px;
      background: white;
      border-radius: 4px;
      box-shadow: var(--shadow);
    }
    
    /* Environment comparison styles */
    .environment-comparison {
      margin: 20px 0;
    }
    
    .environment-comparison table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    
    .environment-comparison th,
    .environment-comparison td {
      padding: 10px;
      text-align: left;
      border: 1px solid var(--color-border);
    }
    
    .environment-comparison th {
      background: var(--color-bg-light);
    }
    
    /* Error summary styles */
    .error-summary {
      background: var(--color-warning-light);
      border-radius: var(--border-radius);
      padding: 15px;
      margin: 20px 0;
    }
    
    .error-summary h2 {
      color: var(--color-warning);
      margin-top: 0;
    }
    
    .error-summary ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .error-summary li {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      padding: 8px;
      background: white;
      border-radius: 4px;
    }
    
    .error-severity {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      margin-right: 10px;
    }
    
    .error-severity.critical { background: #ffebee; color: #c62828; }
    .error-severity.high { background: #fff3e0; color: #e65100; }
    .error-severity.medium { background: #fff8e1; color: #f57f17; }
    .error-severity.low { background: #f1f8e9; color: #33691e; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Generated on: ${new Date().toLocaleString()}</p>
  
  <!-- Workflow Status -->
  <div class="workflow-status">
    <h2>Workflow Status</h2>
    <div class="status-timeline">
      ${generateWorkflowStatus(stepData)}
    </div>
  </div>
  
  <!-- Quick Actions -->
  <div class="quick-actions">
    ${generateQuickActions(previewUrls, gitData)}
  </div>
  
  <!-- Branch Information -->
  <div class="branch-info">
    <h2>Branch Information</h2>
    <ul>
      <li><strong>Current Branch:</strong> ${gitData.currentBranch}</li>
      <li><strong>Base Branch:</strong> ${gitData.baseBranch}</li>
      <li><strong>Last Commit:</strong> ${gitData.lastCommit}</li>
      <li><strong>Changes:</strong> ${gitData.changes}</li>
    </ul>
  </div>
  
  <!-- Preview URLs -->
  ${generatePreviewUrls(previewUrls)}
  
  <!-- Deployment Information -->
  <div class="deployment-info">
    <h2>📊 Deployment Information</h2>
    <ul>
      <li><strong>Build Status:</strong> ${deploymentData.buildStatus}</li>
      <li><strong>Total Duration:</strong> ${deploymentData.totalDuration}</li>
      <li><strong>Build Time:</strong> ${deploymentData.buildTime}</li>
      <li><strong>Deployment Time:</strong> ${deploymentData.deploymentTime}</li>
      <li><strong>Environment:</strong> ${deploymentData.environment}</li>
    </ul>
  </div>
  
  <!-- Environment Comparison -->
  <div class="environment-comparison">
    <h2>Environment Comparison</h2>
    <table>
      <tr>
        <th>Metric</th>
        <th>Development</th>
        <th>Production</th>
        <th>Change</th>
      </tr>
      ${generateEnvironmentComparison(qualityData)}
    </table>
  </div>
  
  <!-- Error Summary -->
  ${generateErrorSummary(qualityData)}
  
  <!-- Next Steps -->
  <div class="next-steps">
    <h2>📝 Next Steps</h2>
    <ol>
      ${generateNextSteps(qualityData, deploymentData)}
    </ol>
  </div>
  
  <!-- Quality Metrics -->
  <div class="status-panel">
    <h2>Quality Metrics</h2>
    <div class="status-items">
      ${generateQualityMetrics(bundleData, deadCodeData, vulnerabilityData, docQualityData)}
    </div>
  </div>
  
  <!-- Detailed Reports -->
  <div class="tab-container">
    <div class="tabs">
      <div class="tab active" data-tab="overview">Overview</div>
      ${bundleData ? '<div class="tab" data-tab="bundle">Bundle Analysis</div>' : ''}
      ${docQualityData ? '<div class="tab" data-tab="doc-quality">Documentation Quality</div>' : ''}
      ${deadCodeData ? '<div class="tab" data-tab="dead-code">Dead Code Detection</div>' : ''}
      ${vulnerabilityData ? '<div class="tab" data-tab="vulnerability">Vulnerability Report</div>' : ''}
      ${performanceData ? '<div class="tab" data-tab="performance">Performance Metrics</div>' : ''}
    </div>
    
    <!-- Tab Contents -->
    ${generateTabContents(data)}
  </div>

  <script>
    // Tab switching functionality
    document.addEventListener('DOMContentLoaded', function() {
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          tab.classList.add('active');
          const tabId = tab.getAttribute('data-tab');
          document.getElementById(tabId).classList.add('active');
        });
      });
    });
  </script>
</body>
</html>`;
}

/**
 * Generate workflow status HTML
 */
function generateWorkflowStatus(stepData) {
  const steps = [
    { id: 'auth', label: 'Authentication', icon: '🔐' },
    { id: 'quality', label: 'Quality Checks', icon: '✅' },
    { id: 'build', label: 'Build', icon: '🏗️' },
    { id: 'deploy', label: 'Deployment', icon: '🚀' },
    { id: 'report', label: 'Reporting', icon: '📊' }
  ];
  
  return steps.map(step => {
    const status = stepData[step.id];
    return `
      <div class="status-step ${status?.completed ? 'completed' : status?.current ? 'current' : ''}">
        <span class="step-icon">${step.icon}</span>
        <span class="step-label">${step.label}</span>
      </div>
    `;
  }).join('');
}

/**
 * Generate quick actions HTML
 */
function generateQuickActions(previewUrls, gitData) {
  return `
    <div class="quick-action-card" onclick="window.open('${previewUrls?.admin || '#'}', '_blank')">
      <h3>🚀 Open Admin Portal</h3>
      <p>Access the admin interface of your preview deployment</p>
    </div>
    <div class="quick-action-card" onclick="window.open('${previewUrls?.hours || '#'}', '_blank')">
      <h3>⏰ Open Hours Portal</h3>
      <p>Access the hours interface of your preview deployment</p>
    </div>
    <div class="quick-action-card" onclick="window.open('https://github.com/${gitData.owner}/${gitData.repo}/pulls', '_blank')">
      <h3>📝 Create Pull Request</h3>
      <p>Create a PR with your changes and preview URLs</p>
    </div>
    <div class="quick-action-card" onclick="window.open('https://github.com/${gitData.owner}/${gitData.repo}/actions', '_blank')">
      <h3>🔄 View CI Status</h3>
      <p>Check the status of your CI/CD pipeline</p>
    </div>
    <div class="quick-action-card" onclick="window.open('${gitData.docsUrl}', '_blank')">
      <h3>📚 View Documentation</h3>
      <p>Access relevant documentation for this feature</p>
    </div>
    <div class="quick-action-card" onclick="window.open('${gitData.testUrl}', '_blank')">
      <h3>🧪 Run Tests</h3>
      <p>Run tests for this feature</p>
    </div>
  `;
}

/**
 * Generate environment comparison HTML
 */
function generateEnvironmentComparison(qualityData) {
  if (!qualityData?.environments) {
    return '<tr><td colspan="4">No environment comparison data available</td></tr>';
  }
  
  return Object.entries(qualityData.environments).map(([metric, values]) => `
    <tr>
      <td>${metric}</td>
      <td>${values.dev}</td>
      <td>${values.prod}</td>
      <td>
        <span class="badge ${values.change > 0 ? 'success' : values.change < 0 ? 'error' : ''}">
          ${values.change > 0 ? '+' : ''}${values.change}%
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * Generate error summary HTML
 */
function generateErrorSummary(qualityData) {
  if (!qualityData?.errors?.length) {
    return '';
  }
  
  return `
    <div class="error-summary">
      <h2>⚠️ Issues Found</h2>
      <ul>
        ${qualityData.errors.map(error => `
          <li>
            <span class="error-severity ${error.severity}">${error.severity}</span>
            ${error.message}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * Generate next steps HTML
 */
function generateNextSteps(qualityData, deploymentData) {
  const steps = [];
  
  // Add steps based on quality data
  if (qualityData?.errors?.length) {
    steps.push('<li>Review and fix the issues found in the quality checks</li>');
  }
  
  // Add steps based on deployment data
  if (deploymentData?.status === 'success') {
    steps.push('<li>Review the preview deployment using the URLs above</li>');
    steps.push('<li>Share the preview URLs with your team for review</li>');
  }
  
  // Add common steps
  steps.push(
    '<li>Check the quality metrics in the tabs below</li>',
    '<li>Create a Pull Request with your changes</li>',
    '<li>Monitor the CI/CD pipeline for any issues</li>'
  );
  
  return steps.join('');
}

/**
 * Generate content for bundle analysis tab
 * @param {Object} data - Bundle analysis data
 * @returns {string} - HTML content
 */
function generateBundleContent(data) {
  if (!data) {
    return '<div class="empty-message">No bundle analysis data available.</div>';
  }
  
  // Placeholder implementation - expand based on actual data structure
  return `
    <div class="summary-card">
      <h3>Bundle Size Summary</h3>
      <p>Total Size: ${formatBytes(getBundleSize(data))}</p>
    </div>
    
    <h3>Size by Package</h3>
    <table>
      <tr>
        <th>Package</th>
        <th>Size</th>
        <th>Change</th>
      </tr>
      ${renderBundleRows(data)}
    </table>
  `;
}

/**
 * Generate content for documentation quality tab
 * @param {Object} data - Documentation quality data
 * @returns {string} - HTML content
 */
function generateDocQualityContent(data) {
  if (!data) {
    return '<div class="empty-message">No documentation quality data available.</div>';
  }
  
  // Placeholder implementation - expand based on actual data structure
  return `
    <div class="summary-card">
      <h3>Documentation Coverage</h3>
      <p>Overall Coverage: ${getDocCoverage(data)}%</p>
    </div>
    
    <h3>Documentation Issues</h3>
    <table>
      <tr>
        <th>File</th>
        <th>Issue</th>
        <th>Severity</th>
      </tr>
      ${renderDocIssueRows(data)}
    </table>
  `;
}

/**
 * Generate content for dead code analysis tab
 * @param {Object} data - Dead code analysis data
 * @returns {string} - HTML content
 */
function generateDeadCodeContent(data) {
  if (!data) {
    return '<div class="empty-message">No dead code analysis data available.</div>';
  }
  
  // Placeholder implementation - expand based on actual data structure
  return `
    <div class="summary-card">
      <h3>Dead Code Summary</h3>
      <p>Unused Exports: ${getUnusedExportCount(data)}</p>
      <p>Unused Dependencies: ${getUnusedDependencyCount(data)}</p>
    </div>
    
    <h3>Unused Exports</h3>
    <table>
      <tr>
        <th>File</th>
        <th>Export</th>
        <th>Type</th>
      </tr>
      ${renderUnusedExportsRows(data)}
    </table>
  `;
}

/**
 * Generate content for vulnerability report tab
 * @param {Object} data - Vulnerability data
 * @returns {string} - HTML content
 */
function generateVulnerabilityContent(data) {
  if (!data) {
    return '<div class="empty-message">No vulnerability data available.</div>';
  }
  
  // Placeholder implementation - expand based on actual data structure
  return `
    <div class="summary-card">
      <h3>Vulnerability Summary</h3>
      <p>Critical: ${getVulnerabilityCount(data, 'critical')}</p>
      <p>High: ${getVulnerabilityCount(data, 'high')}</p>
      <p>Medium: ${getVulnerabilityCount(data, 'medium')}</p>
      <p>Low: ${getVulnerabilityCount(data, 'low')}</p>
    </div>
    
    <h3>Vulnerabilities by Package</h3>
    <table>
      <tr>
        <th>Package</th>
        <th>Version</th>
        <th>Severity</th>
        <th>Description</th>
      </tr>
      ${renderVulnerabilityRows(data)}
    </table>
  `;
}

/**
 * Generate content for performance metrics tab
 * @param {Object} data - Performance data
 * @returns {string} - HTML content
 */
function generatePerformanceContent(data) {
  if (!data) {
    return '<div class="empty-message">No performance data available.</div>';
  }
  
  // Placeholder implementation - expand based on actual data structure
  return `
    <div class="summary-card">
      <h3>Performance Summary</h3>
      <p>Total Duration: ${data.totalDuration || 'N/A'}</p>
      <p>Steps Completed: ${data.stepsCompleted || 'N/A'}</p>
    </div>
    
    <h3>Step Breakdown</h3>
    <table>
      <tr>
        <th>Step</th>
        <th>Duration</th>
        <th>Status</th>
      </tr>
      ${renderPerformanceRows(data)}
    </table>
  `;
}

// Helper functions to render content based on available data
function renderBundleRows(data) {
  if (!data?.assets?.length) {
    return '<tr><td colspan="3">No bundle data available</td></tr>';
  }
  
  return data.assets
    .sort((a, b) => b.size - a.size)
    .map(asset => `
      <tr>
        <td>${asset.name}</td>
        <td>${formatBytes(asset.size)}</td>
        <td>${asset.isNew ? '<span class="badge warning">New</span>' : 
             asset.sizeChange > 0 ? `<span class="badge error">+${formatBytes(asset.sizeChange)}</span>` :
             asset.sizeChange < 0 ? `<span class="badge success">${formatBytes(asset.sizeChange)}</span>` :
             '<span class="badge">No change</span>'
            }</td>
      </tr>
    `).join('');
}

function renderDocIssueRows(data) {
  if (!data?.issues?.length) {
    return '<tr><td colspan="3">No documentation issues found</td></tr>';
  }
  
  return data.issues
    .map(issue => `
      <tr>
        <td>${issue.file}</td>
        <td>${issue.message}</td>
        <td>
          <span class="badge ${issue.severity === 'error' ? 'error' : 
                               issue.severity === 'warning' ? 'warning' : 
                               'success'}">${issue.severity}</span>
        </td>
      </tr>
    `).join('');
}

function renderUnusedExportsRows(data) {
  if (!data?.unusedExports?.length) {
    return '<tr><td colspan="3">No unused exports found</td></tr>';
  }
  
  return data.unusedExports
    .map(exp => `
      <tr>
        <td>${exp.file}</td>
        <td>${exp.name}</td>
        <td>${exp.type}</td>
      </tr>
    `).join('');
}

function renderVulnerabilityRows(data) {
  if (!data?.vulnerabilities?.length) {
    return '<tr><td colspan="4">No vulnerabilities found</td></tr>';
  }
  
  return data.vulnerabilities
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .map(vuln => `
      <tr>
        <td>${vuln.package}</td>
        <td>${vuln.version}</td>
        <td><span class="badge ${vuln.severity}">${vuln.severity}</span></td>
        <td>${vuln.description}</td>
      </tr>
    `).join('');
}

function renderPerformanceRows(data) {
  if (!data?.steps?.length) {
    return '<tr><td colspan="3">No performance data available</td></tr>';
  }
  
  return data.steps
    .map(step => `
      <tr>
        <td>${step.name}</td>
        <td>${step.duration}</td>
        <td>
          <span class="badge ${step.status === 'success' ? 'success' : 
                               step.status === 'warning' ? 'warning' : 
                               'error'}">${step.status}</span>
        </td>
      </tr>
    `).join('');
}

// Utility functions for data extraction
function getBundleSize(data) {
  if (!data) return 0;
  
  // Sum up all asset sizes
  let totalSize = 0;
  if (data.assets) {
    totalSize = data.assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
  }
  return totalSize;
}

function getBundleIssueCount(data) {
  if (!data) return 0;
  return (data.warnings?.length || 0) + (data.errors?.length || 0);
}

function getDocCoverage(data) {
  if (!data) return 0;
  
  const totalFiles = data.totalFiles || 0;
  const documentedFiles = data.documentedFiles || 0;
  
  if (totalFiles === 0) return 0;
  return Math.round((documentedFiles / totalFiles) * 100);
}

function getDocIssueCount(data) {
  if (!data) return 0;
  return data.issues?.length || 0;
}

function getUnusedExportCount(data) {
  if (!data) return 0;
  return data.unusedExports?.length || 0;
}

function getUnusedDependencyCount(data) {
  if (!data) return 0;
  return data.unusedDependencies?.length || 0;
}

function getVulnerabilityCount(data, severity) {
  if (!data?.vulnerabilities) return 0;
  return data.vulnerabilities.filter(v => v.severity === severity).length;
}

// Utility function to format byte sizes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Generate quality metrics HTML
 */
function generateQualityMetrics(bundleData, deadCodeData, vulnerabilityData, docQualityData) {
  return `
    <div class="status-item">
      <div class="status-label">Bundle Size:</div>
      <div class="status-value ${bundleData?.sizeIncrease > 10 ? 'warning' : 'success'}">
        ${bundleData?.totalSize ? `${bundleData.totalSize}KB` : 'N/A'}
        ${bundleData?.sizeIncrease ? ` (${bundleData.sizeIncrease}% change)` : ''}
      </div>
    </div>
    <div class="status-item">
      <div class="status-label">Dead Code:</div>
      <div class="status-value ${deadCodeData?.totalFiles > 0 ? 'warning' : 'success'}">
        ${deadCodeData?.totalFiles || 0} files with unused code
      </div>
    </div>
    <div class="status-item">
      <div class="status-label">Vulnerabilities:</div>
      <div class="status-value ${vulnerabilityData?.highSeverity > 0 ? 'error' : 'success'}">
        ${vulnerabilityData?.highSeverity || 0} high, ${vulnerabilityData?.mediumSeverity || 0} medium
      </div>
    </div>
    <div class="status-item">
      <div class="status-label">Documentation:</div>
      <div class="status-value ${docQualityData?.totalIssues > 0 ? 'warning' : 'success'}">
        ${docQualityData?.totalIssues || 0} issues
      </div>
    </div>
  `;
}

/**
 * Generate preview URLs HTML
 */
function generatePreviewUrls(previewUrls) {
  if (!previewUrls) {
    return `
    <div class="preview-urls-panel missing-urls">
      <h2>⚠️ Preview URLs Not Available</h2>
      <p>No preview URLs were found for this deployment. This might happen if:</p>
      <ul>
        <li>The deployment is still in progress</li>
        <li>The deployment encountered issues</li>
        <li>URL extraction failed</li>
      </ul>
      <p>Check the deployment logs for more information.</p>
    </div>
    `;
  }
  
  return `
  <div class="preview-urls-panel">
    <h2>🚀 Preview URLs</h2>
    <p>Use these URLs to test the current preview deployment:</p>
    
    ${previewUrls.admin ? `
    <div class="preview-url-item">
      <div class="preview-url-label">Admin Portal:</div>
      <div class="preview-url-value">
        <a href="${previewUrls.admin}" target="_blank">${previewUrls.admin}</a>
      </div>
    </div>
    ` : ''}
    
    ${previewUrls.hours ? `
    <div class="preview-url-item">
      <div class="preview-url-label">Hours Portal:</div>
      <div class="preview-url-value">
        <a href="${previewUrls.hours}" target="_blank">${previewUrls.hours}</a>
      </div>
    </div>
    ` : ''}
    
    <p style="margin-top: 15px;"><small>Note: These preview URLs will remain accessible until the preview environment is deleted or expires.</small></p>
  </div>
  `;
}

/**
 * Generate tab contents HTML
 */
function generateTabContents(data) {
  const {
    bundleData,
    docQualityData,
    deadCodeData,
    vulnerabilityData,
    performanceData
  } = data;
  
  return `
    <!-- Overview Tab -->
    <div class="tab-content active" id="overview">
      <h2>Project Overview</h2>
      
      <div class="summary-cards">
        ${bundleData ? `
        <div class="summary-card">
          <h3>Bundle Analysis</h3>
          <p>Bundle Size: ${formatBytes(getBundleSize(bundleData))}</p>
          <p>Issues: ${getBundleIssueCount(bundleData)}</p>
        </div>
        ` : ''}
        
        ${docQualityData ? `
        <div class="summary-card">
          <h3>Documentation Quality</h3>
          <p>Coverage: ${getDocCoverage(docQualityData)}%</p>
          <p>Issues: ${getDocIssueCount(docQualityData)}</p>
        </div>
        ` : ''}
        
        ${deadCodeData ? `
        <div class="summary-card">
          <h3>Dead Code</h3>
          <p>Unused Exports: ${getUnusedExportCount(deadCodeData)}</p>
          <p>Unused Dependencies: ${getUnusedDependencyCount(deadCodeData)}</p>
        </div>
        ` : ''}
        
        ${vulnerabilityData ? `
        <div class="summary-card">
          <h3>Vulnerabilities</h3>
          <p>Critical: ${getVulnerabilityCount(vulnerabilityData, 'critical')}</p>
          <p>High: ${getVulnerabilityCount(vulnerabilityData, 'high')}</p>
          <p>Medium: ${getVulnerabilityCount(vulnerabilityData, 'medium')}</p>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Bundle Analysis Tab -->
    ${bundleData ? `
    <div class="tab-content" id="bundle">
      <h2>Bundle Size Analysis</h2>
      ${generateBundleContent(bundleData)}
    </div>
    ` : ''}
    
    <!-- Documentation Quality Tab -->
    ${docQualityData ? `
    <div class="tab-content" id="doc-quality">
      <h2>Documentation Quality Report</h2>
      ${generateDocQualityContent(docQualityData)}
    </div>
    ` : ''}
    
    <!-- Dead Code Tab -->
    ${deadCodeData ? `
    <div class="tab-content" id="dead-code">
      <h2>Dead Code Analysis</h2>
      ${generateDeadCodeContent(deadCodeData)}
    </div>
    ` : ''}
    
    <!-- Vulnerability Tab -->
    ${vulnerabilityData ? `
    <div class="tab-content" id="vulnerability">
      <h2>Vulnerability Report</h2>
      ${generateVulnerabilityContent(vulnerabilityData)}
    </div>
    ` : ''}
    
    <!-- Performance Tab -->
    ${performanceData ? `
    <div class="tab-content" id="performance">
      <h2>Performance Metrics</h2>
      ${generatePerformanceContent(performanceData)}
    </div>
    ` : ''}
  `;
}

// If run directly
if (process.argv[1] === import.meta.url) {
  // This allows this module to be run directly for testing
  const testData = {
    reportPath: 'test-dashboard.html',
    title: 'Test Dashboard',
    performanceData: {
      totalDuration: '2m 34s',
      stepsCompleted: '8/10'
    }
  };
  
  generateConsolidatedReport(testData)
    .then(result => {
      if (result) {
        logger.success('Test report generated successfully');
      } else {
        logger.error('Failed to generate test report');
      }
    });
} 