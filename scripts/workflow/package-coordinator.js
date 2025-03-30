/**
 * Package Coordinator Module
 * 
 * Manages package coordination in the monorepo, including:
 * - Dependency analysis
 * - Build order optimization
 * - Resource allocation
 * - Performance monitoring
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { performanceMonitor } from '../core/performance-monitor.js';
import errorHandler from '../core/error-handler.js';

// Workflow Components
import getWorkflowState from './workflow-state.js';

/**
 * Validate package dependencies
 * @param {Object} packageJson - Package.json content
 * @param {string} packageName - Name of the package
 * @returns {Object} Validation result
 */
function validateDependencies(packageJson, packageName) {
  const errors = [];
  const warnings = [];
  
  // Check required fields
  if (!packageJson.name) {
    errors.push('Missing required field: name');
  }
  if (!packageJson.version) {
    errors.push('Missing required field: version');
  }
  
  // Validate dependencies
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies
  };
  
  for (const [depName, version] of Object.entries(deps)) {
    // Check for invalid version ranges
    if (!/^[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(version)) {
      warnings.push(`Invalid version range for ${depName}: ${version}`);
    }
    
    // Check for workspace dependencies
    if (depName.startsWith('@')) {
      const workspaceName = depName.split('/')[0];
      if (!packageJson.workspaces?.includes(workspaceName)) {
        warnings.push(`Workspace dependency ${depName} not found in workspaces`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export class PackageCoordinator {
  constructor() {
    this.logger = logger;
    this.commandRunner = commandRunner;
    this.performanceMonitor = performanceMonitor;
    this.errorHandler = errorHandler;
    this.workflowState = getWorkflowState();
    this.packages = ['hours', 'admin', 'common'];
    this.dependencies = new Map();
    this.buildOrder = [];
    this.testOrder = [];
    this.sharedResources = new Set();
    this.performance = {
      packageMetrics: new Map(),
      sharedMetrics: new Map(),
      totalDuration: 0
    };
  }

  /**
   * Analyze package dependencies and determine build order
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeDependencies() {
    this.logger.info('Analyzing package dependencies...');
    const startTime = Date.now();
    
    try {
      // Get all package.json files using Node.js fs operations
      const workspaceRoot = process.cwd();
      const packages = new Map();
      const graph = new Map();
      
      // Read root package.json
      const rootPkgPath = path.join(workspaceRoot, 'package.json');
      const rootPkg = await this.readPackageJson(rootPkgPath);
      packages.set(rootPkg.name, {
        name: rootPkg.name,
        path: workspaceRoot,
        dependencies: rootPkg.dependencies || {},
        devDependencies: rootPkg.devDependencies || {},
        peerDependencies: rootPkg.peerDependencies || {}
      });
      
      // Read packages from packages directory
      const packagesDir = path.join(workspaceRoot, 'packages');
      const entries = await fs.promises.readdir(packagesDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = path.join(packagesDir, entry.name, 'package.json');
          try {
            const pkg = await this.readPackageJson(pkgPath);
            
            // Validate package.json
            const validation = validateDependencies(pkg, pkg.name);
            if (!validation.isValid) {
              this.logger.error(`Validation errors in ${pkgPath}:`, validation.errors);
              throw new this.errorHandler.ValidationError(
                `Invalid package.json in ${pkgPath}: ${validation.errors.join(', ')}`
              );
            }
            
            // Add warnings to workflow state
            validation.warnings.forEach(warning => {
              this.workflowState.addWarning(warning);
            });
            
            packages.set(pkg.name, {
              name: pkg.name,
              path: path.join(packagesDir, entry.name),
              dependencies: pkg.dependencies || {},
              devDependencies: pkg.devDependencies || {},
              peerDependencies: pkg.peerDependencies || {}
            });
            
            // Build dependency graph
            const deps = {
              ...pkg.dependencies,
              ...pkg.devDependencies,
              ...pkg.peerDependencies
            };
            
            graph.set(pkg.name, Object.keys(deps));
          } catch (error) {
            if (error instanceof this.errorHandler.ValidationError) {
              throw error;
            }
            throw new this.errorHandler.WorkflowError(`Failed to parse ${pkgPath}: ${error.message}`);
          }
        }
      }
      
      // Detect circular dependencies
      const visited = new Set();
      const recursionStack = new Set();
      
      function hasCycle(node) {
        if (!visited.has(node)) {
          visited.add(node);
          recursionStack.add(node);
          
          const neighbors = graph.get(node) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor) && hasCycle(neighbor)) {
              return true;
            } else if (recursionStack.has(neighbor)) {
              return true;
            }
          }
        }
        
        recursionStack.delete(node);
        return false;
      }
      
      for (const node of graph.keys()) {
        if (hasCycle(node)) {
          throw new this.errorHandler.ValidationError('Circular dependencies detected');
        }
      }
      
      // Calculate build order using topological sort
      const buildOrder = [];
      const temp = new Set();
      const perm = new Set();
      
      function visit(node) {
        if (temp.has(node)) {
          throw new this.errorHandler.ValidationError('Circular dependencies detected');
        }
        if (!perm.has(node)) {
          temp.add(node);
          const neighbors = graph.get(node) || [];
          for (const neighbor of neighbors) {
            visit(neighbor);
          }
          temp.delete(node);
          perm.add(node);
          buildOrder.push(node);
        }
      }
      
      for (const node of graph.keys()) {
        if (!perm.has(node)) {
          visit(node);
        }
      }
      
      const duration = Date.now() - startTime;
      this.logger.success(`Dependency analysis complete (Duration: ${duration}ms)`);
      
      return {
        success: true,
        duration,
        packages,
        graph,
        buildOrder
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Dependency analysis failed: ${error.message}`);
      
      return {
        success: false,
        duration,
        error: error.message
      };
    }
  }

  /**
   * Read and parse package.json file
   * @private
   * @param {string} path - Path to package.json
   * @returns {Promise<Object>} Parsed package.json
   */
  async readPackageJson(path) {
    try {
      this.logger.info(`Attempting to read package.json from: ${path}`);
      const content = await fs.promises.readFile(path, 'utf8');
      this.logger.info(`Successfully read package.json, content length: ${content.length}`);
      const parsed = JSON.parse(content);
      this.logger.info(`Successfully parsed package.json, name: ${parsed.name}`);
      return parsed;
    } catch (error) {
      this.logger.error(`Error reading package.json at ${path}:`, error);
      throw new this.errorHandler.WorkflowError(
        `Failed to read package.json at ${path}`,
        'package.json',
        error
      );
    }
  }

  /**
   * Read package.json files from workspace
   * @private
   * @returns {Promise<Array>} Array of package information
   */
  async readPackages() {
    const packages = [];
    const workspaceRoot = process.cwd();
    this.logger.info(`Current working directory: ${workspaceRoot}`);

    // Read root package.json
    const rootPkgPath = path.join(workspaceRoot, 'package.json');
    this.logger.info(`Reading root package.json from: ${rootPkgPath}`);
    const rootPkg = await this.readPackageJson(rootPkgPath);
    packages.push(rootPkg);

    // Read packages from packages directory
    const packagesDir = path.join(workspaceRoot, 'packages');
    this.logger.info(`Reading packages from: ${packagesDir}`);
    
    try {
      const entries = await fs.promises.readdir(packagesDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgPath = path.join(packagesDir, entry.name, 'package.json');
          this.logger.info(`Checking for package.json at: ${pkgPath}`);
          
          try {
            const pkg = await this.readPackageJson(pkgPath);
            packages.push(pkg);
            this.logger.info(`Successfully read package.json, name: ${pkg.name}`);
          } catch (error) {
            this.logger.error(`Error reading package.json at ${pkgPath}:`, error);
            throw new this.errorHandler.WorkflowError(
              `Failed to read package.json at ${pkgPath}`,
              'package.json',
              error
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Error reading packages:', error);
      throw new this.errorHandler.WorkflowError(
        'Failed to read packages',
        'packages',
        error
      );
    }

    return packages;
  }
}

// Export package coordinator instance
export const packageCoordinator = new PackageCoordinator();

// Export analyzeDependencies function for direct use
export const analyzeDependencies = () => packageCoordinator.analyzeDependencies();