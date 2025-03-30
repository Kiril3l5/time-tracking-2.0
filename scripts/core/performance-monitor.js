/* global process, setTimeout */

/**
 * Performance Monitor Module
 * 
 * Tracks execution time of workflow steps and operations.
 */

import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: null,
      steps: {},
      totalDuration: 0,
      resourceHistory: []
    };

    // Add resource limits
    this.resourceLimits = {
      memory: {
        warning: 0.8, // 80% of available memory
        critical: 0.9 // 90% of available memory
      },
      cpu: {
        warning: 0.7, // 70% CPU usage
        critical: 0.85 // 85% CPU usage
      },
      disk: {
        warning: 0.8, // 80% disk usage
        critical: 0.9 // 90% disk usage
      }
    };

    // Add cleanup tracking
    this.cleanupTasks = new Set();

    // Add performance thresholds
    this.performanceThresholds = {
      stepDuration: {
        warning: 30000, // 30 seconds
        critical: 60000 // 60 seconds
      }
    };
  }

  start() {
    this.metrics.startTime = Date.now();
  }

  startStep(stepName) {
    this.metrics.steps[stepName] = {
      startTime: Date.now(),
      duration: 0
    };
  }

  endStep(stepName) {
    if (this.metrics.steps[stepName]) {
      this.metrics.steps[stepName].duration = Date.now() - this.metrics.steps[stepName].startTime;
    }
  }

  end() {
    this.metrics.totalDuration = Date.now() - this.metrics.startTime;
    this.saveMetrics();
  }

  saveMetrics() {
    try {
      const metricsDir = path.join(process.cwd(), 'temp', 'metrics');
      if (!fs.existsSync(metricsDir)) {
        fs.mkdirSync(metricsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(metricsDir, `workflow-metrics-${timestamp}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(this.metrics, null, 2));
      logger.info(`Performance metrics saved to ${filePath}`);
    } catch (error) {
      logger.warn('Failed to save performance metrics:', error.message);
    }
  }

  getMetrics() {
    return this.metrics;
  }

  /**
   * Track step performance
   * @param {string} stepName - Name of the step
   * @param {number} duration - Duration in milliseconds
   */
  trackStepPerformance(stepName, duration) {
    if (!this.metrics.steps[stepName]) {
      this.metrics.steps[stepName] = {
        startTime: null,
        duration: 0,
        performance: []
      };
    }

    this.metrics.steps[stepName].performance.push({
      timestamp: new Date().toISOString(),
      duration
    });

    // Keep only last 10 performance records
    if (this.metrics.steps[stepName].performance.length > 10) {
      this.metrics.steps[stepName].performance.shift();
    }

    // Check against thresholds
    if (duration > this.performanceThresholds.stepDuration.critical) {
      logger.error(`Critical performance issue in step ${stepName}: ${duration}ms`);
    } else if (duration > this.performanceThresholds.stepDuration.warning) {
      logger.warn(`Performance warning in step ${stepName}: ${duration}ms`);
    }
  }

  /**
   * Get performance summary
   * @returns {Object} Performance summary
   */
  getPerformanceSummary() {
    const summary = {
      totalDuration: this.metrics.totalDuration,
      stepCount: Object.keys(this.metrics.steps).length,
      slowSteps: [],
      resourceIssues: []
    };

    // Find slow steps
    for (const [stepName, stepData] of Object.entries(this.metrics.steps)) {
      if (stepData.duration > this.performanceThresholds.stepDuration.warning) {
        summary.slowSteps.push({
          name: stepName,
          duration: stepData.duration
        });
      }
    }

    // Check resource history
    if (this.metrics.resourceHistory.length > 0) {
      const lastResourceCheck = this.metrics.resourceHistory[this.metrics.resourceHistory.length - 1];
      for (const [resource, usage] of Object.entries(lastResourceCheck)) {
        if (usage > this.resourceLimits[resource].warning) {
          summary.resourceIssues.push({
            resource,
            usage: usage * 100
          });
        }
      }
    }

    return summary;
  }

  /**
   * Monitor system resources
   * @returns {Object} Resource usage metrics
   */
  async monitorResources() {
    const metrics = {
      memory: await this.getMemoryUsage(),
      cpu: await this.getCPUUsage(),
      disk: await this.getDiskUsage()
    };

    // Store in history
    this.metrics.resourceHistory.push(metrics);
    if (this.metrics.resourceHistory.length > 10) {
      this.metrics.resourceHistory.shift();
    }

    // Check against limits
    for (const [resource, usage] of Object.entries(metrics)) {
      const limits = this.resourceLimits[resource];
      if (usage > limits.critical) {
        logger.error(`Critical ${resource} usage: ${(usage * 100).toFixed(1)}%`);
        this.triggerCleanup(resource);
      } else if (usage > limits.warning) {
        logger.warn(`High ${resource} usage: ${(usage * 100).toFixed(1)}%`);
      }
    }

    return metrics;
  }

  /**
   * Get memory usage
   * @returns {Promise<number>} Memory usage ratio
   */
  async getMemoryUsage() {
    const used = process.memoryUsage();
    const total = os.totalmem();
    return used.heapUsed / total;
  }

  /**
   * Get CPU usage
   * @returns {Promise<number>} CPU usage ratio
   */
  async getCPUUsage() {
    const startUsage = process.cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 100));
    const endUsage = process.cpuUsage(startUsage);
    return (endUsage.user + endUsage.system) / 1000000;
  }

  /**
   * Get disk usage
   * @returns {Promise<number>} Disk usage ratio
   */
  async getDiskUsage() {
    const stats = await fs.promises.statfs('/');
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    return (total - free) / total;
  }

  /**
   * Register cleanup task
   * @param {string} taskId - Unique task identifier
   * @param {Function} cleanupFn - Cleanup function
   */
  registerCleanupTask(taskId, cleanupFn) {
    this.cleanupTasks.add({
      id: taskId,
      fn: cleanupFn,
      timestamp: Date.now()
    });
  }

  /**
   * Trigger cleanup for resource
   * @param {string} resource - Resource type
   */
  async triggerCleanup(resource) {
    logger.info(`Triggering cleanup for ${resource}...`);
    
    for (const task of this.cleanupTasks) {
      try {
        await task.fn();
        logger.info(`Cleanup task ${task.id} completed`);
      } catch (error) {
        logger.error(`Cleanup task ${task.id} failed:`, error);
      }
    }
  }

  /**
   * Set timeout for long-running operations
   * @param {string} operation - Operation name
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Operation promise with timeout
   */
  async withTimeout(operation, timeout) {
    return Promise.race([
      operation,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
      )
    ]);
  }
}

// Create and export a singleton instance
export const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor; 