// Import required dependencies
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { logger } from '../utils/logger.js';
import { exec } from '../utils/process-utils.js';

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
    const { stdout, stderr, code } = await exec('npx tsc --noEmit');
    
    if (code !== 0) {
      // Parse errors from stderr
      const errors = stderr
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
    
    const { stdout, stderr, code } = await exec(buildCommand);
    
    if (code !== 0) {
      logger.error(`Build failed with code ${code}`);
      
      return {
        success: false,
        error: 'Build process exited with error',
        details: {
          code,
          errors: stderr.split('\n').filter(Boolean)
        }
      };
    }
    
    // Parse build stats from output
    const stats = parseWebpackStats(stdout);
    
    // Check for warnings in output
    const warnings = stdout
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

// Export module functions
export default {
  cleanOutputDir,
  runTypeCheck,
  runBuild,
  buildPackage,
  buildPackageWithWorkflowTracking
}; 