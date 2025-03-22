#!/usr/bin/env node

/**
 * TypeScript Configuration for Tests Module
 * 
 * Manages TypeScript configuration for test environments, providing
 * utilities to create, validate, and maintain TypeScript configs specific to testing.
 * 
 * Features:
 * - Generate TypeScript configuration for tests
 * - Validate TypeScript setups for test compatibility
 * - Extend base configurations with test-specific settings
 * - Support for different testing frameworks (Vitest, Jest)
 * 
 * @module test-types/typescript-config
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

// Base TypeScript configuration for tests
const BASE_TEST_TSCONFIG = {
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals", "node"],
    "allowJs": true,
    "checkJs": false,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "node"
  },
  "include": [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "setup/**/*.ts",
    "setup/**/*.js",
    "types/**/*.ts",
    "types/**/*.d.ts"
  ],
  "exclude": [
    "node_modules"
  ]
};

/**
 * Create a TypeScript configuration for tests
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.outputPath - Path to create the tsconfig file
 * @param {Object} [options.baseConfig=null] - Base configuration to extend (null uses default)
 * @param {string} [options.testFramework='vitest'] - Testing framework ('vitest' or 'jest')
 * @param {boolean} [options.includeReact=true] - Whether to include React configuration
 * @param {boolean} [options.includeDOM=true] - Whether to include DOM types
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<string>} - Path to the created file
 */
export async function createTestTSConfig(options) {
  const {
    outputPath = 'src/tests/tsconfig.json',
    baseConfig = null,
    testFramework = 'vitest',
    includeReact = true,
    includeDOM = true,
    verbose = false
  } = options;
  
  logger.info(`Creating TypeScript config for tests at ${outputPath}...`);
  
  // Start with the base configuration
  const config = JSON.parse(JSON.stringify(BASE_TEST_TSCONFIG));
  
  // Modify based on test framework
  if (testFramework === 'vitest') {
    config.compilerOptions.types = ["vitest/globals", "node"];
  } else if (testFramework === 'jest') {
    config.compilerOptions.types = ["jest", "node"];
    
    // Jest typically uses CommonJS
    config.compilerOptions.module = "CommonJS";
  }
  
  // Add DOM types if requested
  if (includeDOM) {
    config.compilerOptions.types.push("@testing-library/jest-dom");
    config.compilerOptions.lib = config.compilerOptions.lib || [];
    if (!config.compilerOptions.lib.includes("dom")) {
      config.compilerOptions.lib.push("dom");
      config.compilerOptions.lib.push("dom.iterable");
    }
  }
  
  // Configure for React if requested
  if (includeReact) {
    config.compilerOptions.jsx = "react-jsx";
    
    // Ensure React is in the types
    if (!config.compilerOptions.types.includes("@types/react")) {
      config.compilerOptions.types.push("@types/react");
    }
    
    // Add React test files to includes
    if (!config.include.includes("**/*.test.tsx")) {
      config.include.push("**/*.test.tsx");
      config.include.push("**/*.spec.tsx");
    }
  } else {
    // If not using React, don't need jsx setting
    delete config.compilerOptions.jsx;
  }
  
  // Apply any custom base config
  if (baseConfig) {
    // Deep merge the configurations
    mergeConfigs(config, baseConfig);
  }
  
  // Format the JSON with proper indentation
  const jsonContent = JSON.stringify(config, null, 2);
  
  // Ensure the directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the file
  await fs.writeFile(outputPath, jsonContent, 'utf-8');
  
  logger.success(`TypeScript config for tests created at: ${outputPath}`);
  
  if (verbose) {
    logger.info(`Test framework: ${testFramework}`);
    logger.info(`Include React: ${includeReact}`);
    logger.info(`Include DOM: ${includeDOM}`);
    logger.info(`File size: ${jsonContent.length} bytes`);
  }
  
  return outputPath;
}

/**
 * Helper function to deep merge two objects
 * 
 * @param {Object} target - Target object to merge into
 * @param {Object} source - Source object to merge from
 * @returns {Object} - The merged target object
 */
function mergeConfigs(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      mergeConfigs(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  
  return target;
}

/**
 * Validate TypeScript configuration for tests
 * 
 * @param {Object} options - Validation options
 * @param {string} options.configPath - Path to the TypeScript config
 * @param {boolean} [options.fix=false] - Whether to fix common issues
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<Object>} - Validation results
 */
export async function validateTestTSConfig(options) {
  const {
    configPath = 'src/tests/tsconfig.json',
    fix = false,
    verbose = false
  } = options;
  
  logger.info(`Validating TypeScript config for tests at ${configPath}...`);
  
  const results = {
    valid: false,
    issues: [],
    fixedIssues: [],
    config: null
  };
  
  try {
    // Check if config file exists
    try {
      await fs.access(configPath);
    } catch (error) {
      logger.error(`TypeScript config not found at: ${configPath}`);
      results.issues.push(`Config file not found: ${configPath}`);
      return results;
    }
    
    // Read the config file
    const configContent = await fs.readFile(configPath, 'utf-8');
    let config;
    
    try {
      config = JSON.parse(configContent);
      results.config = config;
    } catch (error) {
      logger.error(`Invalid JSON in TypeScript config: ${error.message}`);
      results.issues.push(`Invalid JSON: ${error.message}`);
      return results;
    }
    
    // Validate basic structure
    if (!config.compilerOptions) {
      results.issues.push('Missing compilerOptions');
    } else {
      // Check for essential compiler options
      const requiredOptions = ['types', 'module', 'target'];
      for (const option of requiredOptions) {
        if (!config.compilerOptions[option]) {
          results.issues.push(`Missing compilerOptions.${option}`);
          
          if (fix) {
            // Add default values
            if (option === 'types') {
              config.compilerOptions.types = ["vitest/globals", "node"];
              results.fixedIssues.push(`Added default types: ["vitest/globals", "node"]`);
            } else if (option === 'module') {
              config.compilerOptions.module = "ESNext";
              results.fixedIssues.push(`Added default module: "ESNext"`);
            } else if (option === 'target') {
              config.compilerOptions.target = "ESNext";
              results.fixedIssues.push(`Added default target: "ESNext"`);
            }
          }
        }
      }
      
      // Check if noEmit is true (recommended for tests)
      if (config.compilerOptions.noEmit !== true) {
        results.issues.push('compilerOptions.noEmit should be true for test configs');
        
        if (fix) {
          config.compilerOptions.noEmit = true;
          results.fixedIssues.push('Set noEmit to true');
        }
      }
    }
    
    // Check for include patterns
    if (!config.include || !Array.isArray(config.include) || config.include.length === 0) {
      results.issues.push('Missing or empty include array');
      
      if (fix) {
        config.include = [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.spec.ts",
          "**/*.spec.tsx"
        ];
        results.fixedIssues.push('Added default include patterns for test files');
      }
    } else {
      // Check if test files are included
      const hasTestFiles = config.include.some(pattern => 
        pattern.includes('test.ts') || pattern.includes('spec.ts'));
      
      if (!hasTestFiles) {
        results.issues.push('Include patterns should contain test.ts or spec.ts files');
        
        if (fix) {
          config.include.push("**/*.test.ts", "**/*.spec.ts");
          results.fixedIssues.push('Added test.ts and spec.ts patterns to include');
        }
      }
    }
    
    // Save fixed config if needed
    if (fix && results.fixedIssues.length > 0) {
      const updatedContent = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, updatedContent, 'utf-8');
      logger.info(`Fixed ${results.fixedIssues.length} issues in ${configPath}`);
      
      if (verbose) {
        results.fixedIssues.forEach(issue => {
          logger.info(`- Fixed: ${issue}`);
        });
      }
    }
    
    // Final validity check
    results.valid = results.issues.length === 0 || results.fixedIssues.length === results.issues.length;
    
    if (results.valid) {
      logger.success(`TypeScript config for tests is valid!`);
    } else {
      logger.warn(`TypeScript config has ${results.issues.length - results.fixedIssues.length} remaining issues`);
      
      if (verbose) {
        const remainingIssues = results.issues.filter(issue => 
          !results.fixedIssues.some(fixed => fixed.includes(issue.split(':')[0])));
        
        remainingIssues.forEach(issue => {
          logger.warn(`- Issue: ${issue}`);
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error(`Failed to validate TypeScript config: ${error.message}`);
    results.issues.push(`Error: ${error.message}`);
    return results;
  }
}

/**
 * Update references to types in source files
 * 
 * @param {Object} options - Options
 * @param {string} options.sourceDir - Directory containing source files
 * @param {string} options.typesPath - Path to the types directory
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to scan
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run without changes
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<Object>} - Results of the update
 */
export async function updateTypeReferences(options) {
  const {
    sourceDir = 'src',
    typesPath = 'src/tests/types',
    extensions = ['.ts', '.tsx'],
    dryRun = false,
    verbose = false
  } = options;
  
  logger.info(`Updating type references in ${sourceDir}...`);
  
  const results = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    updatedFiles: []
  };
  
  // Get all type definition files
  const typeFiles = [];
  try {
    const files = await fs.readdir(typesPath);
    for (const file of files) {
      if (file.endsWith('.d.ts')) {
        typeFiles.push(file);
      }
    }
    
    if (typeFiles.length === 0) {
      logger.warn(`No type definition files found in ${typesPath}`);
      return results;
    }
    
    if (verbose) {
      logger.info(`Found ${typeFiles.length} type definition files: ${typeFiles.join(', ')}`);
    }
  } catch (error) {
    logger.error(`Failed to read types directory: ${error.message}`);
    results.errors++;
    return results;
  }
  
  // Get relative path from source dir to types dir
  const relativeTypesPath = path.relative(sourceDir, typesPath).replace(/\\/g, '/');
  
  // Build the reference directive
  const referenceDirectives = typeFiles.map(file => 
    `/// <reference path="${relativeTypesPath}/${file}" />`
  );
  
  // Find and update source files
  async function processDirectory(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and dist directories
          if (entry.name !== 'node_modules' && entry.name !== 'dist') {
            await processDirectory(fullPath);
          }
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          // Process TypeScript file
          results.scanned++;
          
          try {
            // Read file content
            const content = await fs.readFile(fullPath, 'utf-8');
            
            // Check if it's a test file
            const isTest = entry.name.includes('.test.') || entry.name.includes('.spec.');
            
            if (!isTest) {
              // Skip non-test files
              results.skipped++;
              continue;
            }
            
            // Check for existing references
            const hasReferences = typeFiles.some(typeFile => 
              content.includes(`<reference path="${relativeTypesPath}/${typeFile}"`)
            );
            
            if (hasReferences) {
              // Already has references
              results.skipped++;
              continue;
            }
            
            // Add references at the top of the file
            const updatedContent = referenceDirectives.join('\n') + '\n\n' + content;
            
            if (!dryRun) {
              await fs.writeFile(fullPath, updatedContent, 'utf-8');
            }
            
            results.updated++;
            results.updatedFiles.push(fullPath);
            
            if (verbose) {
              logger.info(`Updated references in: ${fullPath}`);
            }
          } catch (error) {
            logger.error(`Error processing file ${fullPath}: ${error.message}`);
            results.errors++;
          }
        }
      }
    } catch (error) {
      logger.error(`Error reading directory ${dirPath}: ${error.message}`);
      results.errors++;
    }
  }
  
  // Start processing
  await processDirectory(sourceDir);
  
  // Log summary
  if (dryRun) {
    logger.info(`Dry run: would update ${results.updated} of ${results.scanned} files`);
  } else {
    logger.success(`Updated type references in ${results.updated} of ${results.scanned} files`);
  }
  
  logger.info(`Skipped: ${results.skipped}, Errors: ${results.errors}`);
  
  return results;
}

export default {
  createTestTSConfig,
  validateTestTSConfig,
  updateTypeReferences
}; 