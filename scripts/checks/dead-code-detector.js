/**
 * Dead Code Detector
 * 
 * Analyzes the codebase to identify unused code, imports, and CSS.
 * This helps reduce bundle size by identifying removable code.
 */

/* global process, console */

import fs from 'node:fs';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { logger } from '../core/logger.js';
import { globSync } from 'glob';

// Use the full path for glob import to ensure it's found
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default patterns for files to include in the analysis
// (Knip uses its config file, these aren't directly used anymore)

// Default patterns for files to exclude from the analysis
// (Knip uses its config file, these aren't directly used anymore)
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
 * Run Knip analysis for the entire project
 * @returns {Promise<Object>} Results of the analysis
 */
async function runKnipAnalysis() {
  return new Promise((resolve) => {
    logger.info('Running Knip analysis...');
    
    // Use NODE_OPTIONS for memory limit if needed, similar to depcheck
    const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
    // Command: run knip with JSON reporter and no progress indicator
    const command = `npx knip --reporter json --no-progress`; 
    
    exec(command, { 
      cwd: process.cwd(), // Run from project root
      encoding: 'utf8',
      env: env,
      maxBuffer: 20 * 1024 * 1024 // Increased buffer for potentially large JSON output
    }, (error, stdout, stderr) => {
      let knipResult = {};
      let parsingError = null;
      let executionError = null;

      // Knip exits with non-zero code if issues are found.
      // We capture stdout even if there's an error, as it contains the JSON report.
      if (stdout) {
          try {
              knipResult = JSON.parse(stdout);
          } catch (parseErr) {
              logger.error(`Failed to parse Knip JSON output: ${parseErr.message}`);
              logger.debug(`Raw Knip stdout:\n${stdout}`);
              parsingError = { 
                  message: `Failed to parse Knip JSON output`,
                  details: { stdout: stdout, rawError: parseErr.message }
              };
              // Treat parsing failure as an execution error for reporting
              executionError = parsingError; 
          }
      }

      // Check for actual execution errors (command not found, fatal errors)
      // Exclude exit code 1, which Knip uses to indicate findings.
      if (error && error.code !== 1) {
          logger.error(`Knip command execution failed: Exit code ${error.code}`);
          if (stderr) logger.error(`Knip stderr:\n${stderr}`);
           executionError = {
               message: `Knip command failed (Exit Code: ${error.code})`,
               details: { stderr: stderr || null, rawError: error.message, exitCode: error.code }
           };
      } else if (!stdout && !error) {
          // Handle case where knip runs successfully with no output (no issues found)
          logger.info('Knip ran successfully, no issues found.');
      } else if (error && error.code === 1 && !parsingError) {
          logger.warn('Knip found issues.');
          // This is not a failure of the tool itself, so no executionError
      } else if (error && error.code === 1 && parsingError) {
          // If findings were expected (exit code 1) but parsing failed, it's an execution error
          logger.error('Knip exited with findings, but JSON parsing failed.');
          executionError = parsingError;
      }

      // Structure the results
      const finalResults = {
        success: !executionError, // Analysis succeeded if no execution/parsing errors
        hasIssues: (error && error.code === 1 && !parsingError), // True if Knip exited with code 1 (found issues)
        issues: knipResult, // The raw parsed JSON output from Knip
        error: executionError // Contains details if execution/parsing failed
      };
      
      resolve(finalResults);
    });
  });
}

/**
 * Estimate bundle size impact of dead code
 * @param {Object} analysisResults - Knip analysis results object
 * @returns {string} Estimated bundle size reduction
 */
function estimateBundleSizeImpact(analysisResults) {
  // Knip doesn't directly estimate size, so we provide a count based summary.
  // Access the issues from the parsed JSON stored in analysisResults.issues
  const issues = analysisResults.issues || {};
  let totalIssues = 0;

  // Sum counts from different categories Knip reports
  Object.values(issues).forEach(categoryIssues => {
      if (Array.isArray(categoryIssues)) {
          totalIssues += categoryIssues.length;
      }
  });

  if (totalIssues === 0) {
      return 'No unused code identified.';
  }
  
  return `Identified ${totalIssues} potential issues (unused exports, dependencies, files, etc.).`;
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
 * Main function to analyze dead code
 * @param {Object} options - Configuration options
 * @param {string[]} [options.includePatterns] - Glob patterns for files to include
 * @param {string[]} [options.excludePatterns] - Glob patterns for files to exclude
 * @param {string} [options.reportPath] - Path to save the HTML report
 * @returns {Promise<Object>} Consolidated analysis results
 */
export async function analyzeDeadCode(options = {}) {
  logger.info('Starting dead code analysis...');
  const startTime = Date.now();

  // Knip configuration is now handled by knip.ts
  // We just run the single analysis function

  const knipResults = await runKnipAnalysis();

  const duration = Date.now() - startTime;
  logger.info(`Dead code analysis completed in ${duration}ms`);

  // Consolidate results into the expected format for the workflow
  const finalResults = {
    checkName: 'deadCode',
    success: knipResults.success, // Did the tool run without fatal errors?
    status: knipResults.success ? (knipResults.hasIssues ? 'warning' : 'success') : 'error',
    message: '', // We'll construct this based on findings
    error: knipResults.error ? (knipResults.error.message || 'Knip execution failed') : null,
    details: { // Store the raw knip output for potential details display
      knipOutput: knipResults.issues,
      analysisDuration: duration,
      estimatedImpact: estimateBundleSizeImpact(knipResults) // Use updated impact estimate
    },
    metrics: {
        duration: duration,
        issuesFound: knipResults.hasIssues
    }
  };

  // Construct a summary message
  if (!knipResults.success) {
    finalResults.message = 'Knip analysis failed to execute.';
  } else if (knipResults.hasIssues) {
    let issueCount = 0;
    Object.values(knipResults.issues).forEach(category => {
        if (Array.isArray(category)) issueCount += category.length;
    });
    finalResults.message = `Knip found ${issueCount} potential issues (unused dependencies, exports, files, etc.). See logs or report for details.`;
    finalResults.status = 'warning'; // Report issues as a warning, not a failure
  } else {
    finalResults.message = 'No unused code or dependencies found by Knip.';
    finalResults.status = 'success';
  }

  // Handle report generation if requested (needs adapting for knip output)
  if (options.reportPath) {
    logger.warn('HTML report generation for Knip output is not yet fully implemented.');
    // generateHtmlReport(finalResults, options.reportPath); // Pass structured results
  }

  return finalResults;
}

/**
 * Generates an HTML report from the analysis results
 * NOTE: This needs significant updates to visualize Knip's output structure.
 * @param {Object} results - Consolidated analysis results
 * @param {string} reportPath - Path to save the report
 */
function generateHtmlReport(results, reportPath) {
  logger.info(`Generating dead code analysis report at: ${reportPath}`);
  
  let reportContent = `
<html>
<head>
  <title>Dead Code Analysis Report</title>
  <style>
    body { font-family: sans-serif; }
    .section { margin-bottom: 20px; border: 1px solid #ccc; padding: 15px; border-radius: 5px; }
    .section h2 { margin-top: 0; }
    .error { color: red; font-weight: bold; }
    .warning { color: orange; }
    .success { color: green; }
    ul { list-style: none; padding-left: 0; }
    li { margin-bottom: 5px; font-family: monospace; }
    pre { background-color: #f4f4f4; padding: 10px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Dead Code Analysis Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <p>Analysis Duration: ${results.details?.analysisDuration || 'N/A'}ms</p>
  <p>Status: <span class="${results.status}">${results.status.toUpperCase()}</span></p>
  <p>Summary: ${results.message || '-'}</p>
  ${results.error ? `<p class="error">Execution Error: ${results.error}</p>` : ''}
`;

  // --- Display Knip Results --- 
  reportContent += `<div class="section"><h2>Knip Findings</h2>`;
  if (results.details?.knipOutput && Object.keys(results.details.knipOutput).length > 0) {
    reportContent += `<pre>${JSON.stringify(results.details.knipOutput, null, 2)}</pre>`;
  } else if (!results.error) {
    reportContent += `<p class="success">No issues found by Knip.</p>`;
  } else {
     reportContent += `<p class="warning">Could not display Knip results due to execution error.</p>`;
  }
   reportContent += `</div>`;

  // --- Original Sections (Commented out or adapted) ---
  // Similar sections for unused exports, dependencies, files, etc. would need
  // to be generated by parsing results.details.knipOutput based on Knip's JSON structure.
  // Example:
  // if (results.details?.knipOutput?.dependencies?.length > 0) {
  //   reportContent += `<div class="section"><h2>Unused Dependencies</h2><ul>`;
  //   results.details.knipOutput.dependencies.forEach(dep => {
  //     reportContent += `<li>${dep.name} (in ${dep.package})</li>`; // Adjust based on actual structure
  //   });
  //   reportContent += `</ul></div>`;
  // }
  
  reportContent += `
</body>
</html>
  `;

  try {
    fs.writeFileSync(reportPath, reportContent, 'utf8');
    logger.info(`Report saved successfully to ${reportPath}`);
  } catch (error) {
    logger.error(`Failed to write dead code report: ${error.message}`);
  }
}

// Example usage if run directly (optional)
// if (import.meta.url === `file://${process.argv[1]}`) {
//   analyzeDeadCode({ reportPath: 'dead-code-report.html' })
//     .then(results => {
//       console.log('\n--- Analysis Summary ---');
//       console.log(`Status: ${results.status}`);
//       console.log(`Message: ${results.message}`);
//       if (results.error) {
//         console.error(`Error: ${results.error}`);
//       }
//       // console.log('Raw Results:', JSON.stringify(results, null, 2));
//     })
//     .catch(error => {
//       console.error('Unhandled error during dead code analysis:', error);
//     });
// } 