#!/usr/bin/env node

/**
 * Fix .gitignore File
 * 
 * This script ensures the .gitignore file contains all necessary patterns
 * to ignore temporary files from the preview deployment process.
 * 
 * Usage:
 *   node scripts/fix-gitignore.js
 */

/* global process */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './core/logger.js';

// Get the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Patterns that should be in .gitignore
const requiredPatterns = [
  '.env.build',
  'preview-dashboard.html',
  'temp/',
  'temp/**/*'
];

// Files that might cause issues if committed
const tempFilesToRemove = [
  '.env.build',
  'preview-dashboard.html',
  'temp/.bundle-size-history.json',
  'temp/.vulnerability-scan-history.json',
  'temp/bundle-report.html',
  'temp/bundle-report.json',
  'temp/deadCode-report.html',
  'temp/dead-code-report.json',
  'temp/vulnerability-report.html',
  'temp/vulnerability-report.json',
  'temp/docQuality-report.html'
];

// Category for the patterns
const categoryHeader = '\n# Preview deployment files';

/**
 * Main function
 */
async function main() {
  logger.sectionHeader('FIXING GITIGNORE FILE');
  
  const gitignorePath = path.join(rootDir, '.gitignore');
  
  // Check if .gitignore exists
  if (!fs.existsSync(gitignorePath)) {
    logger.error('.gitignore file not found. Creating a new one.');
    fs.writeFileSync(gitignorePath, '# Generated .gitignore file\n');
  }
  
  // Read the current .gitignore content
  let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  
  // Keep track of patterns we need to add
  const missingPatterns = [];
  
  // Check which patterns are missing
  for (const pattern of requiredPatterns) {
    if (!gitignoreContent.includes(pattern)) {
      missingPatterns.push(pattern);
    }
  }
  
  // Add missing patterns if needed
  if (missingPatterns.length > 0) {
    // Check if the category header already exists
    if (!gitignoreContent.includes(categoryHeader)) {
      gitignoreContent += categoryHeader + '\n';
    }
    
    // Add each missing pattern
    for (const pattern of missingPatterns) {
      if (!gitignoreContent.includes(pattern)) {
        gitignoreContent += pattern + '\n';
      }
    }
    
    // Write back to the file
    fs.writeFileSync(gitignorePath, gitignoreContent);
    logger.success(`Added ${missingPatterns.length} missing patterns to .gitignore`);
  } else {
    logger.info('All required patterns are already in .gitignore');
  }
  
  // Clean up any previously committed temp files from Git index
  logger.info('Cleaning up temporary files from Git index...');
  
  for (const file of tempFilesToRemove) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const { execSync } = await import('child_process');
        execSync(`git rm --cached "${filePath}"`, { stdio: 'pipe' });
        logger.info(`Removed ${file} from Git index`);
      } catch (error) {
        // If the file isn't in the index, that's fine
        if (!error.message.includes('did not match any files')) {
          logger.warn(`Could not remove ${file} from Git index: ${error.message}`);
        }
      }
    }
  }
  
  logger.success('Gitignore file is now correctly configured');
}

// Run the main function
main().catch(error => {
  logger.error('Failed to fix .gitignore file:', error.message);
  process.exit(1);
}); 