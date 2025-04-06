/**
 * Parallel Task Executor
 * 
 * Provides utilities for running tasks in parallel with proper error handling
 * and progress tracking.
 */

import { logger } from '../core/logger.js';
import { setTimeout, clearTimeout } from 'timers';

/**
 * Run multiple tasks in parallel with throttling and error handling
 * 
 * @param {Array<Object>} tasks - Array of task definitions
 * @param {Function} tasks[].task - The async function to execute
 * @param {Object} tasks[].params - Parameters to pass to the task function
 * @param {string} tasks[].name - Name of the task for logging
 * @param {Object} options - Execution options
 * @param {number} [options.maxConcurrent=4] - Maximum number of concurrent tasks
 * @param {boolean} [options.failFast=false] - Whether to stop on first failure
 * @param {Function} [options.onProgress] - Progress callback
 * @param {number} [options.timeout=300000] - Timeout in ms for the entire parallel execution (5 min default)
 * @param {number} [options.taskTimeout=120000] - Timeout in ms for individual tasks (2 min default)
 * @returns {Promise<Array<Object>>} Array of task results
 */
export async function runTasksInParallel(tasks, options = {}) {
  const {
    maxConcurrent = 4,
    failFast = false,
    onProgress = null,
    timeout = 300000,       // 5 minute global timeout
    taskTimeout = 120000    // 2 minute per-task timeout
  } = options;
  
  const results = [];
  let completed = 0;
  let failed = false;
  
  // Create a queue of tasks
  const queue = [...tasks];
  const inProgress = new Set();
  
  logger.debug(`Running ${tasks.length} tasks in parallel (max ${maxConcurrent} concurrent)`);
  
  return new Promise((resolve, reject) => {
    // Set global timeout
    const globalTimeoutId = setTimeout(() => {
      const runningTasks = Array.from(inProgress).map(promise => {
        try {
          return promise._taskName || 'Unknown task';
        } catch (e) {
          return 'Unknown task';
        }
      });
      
      logger.error(`Parallel execution timed out after ${timeout}ms. Still running: ${runningTasks.join(', ')}`);
      reject(new Error(`Parallel execution timed out after ${timeout}ms. Some tasks did not complete in time.`));
    }, timeout);
    
    // Process the next batch of tasks
    function processQueue() {
      // If we need to stop due to failure or the queue is empty and nothing is in progress
      if ((failFast && failed) || (queue.length === 0 && inProgress.size === 0)) {
        clearTimeout(globalTimeoutId);
        return resolve(results);
      }
      
      // Start new tasks up to maxConcurrent
      while (inProgress.size < maxConcurrent && queue.length > 0 && !(failFast && failed)) {
        const taskDef = queue.shift();
        const { task, params, name } = taskDef;
        
        const taskPromise = (async () => {
          const startTime = Date.now();
          
          // Initialize timeoutId outside the promise
          let timeoutId = null;
          
          try {
            logger.debug(`Starting task: ${name}`);
            
            // Race the task against a timeout promise
            const result = await Promise.race([
              task(params),
              new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                  reject(new Error(`Task '${name}' timed out after ${taskTimeout}ms`));
                }, taskTimeout);
              })
            ]);
            
            // Clear the timeout since the task completed
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            
            const duration = Date.now() - startTime;
            logger.debug(`Completed task: ${name} in ${duration}ms`);
            
            // DEBUG: Log the structure of the result received from the task function
            logger.debug(`[Parallel Executor - ${name}] Task function returned: ${JSON.stringify(result)}`);
            
            return {
              name,
              success: true,
              result,
              duration
            };
          } catch (error) {
            // Clear the timeout if it was set
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            
            const duration = Date.now() - startTime;
            logger.error(`Task failed: ${name} - ${error.message} in ${duration}ms`);
            
            // Set as failed if failFast is true
            if (failFast) {
              failed = true;
            }
            
            return {
              name,
              success: false,
              error: error.message,
              duration
            };
          } finally {
            completed++;
            inProgress.delete(taskPromise);
            
            if (onProgress) {
              onProgress(completed, tasks.length);
            }
            
            // Process the next batch
            processQueue();
          }
        })();
        
        // Store task name for debugging
        taskPromise._taskName = name;
        
        // Add to in-progress set
        inProgress.add(taskPromise);
        
        // Add to results
        results.push(taskPromise);
      }
    }
    
    // Start processing
    processQueue();
  })
  .then(promiseResults => Promise.all(promiseResults))
  .catch(error => {
    logger.error(`Parallel execution error: ${error.message}`);
    // Return any completed results along with the error
    return Promise.all(
      results.map(result => 
        result.catch(err => ({
          success: false,
          error: err.message || 'Task failed',
          timedOut: true
        }))
      )
    );
  });
}

/**
 * Wraps a function to add caching functionality
 * 
 * @param {Function} fn - The function to wrap
 * @param {Object} options - Caching options
 * @param {Function} options.getCacheKey - Function to generate cache key
 * @param {Function} options.getCache - Function to retrieve from cache
 * @param {Function} options.setCache - Function to store in cache
 * @returns {Function} Wrapped function with caching
 */
export function withCaching(fn, options) {
  const { getCacheKey, getCache, setCache } = options;
  
  return async function(...args) {
    const cacheKey = await getCacheKey(...args);
    
    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for key: ${cacheKey}`);
      return cached;
    }
    
    // Run the function
    logger.debug(`Cache miss for key: ${cacheKey}`);
    const result = await fn(...args);
    
    // Store in cache
    await setCache(cacheKey, result);
    return result;
  };
} 