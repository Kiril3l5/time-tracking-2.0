/**
 * @fileoverview Documentation Freshness Checker
 * Analyzes documentation files (.md) against linked source code files
 * to identify potentially stale documentation based on Git history.
 * @module checks/docs-freshness
 */

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
 * Gets the last Git commit date for a file.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<Date|null>} - The last commit date or null if not found/error.
 */
async function getGitLastCommitDate(filePath) {
  try {
    const quotedPath = `"${filePath.replace(/\/g, '/')}"`; // Use forward slashes and quote
    const { stdout } = await execPromise(`git log -1 --format=%ct -- ${quotedPath}`);
    const timestamp = parseInt(stdout.trim(), 10);
    if (isNaN(timestamp)) {
      logger.warn(`Could not parse Git timestamp for ${relative(process.cwd(), filePath)}. Output: ${stdout}`);
      return null;
    }
    return new Date(timestamp * 1000);
  } catch (error) {
    const relativePath = relative(process.cwd(), filePath);
    // @ts-ignore - Allow checking error properties
    logger.debug(`Git log command failed for ${relativePath}: ${error.message}. Code: ${error.code}, Signal: ${error.signal}`);
    // @ts-ignore
    if (error.stderr && error.stderr.includes('fatal: not a git repository')) {
      logger.error('Not a Git repository or Git is not available in PATH.');
    // @ts-ignore
    } else if (error.stderr && error.stderr.includes('does not have any commits')) {
      logger.warn(`File not committed yet: ${relativePath}`);
    } else {
      // Avoid overly verbose warnings
    }
    return null;
  }
}

/**
 * Finds linked source code files within a documentation file.
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
    // @ts-ignore
    logger.warn(`Error reading or parsing doc file ${relative(process.cwd(), docFilePath)} for links: ${error.message}`);
  }
  return linkedFiles;
}

/**
 * Checks documentation freshness against source code changes.
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

    const analysisPromises = docFiles.map(async (docFile) => {
      const relativeDocPath = relative(process.cwd(), docFile);
      logger.debug(`Analyzing doc: ${relativeDocPath}`);
      const docLastUpdated = await getGitLastCommitDate(docFile);

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
          const codeLastUpdated = await getGitLastCommitDate(codeFile);
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
    // @ts-ignore
    logger.error(`Error during documentation freshness check: ${error.message}`);
    // @ts-ignore
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
    // @ts-ignore
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

  console.log('\n--- Documentation Freshness Report ---');
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`Total Docs Checked: ${result.totalDocsChecked}`);
  console.log(`Stale Documents Found: ${result.staleDocuments.length}`);

  if (result.staleDocuments.length > 0) {
    console.log('\nStale Documents:');
    result.staleDocuments.forEach(doc => {
      console.log(` - ${doc.file} (Last Update: ${new Date(doc.lastUpdated).toLocaleDateString()}, Reason: ${doc.reason})`);
    });
  }

  if (result.errors.length > 0) {
    console.error('\nErrors encountered:');
    result.errors.forEach(err => console.error(` - ${err}`));
  }
  console.log('------------------------------------');
}

// Check if the script is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStandalone().catch(err => {
    console.error('Standalone execution failed:', err);
    process.exit(1);
  });
} 