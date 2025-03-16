const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Read package.json to get available scripts
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const availableScripts = Object.keys(packageJson.scripts || {});

console.log('Checking GitHub Actions workflows against package.json scripts...');

// Get all workflow files
const workflowDir = path.join('.github', 'workflows');
const workflowFiles = fs.readdirSync(workflowDir).filter(file => 
  file.endsWith('.yml') || file.endsWith('.yaml')
);

let foundIssues = false;

// Validate each workflow file
workflowFiles.forEach(file => {
  const filePath = path.join(workflowDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = yaml.load(content);
  
  console.log(`\nChecking ${file}...`);
  
  // Extract all npm/yarn/pnpm run commands from the workflow
  const runCommands = [];
  const extractRunCommands = (obj) => {
    if (!obj) return;
    
    if (typeof obj === 'string') {
      // Look for patterns like: npm run script-name, pnpm run script-name, etc.
      const runMatches = obj.match(/(?:npm|yarn|pnpm)\s+run\s+([a-zA-Z0-9:_-]+)/g);
      if (runMatches) {
        runMatches.forEach(match => {
          const scriptName = match.split(/\s+run\s+/)[1];
          runCommands.push(scriptName);
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractRunCommands(item));
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(value => extractRunCommands(value));
    }
  };
  
  // Process the workflow to find all run commands
  extractRunCommands(workflow);
  
  // Deduplicate commands
  const uniqueCommands = [...new Set(runCommands)];
  
  // Check if all commands exist in package.json
  const missingScripts = uniqueCommands.filter(cmd => !availableScripts.includes(cmd));
  
  if (missingScripts.length > 0) {
    console.log(`⚠️ Found ${missingScripts.length} scripts in ${file} that don't exist in package.json:`);
    missingScripts.forEach(script => console.log(`  - ${script}`));
    foundIssues = true;
  } else {
    console.log(`✅ All scripts in ${file} exist in package.json`);
  }
  
  // Check for package manager consistency
  const content_lower = content.toLowerCase();
  const hasNpm = content_lower.includes('npm');
  const hasYarn = content_lower.includes('yarn');
  const hasPnpm = content_lower.includes('pnpm');
  
  if ((hasNpm && hasPnpm) || (hasNpm && hasYarn) || (hasYarn && hasPnpm)) {
    console.log('⚠️ Workflow uses multiple package managers, which may cause issues:');
    if (hasNpm) console.log('  - npm');
    if (hasYarn) console.log('  - yarn');
    if (hasPnpm) console.log('  - pnpm');
    foundIssues = true;
  }
});

if (foundIssues) {
  console.log('\n⚠️ Issues found in workflows. Please fix them to ensure CI/CD works properly.');
  process.exit(1);
} else {
  console.log('\n✅ All workflows look good!');
  process.exit(0);
} 