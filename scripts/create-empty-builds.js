/**
 * Script to create empty build directories with minimal files for testing deployments
 */

const fs = require('fs');
const path = require('path');

const directories = [
  'packages/admin/dist',
  'packages/hours/dist'
];

const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Deployment</title>
</head>
<body>
  <h1>Test Deployment</h1>
  <p>This is a temporary page for testing the CI/CD pipeline.</p>
</body>
</html>`;

console.log('Creating empty build directories for testing...');

// Create directories and minimal files
directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${fullPath}`);
  }
  
  // Create index.html
  const indexPath = path.join(fullPath, 'index.html');
  fs.writeFileSync(indexPath, indexHtml);
  console.log(`Created: ${indexPath}`);
});

console.log('Done! You can now test the deployment process.'); 