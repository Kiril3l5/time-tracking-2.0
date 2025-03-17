#!/usr/bin/env node

/**
 * Documentation Index Generator
 * 
 * This script generates an index of all documentation in the project,
 * including metadata about file size, update date, and content summary.
 * 
 * Usage: node scripts/generate-doc-index.js
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

// Configuration
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'documentation-index.md');
const IGNORE_DIRS = ['node_modules', '.git'];

/**
 * Extract title from Markdown content (first H1)
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : '(No title)';
}

/**
 * Generate a brief summary from the markdown content
 */
function generateSummary(content) {
  // First, check for our standardized summary format
  const summaryMatch = content.match(/\*\*Summary:\*\*\s*(.*?)(?:\n\n|\n##)/s);
  if (summaryMatch && summaryMatch[1]) {
    const standardizedSummary = summaryMatch[1]
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();

    return standardizedSummary.length > 100 ? `${standardizedSummary.substring(0, 97)}...` : standardizedSummary;
  }
  
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
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Find all Markdown files recursively
 */
async function findMarkdownFiles(dir, fileList = [], baseDir = dir) {
  const files = await readdir(dir);
  
  for (const file of files) {
    if (IGNORE_DIRS.includes(file)) continue;
    
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);
    
    if (fileStat.isDirectory()) {
      await findMarkdownFiles(filePath, fileList, baseDir);
    } else if (file.endsWith('.md')) {
      const relativePath = path.relative(baseDir, filePath);
      fileList.push({
        path: filePath,
        relativePath,
        size: fileStat.size,
        modified: fileStat.mtime
      });
    }
  }
  
  return fileList;
}

/**
 * Generate documentation index
 */
async function generateIndex() {
  console.log('Generating documentation index...');
  
  // Get all markdown files
  const files = await findMarkdownFiles(DOCS_DIR);
  console.log(`Found ${files.length} Markdown files`);
  
  // Read file contents and extract metadata
  const fileData = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file.path, 'utf8');
      return {
        ...file,
        title: extractTitle(content),
        summary: generateSummary(content),
        lineCount: content.split('\n').length
      };
    })
  );
  
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
      const fileName = path.basename(file.relativePath);
      const relativePath = `./${file.relativePath.replace(/\\/g, '/')}`;
      
      markdown += `| [${file.title}](${relativePath}) | ${formatDate(file.modified)} | ${formatBytes(file.size)} | ${file.lineCount} | ${file.summary} |\n`;
    });
    
    markdown += '\n';
  });
  
  // Write to file
  await writeFile(OUTPUT_FILE, markdown);
  console.log(`Documentation index generated at ${OUTPUT_FILE}`);
}

// Run the generator
generateIndex().catch(console.error); 