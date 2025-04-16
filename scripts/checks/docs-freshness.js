/**
 * @fileoverview Documentation Freshness Checker
 * Analyzes documentation files (.md) against linked source code files
 * to identify potentially stale documentation based on Git history.
 * @module checks/docs-freshness
 */

/* globals global */ // Allow 'global' for standalone mock
/* eslint-env node */ // Specify Node.js environment for ESLint
import process from 'node:process';
import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, relative } from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
// Assuming fileExists is exported from file-utils.js
// If not, you might need `fs.access` check directly
import { fileExists } from '../core/file-utils.js';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DOCS_DIR = 'docs';
const DEFAULT_SRC_DIR = 'packages'; // Includes packages and potentially scripts
const DEFAULT_MAX_STALENESS_DAYS = 90; // 3 months

/**
 * @typedef {object} DocFreshnessOptions
 * @property {string} [docsDir] - Directory containing documentation files.
 * @property {string} [srcDir] - Root directory containing source code packages/scripts.
 * @property {number} [maxStalenessDays] - Maximum days a doc can go without updates.
 * @property {string[]} [ignorePatterns] - Glob patterns to ignore.
 */

/**
 * @typedef {object} StaleDocResult
 * @property {string} file - Relative path to the stale document.
 * @property {string} lastUpdated - ISO string of the document's last commit date.
 * @property {number} daysSinceUpdate - Days since the document was last updated.
 * @property {'exceeded_max_staleness' | 'code_updated_since'} reason - Why the document is considered stale.
 */

/**
 * @typedef {object} DocFreshnessReport
 * @property {boolean} success - Whether the check passed (no stale docs or errors).
 * @property {number} totalDocsChecked - Total number of documentation files analyzed.
 * @property {StaleDocResult[]} staleDocuments - Array of stale document details.
 * @property {string[]} errors - Array of errors encountered during the check.
 * @property {number} duration - Duration of the check in milliseconds.
 * @property {{docsDir: string, srcDir: string, maxStalenessDays: number}} config - Configuration used for the check.
 */

/**
 * Gets the last Git commit dates for multiple files efficiently.
 * Uses a single `git log` command with null delimiters for robustness.
 * @param {string[]} filePaths - Array of absolute paths to the files.
 * @returns {Promise<Map<string, Date|null>>} - Map of file path -> last commit Date object, or null if history not found.
 */
async function getGitLastCommitDatesBatch(filePaths) {
  const dateMap = new Map();
  if (filePaths.length === 0) return dateMap;

  // Git command to get last commit timestamp (%ct) and filename (%N) for multiple files
  // Uses null characters as delimiters for safety with weird filenames
  const command = `git log --format=format:"%ct %N" --name-only -z -- ${filePaths.map(p => `"${p.replace(/\\/g, '/')}"`).join(' ')}`;

  try {
    // Increase maxBuffer if dealing with many files
    const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' });

    // Parse the null-delimited output
    const entries = stdout.trim().split('\0');
    let currentTimestamp = null;
    for (const entry of entries) {
      if (!entry) continue;
      // Check if the line contains a timestamp (start of a commit log entry)
      const timestampMatch = entry.match(/^(\d+)\s/);
      if (timestampMatch) {
         currentTimestamp = parseInt(timestampMatch[1], 10);
      } else if (currentTimestamp) {
         // This entry is a filename associated with the current timestamp
         const filePath = resolve(process.cwd(), entry.trim()); // Resolve relative to cwd
         // Only store the latest timestamp for each file
         if (!dateMap.has(filePath)) {
           dateMap.set(filePath, new Date(currentTimestamp * 1000));
         }
      }
    }
    
    // Add null for files that weren't in the git output (maybe not committed)
    filePaths.forEach(fp => {
      if (!dateMap.has(fp)) {
        dateMap.set(fp, null);
      }
    });
    
    return dateMap;
  } catch (error) {
    logger.error(`Error getting batch Git commit dates: ${error.message}`);
    logger.debug(`Failed Git command: ${command.substring(0, 500)}...`);
    // Fallback: return map with null for all files
    filePaths.forEach(fp => dateMap.set(fp, null));
    return dateMap;
  }
}

/**
 * Finds linked source code files within a documentation file.
 * Uses regex to find markdown links pointing to likely source files (.ts, .js, etc.)
 * within specified directories (packages, scripts).
 * @param {string} docFilePath - Absolute path to the documentation file.
 * @param {string} srcDir - Absolute path to the source directory root.
 * @returns {Promise<string[]>} - Array of absolute paths to existing linked code files.
 */
async function findLinkedCodeFiles(docFilePath, srcDir) {
  const linkedFiles = [];
  try {
    const content = await fs.readFile(docFilePath, 'utf-8');
    // Regex adjusted for JS, matches relative paths likely pointing to source code
    const linkRegex = /\(([^)]+\/(?:src|lib|core|checks|auth|build|firebase|github|reports|test-types|typescript|workflow)\/[^)]+\.(?:ts|tsx|js|jsx))\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const relativePath = match[1];
      const absolutePath = resolve(dirname(docFilePath), relativePath);

      // Check if it's within packages or scripts directory and exists
      if (absolutePath.startsWith(resolve(srcDir)) || absolutePath.startsWith(resolve(process.cwd(), 'scripts'))) {
        if (await fileExists(absolutePath)) {
          linkedFiles.push(absolutePath);
        } else {
          logger.debug(`Linked file does not exist: ${relative(process.cwd(), absolutePath)} (referenced in ${relative(process.cwd(), docFilePath)})`);
        }
      }
    }
  } catch (error) {
    // @ts-expect-error - Allow checking error properties
    logger.warn(`Error reading or parsing doc file ${relative(process.cwd(), docFilePath)} for links: ${error.message}`);
  }
  return linkedFiles;
}

/**
 * Checks documentation freshness against source code changes.
 * Fetches Git history for docs and linked code files in a batch,
 * then compares last commit dates to identify potentially stale docs.
 * @param {DocFreshnessOptions} [options={}] - Configuration options.
 * @returns {Promise<DocFreshnessReport>} - Report object containing analysis results.
 */
export async function checkDocsFreshness(options = {}) {
  const startTime = Date.now();
  const config = {
    docsDir: resolve(options.docsDir || DEFAULT_DOCS_DIR),
    srcDir: resolve(options.srcDir || DEFAULT_SRC_DIR),
    maxStalenessDays: options.maxStalenessDays || DEFAULT_MAX_STALENESS_DAYS,
    ignorePatterns: options.ignorePatterns || [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/temp/**',
      '**/.vitepress/cache/**',
      '**/seed/**'
    ],
  };

  logger.info('Starting Documentation Freshness Check...');
  logger.info(`Config: Docs=${relative(process.cwd(), config.docsDir)}, Src=${relative(process.cwd(), config.srcDir)}, Max Staleness=${config.maxStalenessDays} days`);

  /** @type {DocFreshnessReport} */
  const report = {
    success: true,
    totalDocsChecked: 0,
    staleDocuments: [],
    errors: [],
    duration: 0,
    config,
  };

  // Ensure fileExists utility is available
  if (typeof fileExists !== 'function') {
    report.errors.push('fileExists utility function is not available.');
    report.success = false;
    report.duration = Date.now() - startTime;
    logger.error('Essential utility fileExists is missing.');
    return report;
  }

  try {
    const { glob } = await import('glob');
    const docFiles = await glob(`${config.docsDir}/**/*.md*`, {
      ignore: config.ignorePatterns,
      nodir: true,
      absolute: true,
      windowsPathsNoEscape: true
    });

    report.totalDocsChecked = docFiles.length;
    logger.info(`Found ${docFiles.length} documentation files to check.`);

    if (docFiles.length === 0) {
      logger.warn(`No documentation files found in ${relative(process.cwd(), config.docsDir)}. Skipping freshness check.`);
      report.duration = Date.now() - startTime;
      return report;
    }

    // --- Batch Git Date Fetching --- 
    // 1. Find all potential code files linked across *all* docs first
    let allLinkedCodeFiles = new Set();
    for (const docFile of docFiles) {
       const linked = await findLinkedCodeFiles(docFile, config.srcDir);
       linked.forEach(file => allLinkedCodeFiles.add(file));
    }
    const filesToGetDatesFor = [...docFiles, ...Array.from(allLinkedCodeFiles)];
    logger.info(`Fetching Git history for ${filesToGetDatesFor.length} unique files...`);
    const commitDateMap = await getGitLastCommitDatesBatch(filesToGetDatesFor);
    logger.info('Git history fetched.');
    // --- End Batch Fetching --- 

    const analysisPromises = docFiles.map(async (docFile) => {
      const relativeDocPath = relative(process.cwd(), docFile);
      logger.debug(`Analyzing doc: ${relativeDocPath}`);
      const docLastUpdated = commitDateMap.get(docFile);

      if (!docLastUpdated) {
        logger.warn(`Skipping freshness check for ${relativeDocPath} (Could not get Git history).`);
        return null;
      }

      const daysSinceDocUpdate = (Date.now() - docLastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceDocUpdate > config.maxStalenessDays) {
        logger.warn(`Stale doc (general): ${relativeDocPath} - Last updated ${daysSinceDocUpdate.toFixed(0)} days ago.`);
        /** @type {StaleDocResult} */
        const staleResult = {
          file: relativeDocPath,
          lastUpdated: docLastUpdated.toISOString(),
          daysSinceUpdate: Math.floor(daysSinceDocUpdate),
          reason: 'exceeded_max_staleness',
        };
        return staleResult;
      }

      const linkedCodeFiles = await findLinkedCodeFiles(docFile, config.srcDir);
      if (linkedCodeFiles.length > 0) {
        logger.debug(`Found ${linkedCodeFiles.length} linked code files in ${relativeDocPath}`);
        for (const codeFile of linkedCodeFiles) {
          const codeLastUpdated = commitDateMap.get(codeFile);
          if (codeLastUpdated && codeLastUpdated > docLastUpdated) {
            const relativeCodePath = relative(process.cwd(), codeFile);
            logger.warn(`Stale doc (code changed): ${relativeDocPath} - Linked code file ${relativeCodePath} updated more recently.`);
            /** @type {StaleDocResult} */
            const staleResult = {
              file: relativeDocPath,
              lastUpdated: docLastUpdated.toISOString(),
              daysSinceUpdate: Math.floor(daysSinceDocUpdate),
              reason: 'code_updated_since',
            };
            return staleResult;
          }
        }
      } else {
        logger.debug(`No source code links found in ${relativeDocPath}`);
      }
      return null;
    });

    const results = await Promise.all(analysisPromises);
    results.forEach(result => {
      if (result) {
        report.staleDocuments.push(result);
        report.success = false;
      }
    });

  } catch (error) {
    // @ts-expect-error - Allow checking error properties
    logger.error(`Error during documentation freshness check: ${error.message}`);
    // @ts-expect-error - Allow checking error properties
    report.errors.push(error.message);
    report.success = false;
  }

  report.duration = Date.now() - startTime;
  logger.info(`Documentation Freshness Check finished in ${report.duration / 1000}s. Stale documents found: ${report.staleDocuments.length}.`);
  if (!report.success && report.staleDocuments.length === 0 && report.errors.length > 0) {
    logger.error('Check failed due to errors during processing.');
  } else if (!report.success) {
    logger.warn('Potential documentation staleness detected. Review the report.');
  } else {
    logger.success('Documentation freshness check passed.');
  }

  return report;
}

/**
 * Example usage (if run directly)
 */
async function runStandalone() {
  // Mock fileExists if necessary for standalone run
  if (typeof fileExists !== 'function') {
    // @ts-expect-error - Allow mocking global
    global.fileExists = async (filePath) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    };
    logger.warn('Mocking fileExists function for standalone run.');
  }

  const result = await checkDocsFreshness({});

  logger.info('\n--- Documentation Freshness Report ---');
  logger.info(`Success: ${result.success}`);
  logger.info(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  logger.info(`Total Docs Checked: ${result.totalDocsChecked}`);
  logger.info(`Stale Documents Found: ${result.staleDocuments.length}`);

  if (result.staleDocuments.length > 0) {
    logger.info('\nStale Documents:');
    result.staleDocuments.forEach(doc => {
      logger.info(` - ${doc.file} (Last Update: ${new Date(doc.lastUpdated).toLocaleDateString()}, Reason: ${doc.reason})`);
    });
  }

  if (result.errors.length > 0) {
    logger.error('\nErrors encountered:');
    result.errors.forEach(err => logger.error(` - ${err}`));
  }
  logger.info('------------------------------------');
}

// Check if the script is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStandalone().catch(err => {
    logger.error('Standalone execution failed:', err);
    process.exit(1);
  });
} 