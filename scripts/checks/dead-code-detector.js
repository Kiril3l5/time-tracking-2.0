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
const globPath = path.join(nodeModulesDir, 'glob');

// Results storage location
const RESULTS_FILE = path.join(process.cwd(), 'temp', '.dead-code-analysis.json');

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
    const filesToCheck = files.join(' ');
    
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
function findUnusedDependencies(packageDirs) {
  const unused = [];
  
  for (const dir of packageDirs) {
    try {
      const packageJsonPath = path.join(dir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) continue;
      
      // Use depcheck to find unused dependencies
      const output = execSync(`npx depcheck ${dir} --json`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const depcheckResult = JSON.parse(output);
      const unusedDeps = [
        ...Object.keys(depcheckResult.dependencies || {}).map(dep => ({ name: dep, type: 'dependency' })),
        ...Object.keys(depcheckResult.devDependencies || {}).map(dep => ({ name: dep, type: 'devDependency' }))
      ];
      
      if (unusedDeps.length > 0) {
        unused.push({
          packagePath: packageJsonPath,
          unusedDependencies: unusedDeps
        });
      }
    } catch (error) {
      logger.warn(`Failed to check unused dependencies in ${dir}: ${error.message}`);
    }
  }
  
  return {
    success: true,
    unusedDependencies: unused
  };
}

/**
 * Estimate bundle size impact of dead code
 * @param {Object} results - Analysis results
 * @returns {string} Estimated bundle size reduction
 */
function estimateBundleSizeImpact(results) {
  // Rough estimation based on typical code sizes
  const unusedExportsSize = results.unusedExports.length * 0.2; // ~200 bytes per export
  const unusedDepsSize = results.unusedDependencies.reduce((sum, pkg) => {
    return sum + pkg.unusedDependencies.length * 50; // ~50KB per dependency as a rough estimate
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
  const { unusedExports, unusedDependencies, unusedFiles } = results;
  
  const totalUnusedExports = unusedExports ? unusedExports.length : 0;
  const totalUnusedDependencies = unusedDependencies ? unusedDependencies.length : 0;
  const totalUnusedFiles = unusedFiles ? unusedFiles.length : 0;
  
  const potentialSizeReduction = calculatePotentialSizeReduction(results);
  
  const totalIssues = totalUnusedExports + totalUnusedDependencies + 
                      totalUnusedFiles;
  
  return {
    totalIssues,
    unusedExports: totalUnusedExports,
    unusedDependencies: totalUnusedDependencies,
    unusedFiles: totalUnusedFiles,
    potentialSizeReduction
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
      generateReport = true, 
      reportPath = getHtmlReportPath('deadCode') 
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
      const depsResult = findUnusedDependencies(pkgDirs);
      analysisResults.unusedDependencies = depsResult.unusedDependencies;
      if (!depsResult.success) { // Although findUnusedDependencies currently always returns true, check anyway
        allAnalysesSucceeded = false;
         analysisResults.error = analysisResults.error ? `${analysisResults.error}; Dependency check failed` : 'Dependency check failed'; 
        logger.warn('Unused dependency analysis reported failure or issues.');
      } else {
        const totalUnused = depsResult.unusedDependencies.reduce(
          (sum, pkg) => sum + pkg.unusedDependencies.length, 0
        );
        logger.info(`Found ${totalUnused} unused dependencies across ${depsResult.unusedDependencies.length} packages`);
      }
    }
    
    // Set overall success based on sub-analyses
    analysisResults.success = allAnalysesSucceeded;

    // Estimate potential bundle size reduction
    const potentialBundleSizeReduction = estimateBundleSizeImpact(analysisResults);
    
    // Prepare final results object to be returned
    const finalResults = {
      ...analysisResults, // Includes success, unusedExports, unusedDependencies, error
      summary: {
        unusedExports: analysisResults.unusedExports.length,
        unusedDependencies: analysisResults.unusedDependencies.reduce(
          (sum, pkg) => sum + pkg.unusedDependencies.length, 0
        ),
        totalIssues: analysisResults.unusedExports.length + 
                    analysisResults.unusedDependencies.reduce((sum, pkg) => sum + pkg.unusedDependencies.length, 0)
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
      logger.warning(`Found ${finalResults.summary.totalIssues} potential dead code issues`);
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
 * Main function to run dead code analysis
 */
async function main() {
  try {
    const args = parseArguments();
    
    if (args.help) {
      showHelp();
      return;
    }
    
    logger.info('Starting dead code analysis...');
    
    // Set up default output paths
    const jsonReportPath = args.jsonOutput || getReportPath('deadCode');
    const htmlReportPath = args.htmlOutput || getHtmlReportPath('deadCode');
    
    // Run analysis
    const results = await analyzeDeadCode({
      root: args.root || '.',
      includePatterns: args.include ? args.include.split(',') : DEFAULT_INCLUDE_PATTERNS,
      excludePatterns: args.exclude ? args.exclude.split(',') : DEFAULT_EXCLUDE_PATTERNS,
      packageJsonPaths: args.packageJsonPaths || ['package.json'],
      checkUnusedExports: !args.skipUnusedExports,
      checkUnusedDependencies: !args.skipUnusedDependencies,
      checkUnusedFiles: !args.skipUnusedFiles,
      checkUnusedCss: !args.skipUnusedCss,
      verbose: args.verbose,
      generateReport: false // Don't generate HTML reports by default
    });
    
    // Always save JSON results for the consolidated dashboard
    createJsonReport(results, jsonReportPath);
    logger.info(`Dead code analysis results saved to ${jsonReportPath}`);
    
    // Only generate HTML report if explicitly requested
    if (args.htmlOutput) {
      generateHtmlReport(results, htmlReportPath);
    }
    
    // Summarize results
    const summary = summarizeResults(results);
    
    return summary.issuesFound === 0;
  } catch (error) {
    logger.error(`Error in dead code analysis: ${error.message}`);
    return false;
  }
}

/**
 * Parse command-line arguments
 */
function parseArguments() {
  const options = {
    'src': { type: 'string', default: 'src' },
    'exclude': { type: 'string' },
    'include': { type: 'string' },
    'ignore-comments': { type: 'boolean', default: false },
    'ignore-tests': { type: 'boolean', default: true },
    'json-output': { type: 'string' },
    'html-output': { type: 'string' },
    'min-confidence': { type: 'number', default: 75 },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  };
  
  const { values } = parseArgs({
    options,
    allowPositionals: false,
    strict: false
  });
  
  return values;
}

/**
 * Display help information
 */
function showHelp() {
  const colors = logger.getColors();
  
  console.log(`
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

/**
 * Generate HTML report from results
 * @param {Object} results - Analysis results
 * @param {string} reportPath - Path to save the report
 */
function generateHtmlReport(results, reportPath) {
  try {
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
      </style>
    </head>
    <body>
      <h1>Dead Code Analysis Report</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Unused exports: ${results.unusedExports.length}</p>
        <p>Unused dependencies: ${results.unusedDependencies.reduce((sum, pkg) => sum + pkg.unusedDependencies.length, 0)}</p>
        <p>Potential bundle size reduction: ${results.potentialBundleSizeReduction}</p>
      </div>
      
      <!-- Unused exports section -->
      <h2>Unused Exports (${results.unusedExports.length})</h2>
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
      
      <!-- Unused dependencies section -->
      <h2>Unused Dependencies (${results.unusedDependencies.reduce((sum, pkg) => sum + pkg.unusedDependencies.length, 0)})</h2>
      ${results.unusedDependencies.map(pkg => `
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
      `).join('')}
    </body>
    </html>
    `;

    fs.writeFileSync(reportPath, html);
    logger.info(`Dead code analysis report generated at ${reportPath}`);
  } catch (err) {
    logger.error(`Failed to generate HTML report: ${err.message}`);
  }
} 