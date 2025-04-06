// Import required dependencies
import fs from 'fs'; // Import the standard fs module (includes sync methods)
import path from 'path';
import process from 'process';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { promises as fsPromises } from 'fs';
import getWorkflowState from './workflow-state.js';

/**
 * Clean the output directory
 * 
 * @returns {Promise<boolean>} Success result
 */
export async function cleanOutputDir() {
  try {
    const outputDir = path.resolve(process.cwd(), 'dist');
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    return true;
  } catch (error) {
    logger.error(`Failed to clean output directory: ${error.message}`);
    return false;
  }
}

/**
 * Run TypeScript type checking
 * 
 * @returns {Promise<Object>} Type check result
 */
export async function runTypeCheck() {
  try {
    const result = await commandRunner.runCommandAsync('npx tsc --noEmit', { stdio: 'pipe' });
    
    if (!result.success) {
      // Parse errors from stderr
      const errors = result.error
        .split('\n')
        .filter(line => line.includes('error TS'))
        .map(line => {
          const match = line.match(/(.+)\((\d+),(\d+)\): error TS\d+: (.+)/);
          if (match) {
            return {
              file: match[1],
              line: parseInt(match[2], 10),
              column: parseInt(match[3], 10),
              message: match[4]
            };
          }
          return { message: line };
        });
      
      return {
        success: false,
        errors
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    logger.error(`Type check failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Build a package with specified options
 * 
 * @param {Object} options - Build options
 * @param {string} options.target - Target environment (e.g. 'production', 'staging')
 * @param {boolean} [options.minify=true] - Whether to minify the output
 * @param {boolean} [options.sourceMaps=false] - Whether to generate source maps
 * @param {boolean} [options.typeCheck=true] - Whether to run type checking
 * @param {boolean} [options.clean=true] - Whether to clean the output directory first
 * @param {string} [options.configPath] - Path to custom build config
 * @returns {Promise<Object>} Build result
 */
export async function buildPackage(options = {}) {
  const { target, minify = true, sourceMaps = false, configPath } = options;
  
  const startTime = Date.now();
  
  // Validate target
  if (!target) {
    return { success: false, error: 'Target environment is required for build' };
  }
  
  try {
    // Clean if requested
    await cleanOutputDir();
    
    // Type check if requested
    const typeCheckResult = await runTypeCheck();
    if (!typeCheckResult.success) {
      return {
        success: false,
        error: 'Type check failed',
        typeCheckErrors: typeCheckResult.errors
      };
    }
    
    // Determine package name (needed if buildPackage is used directly, defaults for safety)
    // This function might need rework if used standalone, as packageName isn't passed in.
    // Assuming a default or context is available elsewhere if this function is called.
    const packageName = options.package || 'default'; // Adjust as needed

    // Construct the command to run the package-specific build script via pnpm
    const buildCommand = `pnpm run build:${packageName}`;
    logger.info(`(buildPackage) Executing package build script: ${buildCommand}`);

    // Execute the pnpm run script command
    const buildResult = await commandRunner.runCommandAsync(buildCommand, {
      stdio: 'pipe', // Capture output
      captureOutput: true,
      timeout: options.timeout || 180000, // Use provided timeout or default
      shell: true, // May be needed for pnpm run interaction
      forceKillOnTimeout: true
    });
    
    return {
      ...buildResult,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Build a package with workflow tracking integration
 * 
 * @param {Object} options - Build options
 * @param {string} options.target - Target environment (e.g. 'production', 'staging')
 * @param {boolean} [options.minify=true] - Whether to minify the output
 * @param {boolean} [options.sourceMaps=false] - Whether to generate source maps
 * @param {boolean} [options.typeCheck=true] - Whether to run type checking
 * @param {boolean} [options.clean=true] - Whether to clean the output directory first
 * @param {string} [options.configPath] - Path to custom build config
 * @param {Function} [options.recordWarning] - Function to record warnings in workflow
 * @param {Function} [options.recordStep] - Function to record steps in workflow
 * @param {string} [options.phase='Build'] - Current workflow phase
 * @returns {Promise<Object>} Build result
 */
export async function buildPackageWithWorkflowTracking(options = {}) {
  const { 
    package: packageName = 'admin',
    target = 'development',
    minify = true,
    sourceMaps = false, 
    recordWarning = null,
    phase = 'Build',
    timeout = 180000,  // 3 minute timeout
  } = options;
  
  try {
    // Log step
    logger.debug(`Building package ${packageName} (${target})`);
    
    // Execute vite build directly, setting CWD to the package directory
    const viteExecutablePath = path.join(process.cwd(), 'node_modules', '.bin', 'vite');
    const packageDir = path.join(process.cwd(), 'packages', packageName);
    // Check if vite executable exists (add .cmd for Windows compatibility if needed)
    const viteCommand = process.platform === 'win32' ? `${viteExecutablePath}.cmd` : viteExecutablePath;
    if (!fs.existsSync(viteCommand)) {
        throw new Error(`Vite executable not found at ${viteCommand}`);
    }
    const buildCommandArgs = ['build']; // Arguments for vite

    logger.info(`Executing command: ${viteCommand} ${buildCommandArgs.join(' ')} in CWD: ${packageDir}`);

    // Execute the pnpm run script command
    const result = await commandRunner.runCommandAsync(`${viteCommand} ${buildCommandArgs.join(' ')}`, { // Pass full command string
      stdio: 'pipe', // Capture output
      captureOutput: true,
      timeout,
      cwd: packageDir, // <<< Run command IN the package directory
      shell: false, // <<< No shell needed for direct execution
      forceKillOnTimeout: true
    });
    
    if (!result.success) {
      if (recordWarning) {
        recordWarning(`Build failed for ${packageName}: ${result.error}`, phase, `${packageName} Build`);
      }
      
      throw new Error(`Build failed for package "${packageName}". Error: ${result.error}`);
    }
    
    // --- Basic Vite Output Parsing --- START ---
    let viteWarnings = [];
    let viteTotalSize = 0;
    let viteFileCount = 0;

    // Extract warnings from stderr (basic check)
    if (result.error) {
      viteWarnings = result.error.split(/\r?\n/).filter(line => line.trim().startsWith('(!)')); // Handle different line endings
    }

    // Extract file sizes and count from stdout (very basic parsing)
    if (result.output) {
      // Regex to capture lines like: dist/assets/index-Dxkqh5d1.css   59.31 kB │ gzip: 21.07 kB
      // Note: / and . don't need escaping inside []
      const fileRegex = /([\w\-/.]+\.[a-z0-9]+)\s+([\d.]+)\s+kB/gi;
      let match;
      const lines = result.output.split(/\r?\n/);

      // Use regex matching instead of simple line iteration
      while ((match = fileRegex.exec(result.output)) !== null) {
        const filePath = match[1].trim();
        const fileSizeKB = parseFloat(match[2]);

        // Simple check to avoid double counting potential intermediate lines
        if (filePath.startsWith('dist/')) { 
            viteFileCount++;
            viteTotalSize += fileSizeKB * 1024; // Convert kB to bytes
            logger.debug(`[Vite Parse] Found: ${filePath}, Size: ${fileSizeKB} kB`);
        }
      }

      // Fallback or additional check if regex missed files (e.g., for different formatting)
      if (viteFileCount === 0) {
        lines.forEach(line => {
          // Basic fallback check
          const sizeMatch = line.match(/\s+([\d.]+)\s+kB/);
          if (sizeMatch && line.includes('dist/')) { // Ensure it looks like a final dist file
            viteFileCount++;
            viteTotalSize += parseFloat(sizeMatch[1]) * 1024; // Convert kB to bytes
          }
        });
      }
    }
    // --- Basic Vite Output Parsing --- END ---

    logger.debug(`[Vite Parse - ${packageName}] Final Count: ${viteFileCount}, Final Size: ${viteTotalSize} bytes`);

    // Handle successful build
    if (recordWarning) {
      // Record build warnings from stderr
      viteWarnings.forEach(warning => {
        recordWarning(`Build warning: ${warning}`, phase, `${packageName} Build`);
      });

      // Record build output stats
      recordWarning(`Build output: ${viteFileCount} files, ${(viteTotalSize / 1024).toFixed(2)}KB total`, phase, `${packageName} Build`, 'info');
    }
    
    return {
      success: true,
      packageName,
      warnings: viteWarnings, // Pass parsed warnings
      totalSize: viteTotalSize, // Pass parsed size
      fileCount: viteFileCount, // Pass parsed count
      duration: result.duration // Keep original duration
    };
  } catch (error) {
    // Handle unexpected errors
    if (recordWarning) {
      recordWarning(`Unexpected build error: ${error.message}`, phase, `${packageName} Build`);
    }
    
    throw error;
  }
}

/**
 * Get historical build metrics data
 * @returns {Promise<Array>} Array of historical build metrics
 */
async function getHistoricalBuildMetrics() {
  try {
    const historyPath = path.join(process.cwd(), 'temp', 'build-metrics-history.json');
    
    // Create directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    try {
      await fsPromises.mkdir(tempDir, { recursive: true });
    } catch (err) {
      // Directory already exists or cannot be created
      if (err.code !== 'EEXIST') {
        logger.debug(`Could not create temp directory: ${err.message}`);
      }
    }
    
    // Try to read existing history
    try {
      const data = await fsPromises.readFile(historyPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      // File doesn't exist yet or is invalid
      return [];
    }
  } catch (error) {
    logger.debug(`Error getting historical build metrics: ${error.message}`);
    return [];
  }
}

/**
 * Save build metrics to history
 * @param {Object} metrics - Build metrics to save
 * @returns {Promise<boolean>} Success indicator
 */
async function saveToHistory(metrics) {
  try {
    // Get existing history
    const history = await getHistoricalBuildMetrics();
    
    // Add new entry with timestamp
    const entry = {
      date: new Date().toISOString(),
      totalSize: metrics.totalSize,
      packages: metrics.packages
    };
    
    // Add to history, keeping only the last 10 entries
    history.push(entry);
    if (history.length > 10) {
      history.shift(); // Remove oldest entry if we have more than 10
    }
    
    // Save back to file
    const historyPath = path.join(process.cwd(), 'temp', 'build-metrics-history.json');
    await fsPromises.writeFile(historyPath, JSON.stringify(history, null, 2));
    return true;
  } catch (error) {
    logger.debug(`Error saving build metrics history: ${error.message}`);
    return false;
  }
}

/**
 * Build multiple packages with workflow integration
 * @param {Object} options - Build options
 * @param {Array<string>} [options.packages] - Array of package names to build (default: ['admin', 'hours'])
 * @param {boolean} [options.parallel=false] - Whether to build packages in parallel
 * @param {Function} [options.recordWarning] - Function to record warnings
 * @param {Function} [options.recordStep] - Function to record steps
 * @param {string} [options.phase='Build'] - Current workflow phase
 * @returns {Promise<Object>} Build results
 */
export async function buildPackageWithWorkflowIntegration(options = {}) {
  const { 
    packages = ['admin', 'hours'],
    parallel = false, // New option for parallel building
    recordWarning = null,
    recordStep = null,
    phase = 'Build',
    timeout = 180000,  // 3 minute timeout
    ...buildOptions 
  } = options;
  
  const startTime = Date.now();
  const stepName = 'Package Build';
  const workflowState = getWorkflowState();
  
  try {
    const allResults = {};
    const buildWarnings = [];
    const buildErrors = [];
    let totalBundleSize = 0;
    let allSucceeded = true;

    // Record build start
    const startMsg = `Starting build for packages: ${packages.join(', ')}`;
    if (recordWarning) recordWarning(startMsg, phase, stepName, 'info');
    else workflowState.addWarning(startMsg, stepName, phase, 'info');

    // Build the packages
    if (parallel && packages.length > 1) {
      const { runTasksInParallel } = await import('./parallel-executor.js');
      const buildTasks = packages.map(pkg => ({
        name: `build-${pkg}`,
        task: async (params) => {
          const pkgStartTime = Date.now();
 
          // Log progress (Keep this)
          if (recordWarning) {
            recordWarning(`Building package: ${pkg}`, phase, stepName, 'info');
          }
 
          // Run the build, errors will throw
          const result = await buildPackageWithWorkflowTracking({
            ...buildOptions,
            package: pkg,
            timeout,
            recordWarning,
            phase
          });
 
          // Record completion (Keep this - relies on result object format)
          if (recordWarning) {
            const status = result.success ? 'successfully' : 'with errors'; // result might not be defined if error thrown
            recordWarning(`Build completed ${status} in ${result.duration}ms`, phase, stepName, 'info');
          }
 
          if (result.success) {
            allResults[pkg] = result;
            if (result.warnings) buildWarnings.push(...result.warnings.map(w => `${pkg}: ${w}`));
            if (result.totalSize) totalBundleSize += result.totalSize;
          } else {
            allSucceeded = false;
            // Capture the error message from the failed task result
            buildErrors.push(`${pkg}: ${result.error || 'Unknown build error'}`);
            // Error already thrown and caught by main workflow
          }
        },
        params: {}
      }));

      logger.info(`Building ${packages.length} packages in parallel...`);
      const parallelResults = await runTasksInParallel(buildTasks, {
        maxConcurrent: 2,
        failFast: false, // Let all finish to collect errors
        timeout: timeout * packages.length, // Adjust global timeout
        taskTimeout: timeout,
        onProgress: (completed, total) => {
          const progressMsg = `Build progress: ${completed}/${total} packages`;
          if (recordWarning) recordWarning(progressMsg, phase, stepName, 'info');
        }
      });

      // Process results (errors were thrown by tasks, handled by runTasksInParallel)
      logger.debug(`Processing ${parallelResults.length} parallel build results...`);
      parallelResults.forEach((taskResult, index) => {
        const packageName = packages[index];
        if (taskResult.success) {
            // Access the actual result object nested by runTasksInParallel
            const resultData = taskResult.result || {}; 
            allResults[packageName] = resultData;
            if (resultData.warnings && Array.isArray(resultData.warnings)) {
              buildWarnings.push(...resultData.warnings.map(w => `${packageName}: ${w}`));
            }
            // Log the values being aggregated
            logger.debug(`[Metrics Aggregation - ${packageName}] resultData.totalSize: ${resultData.totalSize}, resultData.fileCount: ${resultData.fileCount}`);
            totalBundleSize += resultData.totalSize || 0; // Add 0 if totalSize is missing
        } else {
            allSucceeded = false;
            // Capture the error message from the failed task result
            buildErrors.push(`${packageName}: ${taskResult.error || 'Unknown build error'}`);
            // Error already thrown and caught by main workflow
        }
      });
    } else {
      // Ensure Sequential build logic is present
      for (const pkg of packages) {
        const result = await buildPackageWithWorkflowTracking({
            ...buildOptions,
            package: pkg,
            timeout,
            recordWarning,
            phase
        });
        allResults[pkg] = result;
        if (result.warnings) buildWarnings.push(...result.warnings.map(w => `${pkg}: ${w}`));
        if (result.totalSize) totalBundleSize += result.totalSize;
        // Errors thrown by buildPackageWithWorkflowTracking will stop the loop
      }
    }

    // ---> CRITICAL FIX: Check if any parallel/sequential task failed <---
    const finalDuration = Date.now() - startTime;
    if (!allSucceeded) {
        // Throw a consolidated error if any build failed
        const consolidatedError = `Build failed for one or more packages: ${buildErrors.join('; ')}`;
        // Record the step failure before throwing
        if (recordStep) recordStep(stepName, phase, false, finalDuration, consolidatedError);
        else workflowState.completeStep(stepName, { success: false, error: consolidatedError, duration: Date.now() - startTime });
        throw new Error(consolidatedError);
    }

    // If we got here without errors, record success
    if (recordStep) {
      recordStep(stepName, phase, true, finalDuration);
    } else {
      workflowState.completeStep(stepName, { success: true, duration: Date.now() - startTime });
    }

    // Calculate metrics (simplified, needs rework if full stats are needed)
    const buildMetrics = {
      totalDuration: Date.now() - startTime,
      totalSize: totalBundleSize, // Note: This is raw bytes
      packages: Object.entries(allResults).map(([name, storedResult]) => ({
        name,
        success: storedResult?.success, // Access potentially nested success
        size: storedResult?.totalSize || 0, // Access potentially nested size
        fileCount: storedResult?.fileCount || 0 // Access potentially nested count
      }))
    };

    logger.debug(`[Metrics Aggregation] Final totalBundleSize (bytes): ${totalBundleSize}`);
    logger.debug(`[Metrics Aggregation] Final buildMetrics.packages: ${JSON.stringify(buildMetrics.packages)}`);

    // Add historical data (simplified)
    try { await saveToHistory(buildMetrics); } catch { /* ignore */ }

    return {
      success: true,
      results: allResults,
      warnings: buildWarnings,
      buildMetrics,
      duration: Date.now() - startTime,
      totalSize: formatFileSize(totalBundleSize)
    };

  } catch (error) {
    // Errors from buildPackageWithWorkflowTracking are caught here if running sequentially
    // or re-thrown by parallel executor
    if (recordWarning) recordWarning(`Build process failed: ${error.message}`, phase, stepName);
    if (recordStep) recordStep(stepName, phase, false, Date.now() - startTime, error.message);
    throw error; // Re-throw to be caught by the main workflow handler
  }
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to a human-readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(milliseconds) {
  if (!milliseconds) return '0s';
  
  if (milliseconds < 1000) return `${milliseconds}ms`;
  
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  
  return `${seconds}s`;
}

// Export module functions
export default {
  cleanOutputDir,
  runTypeCheck,
  buildPackage,
  buildPackageWithWorkflowTracking,
  buildPackageWithWorkflowIntegration
}; 