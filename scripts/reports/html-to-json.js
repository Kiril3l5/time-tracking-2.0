#!/usr/bin/env node

/**
 * HTML to JSON Report Converter
 * 
 * This script converts HTML reports in the temp directory to JSON format
 * that can be used by the consolidated report generator.
 */

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import process from 'node:process';
import { logger } from '../core/logger.js';

const TEMP_DIR = path.join(process.cwd(), 'temp');

/**
 * Convert bundle report HTML to JSON
 */
function convertBundleReport(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  const assets = [];
  const tables = document.querySelectorAll('table');
  
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const name = cells[0].textContent.trim();
        const sizeText = cells[1].textContent.trim();
        const size = parseInt(sizeText.replace(/[^0-9]/g, ''));
        
        if (name && size) {
          assets.push({
            name,
            size,
            isNew: row.textContent.includes('NEW'),
            sizeChange: 0 // We'll calculate this in a future version
          });
        }
      }
    });
  });
  
  return {
    assets,
    totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
    warnings: [],
    errors: []
  };
}

/**
 * Convert doc quality report HTML to JSON
 */
function convertDocQualityReport(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  const issues = [];
  const tables = document.querySelectorAll('table');
  
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const file = cells[0].textContent.trim();
        const message = cells[1].textContent.trim();
        const severity = cells[2].textContent.toLowerCase().trim();
        
        if (file && message) {
          issues.push({ file, message, severity });
        }
      }
    });
  });
  
  // Count documented vs total files from summary section
  const summaryText = document.querySelector('.summary')?.textContent || '';
  const totalFiles = parseInt(summaryText.match(/Total Files: (\d+)/)?.at(1) || '0');
  const documentedFiles = parseInt(summaryText.match(/Documented Files: (\d+)/)?.at(1) || '0');
  
  return {
    issues,
    totalFiles,
    documentedFiles,
    coverage: totalFiles ? Math.round((documentedFiles / totalFiles) * 100) : 0
  };
}

/**
 * Convert dead code report HTML to JSON
 */
function convertDeadCodeReport(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  const unusedExports = [];
  const unusedDependencies = [];
  
  // Parse unused exports
  const exportTables = document.querySelectorAll('table.unused-exports');
  exportTables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const file = cells[0].textContent.trim();
        const name = cells[1].textContent.trim();
        const type = cells[2].textContent.trim();
        
        if (file && name) {
          unusedExports.push({ file, name, type });
        }
      }
    });
  });
  
  // Parse unused dependencies
  const depTables = document.querySelectorAll('table.unused-deps');
  depTables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const name = cells[0].textContent.trim();
        const version = cells[1].textContent.trim();
        
        if (name) {
          unusedDependencies.push({ name, version });
        }
      }
    });
  });
  
  return {
    unusedExports,
    unusedDependencies
  };
}

/**
 * Convert vulnerability report HTML to JSON
 */
function convertVulnerabilityReport(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  const vulnerabilities = [];
  const tables = document.querySelectorAll('table');
  
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const package_ = cells[0].textContent.trim();
        const version = cells[1].textContent.trim();
        const severity = cells[2].textContent.toLowerCase().trim();
        const description = cells[3].textContent.trim();
        
        if (package_ && severity) {
          vulnerabilities.push({
            package: package_,
            version,
            severity,
            description
          });
        }
      }
    });
  });
  
  return { vulnerabilities };
}

/**
 * Convert all HTML reports to JSON
 */
export async function convertReports() {
  try {
    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
      logger.warn('Temp directory not found');
      return false;
    }
    
    // Convert bundle report
    const bundleHtmlPath = path.join(TEMP_DIR, 'bundle-report.html');
    if (fs.existsSync(bundleHtmlPath)) {
      const htmlContent = fs.readFileSync(bundleHtmlPath, 'utf8');
      const jsonData = convertBundleReport(htmlContent);
      fs.writeFileSync(
        path.join(TEMP_DIR, 'bundle-report.json'),
        JSON.stringify(jsonData, null, 2)
      );
      logger.success('Converted bundle report to JSON');
    }
    
    // Convert doc quality report
    const docHtmlPath = path.join(TEMP_DIR, 'docQuality-report.html');
    if (fs.existsSync(docHtmlPath)) {
      const htmlContent = fs.readFileSync(docHtmlPath, 'utf8');
      const jsonData = convertDocQualityReport(htmlContent);
      fs.writeFileSync(
        path.join(TEMP_DIR, 'doc-quality-report.json'),
        JSON.stringify(jsonData, null, 2)
      );
      logger.success('Converted documentation quality report to JSON');
    }
    
    // Convert dead code report
    const deadCodeHtmlPath = path.join(TEMP_DIR, 'deadCode-report.html');
    if (fs.existsSync(deadCodeHtmlPath)) {
      const htmlContent = fs.readFileSync(deadCodeHtmlPath, 'utf8');
      const jsonData = convertDeadCodeReport(htmlContent);
      fs.writeFileSync(
        path.join(TEMP_DIR, 'dead-code-report.json'),
        JSON.stringify(jsonData, null, 2)
      );
      logger.success('Converted dead code report to JSON');
    }
    
    // Convert vulnerability report
    const vulnHtmlPath = path.join(TEMP_DIR, 'vulnerability-report.html');
    if (fs.existsSync(vulnHtmlPath)) {
      const htmlContent = fs.readFileSync(vulnHtmlPath, 'utf8');
      const jsonData = convertVulnerabilityReport(htmlContent);
      fs.writeFileSync(
        path.join(TEMP_DIR, 'vulnerability-report.json'),
        JSON.stringify(jsonData, null, 2)
      );
      logger.success('Converted vulnerability report to JSON');
    }
    
    // Generate performance metrics from deploy logs
    const deployLog = path.join(TEMP_DIR, 'firebase-deploy.log');
    if (fs.existsSync(deployLog)) {
      const logContent = fs.readFileSync(deployLog, 'utf8');
      const steps = [];
      
      // Extract step information from log
      const stepRegex = /=== (.*?) ===/g;
      const timeRegex = /\((\d+\.\d+s)\)/;
      let match;
      
      while ((match = stepRegex.exec(logContent)) !== null) {
        const stepName = match[1];
        const stepContent = logContent.slice(match.index, logContent.indexOf('===', match.index + 4));
        const duration = stepContent.match(timeRegex)?.[1] || 'unknown';
        const status = stepContent.includes('Error') ? 'error' :
                      stepContent.includes('Warning') ? 'warning' : 'success';
        
        steps.push({ name: stepName, duration, status });
      }
      
      const performanceData = {
        totalDuration: steps.reduce((total, step) => {
          const seconds = parseFloat(step.duration.replace('s', '')) || 0;
          return total + seconds;
        }, 0).toFixed(2) + 's',
        stepsCompleted: steps.length,
        steps
      };
      
      fs.writeFileSync(
        path.join(TEMP_DIR, 'performance-metrics.json'),
        JSON.stringify(performanceData, null, 2)
      );
      logger.success('Generated performance metrics JSON');
    }
    
    return true;
  } catch (error) {
    logger.error(`Error converting reports: ${error.message}`);
    return false;
  }
}

// If run directly
if (process.argv[1] === import.meta.url) {
  convertReports()
    .then(success => {
      if (success) {
        logger.success('Successfully converted all reports to JSON format');
      } else {
        logger.error('Failed to convert some reports');
      }
    });
}

export default convertReports; 