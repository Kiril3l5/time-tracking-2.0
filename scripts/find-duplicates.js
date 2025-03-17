#!/usr/bin/env node

/**
 * Documentation Duplication Detector
 * 
 * This script helps identify potential duplicate documentation by:
 * 1. Finding Markdown files with similar titles
 * 2. Finding Markdown files with similar content
 * 
 * Usage: node scripts/find-duplicates.js
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// Configuration
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const SIMILARITY_THRESHOLD = 0.6; // 60% similarity to be considered potential duplicate
const TITLE_SIMILARITY_THRESHOLD = 0.7; // 70% title similarity to be considered potential duplicate
const MIN_CONTENT_LENGTH = 500; // Ignore very small files

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Extract words from a string, excluding common words
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
 * Get title from Markdown content (first H1)
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : '';
}

/**
 * Find all Markdown files recursively
 */
async function findMarkdownFiles(dir, fileList = []) {
  const files = await readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);
    
    if (fileStat.isDirectory()) {
      await findMarkdownFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Analyze files for potential duplication
 */
async function analyzeDuplication() {
  // Get all markdown files
  const files = await findMarkdownFiles(DOCS_DIR);
  console.log(`Found ${files.length} Markdown files to analyze`);
  
  // Read file contents
  const fileData = await Promise.all(
    files.map(async (filePath) => {
      const content = await readFile(filePath, 'utf8');
      return {
        path: filePath,
        content,
        title: extractTitle(content),
        words: extractWords(content)
      };
    })
  );
  
  // Find potential duplicates by title
  console.log('\n=== Potential Duplicates by Title ===');
  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      const file1 = fileData[i];
      const file2 = fileData[j];
      
      // Skip files with no title
      if (!file1.title || !file2.title) continue;
      
      const titleWords1 = extractWords(file1.title);
      const titleWords2 = extractWords(file2.title);
      
      const similarity = jaccardSimilarity(titleWords1, titleWords2);
      
      if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
        console.log(`\nPossible title match (${Math.round(similarity * 100)}% similar):`);
        console.log(`  - ${file1.path} ("${file1.title}")`);
        console.log(`  - ${file2.path} ("${file2.title}")`);
      }
    }
  }
  
  // Find potential duplicates by content
  console.log('\n=== Potential Duplicates by Content ===');
  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      const file1 = fileData[i];
      const file2 = fileData[j];
      
      // Skip files that are too small
      if (file1.content.length < MIN_CONTENT_LENGTH || file2.content.length < MIN_CONTENT_LENGTH) continue;
      
      const similarity = jaccardSimilarity(file1.words, file2.words);
      
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(`\nPossible content match (${Math.round(similarity * 100)}% similar):`);
        console.log(`  - ${file1.path} (${file1.content.length} chars)`);
        console.log(`  - ${file2.path} (${file2.content.length} chars)`);
      }
    }
  }
}

// Run the analysis
analyzeDuplication().catch(console.error); 