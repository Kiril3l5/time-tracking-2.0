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
import { logger } from '../core/logger.js';
import { generateWorkflowDashboard } from '../workflow/dashboard-integration.js';
import { parseArgs } from 'node:util';
import { execSync } from 'child_process';
import convertReports from './html-to-json.js';

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

// Define paths for storing reports
const REPORT_PATHS = {
  BUNDLE: path.join(TEMP_DIR, 'bundle-report.json'),
  DOC_QUALITY: path.join(TEMP_DIR, 'doc-quality-report.json'),
  DEAD_CODE: path.join(TEMP_DIR, 'dead-code-report.json'),
  VULNERABILITY: path.join(TEMP_DIR, 'vulnerability-report.json'),
  PERFORMANCE: path.join(TEMP_DIR, 'performance-metrics.json'),
  PREVIEW_URLS: path.join(TEMP_DIR, 'preview-urls.json'),  // Add path for preview URLs
  DOC_FRESHNESS: path.join(TEMP_DIR, 'doc-freshness-report.json'), // Added for doc freshness
  TYPESCRIPT_CHECK: path.join(TEMP_DIR, 'typescript-check-report.json'), // Added for typescript
  LINT_CHECK: path.join(TEMP_DIR, 'lint-check-report.json'), // Added for lint
  WORKFLOW_VALIDATION: path.join(TEMP_DIR, 'workflow-validation-report.json'), // Added for workflow validation
  HEALTH_CHECK: path.join(TEMP_DIR, 'health-check-report.json') // Added for health checks
};

/**
 * Clean up old reports in the temp directory
 */
function cleanupTempDirectory() {
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
function extractPreviewUrls(options = {}) {
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
 * Load report data from a file
 * @param {string} filePath - Path to the report file
 * @returns {Object|null} - Report data or null if not found
 */
function loadReportData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Report file not found: ${filePath}`);
      return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Validate data structure
    if (!data || typeof data !== 'object') {
      logger.warn(`Invalid report data in ${filePath}`);
      return null;
    }
    
    logger.debug(`Loaded report data from ${filePath}`);
    return data;
  } catch (error) {
    logger.error(`Error loading report data from ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Collect report data from various modules and generate consolidated report
 * 
 * @param {Object} options - Options for report collection
 * @returns {Promise<boolean>} - Whether the report was generated successfully
 */
async function collectAndGenerateReport(options = {}) {
  try {
    ensureTempDirExists();
    
    // First convert HTML reports to JSON
    logger.info('Converting HTML reports to JSON format...');
    await convertReports();
    
    // Load all report data
    const bundleData = loadReportData(REPORT_PATHS.BUNDLE);
    const docQualityData = loadReportData(REPORT_PATHS.DOC_QUALITY);
    const deadCodeData = loadReportData(REPORT_PATHS.DEAD_CODE);
    const vulnerabilityData = loadReportData(REPORT_PATHS.VULNERABILITY);
    const performanceData = loadReportData(REPORT_PATHS.PERFORMANCE);
    const previewUrls = loadReportData(REPORT_PATHS.PREVIEW_URLS);
    
    // Log what data we found
    logger.info('Loading report data...');
    if (bundleData) logger.info('✓ Bundle analysis data loaded');
    if (docQualityData) logger.info('✓ Documentation quality data loaded');
    if (deadCodeData) logger.info('✓ Dead code analysis data loaded');
    if (vulnerabilityData) logger.info('✓ Vulnerability scan data loaded');
    if (performanceData) logger.info('✓ Performance metrics loaded');
    if (previewUrls) logger.info('✓ Preview URLs loaded');
    
    // Transform bundle data to expected dashboard format
    let transformedBundleData = null;
    if (bundleData) {
      // Calculate total size across all packages
      const calculateTotalSize = (data) => {
        if (!data) return '0 KB';
        
        // Handle different data formats
        if (data.totalSize) {
          // Direct totalSize property (from build-manager)
          return `${(data.totalSize / 1024).toFixed(2)} KB`;
        }
        
        // Handle format from bundle analyzer (sum all packages)
        let total = 0;
        
        if (data.packages) {
          // New format with packages object
          Object.values(data.packages).forEach(pkg => {
            if (typeof pkg === 'object' && pkg !== null) {
              total += pkg.totalSize || 0;
            }
          });
        } else if (data.current) {
          // Old format with 'current' object containing packages
          Object.values(data.current).forEach(pkg => {
            if (pkg.total) total += pkg.total;
          });
        }
        
        return `${(total / 1024).toFixed(2)} KB`;
      };
      
      // Transform packages data for dashboard
      const transformPackages = (data) => {
        if (!data) return {};
        const result = {};
        
        // Handle different package data formats
        if (data.packages) {
          // New format from build-manager
          Object.entries(data.packages).forEach(([name, pkg]) => {
            if (typeof pkg !== 'object' || pkg === null) return;
            
            result[name] = {
              totalSize: `${(pkg.totalSize / 1024).toFixed(2)} KB`,
              fileCount: pkg.fileCount || 0,
              files: Array.isArray(pkg.files) ? pkg.files : 
                Object.entries(pkg.files || {}).map(([filename, size]) => ({
                  name: filename,
                  size: typeof size === 'string' ? size : `${(size / 1024).toFixed(2)} KB`
                })).sort((a, b) => {
                  // Extract numeric size for sorting
                  const sizeA = parseFloat(a.size);
                  const sizeB = parseFloat(b.size);
                  return sizeB - sizeA; // Sort largest first
                })
            };
          });
        } else if (data.current) {
          // Old format from bundle analyzer
          Object.entries(data.current).forEach(([name, pkg]) => {
            result[name] = {
              totalSize: `${(pkg.total / 1024).toFixed(2)} KB`,
              fileCount: Object.keys(pkg.files || {}).length,
              files: Object.entries(pkg.files || {}).map(([filename, size]) => ({
                name: filename,
                size: `${(size / 1024).toFixed(2)} KB`
              })).sort((a, b) => {
                // Extract numeric size for sorting
                const sizeA = parseFloat(a.size);
                const sizeB = parseFloat(b.size);
                return sizeB - sizeA; // Sort largest first
              })
            };
          });
        }
        
        return result;
      };
      
      // Determine which data format we're working with
      const dataSource = bundleData.packages ? bundleData : 
                         (bundleData.current ? bundleData : { current: {} });
      
      // Create dashboard-friendly format
      transformedBundleData = {
        totalSize: calculateTotalSize(bundleData),
        duration: bundleData.totalDuration || bundleData.metrics?.duration || 0,
        packages: transformPackages(dataSource),
        history: bundleData.historical || bundleData.history || [],
        issues: bundleData.issues || [],
        isValid: bundleData.valid !== false
      };
      
      logger.debug('Bundle data transformed for dashboard format');
    }
    
    // Generate consolidated report
    const success = await generateWorkflowDashboard({
      bundleData: transformedBundleData,
      docQualityData,
      deadCodeData,
      vulnerabilityData,
      performanceData,
      previewUrls,
      reportPath: options.reportPath || 'preview-dashboard.html'
    });
    
    if (success) {
      logger.success('Preview dashboard generated successfully!');
      
      // Try to open the dashboard
      try {
        execSync('npx open-cli preview-dashboard.html', { stdio: 'pipe' });
        logger.success('Dashboard opened in your default browser');
      } catch (error) {
        logger.warn('Could not open dashboard automatically. Please open preview-dashboard.html in your browser.');
      }
      
      return true;
    } else {
      logger.error('Failed to generate preview dashboard');
      return false;
    }
  } catch (error) {
    logger.error(`Error generating consolidated report: ${error.message}`);
    return false;
  }
}

/**
 * Clean up individual report files after consolidation
 * 
 * @param {string[]} filePaths - Paths to report files to clean up
 */
function _cleanupReportFiles(filePaths) {
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
function createJsonReport(data, filePath) {
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
function getReportPath(reportType) {
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
function getHtmlReportPath(reportType) {
  // Ensure temp directory exists
  ensureTempDirExists();
  
  return path.join(TEMP_DIR, `${reportType}-report.html`);
}

/**
 * Parse command-line arguments
 */
function parseArguments() {
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

/**
 * Cleanup old individual reports
 * @param {Object} options - Cleanup options
 * @param {number} options._keepCount - Number of reports to keep
 * @returns {Promise<{deleted: number, kept: number}>} Stats about cleanup
 */
function _cleanupIndividualReports({ _keepCount = 10 } = {}) {
  // ... existing code ...
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

// Export everything in a single statement
export {
  collectAndGenerateReport as default,
  REPORT_PATHS,
  TEMP_DIR,
  cleanupTempDirectory,
  extractPreviewUrls,
  createJsonReport,
  getReportPath,
  getHtmlReportPath,
  parseArguments
}; 