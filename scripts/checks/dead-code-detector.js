/**
 * Dead Code Detector
 * 
 * Analyzes the codebase to identify unused code, imports, and CSS.
 * This helps reduce bundle size by identifying removable code.
 */

/* global process, console */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { logger } from '../core/logger.js';
import { parseArgs } from 'node:util';
import { getReportPath, getHtmlReportPath, createJsonReport } from '../reports/report-collector.js';
import { globSync } from 'glob';

// Use the full path for glob import to ensure it's found
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nodeModulesDir = path.resolve(__dirname, '../../node_modules');

// Results storage location

// Default patterns for files to include in the analysis
const DEFAULT_INCLUDE_PATTERNS = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'];

// Default patterns for files to exclude from the analysis
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/*.test.js',
  '**/*.test.tsx',
  '**/*.test.ts',
  '**/*.spec.js',
  '**/*.spec.tsx',
  '**/*.spec.ts',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**'
];

/**
 * Find unused exports across the project
 * @param {string[]} files - List of files to analyze
 * @returns {Object} Results of the analysis
 */
function findUnusedExports(files) {
  try {
    // Use TypeScript's project reference mode to find unused exports
    
    // Run ts-prune to find unused exports
    // ts-prune is a tool that finds unused exports in TypeScript code
    const output = execSync(`npx ts-prune --project tsconfig.json --ignore "index.ts|.test.ts|.spec.ts|.d.ts"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Parse ts-prune output
    // Format is: /path/to/file.ts:10:12 - export Function 'unused'
    const unusedExports = [];
    const lines = output.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      // Match pattern like: /path/to/file.ts:10:12 - export Function 'unused' is unused
      const match = line.match(/(.+):(\d+):(\d+) - (.+)/);
      if (match) {
        const [, filePath, line, column, description] = match;
        unusedExports.push({
          filePath: filePath.trim(),
          line: parseInt(line, 10),
          column: parseInt(column, 10),
          description: description.trim(),
          type: description.includes('Function') ? 'function' :
                description.includes('Interface') ? 'interface' :
                description.includes('Class') ? 'class' :
                description.includes('Variable') ? 'variable' : 'other'
        });
      }
    }
    
    return {
      success: true,
      unusedExports
    };
  } catch (error) {
    logger.error(`Error finding unused exports: ${error.message}`);
    return {
      success: false,
      error: error.message,
      unusedExports: []
    };
  }
}

/**
 * Find unused dependencies in package.json files
 * @param {string[]} packageDirs - Directories containing package.json files
 * @returns {Object} Results of the analysis
 */
async function findUnusedDependencies(packageDirs) {
  const depcheckPromises = [];
  
  // Helper function to run depcheck for a single directory
  const runDepcheck = async (dir) => {
    try {
      const packageJsonPath = path.join(dir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) return null;
      
      logger.debug(`Running depcheck in: ${path.relative(process.cwd(), dir)}`);
      // Run depcheck within the package directory itself
      // Use --skip-missing=true to avoid errors for unresolved deps that might be provided by the workspace
      const command = `npx depcheck . --json --skip-missing=true`; 
      const output = execSync(command, {
        encoding: 'utf8',
        cwd: dir, // Execute in the package directory
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const depcheckResult = JSON.parse(output);
      const unusedDeps = [
        ...(depcheckResult.dependencies || []).map(dep => ({ name: dep, type: 'dependency' })),
        ...(depcheckResult.devDependencies || []).map(dep => ({ name: dep, type: 'devDependency' }))
        // Consider adding peerDependencies and optionalDependencies if relevant
      ];
      
      if (unusedDeps.length > 0) {
        return {
          packagePath: path.relative(process.cwd(), packageJsonPath),
          unusedDependencies: unusedDeps
        };
      }
      return null;
    } catch (error) {
      // Log error and potentially add to a results object if you want to track failures
      logger.warn(`Failed to run depcheck in ${path.relative(process.cwd(), dir)}: ${error.message}`);
      // Optionally capture the error details
      if (error.stderr) logger.debug(`Depcheck stderr in ${path.relative(process.cwd(), dir)}:\n${error.stderr}`);
      if (error.stdout) logger.debug(`Depcheck stdout in ${path.relative(process.cwd(), dir)}:\n${error.stdout}`);
      return { 
         packagePath: path.relative(process.cwd(), path.join(dir, 'package.json')), 
         error: error.message 
      }; 
    }
  };

  // Run depcheck for all directories concurrently
  for (const dir of packageDirs) {
    depcheckPromises.push(runDepcheck(dir));
  }

  // Wait for all depcheck processes to complete
  const results = await Promise.all(depcheckPromises);
    
  // Rename this variable to avoid conflict
  const validUnused = results.filter(r => r && !r.error && r.unusedDependencies && r.unusedDependencies.length > 0);
  const errors = results.filter(r => r && r.error);
    
  if (errors.length > 0) {
     logger.warn(`Depcheck encountered errors in ${errors.length} directories.`);
  }

  return {
    success: errors.length === 0, // Consider analysis successful if no errors occurred
    unusedDependencies: validUnused, // Return the filtered valid results
    errors: errors // Include errors in the result for transparency
  };
}

/**
 * Estimate bundle size impact of dead code
 * @param {Object} results - Analysis results
 * @returns {string} Estimated bundle size reduction
 */
function estimateBundleSizeImpact(results) {
  // Rough estimation based on typical code sizes
  const unusedExportsCount = results.unusedExports?.length || 0;
  const unusedDepsPackages = results.unusedDependencies || [];
  
  const unusedExportsSize = unusedExportsCount * 0.2; // ~200 bytes per export
  const unusedDepsSize = unusedDepsPackages.reduce((sum, pkg) => {
    return sum + (pkg.unusedDependencies?.length || 0) * 50; // ~50KB per dependency
  }, 0);
  
  const totalKB = unusedExportsSize + unusedDepsSize;
  
  if (totalKB > 1024) {
    return `${(totalKB / 1024).toFixed(1)} MB`;
  } else {
    return `${totalKB.toFixed(1)} KB`;
  }
}

/**
 * Summarize the results of the dead code analysis
 * @param {Object} results - The analysis results
 * @returns {Object} - Summary of results
 */
function summarizeResults(results) {
  const unusedExportsCount = results.unusedExports?.length || 0;
  const unusedDepsPackages = results.unusedDependencies || [];
  const depcheckErrorCount = results.errors?.length || 0;

  const totalUnusedDeps = unusedDepsPackages.reduce(
    (sum, pkg) => sum + (pkg.unusedDependencies?.length || 0), 0
  );

  const totalIssues = unusedExportsCount + totalUnusedDeps + depcheckErrorCount;
  
  return {
    totalIssues,
    unusedExports: unusedExportsCount,
    unusedDependencies: totalUnusedDeps,
    depcheckErrors: depcheckErrorCount,
    unusedFiles: results.unusedFiles?.length || 0,
    potentialSizeReduction: calculatePotentialSizeReduction(results)
  };
}

/**
 * Calculate the potential bundle size reduction
 * @param {Object} results - The analysis results
 * @returns {string} - Formatted size reduction
 */
function calculatePotentialSizeReduction(results) {
  // Mock implementation - in a real scenario, this would analyze file sizes
  const { unusedFiles } = results;
  let totalBytes = 0;
  
  if (unusedFiles && unusedFiles.length > 0) {
    // Sample calculation - would actually read file sizes
    totalBytes = unusedFiles.length * 5000; // Assume average 5KB per file
  }
  
  // Format bytes to human-readable
  return formatBytes(totalBytes);
}

/**
 * Format bytes to a human-readable string
 * @param {number} bytes - The number of bytes
 * @returns {string} - Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze codebase for dead code
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results - Guaranteed to return an object
 */
export async function analyzeDeadCode(options) {
  // ---> DEBUG: Inspect logger object <---
  logger.debug('--- Inside analyzeDeadCode --- Logger object:');
  logger.debug(typeof logger);
  logger.debug(Object.keys(logger).join(', '));
  // ---> END DEBUG <---

  // Initialize default results structure
  const analysisResults = {
    success: false, // Default to false
    unusedExports: [],
    unusedDependencies: [],
    error: null
  };

  try { // Add top-level try block
    const {
      sourceDirectories = ['packages/*/src'], 
      packageDirectories = ['packages/*', '.'],
      ignorePatterns = DEFAULT_EXCLUDE_PATTERNS,
      analyzeImports = true,
      analyzeDependencies = true,
      generateReport = true 
    } = options;
    
    logger.info('Analyzing codebase for dead code...');
    
    // Find all source files using the imported globSync
    let sourceFiles = [];
    const globOptions = { 
        ignore: ignorePatterns, 
        cwd: process.cwd(), // Specify current working directory
        absolute: true, // Get absolute paths for consistency
        nodir: true // We only want files
    };

    for (const pattern of sourceDirectories) {
      // Construct the full pattern
      const fullPattern = `${pattern}/**/*.{js,jsx,ts,tsx}`;
      logger.debug(`Globbing for source files with pattern: ${fullPattern}`);
      try {
          const files = globSync(fullPattern, globOptions);
          sourceFiles.push(...files);
      } catch (error) {
          logger.error(`Error during glob execution for pattern ${fullPattern}: ${error.message}`);
      }
    }
    
    // Log relative paths for readability if verbose
    if (options.verbose && sourceFiles.length > 0) {
        logger.debug('Found source files:');
        sourceFiles.forEach(f => logger.debug(`  - ${path.relative(process.cwd(), f)}`));
    }
    logger.info(`Found ${sourceFiles.length} source files to analyze`);
    
    // Find all package directories
    let pkgDirs = [];
    const pkgGlobOptions = { 
        ignore: ['**/node_modules/**'], 
        cwd: process.cwd(),
        absolute: true,
        onlyDirectories: true // We only want directories
    };
    for (const pattern of packageDirectories) {
      logger.debug(`Globbing for package dirs with pattern: ${pattern}`);
      try {
          const dirs = globSync(pattern, pkgGlobOptions);
          pkgDirs.push(...dirs);
      } catch (error) {
          logger.error(`Error during glob execution for pattern ${pattern}: ${error.message}`);
      }
    }
    if (options.verbose && pkgDirs.length > 0) {
        logger.debug('Found package directories:');
        pkgDirs.forEach(d => logger.debug(`  - ${path.relative(process.cwd(), d)}`));
    }
    logger.info(`Found ${pkgDirs.length} package directories to analyze`);
    
    // --- Run analyses --- 
    let allAnalysesSucceeded = true; // Track success of sub-analyses

    // Analyze imports
    if (analyzeImports && sourceFiles.length > 0) {
      logger.info('Analyzing unused exports...');
      const exportsResult = findUnusedExports(sourceFiles);
      analysisResults.unusedExports = exportsResult.unusedExports;
      if (!exportsResult.success) {
        allAnalysesSucceeded = false;
        analysisResults.error = analysisResults.error ? `${analysisResults.error}; ${exportsResult.error}` : exportsResult.error; 
        logger.warn(`Unused export analysis failed: ${exportsResult.error}`);
      } else {
         logger.info(`Found ${exportsResult.unusedExports.length} unused exports`);
      }
    }
    
    // Analyze dependencies
    if (analyzeDependencies && pkgDirs.length > 0) {
      logger.info('Analyzing unused dependencies...');
      // IMPORTANT: findUnusedDependencies is now async due to Promise.all
      const depsResult = await findUnusedDependencies(pkgDirs); 
      
      // Store both successful results and errors separately
      analysisResults.unusedDependencies = depsResult.unusedDependencies || []; // Array of { packagePath, unusedDependencies: [...] }
      analysisResults.depcheckErrors = depsResult.errors || []; // Array of { packagePath, error }

      if (!depsResult.success) { 
        allAnalysesSucceeded = false;
        const errorMsg = `Depcheck analysis failed for ${analysisResults.depcheckErrors.length} package(s).`;
        analysisResults.error = analysisResults.error ? `${analysisResults.error}; ${errorMsg}` : errorMsg;
        logger.warn(errorMsg);
        analysisResults.depcheckErrors.forEach(e => logger.warn(` - Error in ${e.packagePath}: ${e.error}`));
      } else {
        // Calculate total unused only from successful results
        const totalUnused = analysisResults.unusedDependencies.reduce(
          (sum, pkg) => sum + (pkg.unusedDependencies ? pkg.unusedDependencies.length : 0), 0
        );
        logger.info(`Found ${totalUnused} unused dependencies across ${analysisResults.unusedDependencies.length} packages checked successfully.`);
      }
    }
    
    // Set overall success based on sub-analyses
    analysisResults.success = allAnalysesSucceeded;

    // Estimate potential bundle size reduction (using valid results)
    // Ensure estimateBundleSizeImpact can handle potentially empty/missing arrays
    const potentialBundleSizeReduction = estimateBundleSizeImpact(analysisResults); 
    
    // Prepare final results object to be returned
    const finalResults = {
      success: analysisResults.success,
      unusedExports: analysisResults.unusedExports || [],
      unusedDependencies: analysisResults.unusedDependencies || [], // Ensure array exists
      depcheckErrors: analysisResults.depcheckErrors || [], // Include errors
      error: analysisResults.error, // Overall error message
      summary: {
        unusedExports: (analysisResults.unusedExports || []).length,
        // Calculate summary based only on packages where depcheck succeeded
        unusedDependencies: (analysisResults.unusedDependencies || []).reduce(
          (sum, pkg) => sum + (pkg.unusedDependencies ? pkg.unusedDependencies.length : 0), 0
        ),
        totalIssues: (analysisResults.unusedExports || []).length + 
                     (analysisResults.unusedDependencies || []).reduce((sum, pkg) => sum + (pkg.unusedDependencies ? pkg.unusedDependencies.length : 0), 0) + 
                     (analysisResults.depcheckErrors || []).length // Count errors as issues
      },
      potentialBundleSizeReduction
    };
    
    // Generate HTML report only if explicitly requested
    if (generateReport && options.htmlOutput) { 
      generateHtmlReport(finalResults, options.htmlOutput);
      logger.info(`Dead code analysis HTML report generated at ${options.htmlOutput}`);
    }
    
    // Log summary
    if (finalResults.summary.totalIssues > 0) {
      logger.warn(`Found ${finalResults.summary.totalIssues} potential dead code issues`);
      logger.info(`Potential bundle size reduction: ${potentialBundleSizeReduction}`);
    } else if (finalResults.success) { // Only log success if analysis actually succeeded
      logger.success('No dead code detected in the analyzed files');
    } else {
      logger.error('Dead code analysis completed with errors.');
    }
    
    return finalResults; // Return the structured results object

  } catch (error) { // Catch any unexpected errors in the main function
    logger.error(`Unexpected error during dead code analysis: ${error.message}`);
    analysisResults.success = false;
    analysisResults.error = error.message;
    return analysisResults; // Return the results object even on error
  }
}

/**
 * Generate HTML report from results
 * @param {Object} results - Analysis results
 * @param {string} reportPath - Path to save the report
 */
function generateHtmlReport(results, reportPath) {
  try {
    const unusedDepsCount = (results.unusedDependencies || []).reduce((sum, pkg) => sum + (pkg.unusedDependencies?.length || 0), 0);
    const depcheckErrorCount = results.depcheckErrors?.length || 0;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Dead Code Analysis Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 25px; }
        .summary { background: #f7f7f7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; font-weight: 600; }
        .error { color: #d32f2f; }
        .warning { color: #f57c00; }
        .success { color: #388e3c; }
        .error-section { background: #ffebee; border: 1px solid #e57373; padding: 10px; margin-bottom: 15px; border-radius: 4px; }
        .error-section h3 { color: #c62828; margin-top: 0; }
        .error-detail { color: #d32f2f; font-style: italic; }
      </style>
    </head>
    <body>
      <h1>Dead Code Analysis Report</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Unused exports: ${results.unusedExports?.length || 0}</p>
        <p>Unused dependencies: ${unusedDepsCount}</p>
        <p>Depcheck Errors: ${depcheckErrorCount}</p> 
        <p>Potential bundle size reduction: ${results.potentialBundleSizeReduction || 'N/A'}</p>
      </div>
      
      <!-- Depcheck Errors Section -->
      ${(results.depcheckErrors && results.depcheckErrors.length > 0) ? `
      <div class="error-section">
        <h3>Depcheck Errors (${results.depcheckErrors.length})</h3>
        <table>
          <tr><th>Package</th><th>Error</th></tr>
          ${results.depcheckErrors.map(item => `
            <tr>
              <td>${item.packagePath}</td>
              <td class="error-detail">${item.error}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      <!-- Unused exports section -->
      <h2>Unused Exports (${results.unusedExports?.length || 0})</h2>
      ${(results.unusedExports && results.unusedExports.length > 0) ? `
      <table>
        <tr>
          <th>File</th>
          <th>Line</th>
          <th>Description</th>
          <th>Type</th>
        </tr>
        ${results.unusedExports.map(item => `
          <tr>
            <td>${item.filePath}</td>
            <td>${item.line}</td>
            <td>${item.description}</td>
            <td>${item.type}</td>
          </tr>
        `).join('')}
      </table>
      ` : '<p>None found.</p>'}
      
      <!-- Unused dependencies section -->
      <h2>Unused Dependencies (${unusedDepsCount})</h2>
      ${(results.unusedDependencies && results.unusedDependencies.length > 0) ? 
        results.unusedDependencies.map(pkg => `
          <h3>${pkg.packagePath}</h3>
          <table>
            <tr>
              <th>Dependency</th>
              <th>Type</th>
            </tr>
            ${pkg.unusedDependencies.map(dep => `
              <tr>
                <td>${dep.name}</td>
                <td>${dep.type}</td>
              </tr>
            `).join('')}
          </table>
        `).join('') : '<p>None found.</p>'
      }
    </body>
    </html>
    `;

    // Use async write file
    fs.writeFile(reportPath, html, 'utf8')
      .then(() => logger.info(`Dead code analysis HTML report generated at ${reportPath}`))
      .catch(err => logger.error(`Failed to generate HTML report: ${err.message}`));

  } catch (err) {
    logger.error(`Failed to generate HTML report: ${err.message}`);
  }
}

function showHelp() {
  const colors = logger.getColors();
  
  logger.info(`
${colors.cyan}${colors.bold}Dead Code Detector${colors.reset}

This tool analyzes your codebase to find dead code and unused dependencies.

${colors.bold}Usage:${colors.reset}
  node scripts/checks/dead-code-detector.js [options]

${colors.bold}Options:${colors.reset}
  --root <path>                     Root directory to analyze (default: .)
  --include <patterns>              Include patterns (comma-separated, default: src/**/*.{ts,tsx,js,jsx})
  --exclude <patterns>              Exclude patterns (comma-separated, default: **/*.{test,spec}.*)
  --package-json <paths>            Package.json paths to check (default: package.json)
  --skip-unused-exports             Skip checking for unused exports
  --skip-unused-dependencies        Skip checking for unused dependencies
  --skip-unused-files               Skip checking for unused files
  --skip-unused-css                 Skip checking for unused CSS classes
  --json-output <path>              Path for JSON report (default: dead-code-report.json)
  --html-output <path>              Path for HTML report (optional, not generated by default)
  --verbose                         Enable verbose logging
  --help                            Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Run full analysis${colors.reset}
  node scripts/checks/dead-code-detector.js

  ${colors.blue}# Run analysis on specific directory${colors.reset}
  node scripts/checks/dead-code-detector.js --root src/components

  ${colors.blue}# Generate both JSON and HTML reports${colors.reset}
  node scripts/checks/dead-code-detector.js --json-output=report.json --html-output=report.html
  `);
} 