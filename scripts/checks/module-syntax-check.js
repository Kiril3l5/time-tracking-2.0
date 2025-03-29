#!/usr/bin/env node

/**
 * Module Syntax Checker
 * 
 * This module verifies and fixes CommonJS require() statements in JavaScript files,
 * converting them to ES Module imports. This helps ensure module syntax consistency
 * across the codebase.
 * 
 * Used in the preview workflow to prevent module syntax inconsistencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cwd, process } from 'node:process';
import * as logger from '../core/logger.js';
import { glob } from 'glob';
import { execSync } from 'child_process';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Common require patterns to detect
const requirePatterns = [
  /const\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
  /let\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
  /var\s+.*require\s*\(\s*['"].*['"]\s*\)/g,
];

// Mapping of common Node.js modules to their most commonly used exports
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
 * @param {string} fileContent - Content to convert
 * @returns {string} Updated content
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
      esmDirnameCode += `import { fileURLToPath } from 'node:url';\n`;
    }
    if (!pathImportAdded) {
      esmDirnameCode += `import path from 'node:path';\n`;
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
 * @param {string} filePath - Path to the file to analyze
 * @returns {Object} Analysis results
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
    logger.error(`Error analyzing file ${filePath}: ${error.message}`);
    return {
      path: filePath,
      hasRequire: false,
      content: null,
      error: error.message
    };
  }
}

/**
 * Fix file by converting require calls to imports
 * @param {string} filePath - Path to the file to fix
 * @param {string} content - Content of the file
 * @returns {Object} Results of the fix operation
 */
function fixFile(filePath, content) {
  try {
    const updatedContent = convertRequireToImport(content);
    
    // Only write if there were changes
    if (updatedContent !== content) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      return {
        fixed: true,
        path: filePath
      };
    }
    
    return {
      fixed: false,
      path: filePath,
      reason: 'No changes needed'
    };
  } catch (error) {
    logger.error(`Error fixing file ${filePath}: ${error.message}`);
    return {
      fixed: false,
      path: filePath,
      error: error.message
    };
  }
}

/**
 * Find JavaScript files with require statements
 * @param {string} dir - Directory to scan
 * @param {Array} fileList - Accumulated list of files
 * @param {Array} excludeDirectories - Directories to exclude
 * @returns {Array} List of files with require statements
 */
function findFiles(dir, fileList = [], excludeDirectories = ['node_modules', '.git', 'dist', 'build']) {
  try {
    // Ensure directory exists before trying to read it
    if (!fs.existsSync(dir)) {
      logger.warn(`Directory does not exist and will be skipped: ${dir}`);
      return fileList;
    }
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      // Skip excluded directories
      if (excludeDirectories.includes(file)) continue;
      
      try {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Call recursively and update the fileList
          findFiles(filePath, fileList, excludeDirectories);
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
      } catch (fileError) {
        // Skip files that can't be accessed or cause errors
        logger.info(`Error processing file ${path.join(dir, file)}: ${fileError.message}`);
        continue;
      }
    }
  } catch (dirError) {
    logger.warn(`Error reading directory ${dir}: ${dirError.message}`);
  }
  
  return fileList;
}

/**
 * Update the function to resolve glob patterns more reliably across platforms
 * @param {Array} patterns - Array of glob patterns
 * @returns {Promise<Array>} Array of resolved paths
 */
async function resolveDirectories(patterns) {
  const resolvedDirs = [];
  for (const pattern of patterns) {
    const matches = await new Promise((resolve, reject) => {
      glob(pattern, { cwd: cwd(), absolute: true }, (err, matches) => {
        if (err) reject(err);
        else resolve(matches);
      });
    });
    resolvedDirs.push(...matches);
  }
  return resolvedDirs;
}

/**
 * Check and fix module syntax in the codebase
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check results
 */
export async function checkModuleSyntax(options = {}) {
  const { verbose, directories = ['scripts'], excludeDirectories = [], autoFix = false } = options;
  
  try {
    logger.info('Checking for CommonJS require() statements...');
    
    // For more reliable paths across all platforms
    const fixedExcludeDirs = Array.isArray(excludeDirectories) ? 
      excludeDirectories : ['node_modules', '.git', 'dist', 'build'];
    
    // Check if directories exist before proceeding
    const validDirs = [];
    for (const dir of directories) {
      try {
        // Handle glob patterns by resolving to absolute paths
        // For direct paths, just check if they exist
        if (dir.includes('*')) {
          logger.warn(`Directory not found and will be skipped: ${dir}`);
        } else {
          const absolutePath = path.resolve(cwd(), dir);
          if (fs.existsSync(absolutePath)) {
            validDirs.push(absolutePath);
          } else {
            logger.warn(`Directory not found and will be skipped: ${dir}`);
          }
        }
      } catch (error) {
        logger.warn(`Error resolving path ${dir}: ${error.message}`);
      }
    }
    
    if (validDirs.length === 0) {
      logger.warn('No valid directories found for module syntax check');
      return {
        success: true,
        filesChecked: 0,
        filesWithRequire: 0,
        fixedFiles: [],
        issues: []
      };
    }
    
    // Use direct file finding
    let allFiles = [];
    
    // Find files in specified directories
    for (const dir of validDirs) {
      try {
        const filesInDir = findFiles(dir, [], fixedExcludeDirs);
        allFiles = [...allFiles, ...filesInDir];
      } catch (error) {
        logger.warn(`Error scanning directory ${dir}: ${error.message}`);
      }
    }
    
    // Log success message showing valid directories that were checked
    logger.info(`Successfully checked ${validDirs.length} directories for module syntax issues`);
    
    if (allFiles.length === 0) {
      logger.success('No files with CommonJS require() statements found');
      return {
        success: true,
        filesChecked: validDirs.length,
        filesWithRequire: 0,
        fixedFiles: [],
        issues: []
      };
    }
    
    logger.info(`Found ${allFiles.length} files with require() statements`);
    
    // Fix files if autoFix is enabled
    const fixedFiles = [];
    if (autoFix) {
      logger.info('Fixing files with require() statements...');
      
      for (const fileInfo of allFiles) {
        logger.info(`Fixing: ${fileInfo.path}`);
        const result = fixFile(fileInfo.path, fileInfo.content);
        
        if (result.fixed) {
          logger.success(`✓ Fixed: ${path.relative(cwd(), fileInfo.path)}`);
          fixedFiles.push(result);
        } else if (verbose) {
          logger.info(`- Skipped: ${path.relative(cwd(), fileInfo.path)} (${result.reason || 'unknown reason'})`);
        }
      }
      
      logger.info(`Fixed ${fixedFiles.length} of ${allFiles.length} files`);
    }
    
    // Return results
    return {
      success: true,
      filesChecked: validDirs.length,
      filesWithRequire: allFiles.length,
      fixedFiles: fixedFiles.map(f => f.path),
      details: allFiles.map(f => ({
        path: f.path,
        hasRequire: true
      }))
    };
  } catch (error) {
    logger.error(`Error in module syntax check: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

function getAllJavaScriptFiles() {
  const files = [];
  const dirs = [
    path.join(process.cwd(), 'scripts'),
    path.join(process.cwd(), 'packages')
  ];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      files.push(...getFilesRecursively(dir, ['.js', '.jsx', '.ts', '.tsx']));
    }
  }

  return files;
}

function getFilesRecursively(dir, extensions) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function convertToESModules(content) {
  // Replace require statements with imports
  content = content.replace(
    /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g,
    (match, varName, modulePath) => {
      // Convert relative paths to proper format
      const importPath = modulePath.startsWith('.') 
        ? modulePath 
        : `'${modulePath}'`;
      
      return `import ${varName} from ${importPath};`;
    }
  );

  // Replace module.exports with export default
  content = content.replace(
    /module\.exports\s*=\s*([^;]+);?/g,
    'export default $1;'
  );

  // Replace exports.x with export const x
  content = content.replace(
    /exports\.(\w+)\s*=\s*([^;]+);?/g,
    'export const $1 = $2;'
  );

  return content;
}

async function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    totalFiles: results.totalFiles,
    filesWithRequire: results.filesWithRequire.length,
    fixedFiles: results.fixedFiles.length,
    details: {
      filesWithRequire: results.filesWithRequire,
      fixedFiles: results.fixedFiles
    }
  };

  // Save JSON report
  fs.writeFileSync(
    'temp/module-syntax-report.json',
    JSON.stringify(report, null, 2)
  );

  // Generate HTML report
  const htmlReport = generateHtmlReport(report);
  fs.writeFileSync('temp/module-syntax-report.html', htmlReport);
}

function generateHtmlReport(results) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Module Syntax Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .metric { margin: 10px 0; }
    .file-list { margin: 20px 0; }
    .file-list h3 { margin-bottom: 10px; }
    .file-list ul { list-style-type: none; padding-left: 0; }
    .file-list li { padding: 5px 0; }
  </style>
</head>
<body>
  <h1>Module Syntax Report</h1>
  
  <h2>Overview</h2>
  <div class="metric">Total Files: ${results.totalFiles}</div>
  <div class="metric">Files with require(): ${results.filesWithRequire}</div>
  <div class="metric">Fixed Files: ${results.fixedFiles}</div>
  
  <h2>Details</h2>
  
  <div class="file-list">
    <h3>Files with require()</h3>
    <ul>
      ${results.details.filesWithRequire.map(file => `<li>${file}</li>`).join('')}
    </ul>
  </div>
  
  <div class="file-list">
    <h3>Fixed Files</h3>
    <ul>
      ${results.details.fixedFiles.map(file => `<li>${file}</li>`).join('')}
    </ul>
  </div>
</body>
</html>
  `;
}

// Run check if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkModuleSyntax();
} 