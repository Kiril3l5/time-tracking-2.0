/**
 * Documentation Quality Checker Module
 * 
 * Checks the quality of documentation and identifies issues like:
 * - Missing README files
 * - Outdated documentation
 * - Missing JSDoc comments
 * - Incomplete API documentation
 */

import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { globSync } from 'glob';

/* global process */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DocQualityChecker {
  constructor() {
    this.warnings = [];
  }
  
  /**
   * Check documentation quality
   * @returns {Promise<Object>} Check results
   */
  async checkDocQuality() {
    // Reset warnings
    this.warnings = [];
    
    try {
      // Run various doc quality checks
      await this._checkReadmeFiles();
      await this._checkJsDocComments();
      await this._checkMarkdownLinking();
      await this._checkApiDocumentation();
      
      return {
        success: this.warnings.length === 0,
        warnings: this.warnings
      };
    } catch (error) {
      logger.error(`Documentation quality check failed: ${error.message}`);
      return {
        success: false,
        warnings: [{
          message: `Documentation check error: ${error.message}`,
          phase: 'Validation',
          step: 'Documentation'
        }]
      };
    }
  }
  
  /**
   * Check for missing or incomplete README files
   * @private
   */
  async _checkReadmeFiles() {
    try {
      // Check main README.md
      const mainReadmePath = path.join(process.cwd(), 'README.md');
      if (!fs.existsSync(mainReadmePath)) {
        this.warnings.push({
          message: 'Missing main README.md file at project root',
          phase: 'Validation',
          step: 'Documentation'
        });
      } else {
        // Check README content
        const content = fs.readFileSync(mainReadmePath, 'utf8');
        
        // Check for minimum content length (very short README is suspicious)
        if (content.length < 500) {
          this.warnings.push({
            message: 'README.md file is too short (< 500 chars). Consider adding more details.',
            phase: 'Validation',
            step: 'Documentation'
          });
        }
        
        // Check for basic sections
        if (!content.includes('# ') && !content.includes('## ')) {
          this.warnings.push({
            message: 'README.md lacks proper section headers. Consider adding structured sections.',
            phase: 'Validation',
            step: 'Documentation'
          });
        }
        
        // Check for installation section
        if (!content.toLowerCase().includes('install') && !content.toLowerCase().includes('setup')) {
          this.warnings.push({
            message: 'README.md lacks installation or setup instructions',
            phase: 'Validation',
            step: 'Documentation'
          });
        }
      }
      
      // Check for README files in key directories
      const importantDirs = ['src', 'app', 'components', 'lib', 'utils', 'api'];
      for (const dir of importantDirs) {
        const dirPath = path.join(process.cwd(), dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          const readmePath = path.join(dirPath, 'README.md');
          if (!fs.existsSync(readmePath)) {
            this.warnings.push({
              message: `Missing README.md in the "${dir}" directory`,
              phase: 'Validation',
              step: 'Documentation'
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`README check error: ${error.message}`);
    }
  }
  
  /**
   * Check for missing JSDoc comments
   * @private
   */
  async _checkJsDocComments() {
    try {
      // Find all JS/TS files
      const files = globSync('**/*.{js,ts,jsx,tsx}', {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
        cwd: process.cwd()
      });
      
      // Set to track files with JSDoc issues
      const filesWithIssues = new Set();
      
      for (const file of files) {
        const fullPath = path.join(process.cwd(), file);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Look for exported functions, classes, or interfaces without JSDoc
        const lines = content.split('\n');
        let inComment = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Track JSDoc comment state
          if (line.startsWith('/**')) {
            inComment = true;
          } else if (line.startsWith('*/')) {
            inComment = false;
            continue;
          }
          
          // If not in a comment, check for declarations without preceding JSDoc
          if (!inComment) {
            // Skip imports, constants, etc.
            if (line.startsWith('import ') || line.startsWith('const ') || 
                line.startsWith('let ') || line.startsWith('var ')) {
              continue;
            }
            
            // Check for export declarations without docs
            if ((line.startsWith('export ') || line.includes(' export ')) && 
                (line.includes('function ') || line.includes('class ') || 
                 line.includes('interface ') || line.includes('type '))) {
              
              // Check if previous lines had JSDoc
              let hasJsDoc = false;
              for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
                if (lines[j].trim().startsWith('/**')) {
                  hasJsDoc = true;
                  break;
                }
                // Stop if we hit another declaration
                if (lines[j].trim().length > 0 && !lines[j].trim().startsWith('*')) {
                  break;
                }
              }
              
              if (!hasJsDoc) {
                filesWithIssues.add(file);
                break; // Only count each file once
              }
            }
          }
        }
      }
      
      // Add warnings for files with JSDoc issues
      if (filesWithIssues.size > 0) {
        // If there are many files, just report the count
        if (filesWithIssues.size > 5) {
          this.warnings.push({
            message: `Found ${filesWithIssues.size} files with missing JSDoc comments on exported items`,
            phase: 'Validation',
            step: 'Documentation'
          });
        } else {
          // Report each file individually if there are just a few
          for (const file of filesWithIssues) {
            this.warnings.push({
              message: `Missing JSDoc comments on exported items in ${file}`,
              file,
              phase: 'Validation',
              step: 'Documentation'
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`JSDoc check error: ${error.message}`);
    }
  }
  
  /**
   * Check for broken links in markdown files
   * @private
   */
  async _checkMarkdownLinking() {
    try {
      // Find all markdown files
      const markdownFiles = globSync('**/*.md', {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        cwd: process.cwd()
      });
      
      for (const file of markdownFiles) {
        const fullPath = path.join(process.cwd(), file);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Extract all links
        const internalLinkRegex = /\[.+?\]\((?!http)(.+?)\)/g;
        let match;
        while ((match = internalLinkRegex.exec(content)) !== null) {
          const linkTarget = match[1].split('#')[0]; // Remove fragment
          
          // Skip empty links and anchor-only links
          if (!linkTarget) continue;
          
          // Check if target exists
          const targetPath = path.join(path.dirname(fullPath), linkTarget);
          if (!fs.existsSync(targetPath)) {
            this.warnings.push({
              message: `Broken internal link in ${file}: ${linkTarget}`,
              file,
              phase: 'Validation',
              step: 'Documentation'
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`Markdown link check error: ${error.message}`);
    }
  }
  
  /**
   * Check for API documentation
   * @private
   */
  async _checkApiDocumentation() {
    try {
      // Look for API directories
      const apiDirs = ['api', 'src/api', 'app/api'];
      
      for (const dir of apiDirs) {
        const dirPath = path.join(process.cwd(), dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          // Check if there's an API documentation file
          const docFiles = [
            path.join(dirPath, 'README.md'),
            path.join(dirPath, 'API.md'),
            path.join(dirPath, 'docs', 'README.md')
          ];
          
          if (!docFiles.some(f => fs.existsSync(f))) {
            this.warnings.push({
              message: `Missing API documentation for the "${dir}" directory`,
              phase: 'Validation',
              step: 'Documentation'
            });
          }
          
          // Check for .openapi.yaml or .openapi.json files
          const apiFiles = globSync(`${dir}/**/*.{ts,js}`, {
            ignore: ['**/*.test.*', '**/*.spec.*'],
            cwd: process.cwd()
          });
          
          if (apiFiles.length > 0 && 
              !fs.existsSync(path.join(process.cwd(), 'openapi.yaml')) && 
              !fs.existsSync(path.join(process.cwd(), 'openapi.json'))) {
            this.warnings.push({
              message: 'Missing OpenAPI specification file for API endpoints',
              phase: 'Validation',
              step: 'Documentation'
            });
          }
        }
      }
    } catch (error) {
      logger.debug(`API documentation check error: ${error.message}`);
    }
  }
}

/**
 * Run documentation quality checks
 * @returns {Promise<Object>} Results with warnings
 */
export async function checkDocumentation() {
  const checker = new DocQualityChecker();
  return checker.checkDocQuality();
}

// For direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkDocumentation()
    .then(result => {
      if (result.warnings.length > 0) {
        logger.warn(`Found ${result.warnings.length} documentation issues:`);
        result.warnings.forEach(warning => logger.warn(`- ${warning.message}`));
      } else {
        logger.success('Documentation checks passed!');
      }
    })
    .catch(error => {
      logger.error('Documentation check failed:', error);
    });
} 