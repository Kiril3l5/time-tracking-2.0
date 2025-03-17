// Cross-platform deployment script runner
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the command line arguments
const args = process.argv.slice(2);

// Check if commit message is provided
if (args.length === 0) {
  console.error('Error: Commit message is required');
  console.error('Usage: pnpm app:deploy "Your commit message"');
  process.exit(1);
}

// Extract the commit message and escape quotes for safety
const commitMessage = args[0].replace(/"/g, '\\"');

console.log('Detecting platform for deployment...');

try {
  // Check if we're on Windows or Unix
  const isWindows = os.platform() === 'win32';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, '..');

  if (isWindows) {
    console.log('Windows platform detected, running PowerShell deployment script...');
    const deployScript = path.join(rootDir, 'deploy.ps1');
    
    execSync(`powershell -ExecutionPolicy Bypass -File "${deployScript}" -CommitMessage "${commitMessage}"`, {
      stdio: 'inherit'
    });
  } else {
    console.log('Unix platform detected, running Bash deployment script...');
    const deployScript = path.join(rootDir, 'deploy.sh');
    
    execSync(`bash "${deployScript}" "${commitMessage}"`, {
      stdio: 'inherit'
    });
  }

  console.log('Deployment completed successfully!');
} catch (error) {
  console.error('Error during deployment:', error.message);
  process.exit(1);
}
