#!/usr/bin/env node

/**
 * Report Collector Module
 * 
 * This module collects data from various reporting modules (bundle analysis, 
 * doc quality, dead code detection, vulnerability scanning) and passes it to
 * the consolidated report generator.
 * 
 * @module reports/report-collector
 */

import fs from 'fs';
import path from 'path';
import process from 'node:process';
import * as logger from '../core/logger.js';
import { generateConsolidatedReport } from './consolidated-report.js';
import { parseArgs } from 'node:util';

// Temp directory for report files
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure temp directory exists
function ensureTempDirExists() {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      logger.debug(`Temp directory doesn't exist, creating: ${TEMP_DIR}`);
      fs.mkdirSync(TEMP_DIR, { recursive: true });
      logger.debug(`Created temp directory: ${TEMP_DIR}`);
    } else {
      logger.debug(`Temp directory already exists: ${TEMP_DIR}`);
    }
    
    // List files in temp directory for debugging
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      logger.debug(`Temp directory contents (${files.length} files): ${files.join(', ')}`);
    }
  } catch (error) {
    logger.warn(`Error managing temp directory: ${error.message}`);
  }
}

// Default paths for various report files
const REPORT_PATHS = {
  bundle: path.join(TEMP_DIR, 'bundle-report.json'),
  docQuality: path.join(TEMP_DIR, 'doc-quality-report.json'),
  deadCode: path.join(TEMP_DIR, 'dead-code-report.json'),
  vulnerability: path.join(TEMP_DIR, 'vulnerability-report.json'),
  performance: path.join(TEMP_DIR, 'performance-metrics.json')
};

/**
 * Clean up old reports in the temp directory
 */
export function cleanupTempDirectory() {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return;
    }
    
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      // Only delete JSON files to be safe
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
        logger.debug(`Cleaned up old report: ${file}`);
      }
    }
    logger.info('Cleaned up old reports from temp directory');
  } catch (error) {
    logger.warn(`Error cleaning up temp directory: ${error.message}`);
  }
}

/**
 * Collect report data from various modules and generate a consolidated report
 * 
 * @param {Object} options - Options for report collection
 * @param {string} [options.bundlePath] - Path to bundle analysis report
 * @param {string} [options.docQualityPath] - Path to doc quality report
 * @param {string} [options.deadCodePath] - Path to dead code report
 * @param {string} [options.vulnerabilityPath] - Path to vulnerability report
 * @param {string} [options.performancePath] - Path to performance metrics report
 * @param {string} [options.outputPath] - Path to save the consolidated report
 * @param {string} [options.title] - Report title
 * @param {boolean} [options.cleanupReports] - Whether to delete individual reports after consolidation
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function collectAndGenerateReport(options = {}) {
  try {
    // Ensure temp directory exists
    ensureTempDirExists();
    
    logger.info('Collecting report data...');
    
    const {
      bundlePath = REPORT_PATHS.bundle,
      docQualityPath = REPORT_PATHS.docQuality,
      deadCodePath = REPORT_PATHS.deadCode,
      vulnerabilityPath = REPORT_PATHS.vulnerability,
      performancePath = REPORT_PATHS.performance,
      outputPath = 'preview-dashboard.html',
      title = `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`,
      cleanupReports = true
    } = options;
    
    // Load data from report files (if they exist)
    const bundleData = loadReportData(bundlePath);
    const docQualityData = loadReportData(docQualityPath);
    const deadCodeData = loadReportData(deadCodePath);
    const vulnerabilityData = loadReportData(vulnerabilityPath);
    const performanceData = loadReportData(performancePath);
    
    // Check if we have at least some data to report
    const hasData = bundleData || docQualityData || deadCodeData || 
                   vulnerabilityData || performanceData;
                   
    if (!hasData) {
      logger.warn('No report data found. Skipping consolidated report generation.');
      return false;
    }
    
    // Generate the consolidated report
    const result = await generateConsolidatedReport({
      reportPath: outputPath,
      bundleData,
      docQualityData,
      deadCodeData,
      vulnerabilityData,
      performanceData,
      title
    });
    
    // If successful and cleanup requested, remove individual report files
    if (result && cleanupReports) {
      cleanupIndividualReports([
        bundlePath, 
        docQualityPath, 
        deadCodePath, 
        vulnerabilityPath, 
        performancePath
      ]);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error collecting and generating report: ${error.message}`);
    return false;
  }
}

/**
 * Load report data from a file
 * 
 * @param {string} filePath - Path to report file
 * @returns {Object|null} - Report data or null if file doesn't exist
 */
function loadReportData(filePath) {
  try {
    logger.debug(`Checking for report file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      logger.debug(`Report file not found: ${filePath}`);
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    logger.debug(`Successfully loaded report from: ${filePath}`);
    
    try {
      const data = JSON.parse(content);
      logger.debug(`Successfully parsed JSON from: ${filePath}`);
      return data;
    } catch (parseError) {
      logger.warn(`Error parsing JSON from ${filePath}: ${parseError.message}`);
      return null;
    }
  } catch (error) {
    logger.warn(`Error loading report data from ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Clean up individual report files after consolidation
 * 
 * @param {string[]} filePaths - Paths to report files to clean up
 */
function cleanupIndividualReports(filePaths) {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Removed individual report: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Error removing report file ${filePath}: ${error.message}`);
    }
  });
}

/**
 * Create a JSON report file from data
 * 
 * @param {Object} data - Report data
 * @param {string} filePath - Path to save the report
 * @returns {boolean} - Whether the operation was successful
 */
export function createJsonReport(data, filePath) {
  try {
    // Ensure directory exists if filePath includes subdirectories
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content);
    logger.debug(`Created JSON report: ${filePath}`);
    return true;
  } catch (error) {
    logger.warn(`Error creating JSON report ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Get the default path for a JSON report in the temp directory
 * 
 * @param {string} reportType - Type of report ('bundle', 'docQuality', 'deadCode', 'vulnerability', 'performance')
 * @returns {string} - Path to the report file
 */
export function getReportPath(reportType) {
  // Ensure temp directory exists
  ensureTempDirExists();
  
  return REPORT_PATHS[reportType] || path.join(TEMP_DIR, `${reportType}-report.json`);
}

/**
 * Get the default path for an HTML report in the temp directory
 * 
 * @param {string} reportType - Type of report ('bundle', 'docQuality', 'deadCode', 'vulnerability', 'performance')
 * @returns {string} - Path to the HTML report file
 */
export function getHtmlReportPath(reportType) {
  // Ensure temp directory exists
  ensureTempDirExists();
  
  return path.join(TEMP_DIR, `${reportType}-report.html`);
}

/**
 * Parse command-line arguments
 */
export function parseArguments() {
  const options = {
    'keep-individual-reports': { type: 'boolean', default: false },
    'output': { type: 'string', default: 'preview-dashboard.html' },
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

// If run directly
if (process.argv[1] === import.meta.url) {
  // This allows the module to be run directly for testing
  const testOptions = {
    cleanupReports: false,
    outputPath: 'test-dashboard.html'
  };
  
  collectAndGenerateReport(testOptions)
    .then(result => {
      if (result) {
        logger.success('Test consolidated report generated successfully');
      } else {
        logger.warn('No test consolidated report was generated');
      }
    });
} 