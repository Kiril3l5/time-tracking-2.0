#!/usr/bin/env node

/**
 * Script to fix dependencies across all packages
 */

import { execSync } from 'child_process';
import path from 'path';

console.log('Starting dependency fixes...');

try {
  // Step 1: Common package dependencies
  console.log('\n[Step 1] Installing dependencies for common package...');
  execSync('cd packages/common && pnpm add -D @tanstack/react-query@^4.29.5 @storybook/react@^7.0.27 @testing-library/jest-dom@^6.1.4', { 
    stdio: 'inherit' 
  });
  
  // Step 2: Admin package dependencies
  console.log('\n[Step 2] Installing dependencies for admin package...');
  execSync('cd packages/admin && pnpm add -D @tanstack/react-query@^4.29.5', { 
    stdio: 'inherit' 
  });
  
  // Step 3: Hours package dependencies
  console.log('\n[Step 3] Installing dependencies for hours package...');
  execSync('cd packages/hours && pnpm add -D @tanstack/react-query@^4.29.5', { 
    stdio: 'inherit' 
  });
  
  // Step 4: Root package dependencies
  console.log('\n[Step 4] Aligning test dependencies in root package...');
  execSync('pnpm add -D vitest@^1.6.1 @vitest/ui@^1.6.1 @vitest/coverage-v8@^1.6.1', { 
    stdio: 'inherit' 
  });
  
  console.log('\nSuccess! Dependencies have been updated across all packages.');
  console.log('Next steps:');
  console.log('1. Run pnpm install to ensure workspaces are properly linked');
  console.log('2. Fix TypeScript errors');
  console.log('3. Update test configuration');
  
} catch (error) {
  console.error('\nError occurred while fixing dependencies:');
  console.error(error.message);
  process.exit(1);
} 