/**
 * Documentation Freshness Checker
 * 
 * Validates and monitors the freshness of project documentation.
 * This tool scans markdown files to verify link validity, check file
 * modification dates, and identify potentially outdated content.
 *
 * Features:
 * - Validates internal and external links in documentation files
 * - Checks for broken references to files, functions, or code examples
 * - Identifies documentation that hasn't been updated recently
 * - Compares code changes with associated documentation updates
 * - Generates warnings for potentially outdated information
 * 
 * @module checks/doc-freshness
 */

import fs from 'fs/promises';
import path from 'path';
import * as glob from 'glob';
import { promisify } from 'util';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { ErrorAggregator, ValidationError } from '../core/error-handler.js';
import { isCI, getEnvironmentType } from '../core/environment.js';
import { fileURLToPath } from 'url';

/* global process, URL */

const globPromise = promisify(glob.glob);

// Configuration constants
const MAX_DOC_AGE_DAYS = 90; // Docs older than this will trigger a warning
const CRITICAL_DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/documentation-guide.md',
  'docs/preview-deployment-guide.md'
];
const CODE_DOC_PAIRS = [
  { code: 'scripts/firebase/deployment.js', docs: ['docs/preview-deployment-guide.md'] },
  { code: 'scripts/firebase/url-extractor.js', docs: ['docs/preview-deployment-guide.md'] },
  { code: 'scripts/build/build-runner.js', docs: ['docs/build-process.md'] },
  { code: 'scripts/core/error-handler.js', docs: ['docs/error-handling.md'] }
];

/**
 * Check if a file exists
 * 
 * @async
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} Whether the file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file modification date 
 * 
 * @async
 * @param {string} filePath - Path to the file
 * @returns {Promise<Date|null>} Modification date or null if file doesn't exist
 */
async function getFileModDate(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

/**
 * Calculate days since file was modified
 * 
 * @param {Date} modDate - Modification date
 * @returns {number} Days since modification
 */
function daysSinceModified(modDate) {
  const now = new Date();
  const diffMs = now - modDate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract links from markdown content
 * 
 * @param {string} content - Markdown content
 * @returns {Array<{text: string, url: string, line: number}>} Extracted links
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  
  // Match both [text](url) and [text]: url formats
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const referenceStyleLinkRegex = /\[([^\]]+)\]:\s*(.+)/g;
  
  lines.forEach((line, idx) => {
    let match;
    // Find inline links
    while ((match = markdownLinkRegex.exec(line)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        line: idx + 1
      });
    }
    
    // Reset regex state
    markdownLinkRegex.lastIndex = 0;
    
    // Find reference style links
    while ((match = referenceStyleLinkRegex.exec(line)) !== null) {
      links.push({
        text: match[1],
        url: match[2].trim(),
        line: idx + 1
      });
    }
    
    // Reset regex state
    referenceStyleLinkRegex.lastIndex = 0;
  });
  
  return links;
}

/**
 * Check if links in markdown content are valid
 * 
 * @async
 * @param {string} filePath - Path to the markdown file
 * @param {string} content - Markdown content
 * @param {ErrorAggregator} errorTracker - Error tracker for reporting issues
 * @returns {Promise<{valid: boolean, count: number, broken: Array}>} Validation results
 */
async function validateLinks(filePath, content, errorTracker) {
  const links = extractLinks(content);
  const baseDir = path.dirname(filePath);
  const broken = [];
  
  for (const link of links) {
    // Skip anchor links within the same document and external URLs
    if (link.url.startsWith('#') || 
        link.url.startsWith('http:') || 
        link.url.startsWith('https:')) {
      continue;
    }
    
    // Handle relative links
    const linkPath = path.resolve(baseDir, link.url);
    const exists = await fileExists(linkPath);
    
    if (!exists) {
      broken.push({
        text: link.text,
        url: link.url,
        line: link.line
      });
      
      errorTracker.addWarning(new ValidationError(
        `Broken link in ${filePath}:${link.line} - [${link.text}](${link.url})`,
        'doc-links',
        null,
        `Update or remove the broken link to "${link.url}"`
      ));
    }
  }
  
  return {
    valid: broken.length === 0,
    count: links.length,
    broken
  };
}

/**
 * Check if documentation is outdated based on last modification date
 * 
 * @async
 * @param {string} filePath - Path to document
 * @param {ErrorAggregator} errorTracker - Error tracker for reporting issues
 * @returns {Promise<{outdated: boolean, daysSinceUpdate: number}>} Freshness check result
 */
async function checkDocFreshness(filePath, errorTracker) {
  const modDate = await getFileModDate(filePath);
  
  if (!modDate) {
    return { outdated: true, daysSinceUpdate: Infinity };
  }
  
  const daysSinceUpdate = daysSinceModified(modDate);
  const isCritical = CRITICAL_DOCS.includes(filePath);
  const maxAgeDays = isCritical ? MAX_DOC_AGE_DAYS / 2 : MAX_DOC_AGE_DAYS;
  
  // Check if document is outdated
  if (daysSinceUpdate > maxAgeDays) {
    const severity = isCritical ? 'warning' : 'info';
    
    errorTracker.addWarning(new ValidationError(
      `Documentation ${filePath} may be outdated (${daysSinceUpdate} days since last update)`,
      'doc-freshness',
      null,
      'Review and update the document to reflect current functionality'
    ));
    
    return { outdated: true, daysSinceUpdate };
  }
  
  return { outdated: false, daysSinceUpdate };
}

/**
 * Check if code has been updated more recently than its documentation
 * 
 * @async
 * @param {Array<{code: string, docs: string[]}>} pairs - Code/doc file pairs
 * @param {ErrorAggregator} errorTracker - Error tracker for reporting issues
 * @returns {Promise<Array<{outdated: boolean, code: string, docs: string[], daysDiff: number}>>} Check results
 */
async function checkCodeDocSynchronization(pairs, errorTracker) {
  const results = [];
  
  for (const pair of pairs) {
    const codeModDate = await getFileModDate(pair.code);
    if (!codeModDate) continue;
    
    for (const docPath of pair.docs) {
      const docModDate = await getFileModDate(docPath);
      if (!docModDate) {
        errorTracker.addWarning(new ValidationError(
          `Missing documentation file ${docPath} for code ${pair.code}`,
          'doc-sync', 
          null,
          `Create the missing documentation file ${docPath}`
        ));
        continue;
      }
      
      // Calculate how many days the code is newer than the docs
      const daysDiff = docModDate < codeModDate ? 
        Math.floor((codeModDate - docModDate) / (1000 * 60 * 60 * 24)) : 0;
      
      // If code is more than 7 days newer than docs, flag as outdated
      if (daysDiff > 7) {
        errorTracker.addWarning(new ValidationError(
          `Documentation ${docPath} may be outdated relative to code changes in ${pair.code} (${daysDiff} days behind)`,
          'doc-sync',
          null,
          'Update documentation to reflect recent code changes'
        ));
        
        results.push({
          outdated: true,
          code: pair.code,
          docs: [docPath],
          daysDiff
        });
      }
    }
  }
  
  return results;
}

/**
 * Run documentation freshness check
 * 
 * @async
 * @param {Object} options - Check options
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {string[]} [options.include] - Patterns of files to include
 * @param {string[]} [options.exclude] - Patterns of files to exclude
 * @param {boolean} [options.strictMode=false] - Treat warnings as errors
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for reporting issues
 * @returns {Promise<{success: boolean, issues: number, files: number}>} Check results
 */
export async function checkDocumentation(options = {}) {
  const {
    verbose = false,
    include = ['**/*.md'],
    exclude = ['**/node_modules/**'],
    strictMode = false,
    errorTracker = new ErrorAggregator()
  } = options;
  
  // Find all markdown files
  let docFiles = [];
  for (const pattern of include) {
    const matches = await globPromise(pattern, { ignore: exclude });
    docFiles = docFiles.concat(matches);
  }
  
  if (verbose) {
    logger.info(`Found ${docFiles.length} documentation files to check`);
  }
  
  let issueCount = 0;
  
  // Check each documentation file
  for (const filePath of docFiles) {
    if (verbose) {
      logger.info(`Checking ${filePath}`);
    }
    
    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Validate links
      const linkResults = await validateLinks(filePath, content, errorTracker);
      if (!linkResults.valid) {
        issueCount += linkResults.broken.length;
        logger.warn(`Found ${linkResults.broken.length} broken links in ${filePath}`);
      }
      
      // Check document freshness
      const freshnessResults = await checkDocFreshness(filePath, errorTracker);
      if (freshnessResults.outdated) {
        issueCount++;
        logger.warn(`Document ${filePath} may be outdated (${freshnessResults.daysSinceUpdate} days old)`);
      }
    } catch (error) {
      errorTracker.addError(new ValidationError(
        `Failed to check documentation file ${filePath}`,
        'doc-freshness',
        error,
        'Ensure the file exists and is readable'
      ));
      issueCount++;
    }
  }
  
  // Check code-doc synchronization
  const syncResults = await checkCodeDocSynchronization(CODE_DOC_PAIRS, errorTracker);
  const outdatedDocs = syncResults.filter(result => result.outdated);
  issueCount += outdatedDocs.length;
  
  if (verbose) {
    logger.info(`Documentation freshness check completed with ${issueCount} issues`);
  }
  
  if (issueCount > 0) {
    logger.warn(`Found ${issueCount} documentation issues`);
    errorTracker.logSummary();
  }
  
  // In strict mode or in CI environment, fail if there are issues
  const shouldFail = (strictMode || isCI()) && issueCount > 0;
  
  return {
    success: !shouldFail,
    issues: issueCount,
    files: docFiles.length
  };
}

/**
 * Check a single documentation file for freshness
 * 
 * @async
 * @param {string} filePath - Path to the documentation file
 * @param {Object} options - Check options
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {boolean} [options.strictMode=false] - Treat warnings as errors
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for reporting issues
 * @returns {Promise<{success: boolean, issues: number}>} Check results
 */
export async function checkSingleDocument(filePath, options = {}) {
  const {
    verbose = false,
    strictMode = false,
    errorTracker = new ErrorAggregator()
  } = options;
  
  if (!(await fileExists(filePath))) {
    errorTracker.addError(new ValidationError(
      `Documentation file ${filePath} does not exist`,
      'doc-freshness',
      null,
      'Create the missing documentation file'
    ));
    
    return {
      success: false,
      issues: 1
    };
  }
  
  let issueCount = 0;
  
  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    
    // Validate links
    const linkResults = await validateLinks(filePath, content, errorTracker);
    if (!linkResults.valid) {
      issueCount += linkResults.broken.length;
      logger.warn(`Found ${linkResults.broken.length} broken links in ${filePath}`);
    }
    
    // Check document freshness
    const freshnessResults = await checkDocFreshness(filePath, errorTracker);
    if (freshnessResults.outdated) {
      issueCount++;
      logger.warn(`Document ${filePath} may be outdated (${freshnessResults.daysSinceUpdate} days old)`);
    }
    
    // Check if this doc is part of a code-doc pair
    const relatedPairs = CODE_DOC_PAIRS.filter(pair => pair.docs.includes(filePath));
    if (relatedPairs.length > 0) {
      const syncResults = await checkCodeDocSynchronization(relatedPairs, errorTracker);
      const outdatedDocs = syncResults.filter(result => result.outdated);
      issueCount += outdatedDocs.length;
    }
  } catch (error) {
    errorTracker.addError(new ValidationError(
      `Failed to check documentation file ${filePath}`,
      'doc-freshness',
      error,
      'Ensure the file exists and is readable'
    ));
    issueCount++;
  }
  
  if (verbose) {
    logger.info(`Documentation check for ${filePath} completed with ${issueCount} issues`);
  }
  
  if (issueCount > 0) {
    errorTracker.logSummary();
  }
  
  // In strict mode or in CI environment, fail if there are issues
  const shouldFail = (strictMode || isCI()) && issueCount > 0;
  
  return {
    success: !shouldFail,
    issues: issueCount
  };
}

// If run directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const errorTracker = new ErrorAggregator();
  
  // Check if a specific file was provided
  const targetFile = process.argv[2];
  
  try {
    if (targetFile) {
      const result = await checkSingleDocument(targetFile, { 
        verbose: true, 
        errorTracker 
      });
      process.exit(result.success ? 0 : 1);
    } else {
      const result = await checkDocumentation({ 
        verbose: true,
        errorTracker
      });
      process.exit(result.success ? 0 : 1);
    }
  } catch (error) {
    logger.error('Documentation freshness check failed');
    logger.error(error);
    process.exit(1);
  }
} 