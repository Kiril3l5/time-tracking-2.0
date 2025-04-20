/**
 * Documentation Freshness & Link Checker (Git-based)
 * 
 * Validates documentation based on Git changes and link validity.
 *
 * Features:
 * - Validates internal relative links in changed documentation files
 * - Identifies source code changes and suggests related docs for review
 * - Uses git diff for relevance and performance
 * 
 * @module checks/doc-freshness
 */

import fs from 'fs/promises';
import path from 'path';
import * as glob from 'glob';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { ErrorAggregator, ValidationError } from '../core/error-handler.js';
import { isCI, getEnvironmentType } from '../core/environment.js';
import { getCurrentBranch } from '../workflow/branch-manager.js'; // Import function to get current branch
import { fileURLToPath } from 'url'; // Added missing import

/* global process */

// --- Configuration --- 
// Define source file extensions
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
// Define documentation file extensions/patterns
const DOC_PATTERNS = ['**/*.md']; // Keep it simple for now
// Define base branch for comparison (usually main or master)
const BASE_BRANCH = 'main'; 
// --- End Configuration ---

/**
 * Check if a file exists
 * @async
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} Whether the file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get files changed between the current branch and the base branch.
 * @async
 * @returns {Promise<string[]>} List of changed file paths relative to repo root.
 */
async function getChangedFiles() {
    const currentBranch = getCurrentBranch();
    if (!currentBranch) {
        logger.warn('Could not determine current branch for git diff.');
        return [];
    }

    // Ensure the base branch remote tracking reference is up-to-date locally
    logger.info(`Fetching base branch ${BASE_BRANCH} from origin...`);
    const fetchCmd = `git fetch origin ${BASE_BRANCH}`;
    const fetchResult = await commandRunner.runCommandAsync(fetchCmd, { stdio: 'pipe', ignoreError: true });
    if (!fetchResult.success) {
        logger.warn(`Failed to fetch ${BASE_BRANCH} from origin. Diff might be inaccurate. Error: ${fetchResult.error || 'Unknown fetch error'}`);
    }

    // Use merge-base to find common ancestor using the remote tracking ref
    const mergeBaseCmd = `git merge-base origin/${BASE_BRANCH} HEAD`;
    const mergeBaseResult = await commandRunner.runCommandAsync(mergeBaseCmd, { stdio: 'pipe', ignoreError: true });
    
    if (!mergeBaseResult.success || !mergeBaseResult.output) {
        logger.warn(`Could not find merge base between origin/${BASE_BRANCH} and HEAD. Falling back to direct diff against origin/${BASE_BRANCH}.`);
        const diffCmdFallback = `git diff --name-only origin/${BASE_BRANCH}...HEAD`;
        const diffResultFallback = await commandRunner.runCommandAsync(diffCmdFallback, { stdio: 'pipe', ignoreError: true });
        if (!diffResultFallback.success || !diffResultFallback.output) {
            logger.error(`Failed to get changed files using git diff origin/${BASE_BRANCH}...HEAD.`);
            return [];
        }
        return diffResultFallback.output.split('\n').filter(Boolean);
    } else {
        const mergeBaseCommit = mergeBaseResult.output.trim();
        const diffCmd = `git diff --name-only ${mergeBaseCommit}...HEAD`;
        const diffResult = await commandRunner.runCommandAsync(diffCmd, { stdio: 'pipe', ignoreError: true });
        if (!diffResult.success || !diffResult.output) {
            logger.error(`Failed to get changed files using git diff ${mergeBaseCommit}...HEAD.`);
            return [];
        }
        return diffResult.output.split('\n').filter(Boolean);
    }
}

/**
 * Extract links from markdown content
 * @param {string} content - Markdown content
 * @returns {Array<{text: string, url: string, line: number}>} Extracted links
 */
function extractLinks(content) {
  const links = [];
  const lines = content.split('\n');
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const referenceStyleLinkRegex = /\[([^\]]+)\]:\s*(.+)/g;
  
  lines.forEach((line, idx) => {
    let match;
    while ((match = markdownLinkRegex.exec(line)) !== null) {
      links.push({ text: match[1], url: match[2], line: idx + 1 });
    }
    markdownLinkRegex.lastIndex = 0;
    while ((match = referenceStyleLinkRegex.exec(line)) !== null) {
      links.push({ text: match[1], url: match[2].trim(), line: idx + 1 });
    }
    referenceStyleLinkRegex.lastIndex = 0;
  });
  
  return links;
}

/**
 * Check if relative links in markdown content are valid
 * @async
 * @param {string} filePath - Path to the markdown file
 * @param {string} content - Markdown content
 * @param {ErrorAggregator} errorTracker - Error tracker for reporting issues
 * @returns {Promise<{valid: boolean, count: number, broken: Array}>} Validation results
 */
async function validateLinks(filePath, content, errorTracker) {
  const links = extractLinks(content);
  const baseDir = path.dirname(filePath);
  const broken = [];
  
  for (const link of links) {
    // Only check relative file links
    if (link.url.startsWith('#') || link.url.startsWith('http:') || link.url.startsWith('https:') || path.isAbsolute(link.url)) {
      continue;
    }
    
    // Resolve the relative path
    const targetPath = path.resolve(baseDir, link.url);
    
    // Check if the target file/directory exists
    const exists = await fileExists(targetPath);
    
    if (!exists) {
      const brokenLinkInfo = {
        text: link.text,
        url: link.url,
        line: link.line,
        resolvedPath: targetPath // Add resolved path for debugging
      };
      broken.push(brokenLinkInfo);
      
      errorTracker.addWarning(new ValidationError(
        `Broken link in ${filePath}:${link.line}: Link '[${link.text}](${link.url})' points to non-existent path '${targetPath}'`,
        'doc-links',
        null,
        `Verify the relative path '${link.url}' or create the target file/directory.`
      ));
    }
  }
  
  return {
    valid: broken.length === 0,
    count: links.length,
    broken
  };
}

/**
 * Check documentation based on Git changes.
 * Validates links in changed Markdown files.
 * Flags potentially stale docs if related source code changed but docs didn't.
 * 
 * @async
 * @param {Object} options - Check options
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {boolean} [options.strictMode=false] - Treat warnings as errors
 * @param {boolean} [options.silent=false] - Suppress all logging
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for reporting issues
 * @returns {Promise<{success: boolean, issues: number, checkedFiles: number, staleDocsSuggestions: Array}>} Check results
 */
export async function checkDocumentation(options = {}) {
  const {
    verbose = false,
    strictMode = false,
    silent = false,
    errorTracker = new ErrorAggregator()
  } = options;

  let issueCount = 0;
  let checkedFileCount = 0;
  let staleDocsSuggestions = [];
  let changedFiles = [];

  try {
    // 1. Get changed files from Git
    changedFiles = await getChangedFiles();
    if (changedFiles.length === 0) {
        if (!silent) logger.info('No changed files detected relative to base branch. Skipping doc freshness checks.');
        return { success: true, issues: 0, checkedFiles: 0, staleDocsSuggestions: [] };
    }
    if (verbose && !silent) logger.info(`Found ${changedFiles.length} changed files relative to ${BASE_BRANCH}.`);

    // 2. Separate changed source files and doc files
    const changedSourceFiles = changedFiles.filter(f => SOURCE_EXTENSIONS.some(ext => f.endsWith(ext)));
    const changedDocFiles = changedFiles.filter(f => 
        DOC_PATTERNS.some(pattern => glob.sync(f, { matchBase: true }).length > 0) && f.endsWith('.md')
    );

    if (verbose && !silent) {
        logger.info(`Changed source files: ${changedSourceFiles.length}`);
        logger.info(`Changed doc files: ${changedDocFiles.length}`);
    }

    // 3. Validate links only in *changed* documentation files
    if (changedDocFiles.length > 0) {
        if (!silent) logger.info(`Validating links in ${changedDocFiles.length} changed doc file(s)...`);
        for (const filePath of changedDocFiles) {
            checkedFileCount++;
            if (verbose && !silent) logger.info(`- Checking links in ${filePath}`);
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const linkResults = await validateLinks(filePath, content, errorTracker);
                if (!linkResults.valid) {
                    issueCount += linkResults.broken.length;
                    if (!silent) logger.warn(`  Found ${linkResults.broken.length} broken links in ${filePath}`);
                }
            } catch (error) {
                const errorMsg = `Failed to read or validate links in ${filePath}: ${error.message}`;
                 if (!silent) logger.error(errorMsg);
                errorTracker.addError(new ValidationError(errorMsg, 'doc-links', error));
                issueCount++;
            }
        }
    } else {
        if (!silent) logger.info('No changed documentation files found to check links.');
    }

    // 4. Suggest potentially stale docs based on changed source files
    // (Simple approach: if source changed but no docs changed, suggest checking all docs)
    // TODO: Implement more sophisticated mapping between source and docs later if needed
    if (changedSourceFiles.length > 0 && changedDocFiles.length === 0) {
        const suggestionMsg = `Source code changed (${changedSourceFiles.length} files) but no documentation files were modified in this branch. Consider reviewing relevant documentation.`;
        staleDocsSuggestions.push(suggestionMsg);
        // Record as a low-severity warning
        errorTracker.addWarning(new ValidationError(suggestionMsg, 'doc-freshness', null, 'Review related documentation', 'info'));
        // Note: This doesn't increment issueCount unless in strict mode maybe?
         if (strictMode && !isCI()) { issueCount++; } // Only count as issue in strict local runs
        if (!silent) logger.warn(suggestionMsg);
    } else if (changedSourceFiles.length > 0 && changedDocFiles.length > 0) {
        // Both changed, could suggest checking the *specific* changed docs for relevance
        const suggestionMsg = `${changedSourceFiles.length} source file(s) and ${changedDocFiles.length} doc file(s) changed. Ensure changed docs reflect code changes.`;
         staleDocsSuggestions.push(suggestionMsg);
        errorTracker.addWarning(new ValidationError(suggestionMsg, 'doc-freshness', null, 'Review changed documentation for accuracy', 'info'));
         if (!silent) logger.info(suggestionMsg);
    }

    if (verbose && !silent) {
      logger.info(`Documentation freshness check completed.`);
    }

  } catch (error) {
    // Catch any unexpected errors during the Git-based check
    if (!silent) logger.error(`Git-based documentation check failed: ${error.message}`);
    errorTracker.addError(new ValidationError(`Git-based documentation check failed`, 'doc-freshness', error));
    issueCount++;
  }

  // Determine final success status
  // Fail only if there are broken links (issueCount > 0 because of link validation)
  // or if strict mode is enabled and stale suggestions were made
  const shouldFail = issueCount > 0; // Broken links are always considered issues
  
  return {
    success: !shouldFail,
    issues: issueCount,
    checkedFiles: checkedFileCount,
    staleDocsSuggestions: staleDocsSuggestions
  };
}

// If run directly from the command line
if (import.meta.url.startsWith('file://') && process.argv[1] === fileURLToPath(import.meta.url)) {
  const errorTracker = new ErrorAggregator();
  
  (async () => {
    try {
      const result = await checkDocumentation({ 
        verbose: true,
        errorTracker,
        // Allow strict mode via CLI arg?
        strictMode: process.argv.includes('--strict') 
      });
      
      if (result.issues > 0) {
         errorTracker.logSummary();
      }

      logger.info(`Doc Check Result: Success=${result.success}, Issues=${result.issues}, Checked Files=${result.checkedFiles}`);
      if (result.staleDocsSuggestions.length > 0) {
        logger.info('Stale Doc Suggestions:');
        result.staleDocsSuggestions.forEach(s => logger.info(`- ${s}`));
      }

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      logger.error('Documentation freshness check failed');
      logger.error(error);
      process.exit(1);
    }
  })();
} 