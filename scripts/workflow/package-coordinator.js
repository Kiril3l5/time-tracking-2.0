/**
 * Package Coordinator Module
 * 
 * Manages package dependencies and build order.
 */

import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';
import process from 'node:process';

export class PackageCoordinator {
  constructor() {
    this.packages = new Map();
    this.buildOrder = [];
  }

  /**
   * Initialize package coordinator
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    logger.info('Analyzing package dependencies...');
    
    try {
      // Find all packages
      await this.findPackages();
      
      // Determine build order
      this.determineBuildOrder();
      
      return {
        success: true,
        packages: this.packages,
        buildOrder: this.buildOrder
      };
    } catch (error) {
      logger.error(`Package analysis failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find all packages in the workspace
   * @private
   */
  async findPackages() {
    // For now, primarily handle the main package
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        this.packages.set('main', {
          name: packageJson.name || 'main',
          version: packageJson.version || '0.0.0',
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {}
        });
      }

      // Check for packages directory
      const packagesDir = path.join(process.cwd(), 'packages');
      if (fs.existsSync(packagesDir)) {
        const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pkgPath = path.join(packagesDir, entry.name, 'package.json');
            if (fs.existsSync(pkgPath)) {
              try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                this.packages.set(pkg.name, {
                  name: pkg.name,
                  path: path.join(packagesDir, entry.name),
                  dependencies: pkg.dependencies || {},
                  devDependencies: pkg.devDependencies || {}
                });
              } catch (error) {
                logger.warn(`Error parsing ${pkgPath}: ${error.message}`);
              }
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error.message}`);
    }
  }

  /**
   * Determine the build order of packages
   * @private
   */
  determineBuildOrder() {
    // Start with the main package
    this.buildOrder = ['main'];
    
    // Add additional packages - for simplicity, we're not doing complex dependency analysis
    for (const [name, pkg] of this.packages.entries()) {
      if (name !== 'main') {
        this.buildOrder.push(name);
      }
    }
  }

  /**
   * Get the build order
   * @returns {Array} Build order array
   */
  getBuildOrder() {
    return this.buildOrder;
  }

  /**
   * Get all packages
   * @returns {Map} Packages map
   */
  getPackages() {
    return this.packages;
  }
}