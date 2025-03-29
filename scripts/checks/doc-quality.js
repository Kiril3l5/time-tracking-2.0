#!/usr/bin/env node

/**
 * Documentation Quality Checker
 * 
 * This module verifies documentation quality by:
 * 1. Finding duplicate content across documentation files
 * 2. Generating an updated index of all documentation
 * 3. Validating that key features have proper documentation
 * 
 * Used in the preview workflow to ensure documentation quality.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as logger from '../core/logger.js';
import { parseArgs } from 'node:util';
import { getReportPath, getHtmlReportPath, createJsonReport } from '../reports/report-collector.js';
import { execSync } from 'child_process';

// Convert callbacks to promises
const readdir = promisify(fs.readdir);
const _readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

// Get the directory and filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const _DEFAULT_DOCS_DIR = 'docs';
const _DEFAULT_OUTPUT_FILE = 'doc-quality-report.html';
const _DEFAULT_REQUIRED_DOCS = ['setup', 'deployment', 'architecture', 'api', 'configuration'];
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_MIN_COVERAGE = 80;
const DEFAULT_IGNORE_DIRS = ['node_modules', '.git', '.github', 'dist', 'build'];
const _DEFAULT_INCLUDE_PATTERNS = ['**/*.md']; // Default include patterns
const _DEFAULT_EXCLUDE_PATTERNS = ['**/node_modules/**']; // Default exclude patterns

/**
 * Calculate Jaccard similarity between two sets
 * @param {Set} set1 - First set
 * @param {Set} set2 - Second set
 * @returns {number} Similarity score (0-1)
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Extract words from text for comparison
 * @param {string} text - The text to extract words from
 * @returns {Set} Set of unique words
 */
function _extractWords(text) {
  const commonWords = new Set(['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'is', 'are']);
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
  );
}

/**
 * Extract title from Markdown content (first H1)
 * @param {string} content - File content
 * @returns {string} Title or default text
 */
function _extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : '(No title)';
}

/**
 * Generate a brief summary from the markdown content
 * @param {string} content - File content
 * @returns {string} Summary text
 */
function _generateSummary(content) {
  // Remove code blocks
  const withoutCode = content.replace(/```[\s\S]*?```/g, '');
  
  // Find the first paragraph after the title
  const paragraphs = withoutCode.split('\n\n');
  for (let i = 0; i < paragraphs.length; i++) {
    // Skip title and empty paragraphs
    if (i === 0 && paragraphs[i].startsWith('#')) continue;
    if (!paragraphs[i].trim()) continue;
    
    // Get the first real paragraph
    const summary = paragraphs[i]
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[#*_]/g, '')  // Remove markdown formatting
      .trim();
      
    if (summary) {
      // Limit to ~100 characters
      return summary.length > 100 ? `${summary.substring(0, 97)}...` : summary;
    }
  }
  
  return '(No summary available)';
}

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format date to YYYY-MM-DD format
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Find all Markdown files recursively
 * @param {string} dir - Directory to scan
 * @param {Array} fileList - Accumulated file list
 * @param {string} baseDir - Base directory for relative paths
 * @param {Array} ignoreDirectories - Directories to ignore
 * @returns {Promise<Array>} List of found files with metadata
 */
async function _findMarkdownFiles(dir, fileList = [], baseDir = dir, ignoreDirectories = DEFAULT_IGNORE_DIRS) {
  const files = await readdir(dir);
  
  for (const file of files) {
    if (ignoreDirectories.includes(file)) continue;
    
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);
    
    if (fileStat.isDirectory()) {
      await _findMarkdownFiles(filePath, fileList, baseDir, ignoreDirectories);
    } else if (file.endsWith('.md')) {
      const relativePath = path.relative(baseDir, filePath);
      fileList.push({
        path: filePath,
        relativePath,
        name: path.basename(filePath),
        size: fileStat.size,
        modified: fileStat.mtime
      });
    }
  }
  
  return fileList;
}

/**
 * Find missing required documentation
 * @param {Array} fileList - List of files found
 * @param {Array} requiredDocs - List of required documentation filenames
 * @returns {Array} List of missing documentation files
 */
function _findMissingDocs(fileList, requiredDocs) {
  const fileNames = fileList.map(file => file.name);
  return requiredDocs.filter(doc => !fileNames.includes(doc));
}

/**
 * Analyze documents for duplication
 * @param {Array} fileData - File data with content and metadata
 * @param {Object} options - Analysis options
 * @returns {Object} Results of duplication analysis
 */
function _analyzeDuplication(fileData, options = {}) {
  const {
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    minContentLength = 500
  } = options;
  
  const results = {
    contentDuplicates: []
  };

  // Check for content duplicates
  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      const file1 = fileData[i];
      const file2 = fileData[j];
      
      // Skip files that are too small
      if (file1.content.length < minContentLength || file2.content.length < minContentLength) continue;
      
      const similarity = jaccardSimilarity(file1.words, file2.words);
      
      if (similarity >= similarityThreshold) {
        results.contentDuplicates.push({
          file1: file1.path,
          file2: file2.path,
          similarity: Math.round(similarity * 100),
          size1: file1.content.length,
          size2: file2.content.length
        });
      }
    }
  }
  
  return results;
}

/**
 * Generate documentation index
 * @param {Array} fileData - File data with content and metadata
 * @param {string} outputFile - Output file path
 * @returns {Promise<string>} Path to generated index
 */
async function _generateIndex(fileData, outputFile) {
  // Sort by directory then filename
  fileData.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  
  // Generate index markdown
  let markdown = '# Documentation Index\n\n';
  markdown += 'This document provides an index of all documentation files in the project.\n\n';
  markdown += 'Generated on: ' + new Date().toISOString() + '\n\n';
  
  // Group by directory
  const directories = {};
  fileData.forEach(file => {
    const dir = path.dirname(file.relativePath);
    if (!directories[dir]) {
      directories[dir] = [];
    }
    directories[dir].push(file);
  });
  
  // Generate table of contents
  markdown += '## Table of Contents\n\n';
  
  Object.keys(directories).sort().forEach(dir => {
    const displayDir = dir === '.' ? 'Root' : dir;
    markdown += `- [${displayDir}](#${displayDir.toLowerCase().replace(/[^\w]+/g, '-')})\n`;
  });
  
  markdown += '\n';
  
  // Generate content for each directory
  Object.keys(directories).sort().forEach(dir => {
    const displayDir = dir === '.' ? 'Root' : dir;
    markdown += `## ${displayDir}\n\n`;
    
    markdown += '| Document | Last Modified | Size | Lines | Summary |\n';
    markdown += '|----------|---------------|------|-------|--------|\n';
    
    directories[dir].forEach(file => {
      const _fileName = path.basename(file.relativePath);
      const relativePath = `./${file.relativePath.replace(/\\/g, '/')}`;
      
      markdown += `| [${file.title}](${relativePath}) | ${formatDate(file.modified)} | ${formatBytes(file.size)} | ${file.lineCount} | ${file.summary} |\n`;
    });
    
    markdown += '\n';
  });
  
  // Write to file
  await writeFile(outputFile, markdown);
  return outputFile;
}

/**
 * Analyze the documentation in a codebase
 * @param {Object} options - Analysis options
 * @returns {Object} - Analysis results
 */
export async function analyzeDocumentation(options) {
  logger.info('Starting documentation analysis...');

  try {
    // Get all markdown files
    const docsDir = path.join(process.cwd(), 'docs');
    const files = await _findMarkdownFiles(docsDir);
    
    const results = {
      totalFiles: files.length,
      filesWithIssues: 0,
      issues: [],
      metrics: {
        totalWords: 0,
        totalCodeBlocks: 0,
        totalImages: 0
      }
    };

    for (const file of files) {
      const content = await _readFile(file.path, 'utf8');
      const relativePath = path.relative(docsDir, file.path);
      
      // Analyze content
      const fileAnalysis = analyzeFile(content, relativePath);
      results.metrics.totalWords += fileAnalysis.wordCount;
      results.metrics.totalCodeBlocks += fileAnalysis.codeBlocks;
      results.metrics.totalImages += fileAnalysis.images;

      if (fileAnalysis.issues.length > 0) {
        results.filesWithIssues++;
        results.issues.push({
          file: relativePath,
          issues: fileAnalysis.issues
        });
      }
    }

    // Generate reports
    await generateReports(results);

    logger.success('Documentation analysis completed successfully!');
    return { success: true, ...results };
  } catch (error) {
    logger.error(`Documentation analysis failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function analyzeFile(content, filePath) {
  const analysis = {
    wordCount: content.split(/\s+/).length,
    codeBlocks: (content.match(/```/g) || []).length / 2,
    images: (content.match(/!\[.*?\]\((.*?)\)/g) || []).length,
    issues: []
  };

  // Check for common issues
  if (content.length < 100) {
    analysis.issues.push('File is too short (less than 100 characters)');
  }

  if (!content.includes('# ')) {
    analysis.issues.push('Missing main heading (H1)');
  }

  if (content.includes('TODO') || content.includes('FIXME')) {
    analysis.issues.push('Contains TODO or FIXME comments');
  }

  return analysis;
}

async function generateReports(results) {
  // Generate JSON report
  const jsonReport = JSON.stringify(results, null, 2);
  fs.writeFileSync('temp/docQuality-report.json', jsonReport);

  // Generate HTML report
  const htmlReport = generateHtmlReport(results);
  fs.writeFileSync('temp/docQuality-report.html', htmlReport);
}

function generateHtmlReport(results) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Documentation Quality Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .metric { margin: 10px 0; }
    .issue { color: #d32f2f; }
    .success { color: #4caf50; }
  </style>
</head>
<body>
  <h1>Documentation Quality Report</h1>
  
  <h2>Overview</h2>
  <div class="metric">Total Files: ${results.totalFiles}</div>
  <div class="metric">Files with Issues: ${results.filesWithIssues}</div>
  
  <h2>Metrics</h2>
  <div class="metric">Total Words: ${results.metrics.totalWords}</div>
  <div class="metric">Total Code Blocks: ${results.metrics.totalCodeBlocks}</div>
  <div class="metric">Total Images: ${results.metrics.totalImages}</div>
  
  <h2>Issues</h2>
  ${results.issues.map(issue => `
    <div class="issue">
      <h3>${issue.file}</h3>
      <ul>
        ${issue.issues.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </div>
  `).join('')}
</body>
</html>
  `;
}

function getAllMarkdownFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main function to analyze documentation quality
 */
async function _main() {
  try {
    const args = parseArguments();
    
    if (args.help) {
      showHelp();
      return;
    }
    
    logger.info('Starting documentation quality analysis...');
    
    // Set up default output paths
    const jsonReportPath = args.jsonOutput || getReportPath('docQuality');
    const htmlReportPath = args.htmlOutput || getHtmlReportPath('docQuality');
    
    // Run analysis
    const results = await analyzeDocumentation({
      rootDir: args.root || '.',
      includePatterns: args.include ? args.include.split(',') : _DEFAULT_INCLUDE_PATTERNS,
      excludePatterns: args.exclude ? args.exclude.split(',') : _DEFAULT_EXCLUDE_PATTERNS,
      minCoverage: args.minCoverage || DEFAULT_MIN_COVERAGE,
      checkFunctionDocs: !args.skipFunctionDocs,
      checkComponentDocs: !args.skipComponentDocs,
      checkTsDoc: !args.skipTsDoc,
      checkJsDoc: !args.skipJsDoc,
      verbose: args.verbose
    });
    
    // Always save JSON results for the consolidated dashboard
    createJsonReport(results, jsonReportPath);
    logger.info(`Documentation quality results saved to ${jsonReportPath}`);
    
    // Only generate HTML report if explicitly requested
    if (args.htmlOutput) {
      generateHtmlReport(results);
    }
    
    // Print summary to console
    printSummary(results, args.minCoverage || DEFAULT_MIN_COVERAGE);
    
    // Determine exit code based on results
    const success = results.metrics.totalWords > 0 && results.filesWithIssues === 0;
    
    if (!success) {
      logger.error(`Documentation analysis failed. Found ${results.filesWithIssues} issues`);
      return false;
    }
    
    logger.success('Documentation quality analysis completed successfully');
    return true;
  } catch (error) {
    logger.error(`Error in documentation quality analysis: ${error.message}`);
    return false;
  }
}

/**
 * Parse command-line arguments
 */
function parseArguments() {
  const options = {
    'root': { type: 'string', default: 'src' },
    'include': { type: 'string' },
    'exclude': { type: 'string' },
    'min-coverage': { type: 'number', default: 80 },
    'skip-function-docs': { type: 'boolean', default: false },
    'skip-component-docs': { type: 'boolean', default: false },
    'skip-ts-doc': { type: 'boolean', default: false },
    'skip-js-doc': { type: 'boolean', default: false },
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
  
  logger.info(`
${colors.cyan}${colors.bold}Documentation Quality Checker${colors.reset}

This tool checks the quality of project documentation.

${colors.bold}Usage:${colors.reset}
  node scripts/checks/doc-quality.js [options]

${colors.bold}Options:${colors.reset}
  --docs-dir <path>         Path to documentation directory (default: docs)
  --output <path>           Path for HTML report (default: doc-quality-report.html)
  --json-output <path>      Path for JSON report
  --required-docs <list>    Comma-separated list of required doc files
  --min-coverage <percent>  Minimum documentation coverage percentage (default: 80)
  --skip-function-docs      Skip function documentation checking
  --skip-component-docs     Skip component documentation checking
  --skip-ts-doc             Skip TypeScript documentation checking
  --skip-js-doc             Skip JSDoc documentation checking
  --verbose                 Enable verbose logging
  --help                    Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Run basic check${colors.reset}
  node scripts/checks/doc-quality.js

  ${colors.blue}# Custom docs directory and output${colors.reset}
  node scripts/checks/doc-quality.js --docs-dir documentation --output docs-report.html

  ${colors.blue}# Set custom coverage threshold${colors.reset}
  node scripts/checks/doc-quality.js --min-coverage 90
  `);
}

/**
 * Print a summary of the documentation analysis to the console
 * @param {Object} results - The analysis results
 * @param {number} minCoverage - The minimum acceptable coverage percentage
 */
function printSummary(results, minCoverage) {
  logger.info('\nDocumentation quality summary:');
  logger.info(`Files: ${results.totalFiles}`);
  logger.info(`Files with issues: ${results.filesWithIssues}`);
  logger.info(`Total words: ${results.metrics.totalWords}`);
  logger.info(`Total code blocks: ${results.metrics.totalCodeBlocks}`);
  logger.info(`Total images: ${results.metrics.totalImages}`);
  
  if (results.filesWithIssues === 0) {
    logger.success(`Documentation analysis completed successfully!`);
  } else {
    logger.warn(`Documentation analysis completed with ${results.filesWithIssues} issues`);
    logger.info(`Found ${results.issues.length} documentation issues to fix`);
  }
}

// Run analysis if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main();
} 