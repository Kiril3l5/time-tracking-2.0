// Cross-platform cleanup script runner
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

console.log('Detecting platform for cleanup...');

try {
  // Check if we're on Windows or Unix
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    console.log('Windows platform detected, running PowerShell cleanup script...');
    execSync('npm run cleanup:win', { stdio: 'inherit' });
  } else {
    console.log('Unix platform detected, running Bash cleanup script...');
    execSync('npm run cleanup:unix', { stdio: 'inherit' });
  }

  console.log('Cleanup completed successfully!');
} catch (error) {
  console.error('Error during cleanup:', error.message);
  process.exit(1);
}
