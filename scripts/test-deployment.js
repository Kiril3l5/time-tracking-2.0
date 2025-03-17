/**
 * Script to test the deployment process in a controlled manner
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('Starting deployment test process...');

try {
  // Step 1: Fix TypeScript errors
  console.log('\n[Step 1] Fixing TypeScript errors...');
  execSync('node scripts/fix-typescript.js', { stdio: 'inherit' });
  
  // Step 2: Create empty build directories
  console.log('\n[Step 2] Creating empty build directories...');
  execSync('node scripts/create-empty-builds.js', { stdio: 'inherit' });
  
  // Step 3: Test deployment to a testing channel
  console.log('\n[Step 3] Deploying to testing channel...');
  execSync('firebase hosting:channel:deploy ci-test-channel --expires 1d', { stdio: 'inherit' });
  
  console.log('\nSuccess! The deployment test process completed successfully.');
  console.log('Next steps to fix the actual build:');
  console.log('1. Install missing dependencies');
  console.log('2. Fix TypeScript errors in the code');
  console.log('3. Fix test failures');
  console.log('4. Make sure all packages can build correctly');
  
} catch (error) {
  console.error('\nError occurred during the deployment test process:');
  console.error(error.message);
  process.exit(1);
} 