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

// Define paths to various reports
const REPORT_PATHS = {
  BUNDLE: path.join(TEMP_DIR, 'bundle-report.json'),
  DOC_QUALITY: path.join(TEMP_DIR, 'doc-quality-report.json'),
  DEAD_CODE: path.join(TEMP_DIR, 'dead-code-report.json'),
  VULNERABILITY: path.join(TEMP_DIR, 'vulnerability-report.json'),
  PERFORMANCE: path.join(TEMP_DIR, 'performance-metrics.json'),
  PREVIEW_URLS: path.join(TEMP_DIR, 'preview-urls.json')  // Add path for preview URLs
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
 * Extract preview URLs from files and logs
 * 
 * @param {Object} options - Options for URL extraction
 * @returns {Object|null} - Preview URLs object or null if not found
 */
export function extractPreviewUrls(options = {}) {
  const tempDir = options.tempDir || path.join(process.cwd(), 'temp');
  
  try {
    // First check if we have a dedicated preview URLs file (most reliable)
    const previewUrlFile = path.join(tempDir, 'preview-urls.json');
    if (fs.existsSync(previewUrlFile)) {
      logger.info(`Reading preview URLs from ${previewUrlFile}`);
      const urlsData = JSON.parse(fs.readFileSync(previewUrlFile, 'utf8'));
      
      // Check if the data is valid (has at least one URL)
      if (urlsData && (urlsData.admin || urlsData.hours || (urlsData.urls && urlsData.urls.length > 0))) {
        logger.success(`Successfully loaded preview URLs from ${previewUrlFile}`);
        return urlsData;
      } else {
        logger.warn(`Preview URL file exists but contains no valid URLs`);
      }
    }
    
    // Second, check for the deployment log
    const deployLogFile = path.join(tempDir, 'firebase-deploy.log');
    if (fs.existsSync(deployLogFile)) {
      logger.info(`Extracting preview URLs from deployment log: ${deployLogFile}`);
      const logContent = fs.readFileSync(deployLogFile, 'utf8');
      
      // Use the enhanced URL extraction for modern Firebase CLI format
      // This pattern looks for: - https://site-name--channel-id-xxxxx.web.app
      const urlsObj = {};
      const dashPrefixPattern = /(?:^|\s)-\s+(https:\/\/[^\s]+\.web\.app)/gm;
      let match;
      let allUrls = [];
      
      while ((match = dashPrefixPattern.exec(logContent)) !== null) {
        allUrls.push(match[1]);
      }
      
      // Try Firebase CLI v9+ hosting URL format
      if (allUrls.length === 0) {
        const hostingUrlPattern = /(?:Channel URL|Hosting URL|Live URL)(?:\s*\([^)]*\))?:\s+(https:\/\/[^\s]+)/gi;
        while ((match = hostingUrlPattern.exec(logContent)) !== null) {
          allUrls.push(match[1]);
        }
      }
      
      // If we found URLs, categorize them
      if (allUrls.length > 0) {
        // Try to identify admin and hours URLs based on URL parts
        for (const url of allUrls) {
          if (url.includes('admin')) {
            urlsObj.admin = url;
          } else if (url.includes('hours')) {
            urlsObj.hours = url;
          } else if (!urlsObj.admin) {
            // Default assignment if we can't identify the purpose
            urlsObj.admin = url;
          } else if (!urlsObj.hours) {
            urlsObj.hours = url;
          }
        }
        
        // If we couldn't categorize, just store as a list
        if (Object.keys(urlsObj).length === 0) {
          urlsObj.urls = allUrls;
        }
        
        // Save for future use
        try {
          fs.writeFileSync(previewUrlFile, JSON.stringify(urlsObj, null, 2));
          logger.success(`Extracted and saved ${allUrls.length} preview URLs to ${previewUrlFile}`);
        } catch (err) {
          logger.warn(`Could not save extracted preview URLs to file: ${err.message}`);
        }
        
        return urlsObj;
      } else {
        logger.warn(`No preview URLs found in deployment log file`);
      }
    } else {
      logger.warn(`Deployment log file not found at ${deployLogFile}`);
    }
    
    // Third, search for any log files that might contain URL information
    const potentialLogFiles = fs.readdirSync(tempDir)
      .filter(file => file.includes('firebase') || file.includes('deploy') || file.includes('preview'))
      .filter(file => file.endsWith('.log') || file.endsWith('.txt'))
      .map(file => path.join(tempDir, file));
    
    if (potentialLogFiles.length > 0) {
      logger.info(`Searching ${potentialLogFiles.length} log files for preview URLs...`);
      
      for (const logFile of potentialLogFiles) {
        try {
          const content = fs.readFileSync(logFile, 'utf8');
          const urlsObj = {};
          let allUrls = [];
          
          // Try all URL patterns
          const patterns = [
            /(?:^|\s)-\s+(https:\/\/[^\s]+\.web\.app)/gm,
            /(?:Channel URL|Hosting URL|Live URL)(?:\s*\([^)]*\))?:\s+(https:\/\/[^\s]+)/gi,
            /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.web\.app/g,
            /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.firebaseapp\.com/g
          ];
          
          // Extract URLs using all patterns
          for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              const url = pattern.toString().includes('Channel URL') ? match[1] : match[0];
              allUrls.push(url.trim());
            }
          }
          
          allUrls = [...new Set(allUrls)]; // Remove duplicates
          
          if (allUrls.length > 0) {
            logger.success(`Found ${allUrls.length} preview URLs in ${path.basename(logFile)}`);
            
            // Categorize URLs
            for (const url of allUrls) {
              if (url.includes('admin')) {
                urlsObj.admin = url;
              } else if (url.includes('hours')) {
                urlsObj.hours = url;
              } else if (!urlsObj.admin) {
                urlsObj.admin = url;
              } else if (!urlsObj.hours) {
                urlsObj.hours = url;
              }
            }
            
            // If we couldn't categorize, just store as a list
            if (Object.keys(urlsObj).length === 0) {
              urlsObj.urls = allUrls;
            }
            
            // Save for future use
            try {
              fs.writeFileSync(previewUrlFile, JSON.stringify(urlsObj, null, 2));
              logger.success(`Extracted and saved preview URLs to ${previewUrlFile}`);
            } catch (err) {
              logger.warn(`Could not save preview URLs to file: ${err.message}`);
            }
            
            return urlsObj;
          }
        } catch (err) {
          logger.debug(`Error processing ${logFile}: ${err.message}`);
        }
      }
      
      logger.warn(`No preview URLs found in any log files`);
    } else {
      logger.warn(`No potential log files found in ${tempDir}`);
    }
    
    logger.warn('No Firebase deployment logs found to extract preview URLs');
    return null;
  } catch (error) {
    logger.error(`Error extracting preview URLs: ${error.message}`);
    return null;
  }
}

/**
 * Collect report data from various modules and generate consolidated report
 * 
 * @param {Object} options - Options for report collection
 * @returns {Promise<boolean>} - Success or failure
 */
async function collectAndGenerateReport(options = {}) {
  // Ensure temp directory exists
  ensureTempDirExists();
  
  logger.info('Starting report collection process...');
  
  const {
    reportPath = 'preview-dashboard.html',
    outputPath = null,
    title = `Preview Workflow Dashboard (${new Date().toLocaleDateString()})`,
    cleanupIndividualReports = false
  } = options;
  
  // Load data from various reports
  let bundleData = null;
  let docQualityData = null;
  let deadCodeData = null;
  let vulnerabilityData = null;
  let performanceData = null;
  let previewUrls = null;  // Add preview URLs variable
  
  try {
    // Load bundle analysis report
    if (fs.existsSync(REPORT_PATHS.BUNDLE)) {
      logger.info(`Loading bundle analysis report from ${REPORT_PATHS.BUNDLE}`);
      bundleData = JSON.parse(fs.readFileSync(REPORT_PATHS.BUNDLE, 'utf8'));
    }
    
    // Load documentation quality report
    if (fs.existsSync(REPORT_PATHS.DOC_QUALITY)) {
      logger.info(`Loading documentation quality report from ${REPORT_PATHS.DOC_QUALITY}`);
      docQualityData = JSON.parse(fs.readFileSync(REPORT_PATHS.DOC_QUALITY, 'utf8'));
    }
    
    // Load dead code detection report
    if (fs.existsSync(REPORT_PATHS.DEAD_CODE)) {
      logger.info(`Loading dead code detection report from ${REPORT_PATHS.DEAD_CODE}`);
      deadCodeData = JSON.parse(fs.readFileSync(REPORT_PATHS.DEAD_CODE, 'utf8'));
    }
    
    // Load vulnerability scanning report
    if (fs.existsSync(REPORT_PATHS.VULNERABILITY)) {
      logger.info(`Loading vulnerability scanning report from ${REPORT_PATHS.VULNERABILITY}`);
      vulnerabilityData = JSON.parse(fs.readFileSync(REPORT_PATHS.VULNERABILITY, 'utf8'));
    }
    
    // Load performance metrics report
    if (fs.existsSync(REPORT_PATHS.PERFORMANCE)) {
      logger.info(`Loading performance metrics report from ${REPORT_PATHS.PERFORMANCE}`);
      performanceData = JSON.parse(fs.readFileSync(REPORT_PATHS.PERFORMANCE, 'utf8'));
    }
    
    // Extract preview URLs
    previewUrls = extractPreviewUrls(options);
    
    // Generate consolidated report
    const consolidatedReportPath = outputPath || reportPath;
    
    const success = await generateConsolidatedReport({
      reportPath: consolidatedReportPath,
      bundleData,
      docQualityData,
      deadCodeData,
      vulnerabilityData,
      performanceData,
      previewUrls,  // Pass preview URLs to consolidated report generator
      title
    });
    
    if (success) {
      logger.success(`Consolidated report generated at ${consolidatedReportPath}`);
      
      // Cleanup individual reports if requested
      if (cleanupIndividualReports) {
        logger.info('Cleaning up individual reports...');
        cleanupTempDirectory();
      }
      
      return true;
    } else {
      logger.error('Failed to generate consolidated report');
      return false;
    }
  } catch (error) {
    logger.error(`Error in report collection process: ${error.message}`);
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

// Export the functions
export {
  collectAndGenerateReport,
  REPORT_PATHS,
  TEMP_DIR
};

// Export default function
export default collectAndGenerateReport; 