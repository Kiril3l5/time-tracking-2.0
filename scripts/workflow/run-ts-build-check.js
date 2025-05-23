#!/usr/bin/env node

/**
 * Simple script to run the TypeScript build check
 */

import { runTypeScriptBuildCheck } from './advanced-checker.js';
import { logger } from '../core/logger.js';
import process from 'node:process';
import { execSync } from 'child_process';
import path from 'path';

async function main() {
  logger.info('Running TypeScript build check...');
  
  // First try to execute TypeScript directly on the packages
  try {
    // Test packages - will help us to verify that there are errors
    const packageFolders = ['common', 'admin', 'hours'];
    for (const pkg of packageFolders) {
      const packageDir = path.join(process.cwd(), 'packages', pkg);
      
      logger.info(`Testing direct TypeScript execution for ${pkg}...`);
      try {
        const output = execSync('npx tsc', { 
          cwd: packageDir, 
          encoding: 'utf8', 
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        });
        
        logger.info(`TypeScript check for ${pkg} - no errors found`);
      } catch (error) {
        logger.info(`TypeScript check for ${pkg} - errors found`);
        if (error.stdout) {
          logger.info('Stdout error output:');
          logger.info(error.stdout);
        }
        if (error.stderr) {
          logger.info('Stderr error output:');
          logger.info(error.stderr);
        }
      }
    }
  } catch (error) {
    logger.error('Error testing packages directly:', error.message);
  }
  
  try {
    const result = await runTypeScriptBuildCheck({
      // Test with real options that would come from workflow
      recordWarning: (message, phase, step, severity, context) => {
        logger.info(`RECORD WARNING: ${message} (${severity || 'warning'}) - ${context || 'no context'}`);
      },
      recordStep: (name, phase, success, duration, error) => {
        logger.info(`RECORD STEP: ${name} - ${success ? 'SUCCESS' : 'FAILURE'} - ${duration}ms`);
        if (error) logger.error(`STEP ERROR: ${error}`);
      },
      phase: 'Test',
      verbose: true,
      silentMode: false
    });
    
    logger.info('Build check completed:');
    logger.info(`Success: ${result.success}`);
    logger.info(`Error: ${result.error || 'None'}`);
    logger.info(`Duration: ${result.duration}ms`);
    
    if (result.errors && result.errors.length > 0) {
      logger.info(`Found ${result.errors.length} errors in ${result.fileCount || 'unknown'} files`);
      
      // Display file summary if available
      if (result.filesSummary) {
        logger.info('Files with errors:');
        result.filesSummary.forEach(summary => logger.info(`- ${summary}`));
      }
      
      logger.info('First 3 errors:');
      result.errors.slice(0, 3).forEach((error, index) => {
        logger.info(`${index + 1}. ${error.file}:${error.line}:${error.column} - ${error.message}`);
      });
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    logger.error(`Failed to run build check: ${error.message}`);
    if (error.stack) logger.debug(error.stack);
    process.exit(1);
  }
}

main(); 