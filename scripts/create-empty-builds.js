#!/usr/bin/env node

/**
 * Script to create empty build directories if the regular build fails.
 * This ensures that deployments can proceed even with partial builds.
 */

import fs from 'fs';
import path from 'path';

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Creates a directory if it doesn't exist
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`${colors.yellow}Creating directory: ${dirPath}${colors.reset}`);
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

/**
 * Creates a minimal index.html file with a message about the build
 */
function createMinimalIndexHtml(dirPath, packageName) {
  const htmlPath = path.join(dirPath, 'index.html');
  
  if (!fs.existsSync(htmlPath)) {
    console.log(`${colors.yellow}Creating minimal index.html for ${packageName}${colors.reset}`);
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${packageName} - Build Placeholder</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      color: #333;
      background-color: #f9f9f9;
    }
    .container {
      max-width: 600px;
      background-color: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #e63946;
      margin-bottom: 20px;
    }
    p {
      line-height: 1.6;
      margin-bottom: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Build Placeholder for ${packageName}</h1>
    <p>This is a placeholder page that was created because the actual build process for this package failed or was skipped.</p>
    <p>Please check your build logs and fix any errors to deploy the actual application.</p>
    <p><strong>Note:</strong> This is only meant for testing the deployment process.</p>
  </div>
</body>
</html>
`;
    
    fs.writeFileSync(htmlPath, htmlContent);
    return true;
  }
  
  return false;
}

/**
 * Main function to create empty builds
 */
function createEmptyBuilds() {
  console.log(`${colors.green}=== Creating empty build directories if needed ===${colors.reset}`);
  
  // Define packages and their build directories
  const packages = [
    { name: 'common', buildDir: 'packages/common/dist' },
    { name: 'admin', buildDir: 'packages/admin/dist' },
    { name: 'hours', buildDir: 'packages/hours/dist' },
  ];
  
  let createdAny = false;
  
  // Ensure build directories exist for each package
  packages.forEach(pkg => {
    const buildDirPath = path.join(process.cwd(), pkg.buildDir);
    const dirCreated = ensureDirectoryExists(buildDirPath);
    
    if (dirCreated || !fs.readdirSync(buildDirPath).length) {
      // Create placeholder index.html if directory was created or is empty
      createMinimalIndexHtml(buildDirPath, pkg.name);
      createdAny = true;
    }
  });
  
  if (createdAny) {
    console.log(`${colors.yellow}Empty build directories created. These are placeholders only.${colors.reset}`);
    console.log(`${colors.yellow}For a proper deployment, you should fix build issues and run a real build.${colors.reset}`);
  } else {
    console.log(`${colors.green}All build directories already exist and contain files.${colors.reset}`);
  }
}

// Run the main function
createEmptyBuilds(); 