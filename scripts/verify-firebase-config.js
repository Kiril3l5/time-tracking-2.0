#!/usr/bin/env node

/**
 * Firebase Configuration Verification Script
 * 
 * This script checks if the Firebase configuration is properly embedded in the built files.
 * It's useful for debugging "Missing Firebase configuration" errors in production.
 * 
 * Usage:
 *   node scripts/verify-firebase-config.js
 */

/* global console */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Package directories to check
const packages = ['hours', 'admin'];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Function to log with color
function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

// Check if dist directory exists for a package
function checkDistDirectory(packageName) {
  const distPath = path.join(rootDir, 'packages', packageName, 'dist');
  if (!fs.existsSync(distPath)) {
    log(`❌ ${packageName}: Dist directory not found at ${distPath}`, colors.red);
    return false;
  }
  log(`✓ ${packageName}: Dist directory found`, colors.green);
  return distPath;
}

// Find JS files in the assets directory
function findJsFiles(distPath) {
  const assetsPath = path.join(distPath, 'assets');
  if (!fs.existsSync(assetsPath)) {
    log(`❌ Assets directory not found at ${assetsPath}`, colors.red);
    return [];
  }
  
  const files = fs.readdirSync(assetsPath)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(assetsPath, file));
  
  log(`Found ${files.length} JavaScript files in assets directory`, colors.blue);
  return files;
}

// Check for Firebase configuration in a file
function checkFileForFirebaseConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const indicators = [
      { pattern: 'apiKey', name: 'Firebase API Key' },
      { pattern: 'authDomain', name: 'Firebase Auth Domain' },
      { pattern: 'projectId', name: 'Firebase Project ID' },
      { pattern: 'storageBucket', name: 'Firebase Storage Bucket' },
      { pattern: 'messagingSenderId', name: 'Firebase Messaging Sender ID' },
      { pattern: 'appId', name: 'Firebase App ID' }
    ];
    
    const results = [];
    let foundConfig = false;
    
    // Check for each indicator
    for (const { pattern, name } of indicators) {
      const found = content.includes(pattern);
      results.push({ name, found });
      if (found) foundConfig = true;
    }
    
    // Also check for firebase app initialization
    const hasFirebaseApp = content.includes('initializeApp') || content.includes('firebaseApp');
    if (hasFirebaseApp) foundConfig = true;
    results.push({ name: 'Firebase App Initialization', found: hasFirebaseApp });
    
    return { filePath, results, foundConfig };
  } catch (error) {
    log(`❌ Error reading file ${filePath}: ${error.message}`, colors.red);
    return { filePath, results: [], foundConfig: false, error: error.message };
  }
}

// Main verification function
async function verifyFirebaseConfig() {
  log(`\n${colors.bold}Firebase Configuration Verification${colors.reset}\n`, colors.cyan);
  log(`Checking built files for Firebase configuration...\n`);
  
  let foundConfigInAnyPackage = false;
  
  for (const packageName of packages) {
    log(`\n${colors.bold}Checking ${packageName} package:${colors.reset}`, colors.magenta);
    
    const distPath = checkDistDirectory(packageName);
    if (!distPath) continue;
    
    const jsFiles = findJsFiles(distPath);
    if (jsFiles.length === 0) continue;
    
    let foundConfigInPackage = false;
    
    for (const filePath of jsFiles) {
      const fileName = path.basename(filePath);
      log(`\nChecking file: ${fileName}`);
      
      const { results, foundConfig } = checkFileForFirebaseConfig(filePath);
      
      if (foundConfig) {
        foundConfigInPackage = true;
        foundConfigInAnyPackage = true;
        log(`✓ Found Firebase configuration in ${fileName}`, colors.green);
        
        // Print details
        for (const { name, found } of results) {
          if (found) {
            log(`  ✓ ${name}: Found`, colors.green);
          } else {
            log(`  ❌ ${name}: Not found`, colors.yellow);
          }
        }
      } else {
        log(`❌ No Firebase configuration found in ${fileName}`, colors.red);
      }
    }
    
    if (foundConfigInPackage) {
      log(`\n✓ Firebase configuration found in ${packageName} package`, colors.green + colors.bold);
    } else {
      log(`\n❌ Firebase configuration not found in any files of ${packageName} package`, colors.red + colors.bold);
    }
  }
  
  // Final verdict
  log(`\n${colors.bold}Verification Results:${colors.reset}`, colors.cyan);
  if (foundConfigInAnyPackage) {
    log(`✓ Firebase configuration appears to be properly embedded in at least one package.`, colors.green + colors.bold);
    log(`This means the "Missing Firebase configuration" error is likely NOT due to missing build-time variables.`);
    log(`If you're still seeing the error, check your runtime deployment environment.`);
  } else {
    log(`❌ Firebase configuration was NOT found in any package!`, colors.red + colors.bold);
    log(`This is likely the cause of the "Missing Firebase configuration" error.`);
    log(`Make sure environment variables are properly set during the build process.`);
  }
}

// Run verification
verifyFirebaseConfig().catch(error => {
  log(`❌ Script error: ${error.message}`, colors.red);
}); 