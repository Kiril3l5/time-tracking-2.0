#!/usr/bin/env node

/**
 * Consolidated Report Dashboard Generator
 * 
 * This module generates a unified HTML dashboard for the preview workflow that combines
 * multiple report types (build analysis, doc quality, bundle size, dead code, vulnerability)
 * into a single tabbed interface, reducing file clutter and providing a better user experience.
 * 
 * @module reports/consolidated-report
 */

import fs from 'fs';
import _path from 'path';
import process from 'node:process';
import * as logger from '../core/logger.js';

// Default report path
const DEFAULT_REPORT_PATH = 'preview-dashboard.html';

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
 * @param {string} [options.title] - Dashboard title
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
      title = `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`
    } = options;
    
    logger.info(`Generating consolidated report at ${reportPath}...`);
    
    // Generate HTML content
    const html = generateHtml({
      title,
      bundleData,
      docQualityData,
      deadCodeData,
      vulnerabilityData,
      performanceData
    });
    
    // Write to file
    fs.writeFileSync(reportPath, html);
    logger.success(`Consolidated report generated at ${reportPath}`);
    
    return true;
  } catch (error) {
    logger.error(`Failed to generate consolidated report: ${error.message}`);
    return false;
  }
}

/**
 * Generate HTML content for the dashboard
 * 
 * @param {Object} data - Data for the dashboard
 * @returns {string} - HTML content
 */
function generateHtml(data) {
  const { 
    title, 
    bundleData, 
    docQualityData, 
    deadCodeData, 
    vulnerabilityData,
    performanceData 
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
      --color-border: #ddd;
      --color-text: #333;
      --color-text-light: #666;
      --color-background: #f9f9f9;
      --border-radius: 8px;
      --shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--color-text);
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: var(--color-background);
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
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Generated on: ${new Date().toLocaleString()}</p>
  
  <div class="status-panel">
    <h2>Workflow Summary</h2>
    <div class="status-items">
      <div class="status-item">
        <div class="status-label">Build Status:</div>
        <div class="status-value success">✅ Completed</div>
      </div>
      ${performanceData ? `
      <div class="status-item">
        <div class="status-label">Total Duration:</div>
        <div class="status-value">${performanceData.totalDuration || '(Not available)'}</div>
      </div>
      ` : ''}
    </div>
  </div>
  
  <div class="tab-container">
    <div class="tabs">
      <div class="tab active" data-tab="overview">Overview</div>
      ${bundleData ? '<div class="tab" data-tab="bundle">Bundle Analysis</div>' : ''}
      ${docQualityData ? '<div class="tab" data-tab="doc-quality">Documentation Quality</div>' : ''}
      ${deadCodeData ? '<div class="tab" data-tab="dead-code">Dead Code Detection</div>' : ''}
      ${vulnerabilityData ? '<div class="tab" data-tab="vulnerability">Vulnerability Report</div>' : ''}
      ${performanceData ? '<div class="tab" data-tab="performance">Performance Metrics</div>' : ''}
    </div>
    
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
  </div>

  <script>
    // Simple tab switching functionality
    document.addEventListener('DOMContentLoaded', function() {
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active class from all tabs and content
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          
          // Add active class to clicked tab
          tab.classList.add('active');
          
          // Show corresponding content
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
function renderBundleRows(_data) {
  // Placeholder - implement based on actual data structure
  return '<tr><td colspan="3">Bundle data will be displayed here based on actual data structure.</td></tr>';
}

function renderDocIssueRows(_data) {
  // Placeholder - implement based on actual data structure
  return '<tr><td colspan="3">Documentation issues will be displayed here based on actual data structure.</td></tr>';
}

function renderUnusedExportsRows(_data) {
  // Placeholder - implement based on actual data structure
  return '<tr><td colspan="3">Unused exports will be displayed here based on actual data structure.</td></tr>';
}

function renderVulnerabilityRows(_data) {
  // Placeholder - implement based on actual data structure
  return '<tr><td colspan="4">Vulnerabilities will be displayed here based on actual data structure.</td></tr>';
}

function renderPerformanceRows(_data) {
  // Placeholder - implement based on actual data structure
  return '<tr><td colspan="3">Performance metrics will be displayed here based on actual data structure.</td></tr>';
}

// Utility functions for data extraction
function getBundleSize(data) {
  // Placeholder - replace with actual implementation
  return data?.totalSize || 0;
}

function getBundleIssueCount(data) {
  // Placeholder - replace with actual implementation
  return data?.issues?.length || 0;
}

function getDocCoverage(data) {
  // Placeholder - replace with actual implementation
  return data?.coverage || 0;
}

function getDocIssueCount(data) {
  // Placeholder - replace with actual implementation
  return data?.issues?.length || 0;
}

function getUnusedExportCount(data) {
  // Placeholder - replace with actual implementation
  return data?.unusedExports?.length || 0;
}

function getUnusedDependencyCount(data) {
  // Placeholder - replace with actual implementation
  return data?.unusedDependencies?.length || 0;
}

function getVulnerabilityCount(data, severity) {
  // Placeholder - replace with actual implementation
  return data?.vulnerabilities?.filter(v => v.severity === severity)?.length || 0;
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