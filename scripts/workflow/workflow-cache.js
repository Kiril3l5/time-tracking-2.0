/**
 * Workflow Cache Manager
 * 
 * Handles caching of workflow results to speed up subsequent runs
 */

import { logger } from '../core/logger.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a cache key based on file contents
 * @param {string} type - Cache type identifier
 * @param {Array<string>} filePaths - Array of file paths to include in hash calculation
 * @returns {Promise<string>} Cache key
 */
export async function generateCacheKey(type, filePaths) {
  try {
    // Default to current directory if no paths
    if (!filePaths || filePaths.length === 0) {
      filePaths = [path.join(process.cwd(), 'package.json')];
    }
    
    // Get modified times for all files
    const fileStats = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          return {
            path: filePath,
            mtime: stats.mtime.getTime(),
            size: stats.size,
          };
        } catch (error) {
          // If file doesn't exist, use 0 as timestamp
          return { path: filePath, mtime: 0, size: 0 };
        }
      })
    );
    
    // Create a string from file stats
    const statsString = fileStats
      .map(stat => `${stat.path}:${stat.mtime}:${stat.size}`)
      .join('|');
    
    // Create hash
    const hash = crypto.createHash('md5').update(`${type}:${statsString}`).digest('hex');
    return hash;
  } catch (error) {
    logger.debug(`Error generating cache key: ${error.message}`);
    return crypto.createHash('md5').update(`${type}:${Date.now()}`).digest('hex');
  }
}

/**
 * Cache manager class
 */
export class WorkflowCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.workflow-cache');
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours by default
    this.enabled = options.enabled !== false;
  }
  
  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      return true;
    } catch (error) {
      logger.debug(`Failed to create cache directory: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get a cached item
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached item or null if not found
   */
  async get(key) {
    if (!this.enabled) return null;
    
    try {
      await this.ensureCacheDir();
      
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      
      // Check if cache file exists
      try {
        await fs.access(cacheFile);
      } catch {
        return null;
      }
      
      // Read cache file
      const cacheData = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
      
      // Check TTL
      if (cacheData._timestamp && Date.now() - cacheData._timestamp > this.ttl) {
        logger.debug(`Cache expired for key: ${key}`);
        return null;
      }
      
      logger.debug(`Cache hit for key: ${key}`);
      return cacheData.data;
    } catch (error) {
      logger.debug(`Error reading cache: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Set a cached item
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @returns {Promise<boolean>} Success
   */
  async set(key, data) {
    if (!this.enabled) return false;
    
    try {
      await this.ensureCacheDir();
      
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      
      // Write cache file
      const cacheData = {
        _timestamp: Date.now(),
        data
      };
      
      await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
      
      logger.debug(`Cache set for key: ${key}`);
      return true;
    } catch (error) {
      logger.debug(`Error writing cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Clear all cache
   * @returns {Promise<boolean>} Success
   */
  async clear() {
    try {
      await this.ensureCacheDir();
      
      // Read all cache files
      const files = await fs.readdir(this.cacheDir);
      
      // Delete all JSON files
      await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
      
      logger.debug('Cache cleared');
      return true;
    } catch (error) {
      logger.debug(`Error clearing cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get or compute a cached value
   * @param {string} key - Cache key
   * @param {Function} computeFn - Function to compute value if not cached
   * @returns {Promise<any>} Cached or computed value
   */
  async getOrCompute(key, computeFn) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached) return cached;
    
    // Compute new value
    const value = await computeFn();
    
    // Cache new value
    await this.set(key, value);
    
    return value;
  }
}

/**
 * Try to use cached validation results
 * @param {WorkflowCache} cache - Cache instance
 * @param {Object} options - Options
 * @returns {Promise<Object>} Cache result: { fromCache, cacheKey, data }
 */
export async function tryUseValidationCache(cache, options = {}) {
  if (options.noCache) {
    logger.debug('Cache disabled with --no-cache flag');
    return { fromCache: false };
  }
  
  logger.info('Checking for cached validation results...');
  
  // Files that affect validation
  const relevantFiles = [
    'package.json',
    'tsconfig.json',
    '.eslintrc.js',
    '.eslintignore'
  ];
  
  // Generate a cache key based on these files
  const cacheKey = await generateCacheKey('validation', relevantFiles);
  
  // Try to get cached validation results
  const cachedResults = await cache.get(cacheKey);
  if (cachedResults) {
    // Ensure warnings are properly initialized even if missing in the cache
    if (!cachedResults.warnings) {
      cachedResults.warnings = [];
      logger.debug('No warnings found in cache, initializing empty array');
    }
    
    logger.success('Using cached validation results');
    return { 
      fromCache: true, 
      cacheKey,
      data: cachedResults
    };
  }
  
  return { fromCache: false, cacheKey };
}

/**
 * Save validation results to cache
 * @param {WorkflowCache} cache - Cache instance
 * @param {string} cacheKey - Cache key
 * @param {Object} advancedChecks - Advanced check results
 * @param {Map} workflowSteps - Workflow steps
 * @param {Array} workflowWarnings - Workflow warnings
 * @param {Object} options - Options
 * @returns {Promise<boolean>} Success
 */
export async function saveValidationCache(cache, cacheKey, advancedChecks, workflowSteps, workflowWarnings = [], options = {}) {
  if (options.noCache) return false;
  
  // Collect steps for caching
  const stepsToCache = [];
  for (const [_name, step] of workflowSteps.entries()) {
    if (step.phase === 'Validation') {
      stepsToCache.push(step);
    }
  }
  
  // Data to cache
  const dataToCache = {
    advancedChecks,
    steps: stepsToCache,
    warnings: workflowWarnings, // Add warnings to cache
    timestamp: Date.now()
  };
  
  // Save to cache
  const result = await cache.set(cacheKey, dataToCache);
  logger.debug('Validation results cached');
  return result;
}

/**
 * Try to use cached build results
 * @param {WorkflowCache} cache - Cache instance
 * @param {Object} options - Options
 * @returns {Promise<Object>} Cache result: { fromCache, cacheKey, data }
 */
export async function tryUseBuildCache(cache, options = {}) {
  if (options.noCache) {
    logger.debug('Cache disabled with --no-cache flag');
    return { fromCache: false };
  }
  
  logger.info('Checking for cached build results...');
  
  // Files that affect build
  const relevantFiles = [
    'package.json',
    'webpack.config.js',
    'tsconfig.json'
  ];
  
  // Generate a cache key based on these files
  const cacheKey = await generateCacheKey('build', relevantFiles);
  
  // Try to get cached build results
  const cachedResults = await cache.get(cacheKey);
  if (cachedResults) {
    logger.success('Using cached build results');
    return { 
      fromCache: true,
      cacheKey,
      data: cachedResults
    };
  }
  
  return { fromCache: false, cacheKey };
}

/**
 * Save build results to cache
 * @param {WorkflowCache} cache - Cache instance
 * @param {string} cacheKey - Cache key
 * @param {Object} buildMetrics - Build metrics
 * @param {Map} workflowSteps - Workflow steps
 * @param {Object} options - Options
 * @returns {Promise<boolean>} Success
 */
export async function saveBuildCache(cache, cacheKey, buildMetrics, workflowSteps, options = {}) {
  if (options.noCache) return false;
  
  // Collect steps for caching
  const stepsToCache = [];
  let buildSucceeded = true;
  for (const [_name, step] of workflowSteps.entries()) {
    if (step.phase === 'Build') {
      stepsToCache.push(step);
      // Check if critical steps like 'Package Build' failed
      if (step.name === 'Package Build' && !step.success) {
        buildSucceeded = false;
      }
    }
  }
  
  // Do not save cache if the build failed
  if (!buildSucceeded) {
    logger.warn('Build failed, skipping saving build results to cache.');
    return false;
  }
  
  // Ensure buildMetrics is valid before caching
  if (!buildMetrics || typeof buildMetrics !== 'object' || Object.keys(buildMetrics).length === 0) {
    logger.warn('Invalid or empty buildMetrics provided, skipping saving build results to cache.');
    return false;
  }
  
  // Data to cache
  const dataToCache = {
    buildMetrics,
    steps: stepsToCache,
    timestamp: Date.now()
  };
  
  // Save to cache
  const result = await cache.set(cacheKey, dataToCache);
  logger.debug('Build results cached');
  return result;
} 