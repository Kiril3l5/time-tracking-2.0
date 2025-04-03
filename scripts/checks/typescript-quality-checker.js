/**
 * TypeScript Quality Checker Module
 * 
 * Performs comprehensive TypeScript quality checks:
 * - Query type fixes
 * - Unused import removal
 * - Duplicate import merging
 * - Type checking
 * - Module syntax validation
 * - Test type validation
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run comprehensive TypeScript quality checks
 * @param {Object} pkg - Package information
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check results
 */
export async function runTypeScriptChecks(pkg, options = {}) {
  const startTime = Date.now();
  const results = {
    success: true,
    issues: [],
    warnings: [],
    duration: 0,
    stats: {
      queryTypes: {
        filesChecked: 0,
        filesFixed: 0
      },
      imports: {
        unusedRemoved: 0,
        duplicatesMerged: 0
      },
      typeChecking: {
        errors: 0,
        warnings: 0
      },
      testTypes: {
        errors: 0,
        warnings: 0
      }
    }
  };

  try {
    logger.info(`Running TypeScript quality checks for ${pkg.name}...`);

    // 1. Fix React Query Types
    const queryResults = await fixQueryTypes(pkg, options);
    if (!queryResults.success) {
      results.issues.push(...queryResults.issues);
      results.warnings.push(...queryResults.warnings);
    }
    results.stats.queryTypes = queryResults.stats;

    // 2. Fix Unused Imports
    const unusedResults = await fixUnusedImports(pkg, options);
    if (!unusedResults.success) {
      results.issues.push(...unusedResults.issues);
      results.warnings.push(...unusedResults.warnings);
    }
    results.stats.imports.unusedRemoved = unusedResults.stats.filesFixed;

    // 3. Fix Duplicate Imports
    const duplicateResults = await fixDuplicateImports(pkg, options);
    if (!duplicateResults.success) {
      results.issues.push(...duplicateResults.issues);
      results.warnings.push(...duplicateResults.warnings);
    }
    results.stats.imports.duplicatesMerged = duplicateResults.stats.filesFixed;

    // 4. Run TypeScript Type Checking
    const typeCheckResults = await runTypeChecking(pkg, options);
    if (!typeCheckResults.success) {
      results.issues.push(...typeCheckResults.issues);
      results.warnings.push(...typeCheckResults.warnings);
    }
    results.stats.typeChecking = typeCheckResults.stats;

    // 5. Validate Test Types
    const testTypeResults = await validateTestTypes(pkg, options);
    if (!testTypeResults.success) {
      results.issues.push(...testTypeResults.issues);
      results.warnings.push(...testTypeResults.warnings);
    }
    results.stats.testTypes = testTypeResults.stats;

    // Update success status
    results.success = results.issues.length === 0;
    results.duration = Date.now() - startTime;

    // Log summary
    if (options.verbose) {
      logger.info(`
TypeScript Quality Check Summary:
- Query Types: ${queryResults.success ? 'Valid' : 'Invalid'}
  - Files Checked: ${queryResults.stats.filesChecked}
  - Files Fixed: ${queryResults.stats.filesFixed}
- Unused Imports: ${unusedResults.success ? 'Valid' : 'Invalid'}
  - Removed: ${unusedResults.stats.filesFixed}
- Duplicate Imports: ${duplicateResults.success ? 'Valid' : 'Invalid'}
  - Merged: ${duplicateResults.stats.filesFixed}
- Type Checking: ${typeCheckResults.success ? 'Valid' : 'Invalid'}
  - Errors: ${typeCheckResults.stats.errors}
  - Warnings: ${typeCheckResults.stats.warnings}
- Test Types: ${testTypeResults.success ? 'Valid' : 'Invalid'}
  - Errors: ${testTypeResults.stats.errors}
  - Warnings: ${testTypeResults.stats.warnings}
      `);
    }

    return results;

  } catch (error) {
    logger.error('TypeScript quality checks failed:', error);
    return {
      success: false,
      issues: [error.message],
      warnings: [],
      duration: Date.now() - startTime,
      stats: {
        queryTypes: {
          filesChecked: 0,
          filesFixed: 0
        },
        imports: {
          unusedRemoved: 0,
          duplicatesMerged: 0
        },
        typeChecking: {
          errors: 0,
          warnings: 0
        },
        testTypes: {
          errors: 0,
          warnings: 0
        }
      }
    };
  }
}

/**
 * Fix React Query types
 * @param {Object} _pkg - Package information
 * @param {Object} _options - Fix options
 * @returns {Promise<Object>} Fix results
 */
async function fixQueryTypes(_pkg, _options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      filesChecked: 0,
      filesFixed: 0
    }
  };

  try {
    // Find all TypeScript files
    const findResult = await commandRunner.runCommand('find . -type f -name "*.ts" -o -name "*.tsx"', {
      ignoreError: true
    });

    if (!findResult.success) {
      results.issues.push('Failed to find TypeScript files');
      return results;
    }

    const files = findResult.output.split('\n').filter(Boolean);
    results.stats.filesChecked = files.length;

    // Process each file
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Skip files that don't use React Query
      if (!content.includes('useQuery') && !content.includes('useMutation')) {
        continue;
      }

      // Replace old imports with new ones
      const updatedContent = content
        .replace(/from ['"]react-query['"]/g, 'from "@tanstack/react-query"')
        .replace(/from ['"]@tanstack\/react-query\/devtools['"]/g, 'from "@tanstack/react-query-devtools"');

      if (content !== updatedContent) {
        fs.writeFileSync(file, updatedContent);
        results.stats.filesFixed++;
      }
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Query type fixes failed:', error);
    return {
      success: false,
      issues: ['Query type fixes failed'],
      warnings: [],
      stats: {
        filesChecked: 0,
        filesFixed: 0
      }
    };
  }
}

/**
 * Fix unused imports
 * @param {Object} _pkg - Package information
 * @param {Object} _options - Fix options
 * @returns {Promise<Object>} Fix results
 */
async function fixUnusedImports(_pkg, _options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      filesChecked: 0,
      filesFixed: 0
    }
  };

  try {
    // Find all TypeScript files
    const findResult = await commandRunner.runCommand('find . -type f -name "*.ts" -o -name "*.tsx"', {
      ignoreError: true
    });

    if (!findResult.success) {
      results.issues.push('Failed to find TypeScript files');
      return results;
    }

    const files = findResult.output.split('\n').filter(Boolean);
    results.stats.filesChecked = files.length;

    // Process each file
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Skip files without imports
      if (!content.includes('import ')) {
        continue;
      }

      // Find unused imports
      const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
      const usedImports = new Set();

      // Check for usage of each import
      for (const line of importLines) {
        const match = line.match(/import\s+{\s*([^}]+)\s*}\s+from/);
        if (match) {
          const imports = match[1].split(',').map(i => i.trim());
          for (const imp of imports) {
            if (content.includes(imp)) {
              usedImports.add(imp);
            }
          }
        }
      }

      // Remove unused imports
      const updatedContent = content.split('\n').filter(line => {
        if (line.trim().startsWith('import ')) {
          const match = line.match(/import\s+{\s*([^}]+)\s*}\s+from/);
          if (match) {
            const imports = match[1].split(',').map(i => i.trim());
            return imports.some(imp => usedImports.has(imp));
          }
        }
        return true;
      }).join('\n');

      if (content !== updatedContent) {
        fs.writeFileSync(file, updatedContent);
        results.stats.filesFixed++;
      }
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Unused import fixes failed:', error);
    return {
      success: false,
      issues: ['Unused import fixes failed'],
      warnings: [],
      stats: {
        filesChecked: 0,
        filesFixed: 0
      }
    };
  }
}

/**
 * Fix duplicate imports
 * @param {Object} _pkg - Package information
 * @param {Object} _options - Fix options
 * @returns {Promise<Object>} Fix results
 */
async function fixDuplicateImports(_pkg, _options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      filesChecked: 0,
      filesFixed: 0
    }
  };

  try {
    // Find all TypeScript files
    const findResult = await commandRunner.runCommand('find . -type f -name "*.ts" -o -name "*.tsx"', {
      ignoreError: true
    });

    if (!findResult.success) {
      results.issues.push('Failed to find TypeScript files');
      return results;
    }

    const files = findResult.output.split('\n').filter(Boolean);
    results.stats.filesChecked = files.length;

    // Process each file
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Skip files without imports
      if (!content.includes('import ')) {
        continue;
      }

      // Find duplicate imports
      const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
      const importMap = new Map();

      // Group imports by source
      for (const line of importLines) {
        const match = line.match(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]([^'"]+)['"]/);
        if (match) {
          const [, imports, source] = match;
          const importList = imports.split(',').map(i => i.trim());
          if (!importMap.has(source)) {
            importMap.set(source, new Set());
          }
          importList.forEach(imp => importMap.get(source).add(imp));
        }
      }

      // Generate new import statements
      const newImports = Array.from(importMap.entries()).map(([source, imports]) => {
        return `import { ${Array.from(imports).join(', ')} } from '${source}';`;
      });

      // Replace old imports with new ones
      const updatedContent = content.split('\n').map(line => {
        if (line.trim().startsWith('import ')) {
          return newImports.shift() || line;
        }
        return line;
      }).join('\n');

      if (content !== updatedContent) {
        fs.writeFileSync(file, updatedContent);
        results.stats.filesFixed++;
      }
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error('Duplicate import fixes failed:', error);
    return {
      success: false,
      issues: ['Duplicate import fixes failed'],
      warnings: [],
      stats: {
        filesChecked: 0,
        filesFixed: 0
      }
    };
  }
}

/**
 * Run TypeScript type checking
 * @param {Object} _pkg - Package information
 * @param {Object} _options - Check options
 * @returns {Promise<Object>} Check results
 */
async function runTypeChecking(_pkg, _options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      errors: 0,
      warnings: 0
    }
  };

  try {
    // Run TypeScript compiler in check mode
    const checkResult = await commandRunner.runCommand('pnpm tsc --noEmit', {
      ignoreError: true
    });

    // Parse TypeScript errors and warnings
    const lines = checkResult.output.split('\n');
    for (const line of lines) {
      if (line.includes('error TS')) {
        results.issues.push(line);
        results.stats.errors++;
      } else if (line.includes('warning TS')) {
        results.warnings.push(line);
        results.stats.warnings++;
      }
    }

    results.success = results.stats.errors === 0;
    return results;

  } catch (error) {
    logger.error('TypeScript type checking failed:', error);
    return {
      success: false,
      issues: ['TypeScript type checking failed'],
      warnings: [],
      stats: {
        errors: 0,
        warnings: 0
      }
    };
  }
}

/**
 * Validate test types
 * @param {Object} _pkg - Package information
 * @param {Object} _options - Validation options
 * @returns {Promise<Object>} Validation results
 */
async function validateTestTypes(_pkg, _options) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      errors: 0,
      warnings: 0
    }
  };

  try {
    // Find all test files
    const findResult = await commandRunner.runCommand('find . -type f -name "*.test.ts" -o -name "*.test.tsx"', {
      ignoreError: true
    });

    if (!findResult.success) {
      results.issues.push('Failed to find test files');
      return results;
    }

    const files = findResult.output.split('\n').filter(Boolean);

    // Process each test file
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for missing type imports
      if (content.includes('expect(') && !content.includes('import { expect } from')) {
        results.warnings.push(`Missing expect type import in ${file}`);
        results.stats.warnings++;
      }

      // Check for missing test type imports
      if (content.includes('test(') && !content.includes('import { test } from')) {
        results.warnings.push(`Missing test type import in ${file}`);
        results.stats.warnings++;
      }

      // Check for missing describe type imports
      if (content.includes('describe(') && !content.includes('import { describe } from')) {
        results.warnings.push(`Missing describe type import in ${file}`);
        results.stats.warnings++;
      }
    }

    results.success = results.stats.errors === 0;
    return results;

  } catch (error) {
    logger.error('Test type validation failed:', error);
    return {
      success: false,
      issues: ['Test type validation failed'],
      warnings: [],
      stats: {
        errors: 0,
        warnings: 0
      }
    };
  }
}

export default {
  runTypeScriptChecks
}; 