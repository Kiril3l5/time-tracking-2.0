/**
 * Dependency Security Scanner
 * 
 * Scans project dependencies for known security vulnerabilities.
 * Uses npm or pnpm audit to identify packages with security issues.
 */

/* global process, console */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as logger from '../core/logger.js';
import { parseArgs } from 'node:util';
import { getReportPath, getHtmlReportPath, createJsonReport } from '../reports/report-collector.js';

// Store historical data
const HISTORY_FILE = path.join(process.cwd(), 'temp', '.vulnerability-scan-history.json');

// Severity levels in order of importance
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];

/**
 * Runs pnpm audit on a package directory
 * @param {string} packageDir - Directory containing package.json
 * @returns {Object} - Audit results
 */
function runPnpmAudit(packageDir) {
  try {
    let output;
    
    // Run pnpm audit and capture the output as JSON
    try {
      output = execSync('pnpm audit --json', {
        cwd: packageDir,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch (error) {
      // pnpm audit returns non-zero exit code if vulnerabilities found, so we need to handle that
      if (error.stdout) {
        output = error.stdout;
      } else {
        throw error;
      }
    }
    
    let results;
    try {
      results = JSON.parse(output.toString());
    } catch (parseError) {
      logger.error(`Error parsing pnpm audit output: ${parseError.message}`);
      return { error: parseError.message };
    }
    
    return results;
  } catch (error) {
    // Handle the case where pnpm audit returns a non-zero exit code (vulnerabilities found)
    logger.error(`Error running pnpm audit: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Load historical vulnerability data for comparison
 */
function loadHistoricalData() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      logger.warning('Could not parse historical vulnerability data');
      return {};
    }
  }
  return {};
}

/**
 * Save current vulnerability data for future comparisons
 */
function saveHistoricalData(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error(`Failed to save vulnerability history: ${e.message}`);
  }
}

/**
 * Summarizes vulnerabilities by severity level
 * @param {Object} vulnerabilities - Vulnerabilities from pnpm audit
 * @returns {Object} Summary counts by severity
 */
function summarizeVulnerabilities(vulnerabilities) {
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0
  };
  
  // If vulnerabilities is null or undefined, return empty summary
  if (!vulnerabilities) {
    return summary;
  }
  
  // Ensure vulnerabilities is an object before trying to iterate
  if (typeof vulnerabilities === 'object') {
    for (const [, vulnerability] of Object.entries(vulnerabilities)) {
      if (vulnerability && vulnerability.severity) {
        const severity = vulnerability.severity.toLowerCase();
        if (summary[severity] !== undefined) {
          summary[severity]++;
          summary.total++;
        }
      }
    }
  }
  
  return summary;
}

/**
 * Generates a list of issues based on vulnerabilities and thresholds
 * @param {Object} scanResults - Results from all package scans
 * @param {Object} thresholds - Configuration for reporting thresholds
 * @returns {Array} List of issues
 */
function generateIssueList(scanResults, thresholds) {
  const issues = [];
  const minSeverityIndex = SEVERITY_LEVELS.indexOf(thresholds.minSeverity);
  
  // Add defensive programming
  if (!scanResults || typeof scanResults !== 'object') {
    logger.warning('Invalid scan results passed to generateIssueList');
    return [];
  }
  
  for (const [packageName, result] of Object.entries(scanResults)) {
    // Skip if result is invalid
    if (!result || typeof result !== 'object') continue;
    
    // Skip if there was an error or no vulnerabilities
    if (result.error || !result.vulnerabilities) continue;
    
    // Make sure vulnerabilities is an object before iterating
    if (typeof result.vulnerabilities !== 'object') {
      logger.warning(`Invalid vulnerabilities data for ${packageName}`);
      continue;
    }
    
    for (const [vulnId, vulnerability] of Object.entries(result.vulnerabilities)) {
      // Skip if vulnerability is not an object or missing required fields
      if (!vulnerability || typeof vulnerability !== 'object' || !vulnerability.severity) continue;
      
      const severity = vulnerability.severity.toLowerCase();
      const severityIndex = SEVERITY_LEVELS.indexOf(severity);
      
      // Skip if below threshold
      if (severityIndex > minSeverityIndex) continue;
      
      // Handle missing or null advisories
      const advisory = result.advisories?.[vulnId] || {};
      
      // Handle via property safely
      let via = '';
      if (Array.isArray(vulnerability.via)) {
        via = vulnerability.via.filter(v => typeof v === 'string').join(', ');
      } else if (typeof vulnerability.via === 'string') {
        via = vulnerability.via;
      }
      
      // Handle fixAvailable property safely
      let fixAvailable = 'No';
      if (vulnerability.fixAvailable) {
        if (typeof vulnerability.fixAvailable === 'object' && 
            vulnerability.fixAvailable.name && 
            vulnerability.fixAvailable.version) {
          fixAvailable = `Update to ${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}`;
        } else {
          fixAvailable = 'Yes';
        }
      }
      
      issues.push({
        severity,
        packageName,
        name: vulnerability.name || 'Unknown',
        title: advisory?.title || vulnerability.name || 'Unknown',
        path: vulnerability.path || via,
        range: vulnerability.range || 'Unknown',
        fixAvailable,
        url: advisory?.url || '',
        recommendation: advisory?.recommendation || fixAvailable
      });
    }
  }
  
  // Sort by severity (critical first)
  return issues.sort((a, b) => {
    const aSeverityIndex = SEVERITY_LEVELS.indexOf(a.severity);
    const bSeverityIndex = SEVERITY_LEVELS.indexOf(b.severity);
    return aSeverityIndex - bSeverityIndex;
  });
}

/**
 * Generate HTML report for vulnerabilities
 * @param {Object} scanResults - Results of the scan
 * @param {Array} issues - List of issues found
 * @param {Object} summary - Summary of findings
 * @param {string} reportPath - Path to save the report
 */
function generateHtmlReport(scanResults, issues, summary, reportPath) {
  try {
    // Create HTML report
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Dependency Vulnerability Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 25px; }
        .summary { background: #f7f7f7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; font-weight: 600; }
        .critical { color: #d32f2f; }
        .high { color: #f57c00; }
        .moderate { color: #fbc02d; }
        .low { color: #388e3c; }
      </style>
    </head>
    <body>
      <h1>Dependency Vulnerability Report</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Total vulnerabilities: ${summary.total}</p>
        <p>Critical: ${summary.critical}</p>
        <p>High: ${summary.high}</p>
        <p>Moderate: ${summary.moderate}</p>
        <p>Low: ${summary.low}</p>
        <p>Status: ${summary.total === 0 ? 'Pass' : 'Fail'}</p>
      </div>
      
      ${issues.length > 0 ? `
      <h2>Issues</h2>
      <table>
        <tr>
          <th>Severity</th>
          <th>Package</th>
          <th>Description</th>
          <th>Vulnerability</th>
          <th>Remediation</th>
        </tr>
        ${issues.map(issue => `
        <tr>
          <td class="${issue.severity.toLowerCase()}">${issue.severity}</td>
          <td>${issue.packageName}</td>
          <td>${issue.name} (${issue.range})</td>
          <td><a href="${issue.url}" target="_blank">More info</a></td>
          <td>${issue.recommendation}</td>
        </tr>
        `).join('')}
      </table>
      ` : ''}
    </body>
    </html>
    `;

    fs.writeFileSync(reportPath, html);
    logger.info(`Vulnerability report generated at ${reportPath}`);
  } catch (err) {
    logger.error(`Failed to generate HTML report: ${err.message}`);
  }
}

/**
 * Scan packages for vulnerabilities
 * @param {Object} options - Configuration options
 * @returns {Object} Scan results and validation status
 */
export async function scanDependencies(options) {
  const {
    directories = ['.'],
    thresholds = {
      minSeverity: 'high', // Only report issues of this severity or higher
      failOnSeverity: 'critical' // Only fail the scan for issues of this severity or higher
    },
    generateReport = true,
    reportPath = './vulnerability-report.html',
    baselineSource = null, // Optional path to use a specific baseline file
    includeDevDependencies = true
  } = options;
  
  logger.info('Scanning dependencies for vulnerabilities...');

  // Load historical data (either from default or specified source)
  let historical = {};
  if (baselineSource && fs.existsSync(baselineSource)) {
    try {
      historical = JSON.parse(fs.readFileSync(baselineSource, 'utf8'));
      logger.info(`Using baseline from: ${baselineSource}`);
    } catch (e) {
      logger.warning(`Could not load baseline from ${baselineSource}, using default history`);
      historical = loadHistoricalData();
    }
  } else {
    historical = loadHistoricalData();
  }
  
  // Run pnpm audit on each package
  const scanResults = {};
  let totalSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0
  };
  
  // Use try/catch to handle any unexpected errors in the scanning process
  try {
    for (const dir of directories) {
      const packageName = path.basename(dir) || 'root';
      scanResults[packageName] = runPnpmAudit(dir);
      
      // Get summary for this package
      if (!scanResults[packageName].error) {
        // Add defensive check for vulnerabilities property
        if (!scanResults[packageName].vulnerabilities) {
          logger.info(`${packageName}: No vulnerabilities data available`);
          scanResults[packageName].vulnerabilities = {}; // Ensure it's an object
          continue;
        }
        
        const packageSummary = summarizeVulnerabilities(scanResults[packageName].vulnerabilities);
        
        // Add to total summary
        totalSummary.critical += packageSummary.critical;
        totalSummary.high += packageSummary.high;
        totalSummary.medium += packageSummary.medium;
        totalSummary.low += packageSummary.low;
        totalSummary.total += packageSummary.total;
        
        // Log package summary
        if (packageSummary.total > 0) {
          logger.info(`${packageName}: Found ${packageSummary.total} vulnerabilities (${packageSummary.critical} critical, ${packageSummary.high} high, ${packageSummary.medium} medium, ${packageSummary.low} low)`);
        } else {
          logger.info(`${packageName}: No vulnerabilities found`);
        }
      } else {
        logger.warning(`${packageName}: Scan failed - ${scanResults[packageName].error}`);
        // Initialize vulnerabilities as empty object to prevent null/undefined errors
        scanResults[packageName].vulnerabilities = {};
      }
    }
  } catch (error) {
    logger.error(`Error during vulnerability scanning: ${error.message}`);
    // Return a valid object even in case of errors
    return {
      valid: false,
      error: `Error scanning dependencies: ${error.message}`,
      issues: [],
      totalSummary,
      scanResults: scanResults || {}
    };
  }
  
  // Save current data for future comparison
  saveHistoricalData(scanResults);
  
  // Generate list of issues based on thresholds
  const issues = generateIssueList(scanResults, thresholds);
  
  // Generate HTML report if requested
  if (generateReport) {
    generateHtmlReport(scanResults, issues, totalSummary, reportPath);
  }
  
  // Determine if scan should fail based on thresholds
  const failOnSeverityIndex = SEVERITY_LEVELS.indexOf(thresholds.failOnSeverity);
  let shouldFail = false;
  let failureSeverity = null;
  
  for (const level of SEVERITY_LEVELS) {
    const severityIndex = SEVERITY_LEVELS.indexOf(level);
    if (severityIndex <= failOnSeverityIndex && totalSummary[level] > 0) {
      shouldFail = true;
      failureSeverity = level;
      break;
    }
  }
  
  // Log overall results
  if (totalSummary.total > 0) {
    logger.warning(`Found ${totalSummary.total} vulnerabilities in total:`);
    logger.warning(`- Critical: ${totalSummary.critical}`);
    logger.warning(`- High: ${totalSummary.high}`);
    logger.warning(`- Medium: ${totalSummary.medium}`);
    logger.warning(`- Low: ${totalSummary.low}`);
    
    if (shouldFail) {
      logger.error(`Scan failed due to ${failureSeverity} severity vulnerabilities`);
    } else {
      logger.warning(`Vulnerabilities found, but below ${thresholds.failOnSeverity} threshold`);
    }
  } else {
    logger.success('No vulnerabilities found');
  }
  
  return {
    valid: !shouldFail,
    error: shouldFail ? `Found ${totalSummary[failureSeverity]} ${failureSeverity} severity vulnerabilities` : null,
    issues,
    totalSummary,
    scanResults
  };
}

/**
 * Main function to run vulnerability scan
 */
async function main() {
  try {
    const args = parseArguments();
    
    if (args.help) {
      showHelp();
      return;
    }
    
    logger.info('Starting dependency vulnerability scan...');
    
    // Validate threshold level
    if (args.threshold && !['critical', 'high', 'moderate', 'low'].includes(args.threshold)) {
      logger.error(`Invalid threshold: ${args.threshold}. Must be one of: critical, high, moderate, low`);
      return false;
    }
    
    // Set up default output paths
    const jsonReportPath = args.jsonOutput || getReportPath('vulnerability');
    const htmlReportPath = args.htmlOutput || getHtmlReportPath('vulnerability');
    
    // Run the dependency scan
    const scanResults = await scanDependencies({
      directories: ['.'],
      thresholds: {
        minSeverity: args.threshold || 'moderate',
        failOnSeverity: args.threshold || 'moderate'
      },
      generateReport: false,
      includeDevDependencies: args.includeDev
    });
    
    // Always save JSON results for the consolidated dashboard
    createJsonReport(scanResults, jsonReportPath);
    logger.info(`Vulnerability scan results saved to ${jsonReportPath}`);
    
    // Only generate HTML report if explicitly requested
    if (args.htmlOutput) {
      const issues = generateIssueList(scanResults.scanResults || {}, {
        minSeverity: args.threshold || 'moderate'
      });
      
      const summary = summarizeVulnerabilities(scanResults.scanResults?.vulnerabilities || {});
      
      generateHtmlReport(scanResults.scanResults || {}, issues, summary, htmlReportPath);
    }
    
    // Print summary to console
    printSummary(scanResults, args.threshold || 'moderate');
    
    // Determine exit code based on vulnerability results
    const hasBlockingVulnerabilities = Object.keys(scanResults.vulnerabilities || {})
      .some(severity => {
        if (severity === 'critical' || 
            (severity === 'high' && args.threshold !== 'critical') || 
            (severity === 'moderate' && (args.threshold === 'moderate' || args.threshold === 'low')) || 
            (severity === 'low' && args.threshold === 'low')) {
          return scanResults.vulnerabilities[severity] > 0;
        }
        return false;
      });
    
    if (hasBlockingVulnerabilities) {
      logger.error(`Found vulnerabilities at or above the ${args.threshold || 'moderate'} threshold`);
      return false;
    }
    
    logger.success('Dependency vulnerability scan completed successfully');
    return true;
  } catch (error) {
    logger.error(`Error in dependency vulnerability scan: ${error.message}`);
    return false;
  }
}

/**
 * Parse command-line arguments
 */
function parseArguments() {
  const options = {
    'package-manager': { type: 'string', default: 'npm' },
    'package-json': { type: 'string', default: 'package.json' },
    'threshold': { type: 'string', default: 'high' },
    'include-dev': { type: 'boolean', default: false },
    'json-output': { type: 'string' },
    'html-output': { type: 'string' },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
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
${colors.cyan}${colors.bold}Dependency Vulnerability Scanner${colors.reset}

This tool scans your project dependencies for known vulnerabilities.

${colors.bold}Usage:${colors.reset}
  node scripts/checks/dependency-scanner.js [options]

${colors.bold}Options:${colors.reset}
  --package-manager <pm>     Package manager to use (npm, yarn, pnpm) (default: npm)
  --package-json <path>      Path to package.json file (default: package.json)
  --threshold <level>        Vulnerability threshold (critical, high, moderate, low) (default: high)
  --include-dev              Include devDependencies in scan (default: true)
  --no-include-dev           Exclude devDependencies from scan
  --json-output <path>       Path for JSON report (default: vulnerability-report.json)
  --html-output <path>       Path for HTML report (optional, not generated by default)
  --verbose                  Enable verbose logging
  --help                     Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Run basic scan${colors.reset}
  node scripts/checks/dependency-scanner.js

  ${colors.blue}# Run scan with custom threshold${colors.reset}
  node scripts/checks/dependency-scanner.js --threshold medium

  ${colors.blue}# Run scan excluding devDependencies${colors.reset}
  node scripts/checks/dependency-scanner.js --no-include-dev
  `);
}

/**
 * Print a summary of the scan results
 * @param {Object} results - The scan results
 * @param {string} threshold - The threshold level to check against
 */
function printSummary(results, threshold) {
  // Handle null or undefined results
  if (!results) {
    logger.warn('No scan results to summarize');
    return;
  }
  
  const summary = summarizeVulnerabilities(results.vulnerabilities || {});
  
  logger.info('\nVulnerability scan summary:');
  logger.info(`Total vulnerabilities: ${summary.total}`);
  
  if (summary.critical > 0) logger.error(`Critical: ${summary.critical}`);
  else logger.info(`Critical: ${summary.critical}`);
  
  if (summary.high > 0 && ['high', 'moderate', 'low'].includes(threshold)) {
    logger.error(`High: ${summary.high}`);
  } else {
    logger.info(`High: ${summary.high}`);
  }
  
  if (summary.moderate > 0 && ['moderate', 'low'].includes(threshold)) {
    logger.warn(`Moderate: ${summary.moderate}`);
  } else {
    logger.info(`Moderate: ${summary.moderate}`);
  }
  
  if (summary.low > 0 && threshold === 'low') {
    logger.warn(`Low: ${summary.low}`);
  } else {
    logger.info(`Low: ${summary.low}`);
  }
  
  if (summary.total === 0) {
    logger.success('No vulnerabilities found!');
  } else {
    const blocking = Object.keys(results.vulnerabilities || {})
      .some(severity => {
        if (severity === 'critical' || 
            (severity === 'high' && threshold !== 'critical') || 
            (severity === 'moderate' && (threshold === 'moderate' || threshold === 'low')) || 
            (severity === 'low' && threshold === 'low')) {
          return results.vulnerabilities[severity] > 0;
        }
        return false;
      });
      
    if (blocking) {
      logger.error(`Found vulnerabilities at or above the ${threshold} threshold`);
    } else {
      logger.success(`No vulnerabilities at or above the ${threshold} threshold`);
    }
  }
} 