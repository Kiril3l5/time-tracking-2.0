// Import required dependencies
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';

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
 * Run the build process
 * 
 * @param {Object} config - Build configuration
 * @param {string} config.target - Target environment
 * @param {boolean} [config.minify=true] - Whether to minify output
 * @param {boolean} [config.sourceMaps=false] - Whether to generate source maps
 * @param {string} [config.configPath] - Path to custom build config
 * @returns {Promise<Object>} Build result
 */
export async function runBuild(config) {
  const { target, minify = true, sourceMaps = false, configPath } = config;
  
  try {
    let buildCommand = `npx webpack --env target=${target}`;
    
    if (minify) {
      buildCommand += ' --env minify=true';
    }
    
    if (sourceMaps) {
      buildCommand += ' --env sourceMaps=true';
    }
    
    if (configPath) {
      buildCommand += ` --config ${configPath}`;
    }
    
    logger.info(`Running build: ${buildCommand}`);
    
    const result = await commandRunner.runCommandAsync(buildCommand, { stdio: 'pipe' });
    
    if (!result.success) {
      logger.error(`Build failed: ${result.error}`);
      
      return {
        success: false,
        error: 'Build process exited with error',
        details: {
          code: 1,
          errors: result.error.split('\n').filter(Boolean)
        }
      };
    }
    
    // Parse build stats from output
    const stats = parseWebpackStats(result.output);
    
    // Check for warnings in output
    const warnings = result.output
      .split('\n')
      .filter(line => line.includes('WARNING'))
      .map(line => line.trim());
    
    return {
      success: true,
      stats,
      warnings
    };
  } catch (error) {
    logger.error(`Build failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Parse webpack stats from build output
 * 
 * @param {string} output - Build output
 * @returns {Object} Parsed stats
 */
function parseWebpackStats(output) {
  try {
    // Find stats object in output (simplified for example)
    const statsMatch = output.match(/asset stats:([\s\S]+?)entrypoints:/i);
    
    if (!statsMatch) {
      return {
        fileCount: 0,
        totalSize: 0
      };
    }
    
    // Count number of output files
    const fileCount = (output.match(/asset/g) || []).length;
    
    // Calculate total size
    const sizeMatches = [...output.matchAll(/(\d+) bytes/g)];
    const totalSize = sizeMatches.reduce((total, match) => total + parseInt(match[1], 10), 0);
    
    // Extract entry points
    const entryPointMatches = [...output.matchAll(/entrypoint (.+?) = (.+?)\s+(\d+) bytes/g)];
    const entryPoints = entryPointMatches.map(match => ({
      name: match[1],
      files: match[2].split(' '),
      size: parseInt(match[3], 10)
    }));
    
    return {
      fileCount,
      totalSize,
      entryPoints: entryPoints.length > 0 ? entryPoints : undefined
    };
  } catch (error) {
    logger.warn(`Failed to parse webpack stats: ${error.message}`);
    return {
      fileCount: 0,
      totalSize: 0
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
  const { 
    target, 
    minify = true, 
    sourceMaps = false, 
    typeCheck = true, 
    clean = true,
    configPath
  } = options;
  
  const startTime = Date.now();
  
  // Validate target
  if (!target) {
    return { success: false, error: 'Target environment is required for build' };
  }
  
  try {
    // Clean if requested
    if (clean) {
      await cleanOutputDir();
    }
    
    // Type check if requested
    if (typeCheck) {
      const typeCheckResult = await runTypeCheck();
      if (!typeCheckResult.success) {
        return {
          success: false,
          error: 'Type check failed',
          typeCheckErrors: typeCheckResult.errors
        };
      }
    }
    
    // Run the build
    const buildResult = await runBuild({
      target,
      minify,
      sourceMaps,
      configPath
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
    target, 
    minify = true, 
    sourceMaps = false, 
    typeCheck = true, 
    clean = true,
    configPath,
    recordWarning = null,
    recordStep = null,
    phase = 'Build'
  } = options;
  
  const startTime = Date.now();
  const stepName = 'Package Build';
  
  // Start step tracking
  if (recordStep) {
    recordStep(stepName, phase, null, 0);
  }
  
  try {
    // Validate target
    if (!target) {
      const error = 'Target environment is required for build';
      if (recordWarning) {
        recordWarning(error, phase, stepName);
      }
      
      if (recordStep) {
        recordStep(stepName, phase, false, Date.now() - startTime, error);
      }
      
      return { success: false, error };
    }
    
    // Validate against supported targets
    const supportedTargets = ['production', 'staging', 'development', 'test'];
    if (!supportedTargets.includes(target.toLowerCase())) {
      const error = `Unsupported target: ${target}. Supported targets: ${supportedTargets.join(', ')}`;
      
      if (recordWarning) {
        recordWarning(error, phase, stepName);
      }
      
      if (recordStep) {
        recordStep(stepName, phase, false, Date.now() - startTime, error);
      }
      
      return { success: false, error };
    }
    
    // Record build start
    if (recordWarning) {
      recordWarning(`Starting build for target: ${target}`, phase, stepName, 'info');
    }
    
    // Clean if requested
    if (clean) {
      try {
        await cleanOutputDir();
        if (recordWarning) {
          recordWarning('Cleaned output directory', phase, stepName, 'info');
        }
      } catch (cleanError) {
        if (recordWarning) {
          recordWarning(`Failed to clean output directory: ${cleanError.message}`, phase, stepName);
        }
        // Continue despite clean error
      }
    }
    
    // Type check if requested
    if (typeCheck) {
      try {
        const typeCheckStart = Date.now();
        const typeCheckResult = await runTypeCheck();
        
        if (!typeCheckResult.success) {
          if (recordWarning) {
            recordWarning('Type check failed', phase, stepName);
            
            if (typeCheckResult.errors && typeCheckResult.errors.length > 0) {
              typeCheckResult.errors.forEach(error => {
                recordWarning(`TypeScript error: ${error.message} (${error.file}:${error.line})`, phase, stepName);
              });
            }
          }
        } else {
          if (recordWarning) {
            recordWarning(`Type check completed successfully in ${Date.now() - typeCheckStart}ms`, phase, stepName, 'info');
          }
        }
      } catch (typeCheckError) {
        if (recordWarning) {
          recordWarning(`Type check process failed: ${typeCheckError.message}`, phase, stepName);
        }
        // Continue despite type check error
      }
    }
    
    // Prepare build config
    const buildConfig = {
      target,
      minify,
      sourceMaps,
      configPath
    };
    
    // Record build settings
    if (recordWarning) {
      recordWarning(`Build configuration: ${JSON.stringify({
        target,
        minify,
        sourceMaps,
        typeCheck,
        clean
      })}`, phase, stepName, 'info');
    }
    
    // Run the actual build
    const buildStart = Date.now();
    const buildResult = await runBuild(buildConfig);
    const buildDuration = Date.now() - buildStart;
    
    // Handle build failure
    if (!buildResult.success) {
      if (recordWarning) {
        recordWarning(`Build failed: ${buildResult.error}`, phase, stepName);
        
        if (buildResult.details && buildResult.details.errors) {
          buildResult.details.errors.forEach(error => {
            recordWarning(`Build error: ${error}`, phase, stepName);
          });
        }
      }
      
      if (recordStep) {
        recordStep(stepName, phase, false, Date.now() - startTime, buildResult.error);
      }
      
      return buildResult;
    }
    
    // Handle successful build
    if (recordWarning) {
      recordWarning(`Build completed successfully in ${buildDuration}ms`, phase, stepName, 'info');
      
      // Record build output stats
      if (buildResult.stats) {
        const { fileCount, totalSize, entryPoints } = buildResult.stats;
        recordWarning(`Build output: ${fileCount} files, ${(totalSize / 1024).toFixed(2)}KB total`, phase, stepName, 'info');
        
        if (entryPoints) {
          entryPoints.forEach(entry => {
            recordWarning(`Entry point "${entry.name}": ${(entry.size / 1024).toFixed(2)}KB`, phase, stepName, 'info');
          });
        }
      }
      
      // Record build warnings
      if (buildResult.warnings && buildResult.warnings.length > 0) {
        buildResult.warnings.forEach(warning => {
          recordWarning(`Build warning: ${warning}`, phase, stepName);
        });
      }
    }
    
    // Complete step tracking
    if (recordStep) {
      recordStep(stepName, phase, true, Date.now() - startTime);
    }
    
    return {
      ...buildResult,
      duration: Date.now() - startTime
    };
  } catch (error) {
    // Handle unexpected errors
    if (recordWarning) {
      recordWarning(`Unexpected build error: ${error.message}`, phase, stepName);
    }
    
    if (recordStep) {
      recordStep(stepName, phase, false, Date.now() - startTime, error.message);
    }
    
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Build packages with workflow integration
 * 
 * @param {Object} options - Build options
 * @param {string} [options.target='development'] - Target environment (e.g. 'production', 'staging')
 * @param {boolean} [options.minify=true] - Whether to minify the output
 * @param {boolean} [options.sourceMaps=false] - Whether to generate source maps
 * @param {boolean} [options.typeCheck=true] - Whether to run type checking before build
 * @param {boolean} [options.clean=true] - Whether to clean the output directory first
 * @param {string[]} [options.packages=['admin', 'hours']] - Packages to build
 * @param {Function} [options.recordWarning] - Function to record warnings in workflow
 * @param {Function} [options.recordStep] - Function to record steps in workflow
 * @param {string} [options.phase='Build'] - Current workflow phase
 * @returns {Promise<Object>} Build result with success status and details
 */
export async function buildPackageWithWorkflowIntegration(options = {}) {
  const { 
    target = 'development', 
    minify = true, 
    sourceMaps = false, 
    typeCheck = true, 
    clean = true,
    packages = ['admin', 'hours'],
    recordWarning = null,
    recordStep = null,
    phase = 'Build'
  } = options;
  
  const startTime = Date.now();
  
  // Record start of build process
  if (recordStep) {
    recordStep('Package Build', phase, null, 0);
  }
  
  try {
    if (recordWarning) {
      recordWarning(`Starting build process for packages: ${packages.join(', ')}`, phase, 'Package Build', 'info');
    }
    
    // Clean if requested
    if (clean) {
      if (recordStep) {
        recordStep('Clean Build Directory', phase, null, 0);
      }
      
      try {
        // Use platform-specific command for cleaning
        const isWindows = process.platform === 'win32';
        const cleanCommand = isWindows 
          ? 'if exist packages\\admin\\dist rmdir /s /q packages\\admin\\dist && if exist packages\\hours\\dist rmdir /s /q packages\\hours\\dist && if exist packages\\common\\dist rmdir /s /q packages\\common\\dist'
          : 'rm -rf packages/admin/dist packages/hours/dist packages/common/dist';
        
        const cleanResult = await commandRunner.runCommandAsync(cleanCommand, {
          ignoreError: true, // Don't fail if directories don't exist
          shell: true
        });
        
        if (recordWarning) {
          recordWarning(`Cleaned build directories`, phase, 'Clean Build Directory', 'info');
        }
        
        if (recordStep) {
          recordStep('Clean Build Directory', phase, true, Date.now() - startTime);
        }
      } catch (cleanError) {
        if (recordWarning) {
          recordWarning(`Failed to clean build directories: ${cleanError.message}`, phase, 'Clean Build Directory');
        }
        
        if (recordStep) {
          recordStep('Clean Build Directory', phase, false, Date.now() - startTime, cleanError.message);
        }
        // Continue despite clean error
      }
    }
    
    // Type check if requested
    if (typeCheck) {
      if (recordStep) {
        recordStep('TypeScript Check', phase, null, 0);
      }
      
      const typeCheckResult = await runTypeCheck();
      
      if (!typeCheckResult.success) {
        if (recordWarning) {
          recordWarning('TypeScript check failed', phase, 'TypeScript Check');
          
          if (typeCheckResult.errors && typeCheckResult.errors.length > 0) {
            typeCheckResult.errors.forEach(error => {
              recordWarning(`TypeScript error: ${error.message} (${error.file}:${error.line})`, phase, 'TypeScript Check');
            });
          }
        }
        
        if (recordStep) {
          recordStep('TypeScript Check', phase, false, Date.now() - startTime, 'TypeScript check failed');
        }
        
        return {
          success: false,
          error: 'TypeScript check failed',
          typeCheckErrors: typeCheckResult.errors,
          duration: Date.now() - startTime
        };
      }
      
      if (recordWarning) {
        recordWarning('TypeScript check passed', phase, 'TypeScript Check', 'info');
      }
      
      if (recordStep) {
        recordStep('TypeScript Check', phase, true, Date.now() - startTime);
      }
    }
    
    // Build all packages using the existing script
    if (recordStep) {
      recordStep('Build Packages', phase, null, 0);
    }
    
    try {
      if (recordWarning) {
        recordWarning(`Building all packages for target: ${target}`, phase, 'Build Packages', 'info');
      }
      
      // Use the existing build:all script which is already properly configured
      const buildCommand = `pnpm run build:all`;
      logger.info(`Running build: ${buildCommand}`);
      
      const result = await commandRunner.runCommandAsync(buildCommand, { 
        stdio: 'pipe',
        timeout: 300000 // 5 minute timeout
      });
      
      if (!result.success) {
        if (recordWarning) {
          recordWarning(`Build failed`, phase, 'Build Packages');
          
          // Log error details
          const errors = result.error.split('\n').filter(Boolean);
          errors.slice(0, 10).forEach(error => {
            recordWarning(`Build error: ${error}`, phase, 'Build Packages');
          });
          
          if (errors.length > 10) {
            recordWarning(`...and ${errors.length - 10} more build errors`, phase, 'Build Packages');
          }
        }
        
        if (recordStep) {
          recordStep('Build Packages', phase, false, Date.now() - startTime, `Build failed`);
        }
        
        return {
          success: false,
          error: `Build process exited with error`,
          details: {
            errors: result.error.split('\n').filter(Boolean)
          },
          duration: Date.now() - startTime
        };
      }
      
      // Parse build output for warnings
      const warnings = result.output
        .split('\n')
        .filter(line => line.toLowerCase().includes('warning') && !line.includes('TypeScript which is not officially supported'))
        .map(line => line.trim());
      
      // Record warnings - don't mark these as 'info' so they appear in the warnings section
      if (recordWarning && warnings.length > 0) {
        warnings.forEach(warning => {
          recordWarning(`Build warning: ${warning}`, phase, 'Build Packages');
        });
      }
      
      // Verify that build artifacts exist
      const rootDir = process.cwd();
      const buildResults = {};
      let allSucceeded = true;
      
      // Track total bundle size across all packages
      let totalBundleSize = 0;
      let largestFiles = [];
      
      for (const pkg of packages) {
        const pkgDistPath = path.join(rootDir, `packages/${pkg}/dist`);
        
        try {
          const files = await fs.readdir(pkgDistPath);
          
          if (files.length === 0) {
            if (recordWarning) {
              recordWarning(`No build artifacts found for ${pkg}`, phase, 'Build Packages');
            }
            
            buildResults[pkg] = {
              success: false,
              error: 'No build artifacts produced'
            };
            
            allSucceeded = false;
          } else {
            // Calculate total bundle size and find large files
            let packageSize = 0;
            const fileDetails = [];
            
            for (const file of files) {
              const filePath = path.join(pkgDistPath, file);
              try {
                const stats = await fs.stat(filePath);
                if (stats.isFile()) {
                  packageSize += stats.size;
                  fileDetails.push({
                    name: file,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size)
                  });
                }
              } catch (err) {
                // Ignore file stat errors
              }
            }
            
            // Sort files by size and keep track of the largest
            fileDetails.sort((a, b) => b.size - a.size);
            largestFiles = [...largestFiles, ...fileDetails.slice(0, 3)].sort((a, b) => b.size - a.size).slice(0, 5);
            
            totalBundleSize += packageSize;
            
            if (recordWarning) {
              // This is a successful case, but we want it shown prominently in the dashboard
              recordWarning(`${pkg} package: ${files.length} files, total size: ${formatFileSize(packageSize)}`, phase, 'Build Packages');
              
              // Record largest files - don't mark as info to ensure visibility in dashboard
              fileDetails.slice(0, 3).forEach(file => {
                recordWarning(`${pkg} large file: ${file.name} (${file.sizeFormatted})`, phase, 'Build Packages');
              });
            }
            
            buildResults[pkg] = {
              success: true,
              fileCount: files.length,
              size: packageSize,
              sizeFormatted: formatFileSize(packageSize),
              largestFiles: fileDetails.slice(0, 3)
            };
          }
        } catch (error) {
          if (recordWarning) {
            recordWarning(`Failed to verify build for ${pkg}: ${error.message}`, phase, 'Build Packages');
          }
          
          buildResults[pkg] = {
            success: false,
            error: `Failed to verify build: ${error.message}`
          };
          
          allSucceeded = false;
        }
      }
      
      if (recordStep) {
        recordStep('Build Packages', phase, allSucceeded, Date.now() - startTime);
      }
      
      // Record success
      if (recordWarning) {
        recordWarning(`Build process completed in ${Date.now() - startTime}ms, total bundle size: ${formatFileSize(totalBundleSize)}`, phase, 'Package Build');
        
        // Record bundle size warnings if over certain thresholds
        if (totalBundleSize > 5 * 1024 * 1024) { // Over 5MB
          recordWarning(`Total bundle size exceeds 5MB (${formatFileSize(totalBundleSize)})`, phase, 'Package Build');
        }
        
        // Include top 5 largest files as warnings (not info) to ensure visibility
        if (largestFiles.length > 0) {
          recordWarning(`Largest files in bundle:`, phase, 'Package Build');
          largestFiles.forEach((file, index) => {
            recordWarning(`${index+1}. ${file.name} (${file.sizeFormatted})`, phase, 'Package Build');
          });
        }
      }
      
      // Complete the overall build step
      if (recordStep) {
        recordStep('Package Build', phase, allSucceeded, Date.now() - startTime);
      }
      
      return {
        success: allSucceeded,
        results: buildResults,
        warnings,
        duration: Date.now() - startTime,
        totalSize: formatFileSize(totalBundleSize)
      };
    } catch (error) {
      if (recordWarning) {
        recordWarning(`Unexpected error during build: ${error.message}`, phase, 'Build Packages');
      }
      
      if (recordStep) {
        recordStep('Build Packages', phase, false, Date.now() - startTime, error.message);
        recordStep('Package Build', phase, false, Date.now() - startTime, error.message);
      }
      
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  } catch (error) {
    // Handle unexpected errors
    if (recordWarning) {
      recordWarning(`Unexpected build error: ${error.message}`, phase, 'Package Build');
    }
    
    if (recordStep) {
      recordStep('Package Build', phase, false, Date.now() - startTime, error.message);
    }
    
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
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

// Export module functions
export default {
  cleanOutputDir,
  runTypeCheck,
  runBuild,
  buildPackage,
  buildPackageWithWorkflowTracking,
  buildPackageWithWorkflowIntegration
}; 