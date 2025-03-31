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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a consolidated report for the workflow
 * @param {Object} data Report data
 * @returns {Promise<Object>} Generated report
 */
export async function generateReport(data) {
  try {
    // Load any existing metrics from files
    const existingMetrics = loadExistingMetrics();
    
    // Create the full report by combining passed data and existing metrics
    const report = {
      timestamp: data.timestamp || new Date().toISOString(),
      metrics: {
        duration: data.metrics?.duration || 0,
        ...existingMetrics?.metrics || {}
      },
      preview: data.preview || {
        hours: 'Not deployed',
        admin: 'Not deployed',
        channelId: 'None'
      },
      workflow: {
        options: data.workflow?.options || {},
        git: data.workflow?.git || {},
        steps: existingMetrics?.steps || []
      },
      warnings: existingMetrics?.warnings || [],
      errors: existingMetrics?.errors || []
    };

    // Generate HTML report
    const htmlReport = generateHtmlReport(report);

    // Save report
    const reportPaths = await saveReport(report, htmlReport);
    
    // Save a copy as preview-dashboard.html in the root
    const dashboardPath = join(process.cwd(), 'preview-dashboard.html');
    await writeFile(dashboardPath, generateDashboardHtml(report));
    logger.info(`✨ Generated dashboard: ${dashboardPath}`);
    
    // Open the dashboard in the default browser
    openInBrowser(dashboardPath);
    
    return {
      ...report,
      reportPaths,
      dashboardPath
    };
  } catch (error) {
    logger.error(`Error generating report: ${error.message}`);
    return {
      timestamp: new Date().toISOString(),
      error: error.message
    };
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
    .header-gradient {
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
    }
    .card {
      transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    .step-card {
      border-left: 4px solid #3b82f6;
    }
    .success-card {
      border-left: 4px solid #10b981;
    }
    .error-card {
      border-left: 4px solid #ef4444;
    }
    .warning-card {
      border-left: 4px solid #f59e0b;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-blue {
      background-color: #dbeafe;
      color: #1e40af;
    }
    .badge-green {
      background-color: #d1fae5;
      color: #065f46;
    }
    .badge-yellow {
      background-color: #fef3c7;
      color: #92400e;
    }
    .badge-red {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    .timeline-item {
      position: relative;
      padding-left: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      background-color: #3b82f6;
    }
    .timeline-item::after {
      content: '';
      position: absolute;
      left: 0.5rem;
      top: 1rem;
      bottom: -1.5rem;
      width: 1px;
      background-color: #e5e7eb;
      transform: translateX(-50%);
    }
    .timeline-item:last-child::after {
      display: none;
    }
    .animate-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: .5;
      }
    }
  </style>
</head>
<body>
  <div class="container mx-auto px-4 py-8">
    <header class="header-gradient text-white p-6 rounded-lg shadow-lg mb-8">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold">Workflow Dashboard</h1>
          <p class="text-gray-100 mt-1">Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        </div>
        <div class="text-right">
          <span class="badge bg-white text-indigo-600">Branch: ${report.workflow.git.branch || 'Unknown'}</span>
          <p class="text-gray-100 mt-2">Duration: ${formatDuration(report.metrics.duration)}</p>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <!-- Preview URLs -->
      <div class="bg-white p-6 rounded-lg shadow">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Preview URLs</h2>
        <div class="space-y-4">
          ${report.preview.hours !== 'Not deployed' ? `
            <div class="card success-card p-4 rounded bg-green-50">
              <h3 class="font-semibold text-green-800">Hours App</h3>
              <a href="${report.preview.hours}" target="_blank" class="text-blue-600 hover:underline break-all">
                ${report.preview.hours}
              </a>
            </div>
          ` : `
            <div class="card p-4 rounded bg-gray-50">
              <h3 class="font-semibold text-gray-600">Hours App</h3>
              <p class="text-gray-500">Not deployed</p>
            </div>
          `}
          
          ${report.preview.admin !== 'Not deployed' ? `
            <div class="card success-card p-4 rounded bg-green-50">
              <h3 class="font-semibold text-green-800">Admin App</h3>
              <a href="${report.preview.admin}" target="_blank" class="text-blue-600 hover:underline break-all">
                ${report.preview.admin}
              </a>
            </div>
          ` : `
            <div class="card p-4 rounded bg-gray-50">
              <h3 class="font-semibold text-gray-600">Admin App</h3>
              <p class="text-gray-500">Not deployed</p>
            </div>
          `}
          
          <div class="p-4 rounded bg-gray-50">
            <h3 class="font-semibold text-gray-600">Channel ID</h3>
            <p class="text-gray-600 font-mono">${report.preview.channelId}</p>
          </div>
        </div>
      </div>

      <!-- Workflow Options -->
      <div class="bg-white p-6 rounded-lg shadow">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Workflow Configuration</h2>
        <div class="grid grid-cols-2 gap-4">
          ${Object.entries(report.workflow.options).map(([key, value]) => `
            <div class="p-3 rounded ${value === true ? 'bg-blue-50' : 'bg-gray-50'}">
              <span class="font-medium ${value === true ? 'text-blue-700' : 'text-gray-600'}">${key}</span>
              <span class="ml-2 badge ${value === true ? 'badge-blue' : 'badge-gray'}">${value}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="bg-white p-6 rounded-lg shadow mb-8">
      <h2 class="text-xl font-bold mb-4 text-gray-800">Workflow Timeline</h2>
      <div class="pl-4">
        ${report.workflow.steps.map((step, index) => `
          <div class="timeline-item">
            <div class="flex justify-between mb-1">
              <h3 class="font-semibold text-gray-800">${step.name}</h3>
              ${step.duration ? `<span class="text-gray-500 text-sm">${formatDuration(step.duration)}</span>` : ''}
            </div>
            ${step.timestamp ? `
              <p class="text-gray-500 text-sm">
                ${new Date(step.timestamp).toLocaleString()}
              </p>
            ` : ''}
            ${step.result ? `
              <span class="badge ${step.result.success ? 'badge-green' : 'badge-red'}">
                ${step.result.success ? 'Success' : 'Failed'}
              </span>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    ${report.warnings && report.warnings.length > 0 ? `
      <!-- Warnings -->
      <div class="bg-white p-6 rounded-lg shadow mb-8">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Warnings (${report.warnings.length})</h2>
        <div class="space-y-3">
          ${report.warnings.slice(0, 10).map(warning => `
            <div class="warning-card p-3 rounded bg-yellow-50">
              <p class="text-yellow-700">${warning.message}</p>
              ${warning.timestamp ? `
                <p class="text-yellow-500 text-xs mt-1">
                  ${new Date(warning.timestamp).toLocaleString()}
                </p>
              ` : ''}
            </div>
          `).join('')}
          ${report.warnings.length > 10 ? `
            <div class="p-3 rounded bg-gray-50 text-gray-500 text-center">
              + ${report.warnings.length - 10} more warnings
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    ${report.errors && report.errors.length > 0 ? `
      <!-- Errors -->
      <div class="bg-white p-6 rounded-lg shadow mb-8">
        <h2 class="text-xl font-bold mb-4 text-gray-800">Errors (${report.errors.length})</h2>
        <div class="space-y-3">
          ${report.errors.map(error => `
            <div class="error-card p-3 rounded bg-red-50">
              <p class="text-red-700">${error.message || error}</p>
              ${error.timestamp ? `
                <p class="text-red-500 text-xs mt-1">
                  ${new Date(error.timestamp).toLocaleString()}
                </p>
              ` : ''}
              ${error.step ? `
                <p class="text-red-500 text-xs mt-1">
                  Step: ${error.step}
                </p>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Next Steps -->
    <div class="bg-indigo-50 p-6 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-4 text-indigo-800">Next Steps</h2>
      <ul class="list-disc pl-5 text-indigo-700">
        <li class="mb-2">Push your changes to GitHub</li>
        <li class="mb-2">Create a pull request with preview URLs</li>
        <li class="mb-2">Share the preview links with your team for feedback</li>
      </ul>
    </div>

    <footer class="mt-8 text-center text-gray-500 text-sm">
      <p>Generated by Improved Workflow Tool</p>
    </footer>
  </div>
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

export default {
  generateReport
}; 