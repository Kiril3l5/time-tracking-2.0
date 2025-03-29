/**
 * Consolidated Report Module
 * 
 * Handles the final reporting step of the workflow, consolidating data
 * from various checks and generating a comprehensive dashboard.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as logger from '../core/logger.js';
import { fileURLToPath } from 'url';

// Configuration
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const TEMP_DIR = path.join(PROJECT_ROOT, '.temp');
const DASHBOARD_TEMPLATE = path.join(PROJECT_ROOT, 'templates', 'preview-dashboard.html');
const DASHBOARD_OUTPUT = path.join(TEMP_DIR, 'preview-dashboard.html');

// Report file paths
const REPORT_PATHS = {
  bundle: path.join(TEMP_DIR, 'bundle-report.json'),
  deadCode: path.join(TEMP_DIR, 'deadcode-report.json'),
  vulnerability: path.join(TEMP_DIR, 'vulnerability-report.json'),
  docsQuality: path.join(TEMP_DIR, 'docs-quality-report.json'),
  importSyntax: path.join(TEMP_DIR, 'import-syntax-report.json'),
  previewUrls: path.join(TEMP_DIR, 'preview-urls.json'),
  lintErrors: path.join(TEMP_DIR, 'lint-errors.json'),
  typeErrors: path.join(TEMP_DIR, 'type-errors.json'),
  testResults: path.join(TEMP_DIR, 'test-results.json'),
};

/**
 * Ensure the temp directory exists
 */
function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Save preview URLs to file
 * @param {Object} urls - The preview URLs
 */
function savePreviewUrls(urls) {
  ensureTempDir();
  fs.writeFileSync(
    REPORT_PATHS.previewUrls,
    JSON.stringify(urls || {}, null, 2)
  );
}

/**
 * Load preview URLs from file
 * @returns {Object} The preview URLs
 */
function loadPreviewUrls() {
  try {
    if (fs.existsSync(REPORT_PATHS.previewUrls)) {
      return JSON.parse(fs.readFileSync(REPORT_PATHS.previewUrls, 'utf8'));
    }
  } catch (error) {
    logger.debug(`Error loading preview URLs: ${error.message}`);
  }
  return {};
}

/**
 * Load a report file
 * @param {string} reportPath - Path to the report file
 * @returns {Object} The report data or null if not found
 */
function loadReportFile(reportPath) {
  try {
    if (fs.existsSync(reportPath)) {
      return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }
  } catch (error) {
    logger.debug(`Error loading report file ${reportPath}: ${error.message}`);
  }
  return null;
}

/**
 * Load all report data
 * @returns {Object} The consolidated report data
 */
function loadReportData() {
  const reports = {
    bundleSize: loadReportFile(REPORT_PATHS.bundle),
    deadCode: loadReportFile(REPORT_PATHS.deadCode),
    vulnerability: loadReportFile(REPORT_PATHS.vulnerability),
    docsQuality: loadReportFile(REPORT_PATHS.docsQuality),
    importSyntax: loadReportFile(REPORT_PATHS.importSyntax),
    lintErrors: loadReportFile(REPORT_PATHS.lintErrors),
    typeErrors: loadReportFile(REPORT_PATHS.typeErrors),
    testResults: loadReportFile(REPORT_PATHS.testResults),
    previewUrls: loadPreviewUrls()
  };
  
  return reports;
}

/**
 * Generate HTML for the dashboard
 * @param {Object} data - The consolidated report data
 * @returns {string} The HTML content
 */
function generateDashboardHTML(data) {
  // Try to use the template if it exists
  let templateHTML = '';
  
  try {
    if (fs.existsSync(DASHBOARD_TEMPLATE)) {
      templateHTML = fs.readFileSync(DASHBOARD_TEMPLATE, 'utf8');
    } else {
      // If no template found, use a basic template
      templateHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #0066cc; }
    .card { background: #f9f9f9; border-radius: 5px; padding: 15px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .success { color: #2ecc71; }
    .warning { color: #f39c12; }
    .error { color: #e74c3c; }
    .url-list { list-style-type: none; padding: 0; }
    .url-list li { margin-bottom: 10px; }
    .url-list a { color: #3498db; text-decoration: none; }
    .url-list a:hover { text-decoration: underline; }
    .metrics-table { width: 100%; border-collapse: collapse; }
    .metrics-table th, .metrics-table td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    .metrics-table th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Preview Dashboard</h1>
  
  <div class="card">
    <h2>Preview URLs</h2>
    <ul class="url-list" id="preview-urls">
      <li>No preview URLs available</li>
    </ul>
  </div>
  
  <div class="card">
    <h2>Quality Metrics</h2>
    <table class="metrics-table" id="quality-metrics">
      <tr>
        <th>Metric</th>
        <th>Status</th>
        <th>Details</th>
      </tr>
      <tr>
        <td>No metrics available</td>
        <td></td>
        <td></td>
      </tr>
    </table>
  </div>
  
  <script>
    // This will be replaced with the actual data
    const dashboardData = DASHBOARD_DATA_PLACEHOLDER;
    
    // Populate preview URLs
    const urlList = document.getElementById('preview-urls');
    if (dashboardData.previewUrls && Object.keys(dashboardData.previewUrls).length > 0) {
      urlList.innerHTML = '';
      for (const [name, url] of Object.entries(dashboardData.previewUrls)) {
        urlList.innerHTML += \`<li><strong>\${name}:</strong> <a href="\${url}" target="_blank">\${url}</a></li>\`;
      }
    }
    
    // Populate quality metrics
    const metricsTable = document.getElementById('quality-metrics');
    if (dashboardData) {
      metricsTable.innerHTML = \`
        <tr>
          <th>Metric</th>
          <th>Status</th>
          <th>Details</th>
        </tr>
      \`;
      
      // Add bundle size info
      if (dashboardData.bundleSize) {
        const status = dashboardData.bundleSize.sizeIncrease > 10 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Bundle Size</td>
            <td class="\${status}">\${dashboardData.bundleSize.sizeIncrease > 10 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.bundleSize.totalSize ? dashboardData.bundleSize.totalSize + 'KB' : ''} 
                \${dashboardData.bundleSize.sizeIncrease ? '(' + dashboardData.bundleSize.sizeIncrease + '% change)' : ''}</td>
          </tr>
        \`;
      }
      
      // Add dead code info
      if (dashboardData.deadCode) {
        const status = dashboardData.deadCode.totalFiles > 0 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Dead Code</td>
            <td class="\${status}">\${dashboardData.deadCode.totalFiles > 0 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.deadCode.totalFiles || 0} files with unused code</td>
          </tr>
        \`;
      }
      
      // Add vulnerability info
      if (dashboardData.vulnerability) {
        const status = dashboardData.vulnerability.highSeverity > 0 ? 'error' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Vulnerabilities</td>
            <td class="\${status}">\${dashboardData.vulnerability.highSeverity > 0 ? 'Critical' : 'OK'}</td>
            <td>\${dashboardData.vulnerability.highSeverity || 0} high severity, 
                \${dashboardData.vulnerability.mediumSeverity || 0} medium severity</td>
          </tr>
        \`;
      }
      
      // Add docs quality info
      if (dashboardData.docsQuality) {
        const status = dashboardData.docsQuality.totalIssues > 0 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Documentation</td>
            <td class="\${status}">\${dashboardData.docsQuality.totalIssues > 0 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.docsQuality.totalIssues || 0} documentation issues</td>
          </tr>
        \`;
      }
      
      // Add import syntax info
      if (dashboardData.importSyntax) {
        const status = dashboardData.importSyntax.inconsistentFiles > 0 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Import Syntax</td>
            <td class="\${status}">\${dashboardData.importSyntax.inconsistentFiles > 0 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.importSyntax.inconsistentFiles || 0} files with inconsistent imports</td>
          </tr>
        \`;
      }
      
      // Add lint error info
      if (dashboardData.lintErrors) {
        const status = dashboardData.lintErrors.total > 0 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>ESLint</td>
            <td class="\${status}">\${dashboardData.lintErrors.total > 0 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.lintErrors.total || 0} linting issues</td>
          </tr>
        \`;
      }
      
      // Add type error info
      if (dashboardData.typeErrors) {
        const status = dashboardData.typeErrors.total > 0 ? 'warning' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>TypeScript</td>
            <td class="\${status}">\${dashboardData.typeErrors.total > 0 ? 'Warning' : 'OK'}</td>
            <td>\${dashboardData.typeErrors.total || 0} type errors</td>
          </tr>
        \`;
      }
      
      // Add test results
      if (dashboardData.testResults) {
        const failedTests = dashboardData.testResults.failed || 0;
        const status = failedTests > 0 ? 'error' : 'success';
        metricsTable.innerHTML += \`
          <tr>
            <td>Tests</td>
            <td class="\${status}">\${failedTests > 0 ? 'Failed' : 'Passed'}</td>
            <td>\${dashboardData.testResults.passed || 0} passed, \${failedTests} failed</td>
          </tr>
        \`;
      }
    }
  </script>
</body>
</html>
      `;
    }
  } catch (error) {
    logger.error(`Error reading dashboard template: ${error.message}`);
    return null;
  }
  
  // Replace the placeholder with actual data
  return templateHTML.replace(
    'DASHBOARD_DATA_PLACEHOLDER',
    JSON.stringify(data, null, 2)
  );
}

/**
 * Generate the dashboard file
 * @param {Object} reports - The report data
 * @returns {string} The path to the dashboard file
 */
function generateDashboardFile(reports) {
  const dashboardHTML = generateDashboardHTML(reports);
  
  if (dashboardHTML) {
    ensureTempDir();
    fs.writeFileSync(DASHBOARD_OUTPUT, dashboardHTML);
    logger.success(`Dashboard generated at ${DASHBOARD_OUTPUT}`);
    return DASHBOARD_OUTPUT;
  }
  
  return null;
}

/**
 * Open the dashboard in the default browser
 * @param {string} dashboardPath - Path to the dashboard file
 */
async function openDashboard(dashboardPath) {
  try {
    const open = (await import('open')).default;
    await open(`file://${dashboardPath}`);
    logger.info("Dashboard opened in browser");
  } catch (error) {
    logger.error(`Error opening dashboard: ${error.message}`);
    logger.info(`You can manually open the dashboard at: ${dashboardPath}`);
  }
}

/**
 * Run the consolidated report generation
 * @param {Object} options - Report options
 * @param {Object} options.previewUrls - Preview URLs to include in the report
 * @param {boolean} options.openInBrowser - Whether to open the dashboard in the browser
 * @returns {Promise<{success: boolean, dashboardPath: string}>} - Result
 */
export async function generateConsolidatedReport(options = {}) {
  logger.info("Generating consolidated report...");
  
  try {
    // Save preview URLs if provided
    if (options.previewUrls) {
      savePreviewUrls(options.previewUrls);
    }
    
    // Load all report data
    const reportData = loadReportData();
    
    // Generate the dashboard file
    const dashboardPath = generateDashboardFile(reportData);
    
    // Open in browser if requested
    if (options.openInBrowser && dashboardPath) {
      await openDashboard(dashboardPath);
    }
    
    return {
      success: true,
      dashboardPath
    };
  } catch (error) {
    logger.error(`Error generating consolidated report: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean up report files
 * @returns {Promise<{success: boolean}>} - Result
 */
export async function cleanupReports() {
  logger.info("Cleaning up report files...");
  
  try {
    const reportFiles = Object.values(REPORT_PATHS);
    
    for (const reportFile of reportFiles) {
      if (fs.existsSync(reportFile)) {
        fs.unlinkSync(reportFile);
      }
    }
    
    return { success: true };
  } catch (error) {
    logger.error(`Error cleaning up reports: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  generateConsolidatedReport,
  savePreviewUrls,
  loadPreviewUrls,
  cleanupReports
}; 