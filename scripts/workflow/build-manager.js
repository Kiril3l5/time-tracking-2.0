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

      // Use regex matching to find all file size lines
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

      // Try a different approach if no matches found
      if (viteFileCount === 0) {
        // Try another regex pattern to match different Vite output formats
        const alternateFileRegex = /(\S+\.(?:js|css|html))\s+(\d+(?:\.\d+)?)\s*(?:kB|KB)/gi;
        
        while ((match = alternateFileRegex.exec(result.output)) !== null) {
          const filePath = match[1].trim();
          const fileSizeKB = parseFloat(match[2]);
          
          viteFileCount++;
          viteTotalSize += fileSizeKB * 1024; // Convert kB to bytes
          logger.debug(`[Vite Parse Alt] Found: ${filePath}, Size: ${fileSizeKB} kB`);
        }
        
        // Handle newer Vite output format that might use tables
        const lines = result.output.split(/\r?\n/);
        for (const line of lines) {
          if (line.includes('.js') || line.includes('.css')) {
            const sizePart = line.match(/\d+\.\d+\s*kB/);
            if (sizePart) {
              const sizeKB = parseFloat(sizePart[0]);
              if (!isNaN(sizeKB)) {
                viteFileCount++;
                viteTotalSize += sizeKB * 1024;
                logger.debug(`[Vite Parse Table] Found size: ${sizeKB} kB`);
              }
            }
          }
        }
      }
    }
    
    // Final fallback: If still no files found, use filesystem to count dist files
    if (viteFileCount === 0) {
      try {
        const distDir = path.join(packageDir, 'dist');
        let totalSize = 0;
        let fileCount = 0;
        
        function scanDirectory(dir) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              scanDirectory(fullPath);
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.css') || entry.name.endsWith('.html'))) {
              const stats = fs.statSync(fullPath);
              totalSize += stats.size;
              fileCount++;
            }
          }
        }
        
        if (fs.existsSync(distDir)) {
          scanDirectory(distDir);
          viteTotalSize = totalSize;
          viteFileCount = fileCount;
          logger.debug(`[Vite Parse Fallback] Found ${fileCount} files, total size: ${(totalSize / 1024).toFixed(2)} kB`);
        }
      } catch (fsError) {
        logger.debug(`[Vite Parse Fallback] Error scanning dist directory: ${fsError.message}`);
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
    
    // Explicitly ensure totalSize and fileCount are set
    return {
      success: true,
      packageName,
      warnings: viteWarnings, 
      totalSize: viteTotalSize,  // Explicit assignment of parsed size
      fileCount: viteFileCount,  // Explicit assignment of file count
      duration: result.duration
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
 * @returns {Promise<Object>} Build result with metrics
 */
export async function buildPackageWithWorkflowIntegration(options = {}) {
  const { 
    packages = ['admin', 'hours'],
    parallel = true,
    recordWarning = null,
    recordStep = null,
    phase = 'Build',
    timeout = 180000
  } = options;
  
  const startTime = Date.now();
  const allPackages = Array.isArray(packages) ? packages : [packages];
  
  // Record initial step
  if (recordWarning) {
    recordWarning(`Starting build for packages: ${allPackages.join(', ')}`, phase, 'Package Build', 'info');
  }
  
  try {
    const buildResults = {};
    const buildMetrics = {
      duration: 0,
      totalSize: 0,
      fileCount: 0,
      packages: {},
      isValid: true
    };
    
    // Build packages either in parallel or sequentially
    if (parallel && allPackages.length > 1) {
      // Build in parallel
      const buildPromises = allPackages.map(packageName => {
        if (recordWarning) {
          recordWarning(`Building package: ${packageName}`, phase, 'Package Build', 'info');
        }
        
        return buildPackageWithWorkflowTracking({
          package: packageName,
          recordWarning,
          recordStep,
          phase,
          timeout
        });
      });
      
      const results = await Promise.all(buildPromises);
      
      // Process results
      results.forEach(result => {
        if (!result.success) {
          throw new Error(`Build failed for package "${result.packageName}"`);
        }
        
        buildResults[result.packageName] = result;
        
        // Add to metrics - ensure we have valid data
        const packageTotalSize = result.totalSize || 0;
        const packageFileCount = result.fileCount || 0;
        const packageDuration = result.duration || 0;
        
        buildMetrics.packages[result.packageName] = {
          totalSize: formatFileSize(packageTotalSize),
          rawSize: packageTotalSize,
          fileCount: packageFileCount,
          duration: formatDuration(packageDuration),
          rawDuration: packageDuration
        };
        
        buildMetrics.totalSize += packageTotalSize;
        buildMetrics.fileCount += packageFileCount;
        
        if (packageDuration > buildMetrics.duration) {
          buildMetrics.duration = packageDuration;
        }
        
        if (recordWarning) {
          recordWarning(`Build progress: ${Object.keys(buildResults).length}/${allPackages.length} packages`, phase, 'Package Build', 'info');
        }
      });
    } else {
      // Build sequentially
      for (const packageName of allPackages) {
        if (recordWarning) {
          recordWarning(`Building package: ${packageName}`, phase, 'Package Build', 'info');
        }
        
        const result = await buildPackageWithWorkflowTracking({
          package: packageName,
          recordWarning,
          recordStep,
          phase,
          timeout
        });
        
        if (!result.success) {
          throw new Error(`Build failed for package "${packageName}"`);
        }
        
        buildResults[packageName] = result;
        
        // Add to metrics - ensure we have valid data
        const packageTotalSize = result.totalSize || 0;
        const packageFileCount = result.fileCount || 0;
        const packageDuration = result.duration || 0;
        
        buildMetrics.packages[packageName] = {
          totalSize: formatFileSize(packageTotalSize),
          rawSize: packageTotalSize,
          fileCount: packageFileCount,
          duration: formatDuration(packageDuration),
          rawDuration: packageDuration
        };
        
        buildMetrics.totalSize += packageTotalSize;
        buildMetrics.fileCount += packageFileCount;
        buildMetrics.duration += packageDuration;
        
        if (recordWarning) {
          recordWarning(`Build progress: ${Object.keys(buildResults).length}/${allPackages.length} packages`, phase, 'Package Build', 'info');
        }
      }
    }
    
    // Format the total metrics
    buildMetrics.totalSizeFormatted = formatFileSize(buildMetrics.totalSize);
    buildMetrics.durationFormatted = formatDuration(buildMetrics.duration);
    
    // Log the metrics to help debug
    logger.debug(`Build metrics: totalSize=${buildMetrics.totalSize} (${buildMetrics.totalSizeFormatted}), ` +
                 `duration=${buildMetrics.duration} (${buildMetrics.durationFormatted}), ` +
                 `fileCount=${buildMetrics.fileCount}`);
    
    // Store metrics history 
    await saveToHistory(buildMetrics);
    
    // Record step
    if (recordStep) {
      recordStep('Package Build', phase, true, buildMetrics.duration);
    }
    
    const finalDuration = Date.now() - startTime;
    
    // Return the combined results
    return {
      success: true,
      buildResults,
      buildMetrics,
      duration: finalDuration
    };
  } catch (error) {
    // Record step failure
    if (recordStep) {
      recordStep('Package Build', phase, false, Date.now() - startTime, error.message);
    }
    
    throw error;
  }
}

/**
 * Format file size in bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size (e.g., "1.23 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  // Keep to 2 decimal places max and remove trailing zeros
  return (bytes / Math.pow(1024, i)).toFixed(2).replace(/\.0+$/, '') + ' ' + units[i];
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration (e.g., "1m 23s")
 */
function formatDuration(milliseconds) {
  if (milliseconds === 0 || isNaN(milliseconds)) return '0s';
  
  if (milliseconds < 1000) return `${milliseconds}ms`;
  
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  
  let result = '';
  
  if (hours > 0) {
    result += `${hours}h `;
  }
  
  if (minutes > 0 || hours > 0) {
    result += `${minutes}m `;
  }
  
  result += `${seconds}s`;
  
  return result;
}

// Export module functions
export default {
  cleanOutputDir,
  runTypeCheck,
  buildPackage,
  buildPackageWithWorkflowTracking,
  buildPackageWithWorkflowIntegration
}; 