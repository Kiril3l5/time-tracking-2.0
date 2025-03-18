#!/usr/bin/env node

/**
 * CI Cleanup Fix Script
 * 
 * This script specifically ensures that the cleanup.js script is using
 * ES module syntax rather than CommonJS.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cleanupPath = path.join(__dirname, 'cleanup.js');

// Check if the cleanup.js file exists
if (!fs.existsSync(cleanupPath)) {
  console.error(`Error: cleanup.js not found at ${cleanupPath}`);
  process.exit(1);
}

// Read the cleanup.js file
const content = fs.readFileSync(cleanupPath, 'utf8');

// Check if it's using CommonJS require syntax
if (content.includes("require('child_process')") || 
    content.includes('require("child_process")')) {
  console.log('Fixing cleanup.js to use ES module syntax...');
  
  // Replace CommonJS require with ES module import
  let updatedContent = content
    .replace(/const\s*{\s*execSync\s*}\s*=\s*require\s*\(\s*['"]child_process['"]\s*\)\s*;/g, 
             'import { execSync } from \'child_process\';')
    .replace(/const\s*os\s*=\s*require\s*\(\s*['"]os['"]\s*\)\s*;/g, 
             'import os from \'os\';')
    .replace(/const\s*path\s*=\s*require\s*\(\s*['"]path['"]\s*\)\s*;/g, 
             'import path from \'path\';')
    .replace(/const\s*fs\s*=\s*require\s*\(\s*['"]fs['"]\s*\)\s*;/g, 
             'import fs from \'fs\';');
  
  // Add fileURLToPath if not already there
  if (!updatedContent.includes('fileURLToPath')) {
    updatedContent = updatedContent.replace(
      'import fs from \'fs\';',
      'import fs from \'fs\';\nimport { fileURLToPath } from \'url\';'
    );
    
    // Add __dirname and __filename handling
    if (updatedContent.includes('__dirname') && !updatedContent.includes('fileURLToPath(import.meta.url)')) {
      const dirnameCode = `
// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;
      
      // Find a good place to insert this code
      // Look for the first empty line after imports
      const lines = updatedContent.split('\n');
      let insertIndex = 0;
      
      // Find last import statement
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
          insertIndex = i + 1;
        }
      }
      
      // Skip any blank lines
      while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
        insertIndex++;
      }
      
      // Insert the __dirname code
      lines.splice(insertIndex, 0, dirnameCode);
      updatedContent = lines.join('\n');
    }
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(cleanupPath, updatedContent, 'utf8');
  console.log('cleanup.js has been fixed to use ES module syntax.');
} else {
  console.log('cleanup.js is already using ES module syntax.');
} 