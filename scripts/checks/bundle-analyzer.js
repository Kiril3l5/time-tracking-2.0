/**
 * Bundle Size Analyzer
 * 
 * Analyzes JavaScript bundle sizes and compares against baselines.
 * Flags significant increases in bundle size that could impact performance.
 */

/* global process, console */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { parseArgs } from 'node:util';
import { getReportPath, getHtmlReportPath, createJsonReport } from '../reports/report-collector.js';

// Store historical data
const HISTORY_FILE = path.join(process.cwd(), 'temp', '.bundle-size-history.json');

/**
 * Gets size information about files in a directory
 * @param {string} directory - Directory to analyze
 * @returns {Object} Size information
 */
function getDirectorySize(directory) {
  const sizes = {};
  try {
    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      logger.warn(`Directory doesn't exist: ${directory}`);
      return { files: {}, total: 0 };
    }
    
    // Get all JS and CSS files recursively
    const files = fs.readdirSync(directory, { recursive: true })
      .filter(file => file.endsWith('.js') || file.endsWith('.css'));
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isFile()) {
        const size = fs.statSync(filePath).size;
        sizes[file] = size;
      }
    }
  } catch (err) {
    logger.error(`Error analyzing directory ${directory}: ${err.message}`);
    return { files: {}, total: 0 };
  }
  
  return {
    files: sizes,
    total: Object.values(sizes).reduce((sum, size) => sum + size, 0)
  };
}

/**
 * Load historical size data for comparison
 */
function loadHistoricalData() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      logger.warn('Could not parse historical bundle size data');
      return {};
    }
  }
  return {};
}

/**
 * Save current size data for future comparisons
 */
function saveHistoricalData(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error(`Failed to save bundle size history: ${e.message}`);
  }
}

/**
 * Generate HTML report for bundle sizes
 */
function generateHTMLReport(current, historical, issues, reportPath) {
  try {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bundle Size Analysis Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 25px; }
        .summary { background: #f7f7f7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .module { margin-bottom: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; font-weight: 600; }
        .error { color: #d32f2f; }
        .warning { color: #f57c00; }
        .success { color: #388e3c; }
        .size-change.increase { color: #d32f2f; }
        .size-change.decrease { color: #388e3c; }
        .issues-container { margin: 20px 0; }
        .issue { padding: 10px; margin: 5px 0; border-radius: 3px; }
        .issue.error { background-color: rgba(211, 47, 47, 0.1); }
        .issue.warning { background-color: rgba(245, 124, 0, 0.1); }
      </style>
    </head>
    <body>
      <h1>Bundle Size Analysis Report</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Issues found: ${issues.length} (${issues.filter(i => i.severity === 'error').length} errors, ${issues.filter(i => i.severity === 'warning').length} warnings)</p>
      </div>
      
      ${issues.length > 0 ? `
      <div class="issues-container">
        <h2>Issues</h2>
        ${issues.map(issue => `
          <div class="issue ${issue.severity}">
            <strong>${issue.severity === 'error' ? '🛑 Error:' : '⚠️ Warning:'}</strong> ${issue.message}
            <div>${issue.details}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      <h2>Bundle Size Details</h2>
      ${Object.entries(current).map(([dirName, data]) => `
        <div class="module">
          <h3>Package: ${dirName}</h3>
          <table>
            <tr>
              <th>File</th>
              <th>Size (KB)</th>
              ${historical[dirName] ? '<th>Previous (KB)</th><th>Change</th>' : ''}
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td>${(data.total / 1024).toFixed(2)} KB</td>
              ${historical[dirName] ? `
                <td>${(historical[dirName].total / 1024).toFixed(2)} KB</td>
                <td class="size-change ${data.total > historical[dirName].total ? 'increase' : 'decrease'}">
                  ${((data.total - historical[dirName].total) / historical[dirName].total * 100).toFixed(2)}%
                </td>
              ` : ''}
            </tr>
            ${Object.entries(data.files)
              .sort(([, sizeA], [, sizeB]) => sizeB - sizeA) // Sort by size, largest first
              .map(([file, size]) => `
                <tr>
                  <td>${file}</td>
                  <td>${(size / 1024).toFixed(2)} KB</td>
                  ${historical[dirName] && historical[dirName].files[file] ? `
                    <td>${(historical[dirName].files[file] / 1024).toFixed(2)} KB</td>
                    <td class="size-change ${size > historical[dirName].files[file] ? 'increase' : 'decrease'}">
                      ${((size - historical[dirName].files[file]) / historical[dirName].files[file] * 100).toFixed(2)}%
                    </td>
                  ` : historical[dirName] ? '<td>New</td><td>N/A</td>' : ''}
                </tr>
              `).join('')}
          </table>
        </div>
      `).join('')}
    </body>
    </html>
    `;

    fs.writeFileSync(reportPath, html);
    logger.info(`Bundle size report generated at ${reportPath}`);
  } catch (err) {
    logger.error(`Failed to generate HTML report: ${err.message}`);
  }
}

/**
 * Analyze bundle sizes and compare against thresholds
 * @param {Object} options - Analysis options
 * @returns {Object} Analysis result
 */
export async function analyzeBundles(options) {
  const {
    directories = [],
    thresholds = {
      totalIncrease: 10,   // percent
      chunkIncrease: 20,   // percent
      maxInitialLoad: 1000  // KB (1MB)
    },
    generateReport = true,
    reportPath = getHtmlReportPath('bundle'),
    baselineSource = null // Optional path to use a specific baseline file
  } = options;
  
  logger.info('Analyzing bundle sizes...');
  
  // Ensure directories is an array
  const dirsToAnalyze = Array.isArray(directories) ? directories : 
    (directories ? [directories] : []);
  
  // If no directories specified, try to use default build directories
  if (dirsToAnalyze.length === 0) {
    logger.info('No directories specified for bundle analysis, using default build directories');
    const defaultDirs = [
      path.join(process.cwd(), 'packages/admin/dist'),
      path.join(process.cwd(), 'packages/hours/dist')
    ];
    
    // Only add directories that exist
    for (const dir of defaultDirs) {
      if (fs.existsSync(dir)) {
        logger.info(`Found build directory: ${dir}`);
        dirsToAnalyze.push(dir);
      }
    }
    
    if (dirsToAnalyze.length === 0) {
      logger.warn('No build directories found for bundle analysis');
      return {
        success: false,
        error: 'No build directories found for analysis',
        current: {},
        historical: {},
        issues: [{
          severity: 'error',
          message: 'No build directories found',
          details: 'Make sure to build the application before running bundle analysis'
        }]
      };
    }
  }
  
  // Load historical data (either from default or specified source)
  let historical = {};
  if (baselineSource && fs.existsSync(baselineSource)) {
    try {
      historical = JSON.parse(fs.readFileSync(baselineSource, 'utf8'));
      logger.info(`Using baseline from: ${baselineSource}`);
    } catch (e) {
      logger.warn(`Could not load baseline from ${baselineSource}, using default history`);
      historical = loadHistoricalData();
    }
  } else {
    historical = loadHistoricalData();
  }
  
  const current = {};
  const issues = [];
  
  // Analyze each directory
  for (const dir of dirsToAnalyze) {
    const dirName = path.basename(dir);
    current[dirName] = getDirectorySize(dir);
    
    // Report current sizes
    logger.info(`Bundle size for ${dirName}: ${(current[dirName].total / 1024).toFixed(2)} KB`);
    
    // Compare with historical data if available
    if (historical[dirName]) {
      const historicalTotal = historical[dirName].total;
      const currentTotal = current[dirName].total;
      
      if (historicalTotal > 0) {
        const percentChange = ((currentTotal - historicalTotal) / historicalTotal) * 100;
        
        if (currentTotal > historicalTotal) {
          logger.info(`Bundle size for ${dirName} increased by ${percentChange.toFixed(2)}%`);
        } else if (currentTotal < historicalTotal) {
          logger.info(`Bundle size for ${dirName} decreased by ${Math.abs(percentChange).toFixed(2)}%`);
        } else {
          logger.info(`Bundle size for ${dirName} unchanged`);
        }
        
        if (percentChange > thresholds.totalIncrease) {
          issues.push({
            severity: 'warning',
            message: `Bundle size for ${dirName} increased by ${percentChange.toFixed(2)}% (threshold: ${thresholds.totalIncrease}%)`,
            details: `Previous: ${(historicalTotal / 1024).toFixed(2)}KB, Current: ${(currentTotal / 1024).toFixed(2)}KB`
          });
        }
        
        // Check individual chunks for significant increases
        for (const [file, size] of Object.entries(current[dirName].files)) {
          if (historical[dirName].files[file]) {
            const histSize = historical[dirName].files[file];
            if (histSize > 0) {
              const filePercentChange = ((size - histSize) / histSize) * 100;
              
              if (filePercentChange > thresholds.chunkIncrease) {
                const isMainBundle = file.includes('main') || file.includes('index') || file.includes('chunk');
                issues.push({
                  severity: isMainBundle ? 'error' : 'warning',
                  message: `File ${file} in ${dirName} increased by ${filePercentChange.toFixed(2)}% (threshold: ${thresholds.chunkIncrease}%)`,
                  details: `Previous: ${(histSize / 1024).toFixed(2)}KB, Current: ${(size / 1024).toFixed(2)}KB`
                });
              }
            }
          }
        }
      }
      
      // Check initial load size (main bundles)
      const mainBundleSize = Object.entries(current[dirName].files)
        .filter(([file]) => file.includes('main') || file.includes('index') || file.includes('chunk'))
        .reduce((sum, [_, size]) => sum + size, 0);
      
      if (mainBundleSize / 1024 > thresholds.maxInitialLoad) {
        issues.push({
          severity: 'error',
          message: `Initial load size for ${dirName} exceeds threshold`,
          details: `Size: ${(mainBundleSize / 1024).toFixed(2)}KB (threshold: ${thresholds.maxInitialLoad}KB)`
        });
      }
    } else {
      logger.info(`No historical data for ${dirName} - this will be used as the baseline`);
    }
  }
  
  // Save current data as new baseline
  saveHistoricalData(current);
  
  // Generate HTML report if requested
  if (generateReport) {
    generateHTMLReport(current, historical, issues, reportPath);
  }
  
  // Log results
  if (issues.length > 0) {
    logger.warn(`Found ${issues.length} bundle size issues:`);
    for (const issue of issues) {
      if (issue.severity === 'error') {
        logger.error(`- ${issue.message}`);
        logger.error(`  ${issue.details}`);
      } else {
        logger.warn(`- ${issue.message}`);
        logger.warn(`  ${issue.details}`);
      }
    }
    
    // Only fail on errors
    const hasErrors = issues.some(issue => issue.severity === 'error');
    if (hasErrors) {
      return { valid: false, error: 'Bundle size exceeds critical thresholds' };
    }
  } else {
    logger.success('Bundle size analysis passed - no significant increases detected');
  }
  
  return { valid: true, current, historical, issues };
}

/**
 * Main function for bundle analysis
 */
async function main() {
  try {
    const args = parseArguments();
    
    if (args.help) {
      showHelp();
      return;
    }
    
    logger.info('Starting bundle size analysis...');
    
    // Set up default output paths
    const jsonReportPath = args.jsonOutput || getReportPath('bundle');
    const htmlReportPath = args.htmlOutput || getHtmlReportPath('bundle');
    const baselinePath = args.baseline;
    
    // Analyze bundle size
    const results = await analyzeBundles({
      directories: args.distDir ? [args.distDir] : [],
      baselineSource: baselinePath,
      thresholds: {
        error: args.errorThreshold || 10,
        warning: args.warningThreshold || 5,
        totalIncrease: args.totalIncrease || 10,
        chunkIncrease: args.chunkIncrease || 20,
        maxInitialLoad: args.maxInitialLoad || 1000
      },
      generateReport: false, // Never generate HTML reports automatically, only JSON
      reportPath: htmlReportPath
    });
    
    // Always save JSON results for the consolidated dashboard using the report-collector utility
    createJsonReport({
      current: results.current || {},
      historical: results.historical || {},
      issues: results.issues || []
    }, jsonReportPath);
    logger.info(`Bundle analysis results saved to ${jsonReportPath}`);
    
    // Only generate HTML report if explicitly requested
    if (args.htmlOutput) {
      generateHTMLReport(
        results.current || {},
        results.historical || {},
        results.issues || [],
        htmlReportPath
      );
    }
    
    // Update baseline if requested
    if (args.updateBaseline) {
      const newBaselinePath = args.updateBaseline === true ? 
        (baselinePath || HISTORY_FILE) : args.updateBaseline;
      
      saveHistoricalData(results.current || {});
      logger.info(`Baseline updated at ${newBaselinePath}`);
    }
    
    // Determine exit code based on issues
    const errorCount = results.issues?.filter(issue => issue.severity === 'error').length || 0;
    
    if (errorCount > 0) {
      logger.error(`Found ${errorCount} errors in bundle analysis`);
      return false;
    }
    
    logger.success('Bundle analysis completed successfully');
    return true;
  } catch (error) {
    logger.error(`Error in bundle analysis: ${error.message}`);
    return false;
  }
}

/**
 * Parse command-line arguments
 */
function parseArguments() {
  const options = {
    'dist-dir': { type: 'string' },
    'baseline': { type: 'string' },
    'update-baseline': { type: 'boolean' },
    'error-threshold': { type: 'number' },
    'warning-threshold': { type: 'number' },
    'output': { type: 'string' },
    'json-report': { type: 'string' },
    'html-report': { type: 'string' },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false },
    'total-increase': { type: 'number' },
    'chunk-increase': { type: 'number' },
    'max-initial-load': { type: 'number' }
  };
  
  const { values } = parseArgs({
    options,
    allowPositionals: false,
    strict: false
  });
  
  return values;
}

/**
 * Show help information
 */
function showHelp() {
  const colors = logger.getColors();
  
  console.log(`
${colors.cyan}${colors.bold}Bundle Size Analyzer${colors.reset}

This tool analyzes the size of your application's bundle and compares it with a baseline.

${colors.bold}Usage:${colors.reset}
  node scripts/checks/bundle-analyzer.js [options]

${colors.bold}Options:${colors.reset}
  --dist-dir <path>              Directory containing build artifacts (default: current directory)
  --baseline <path>              Path to baseline file (default: ${HISTORY_FILE})
  --update-baseline [path]       Update baseline file (optional path or use default)
  --error-threshold <percent>    Percentage increase to trigger error (default: 10)
  --warning-threshold <percent>  Percentage increase to trigger warning (default: 5)
  --output <dir>                 Output directory for reports (default: current directory)
  --json-report <filename>       Filename for JSON report (default: bundle-report.json)
  --html-report <filename>       Filename for HTML report (optional, not generated by default)
  --verbose                      Enable verbose logging
  --help                         Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Run basic analysis${colors.reset}
  node scripts/checks/bundle-analyzer.js

  ${colors.blue}# Run analysis with custom thresholds${colors.reset}
  node scripts/checks/bundle-analyzer.js --error-threshold 10 --warning-threshold 5

  ${colors.blue}# Update baseline after a release${colors.reset}
  node scripts/checks/bundle-analyzer.js --update-baseline
  `);
} 