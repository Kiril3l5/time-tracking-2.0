/**
 * Dashboard Generator Module
 * 
 * Generates a dashboard with package-aware reporting.
 * Shows build status, test results, and deployment info.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate dashboard with package information
 * @param {Object} options - Dashboard options
 * @param {Object} options.workspaceState - Workspace state with package info
 * @param {Object} options.performance - Performance metrics
 * @returns {Promise<Object>} Dashboard generation result
 */
export async function generateDashboard(options = {}) {
  const startTime = Date.now();
  const result = {
    success: false,
    dashboardPath: null,
    error: null,
    duration: 0
  };

  try {
    const { workspaceState, performance } = options;
    logger.info('Generating dashboard...');

    // Create dashboard HTML
    const html = generateDashboardHtml(workspaceState, performance);

    // Save dashboard file
    const dashboardPath = join(dirname(__dirname), 'dashboard.html');
    fs.writeFileSync(dashboardPath, html);

    result.success = true;
    result.dashboardPath = dashboardPath;
    result.duration = Date.now() - startTime;

    return result;

  } catch (error) {
    logger.error('Dashboard generation failed:', error);
    result.error = error.message;
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Generate dashboard HTML
 * @param {Object} workspaceState - Workspace state
 * @param {Object} performance - Performance metrics
 * @returns {string} Dashboard HTML
 */
function generateDashboardHtml(workspaceState, performance) {
  const { packages, buildOrder, testOrder } = workspaceState;
  const { packageMetrics, sharedMetrics } = performance;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .section {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .package-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .package-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
      padding: 5px 0;
      border-bottom: 1px solid #eee;
    }
    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: 500;
    }
    .status-success {
      background: #d4edda;
      color: #155724;
    }
    .status-warning {
      background: #fff3cd;
      color: #856404;
    }
    .status-error {
      background: #f8d7da;
      color: #721c24;
    }
    .chart {
      height: 200px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Workflow Dashboard</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="section">
      <h2>Package Overview</h2>
      <div class="package-grid">
        ${packages.map(pkg => generatePackageCard(pkg, packageMetrics[pkg])).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Build Order</h2>
      <div class="build-order">
        ${buildOrder.map((pkg, index) => `
          <div class="metric">
            <span>${index + 1}. ${pkg}</span>
            <span>${formatDuration(packageMetrics[pkg]?.duration || 0)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Test Order</h2>
      <div class="test-order">
        ${testOrder.map((pkg, index) => `
          <div class="metric">
            <span>${index + 1}. ${pkg}</span>
            <span>${formatDuration(packageMetrics[pkg]?.duration || 0)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Shared Resources</h2>
      <div class="shared-resources">
        ${Object.entries(sharedMetrics).map(([resource, metrics]) => `
          <div class="metric">
            <span>${resource}</span>
            <span>${formatDuration(metrics.duration)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate package card HTML
 * @param {string} pkg - Package name
 * @param {Object} metrics - Package metrics
 * @returns {string} Package card HTML
 */
function generatePackageCard(pkg, metrics) {
  if (!metrics) return '';

  const status = metrics.issues?.length > 0 ? 'error' : 
                 metrics.warnings?.length > 0 ? 'warning' : 'success';

  return `
    <div class="package-card">
      <h3>${pkg}</h3>
      <div class="status status-${status}">
        ${status === 'success' ? '✓ Success' :
          status === 'warning' ? '⚠ Warning' : '✗ Error'}
      </div>
      <div class="metric">
        <span>Duration:</span>
        <span>${formatDuration(metrics.duration)}</span>
      </div>
      ${metrics.issues?.length > 0 ? `
        <div class="issues">
          <h4>Issues:</h4>
          <ul>
            ${metrics.issues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${metrics.warnings?.length > 0 ? `
        <div class="warnings">
          <h4>Warnings:</h4>
          <ul>
            ${metrics.warnings.map(warning => `<li>${warning}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default {
  generateDashboard
}; 