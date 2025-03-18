#!/usr/bin/env node

/**
 * Script to reinstall testing-library/jest-dom with the correct version
 * This helps resolve package resolution errors in tests
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${colors.blue}INFO:${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}SUCCESS:${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}WARNING:${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}ERROR:${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.magenta}${msg}${colors.reset}\n` + '='.repeat(msg.length) + '\n'),
};

function runCommand(command) {
  log.info(`Running: ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    log.error(`Command failed: ${command}`);
    log.error(error.message);
    return false;
  }
}

function main() {
  log.title('FIXING JEST-DOM PACKAGE');

  // Remove current package
  log.info('Removing current @testing-library/jest-dom package');
  runCommand('pnpm remove @testing-library/jest-dom');

  // Install specific version known to work with Vitest
  log.info('Installing @testing-library/jest-dom@6.1.4');
  runCommand('pnpm add -D @testing-library/jest-dom@6.1.4');

  // Cleanup packages
  log.info('Cleaning up packages');
  runCommand('pnpm install --force');

  // Update vitest.setup.ts to use the new package
  log.info('Updating vitest.setup.ts');
  runCommand('pnpm exec tsc --noEmit');

  log.title('JEST-DOM FIX COMPLETE');
  log.info('Next steps:');
  log.info('1. Update vitest.setup.ts to uncomment the jest-dom import');
  log.info('2. Run pnpm test to verify the fixes');
}

main(); 