/**
 * Consolidated Report Generator
 * 
 * Generates a comprehensive report combining results from:
 * - Health checks
 * - TypeScript quality checks
 * - Test results
 * - Build results
 * - Documentation quality
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a consolidated report combining all quality metrics
 * @param {Object} data Report data
 * @returns {Promise<Object>} Generated report
 */
export async function generateReport(data) {
  const {
    metrics,
    qualityResults,
    documentationResults,
    bundleAnalysis,
    deadCodeResults,
    docFreshnessResults
  } = data;

  const report = {
    timestamp: new Date().toISOString(),
    metrics: {
      ...metrics,
      bundleSize: bundleAnalysis?.totalSize || 0,
      deadCodeCount: deadCodeResults?.totalDeadCode || 0,
      docFreshnessScore: docFreshnessResults?.freshnessScore || 0
    },
    quality: {
      lint: qualityResults?.lint || {},
      typescript: qualityResults?.typescript || {},
      tests: qualityResults?.tests || {}
    },
    documentation: {
      quality: documentationResults || {},
      freshness: docFreshnessResults || {}
    },
    bundle: {
      analysis: bundleAnalysis || {},
      sizeDiff: bundleAnalysis?.sizeDiff || 0
    },
    deadCode: deadCodeResults || {}
  };

  // Generate HTML report
  const htmlReport = generateHtmlReport(report);

  // Save report
  await saveReport(report, htmlReport);

  return report;
}

/**
 * Generate HTML report
 * @param {Object} report Report data
 * @returns {string} HTML report
 */
function generateHtmlReport(report) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Workflow Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 2rem;
            background: #f8f9fa;
          }
          .container {
            max-width: 1200px;
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
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          }
          .metric-card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .metric-value {
            font-size: 2rem;
            font-weight: bold;
            color: #3498db;
            margin-bottom: 0.5rem;
          }
          .metric-label {
            color: #7f8c8d;
            font-size: 0.9rem;
          }
          .section {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          pre {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.9rem;
          }
          .success {
            color: #27ae60;
          }
          .warning {
            color: #f1c40f;
          }
          .error {
            color: #e74c3c;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Workflow Report</h1>
          <div class="timestamp">Generated: ${report.timestamp}</div>
          
          <h2>Metrics</h2>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">${formatBytes(report.metrics.bundleSize)}</div>
              <div class="metric-label">Bundle Size</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${report.metrics.deadCodeCount}</div>
              <div class="metric-label">Dead Code Lines</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${report.metrics.docFreshnessScore}%</div>
              <div class="metric-label">Documentation Freshness</div>
            </div>
          </div>

          <h2>Quality Results</h2>
          <div class="section">
            <h3>Linting</h3>
            <pre>${JSON.stringify(report.quality.lint, null, 2)}</pre>
            
            <h3>TypeScript</h3>
            <pre>${JSON.stringify(report.quality.typescript, null, 2)}</pre>
            
            <h3>Tests</h3>
            <pre>${JSON.stringify(report.quality.tests, null, 2)}</pre>
          </div>

          <h2>Documentation</h2>
          <div class="section">
            <h3>Quality</h3>
            <pre>${JSON.stringify(report.documentation.quality, null, 2)}</pre>
            
            <h3>Freshness</h3>
            <pre>${JSON.stringify(report.documentation.freshness, null, 2)}</pre>
          </div>

          <h2>Bundle Analysis</h2>
          <div class="section">
            <h3>Analysis</h3>
            <pre>${JSON.stringify(report.bundle.analysis, null, 2)}</pre>
            
            <h3>Size Difference</h3>
            <div class="metric-value ${report.bundle.sizeDiff > 0 ? 'error' : 'success'}">
              ${formatBytes(report.bundle.sizeDiff)}
            </div>
          </div>

          <h2>Dead Code Analysis</h2>
          <div class="section">
            <pre>${JSON.stringify(report.deadCode, null, 2)}</pre>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Save report to file
 * @param {Object} report Report data
 * @param {string} htmlReport HTML report
 */
async function saveReport(report, htmlReport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = join(process.cwd(), 'reports');
  const reportFile = join(reportDir, `report-${timestamp}.json`);
  const htmlFile = join(reportDir, `report-${timestamp}.html`);

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

  return {
    json: reportFile,
    html: htmlFile
  };
}

/**
 * Format bytes to human readable string
 * @param {number} bytes Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default {
  generateReport
}; 