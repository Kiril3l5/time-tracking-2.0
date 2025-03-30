/**
 * Documentation Quality Checker Module
 * 
 * This module verifies documentation quality by:
 * 1. Finding duplicate content across documentation files
 * 2. Generating an updated index of all documentation
 * 3. Validating that key features have proper documentation
 */

import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

// Convert callbacks to promises
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

// Get the directory and filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const DEFAULT_DOCS_DIR = 'docs';
const DEFAULT_REQUIRED_DOCS = ['setup', 'deployment', 'architecture', 'api', 'configuration'];
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_MIN_COVERAGE = 80;
const DEFAULT_IGNORE_DIRS = ['node_modules', '.git', '.github', 'dist', 'build'];

/**
 * Run documentation quality checks
 * @param {string} pkg - Package name
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check results
 */
export async function runDocQualityChecks(pkg, options = {}) {
  const startTime = Date.now();
  const results = {
    success: true,
    issues: [],
    warnings: [],
    duration: 0,
    stats: {
      totalFiles: 0,
      duplicateContent: 0,
      missingDocs: 0,
      coverage: 0
    }
  };

  try {
    logger.info(`Running documentation quality checks for package: ${pkg}`);

    // Find all markdown files
    const fileList = await findMarkdownFiles(pkg, options);
    results.stats.totalFiles = fileList.length;

    // Check for missing required documentation
    const missingDocs = findMissingDocs(fileList, DEFAULT_REQUIRED_DOCS);
    if (missingDocs.length > 0) {
      results.warnings.push(`Missing required documentation: ${missingDocs.join(', ')}`);
      results.stats.missingDocs = missingDocs.length;
    }

    // Analyze for duplicate content
    const duplicateResults = await analyzeDuplication(fileList, options);
    if (duplicateResults.contentDuplicates.length > 0) {
      results.warnings.push(`Found ${duplicateResults.contentDuplicates.length} potential content duplicates`);
      results.stats.duplicateContent = duplicateResults.contentDuplicates.length;
    }

    // Generate documentation index
    await generateIndex(fileList, pkg);

    // Calculate coverage
    results.stats.coverage = calculateCoverage(fileList, DEFAULT_REQUIRED_DOCS);

    // Update success status
    results.success = results.issues.length === 0 && results.stats.coverage >= DEFAULT_MIN_COVERAGE;
    results.duration = Date.now() - startTime;

    // Log summary
    if (options.verbose) {
      logger.info(`
Documentation Quality Summary:
- Total Files: ${results.stats.totalFiles}
- Missing Required Docs: ${results.stats.missingDocs}
- Duplicate Content: ${results.stats.duplicateContent}
- Coverage: ${results.stats.coverage}%
      `);
    }

    return results;

  } catch (error) {
    logger.error(`Documentation quality checks failed for package ${pkg}:`, error);
    return {
      success: false,
      issues: [error.message],
      warnings: [],
      duration: Date.now() - startTime,
      stats: {
        totalFiles: 0,
        duplicateContent: 0,
        missingDocs: 0,
        coverage: 0
      }
    };
  }
}

/**
 * Find all Markdown files recursively
 * @param {string} pkg - Package name
 * @param {Object} options - Search options
 * @returns {Promise<Array>} List of found files with metadata
 */
async function findMarkdownFiles(pkg, options) {
  const docsDir = path.join(dirname(__dirname), '..', pkg, DEFAULT_DOCS_DIR);
  const fileList = [];

  try {
    const files = await readdir(docsDir);
    
    for (const file of files) {
      if (DEFAULT_IGNORE_DIRS.includes(file)) continue;
      
      const filePath = path.join(docsDir, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isDirectory()) {
        const subFiles = await findMarkdownFiles(file, options);
        fileList.push(...subFiles);
      } else if (file.endsWith('.md')) {
        const content = await readFile(filePath, 'utf8');
        fileList.push({
          path: filePath,
          name: file,
          content,
          size: fileStat.size,
          modified: fileStat.mtime
        });
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
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
function findMissingDocs(fileList, requiredDocs) {
  const fileNames = fileList.map(file => file.name);
  return requiredDocs.filter(doc => !fileNames.includes(doc));
}

/**
 * Analyze documents for duplication
 * @param {Array} fileData - File data with content and metadata
 * @param {Object} options - Analysis options
 * @returns {Object} Results of duplication analysis
 */
async function analyzeDuplication(fileData, options = {}) {
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
      
      const similarity = calculateSimilarity(file1.content, file2.content);
      
      if (similarity >= similarityThreshold) {
        results.contentDuplicates.push({
          file1: file1.path,
          file2: file2.path,
          similarity: Math.round(similarity * 100)
        });
      }
    }
  }
  
  return results;
}

/**
 * Calculate similarity between two texts
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(text1, text2) {
  const words1 = extractWords(text1);
  const words2 = extractWords(text2);
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Extract words from text for comparison
 * @param {string} text - The text to extract words from
 * @returns {Set} Set of unique words
 */
function extractWords(text) {
  const commonWords = new Set(['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'is', 'are']);
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
  );
}

/**
 * Generate documentation index
 * @param {Array} fileData - File data with content and metadata
 * @param {string} pkg - Package name
 * @returns {Promise<void>}
 */
async function generateIndex(fileData, pkg) {
  const docsDir = path.join(dirname(__dirname), '..', pkg, DEFAULT_DOCS_DIR);
  const indexPath = path.join(docsDir, 'index.md');
  
  // Sort by filename
  fileData.sort((a, b) => a.name.localeCompare(b.name));
  
  // Generate index markdown
  let markdown = '# Documentation Index\n\n';
  markdown += 'This document provides an index of all documentation files in the project.\n\n';
  markdown += 'Generated on: ' + new Date().toISOString() + '\n\n';
  
  // Generate table of contents
  markdown += '## Table of Contents\n\n';
  
  fileData.forEach(file => {
    const title = extractTitle(file.content);
    markdown += `- [${title}](${file.name})\n`;
  });
  
  await writeFile(indexPath, markdown);
}

/**
 * Extract title from Markdown content (first H1)
 * @param {string} content - File content
 * @returns {string} Title or default text
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : '(No title)';
}

/**
 * Calculate documentation coverage
 * @param {Array} fileList - List of files found
 * @param {Array} requiredDocs - List of required documentation filenames
 * @returns {number} Coverage percentage
 */
function calculateCoverage(fileList, requiredDocs) {
  const fileNames = fileList.map(file => file.name);
  const foundDocs = requiredDocs.filter(doc => fileNames.includes(doc));
  return Math.round((foundDocs.length / requiredDocs.length) * 100);
}

export default {
  runDocQualityChecks
}; 