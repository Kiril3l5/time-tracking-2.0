#!/usr/bin/env node

/**
 * Script to detect and fix CommonJS require() statements in JavaScript files
 * This is needed because the project uses ES Modules (type: "module" in package.json)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log(`${colors.bright}${colors.cyan}=== JavaScript Module Syntax Fixer ===${colors.reset}`);
console.log(`${colors.yellow}Detecting files with CommonJS require() calls...${colors.reset}`);

// Common require patterns
const requirePatterns = [
  /const\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
  /let\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
  /var\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
];

// Mapping of common imports 
const importMappings = {
  'child_process': ['execSync', 'spawn', 'exec', 'spawnSync'],
  'fs': ['readFileSync', 'writeFileSync', 'existsSync', 'readdirSync', 'statSync', 'mkdirSync', 'unlinkSync'],
  'path': ['join', 'resolve', 'dirname', 'basename', 'extname'],
  'os': ['platform', 'EOL', 'homedir', 'tmpdir'],
  'util': ['promisify', 'inspect', 'format'],
  'url': ['URL', 'URLSearchParams', 'fileURLToPath', 'pathToFileURL'],
};

/**
 * Convert a CommonJS require to an ES import
 */
function convertRequireToImport(fileContent) {
  // Replace common require patterns
  let updatedContent = fileContent;
  
  // Replace import { x, y  } from 'module'
  updatedContent = updatedContent.replace(
    /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, 
    (match, imports, module) => {
      return `import { ${imports} } from '${module}'`;
    }
  );
  
  // Replace import module from 'module'
  updatedContent = updatedContent.replace(
    /const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, varName, module) => {
      return `import ${varName} from '${module}'`;
    }
  );
  
  // Replace var/let patterns
  updatedContent = updatedContent.replace(
    /(var|let)\s+\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, varType, imports, module) => {
      return `import { ${imports} } from '${module}'`;
    }
  );
  
  updatedContent = updatedContent.replace(
    /(var|let)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, varType, varName, module) => {
      return `import ${varName} from '${module}'`;
    }
  );
  
  // Add __dirname and __filename handling if needed
  if (
    (fileContent.includes('__dirname') || fileContent.includes('__filename')) &&
    !fileContent.includes('fileURLToPath')
  ) {
    const importStatements = updatedContent.split('\n');
    let urlImportAdded = false;
    let pathImportAdded = false;
    
    // Check if we have the necessary imports
    for (const statement of importStatements) {
      if (statement.includes('import') && statement.includes('url')) {
        urlImportAdded = true;
      }
      if (statement.includes('import') && statement.includes('path')) {
        pathImportAdded = true;
      }
    }
    
    // Add required imports
    let esmDirnameCode = '';
    if (!urlImportAdded) {
      esmDirnameCode += `import { fileURLToPath } from 'url';\n`;
    }
    if (!pathImportAdded) {
      esmDirnameCode += `import path from 'path';\n`;
    }
    
    // Add the dirname/filename handling code
    esmDirnameCode += `
// Get the directory and filename in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);\n`;
    
    // Insert after the last import statement
    let lastImportIndex = 0;
    for (let i = 0; i < importStatements.length; i++) {
      if (importStatements[i].includes('import ')) {
        lastImportIndex = i;
      }
    }
    
    // If we have imports, add after the last one
    if (lastImportIndex > 0) {
      importStatements.splice(lastImportIndex + 1, 0, esmDirnameCode);
      updatedContent = importStatements.join('\n');
    } else {
      // Otherwise add at the beginning after any comments or shebang
      let insertPoint = 0;
      const lines = updatedContent.split('\n');
      
      // Skip initial comments and shebang
      while (
        insertPoint < lines.length && 
        (lines[insertPoint].startsWith('//') || 
         lines[insertPoint].startsWith('/*') ||
         lines[insertPoint].startsWith('#!/') ||
         lines[insertPoint].trim() === '')
      ) {
        insertPoint++;
      }
      
      lines.splice(insertPoint, 0, esmDirnameCode);
      updatedContent = lines.join('\n');
    }
  }
  
  // Add Node.js shebang if not present and needed
  if (!updatedContent.includes('#!/usr/bin/env node') && 
      (updatedContent.includes('process.') || 
       updatedContent.includes('execSync('))) {
    updatedContent = `#!/usr/bin/env node\n\n${updatedContent}`;
  }
  
  return updatedContent;
}

/**
 * Analyze file for CommonJS require calls
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let requireFound = false;
    
    for (const pattern of requirePatterns) {
      if (pattern.test(content)) {
        requireFound = true;
        break;
      }
    }
    
    return {
      path: filePath,
      hasRequire: requireFound,
      content
    };
  } catch (error) {
    console.error(`${colors.red}Error analyzing file ${filePath}:${colors.reset}`, error.message);
    return {
      path: filePath,
      hasRequire: false,
      content: null
    };
  }
}

/**
 * Fix file by converting require calls to imports
 */
function fixFile(filePath, content) {
  try {
    const updatedContent = convertRequireToImport(content);
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    return true;
  } catch (error) {
    console.error(`${colors.red}Error fixing file ${filePath}:${colors.reset}`, error.message);
    return false;
  }
}

/**
 * Find and fix files with require statements
 */
function findAndFixFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
      findAndFixFiles(filePath, fileList);
    } else if (
      stat.isFile() && 
      file.endsWith('.js') && 
      !file.endsWith('.cjs') && 
      !file.endsWith('.mjs')
    ) {
      const fileInfo = analyzeFile(filePath);
      if (fileInfo.hasRequire) {
        fileList.push(fileInfo);
      }
    }
  }
  
  return fileList;
}

// Find files with require statements
const filesToFix = findAndFixFiles(rootDir);

console.log(`${colors.yellow}Found ${filesToFix.length} files with require() statements:${colors.reset}`);

let fixedCount = 0;
let unfixedCount = 0;

// Fix the files
for (const fileInfo of filesToFix) {
  console.log(`${colors.blue}Fixing: ${fileInfo.path}${colors.reset}`);
  const success = fixFile(fileInfo.path, fileInfo.content);
  
  if (success) {
    console.log(`${colors.green}✓ Fixed${colors.reset}`);
    fixedCount++;
  } else {
    console.log(`${colors.red}✗ Failed to fix${colors.reset}`);
    unfixedCount++;
  }
}

// Make all scripts executable
console.log(`${colors.blue}Making scripts executable...${colors.reset}`);
try {
  execSync('chmod +x scripts/*.js', { stdio: 'inherit' });
} catch (error) {
  console.warn(`${colors.yellow}Warning: Could not set execute permissions${colors.reset}`);
}

// Summary
console.log(`\n${colors.bright}${colors.green}=== Module Syntax Fix Summary ===${colors.reset}`);
console.log(`${colors.green}Files fixed: ${fixedCount}${colors.reset}`);
if (unfixedCount > 0) {
  console.log(`${colors.red}Files failed to fix: ${unfixedCount}${colors.reset}`);
}
console.log(`\n${colors.bright}${colors.cyan}Next Steps:${colors.reset}`);
console.log(`1. ${colors.yellow}Test the fixed scripts:${colors.reset} node <script.js>`);
console.log(`2. ${colors.yellow}If any script won't work with ES Modules:${colors.reset} rename to .cjs extension`);
console.log(`3. ${colors.yellow}Update documentation:${colors.reset} make sure all scripts follow ES Module guidelines`);
console.log(`4. ${colors.yellow}Run tests:${colors.reset} pnpm test\n`); 