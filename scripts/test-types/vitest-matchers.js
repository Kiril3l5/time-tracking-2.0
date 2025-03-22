#!/usr/bin/env node

/**
 * Vitest Matchers Module
 * 
 * Provides custom test matchers for Vitest testing framework.
 * This module extends Vitest's built-in matchers with Firebase-specific
 * and application-specific matchers.
 * 
 * Features:
 * - Custom matchers for Firebase data validation
 * - Utilities for asserting on asynchronous Firebase operations
 * - TypeScript type definitions for custom matchers
 * - Helper functions for testing Firebase Auth, Firestore, and Storage
 * 
 * @module test-types/vitest-matchers
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as logger from '../core/logger.js';

// Base custom matcher type definitions
const VITEST_MATCHERS_TYPE_DEF = `
// Custom Vitest matchers for Firebase testing
// This file should not be edited manually

import '@vitest/expect';

declare module '@vitest/expect' {
  interface Assertion<T = any> {
    /**
     * Assert that a Firestore document has specific fields
     * @param fields Object containing expected fields
     * @param options Optional matcher options
     */
    toHaveDocumentFields(fields: Record<string, any>, options?: {
      /**
       * Whether to check for exact match (no extra fields allowed)
       */
      exact?: boolean;
      /**
       * Whether to do a deep comparison of fields
       */
      deep?: boolean;
    }): void;
    
    /**
     * Assert that a Firestore query contains a document with specific fields
     * @param fields Object containing expected fields
     */
    toContainDocument(fields: Record<string, any>): void;
    
    /**
     * Assert that a Firebase auth user has specific properties
     * @param properties Expected user properties
     */
    toHaveUserProperties(properties: Record<string, any>): void;
    
    /**
     * Assert that an object is a valid Firestore timestamp
     */
    toBeFirestoreTimestamp(): void;
    
    /**
     * Assert that a function throws a Firebase error with a specific code
     * @param code Expected Firebase error code
     */
    toThrowFirebaseError(code: string): void;
    
    /**
     * Assert that a Storage reference points to a specific path
     * @param path Expected storage path
     */
    toHaveStoragePath(path: string): void;
    
    /**
     * Assert that a Promise resolves within a specific time
     * @param ms Maximum time in milliseconds
     */
    toResolveWithin(ms: number): Promise<void>;
  }
}

// Extend the global Vitest namespace
declare global {
  namespace Vi {
    interface Assertion<T = any> {
      /**
       * Assert that a Firestore document has specific fields
       * @param fields Object containing expected fields
       * @param options Optional matcher options
       */
      toHaveDocumentFields(fields: Record<string, any>, options?: {
        /**
         * Whether to check for exact match (no extra fields allowed)
         */
        exact?: boolean;
        /**
         * Whether to do a deep comparison of fields
         */
        deep?: boolean;
      }): void;
      
      /**
       * Assert that a Firestore query contains a document with specific fields
       * @param fields Object containing expected fields
       */
      toContainDocument(fields: Record<string, any>): void;
      
      /**
       * Assert that a Firebase auth user has specific properties
       * @param properties Expected user properties
       */
      toHaveUserProperties(properties: Record<string, any>): void;
      
      /**
       * Assert that an object is a valid Firestore timestamp
       */
      toBeFirestoreTimestamp(): void;
      
      /**
       * Assert that a function throws a Firebase error with a specific code
       * @param code Expected Firebase error code
       */
      toThrowFirebaseError(code: string): void;
      
      /**
       * Assert that a Storage reference points to a specific path
       * @param path Expected storage path
       */
      toHaveStoragePath(path: string): void;
      
      /**
       * Assert that a Promise resolves within a specific time
       * @param ms Maximum time in milliseconds
       */
      toResolveWithin(ms: number): Promise<void>;
    }
  }
}
`;

// Base custom matcher implementation
const VITEST_MATCHERS_IMPLEMENTATION = `
// Custom Vitest matchers for Firebase testing
// This file should not be edited manually

import { expect } from 'vitest';

// Helper function to check if an object is a Firestore document
function isFirestoreDocument(obj) {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.id === 'string' && 
    typeof obj.ref === 'object' && 
    typeof obj.data === 'function';
}

// Helper function to check if an object is a Firestore timestamp
function isFirestoreTimestamp(obj) {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.toDate === 'function' && 
    typeof obj.seconds === 'number' && 
    typeof obj.nanoseconds === 'number';
}

// Helper function to check if an object is a Firebase auth user
function isFirebaseUser(obj) {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.uid === 'string' && 
    typeof obj.getIdToken === 'function';
}

// Helper function to check if an object is a Firebase storage reference
function isStorageReference(obj) {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.bucket === 'string' && 
    typeof obj.fullPath === 'string' && 
    typeof obj.name === 'string';
}

// Custom matchers
expect.extend({
  // Assert that a Firestore document has specific fields
  toHaveDocumentFields(received, expected, options = {}) {
    const { exact = false, deep = true } = options;
    
    if (!isFirestoreDocument(received)) {
      return {
        pass: false,
        message: () => \`Expected \${received} to be a Firestore document\`
      };
    }
    
    const data = received.data();
    
    if (!data) {
      return {
        pass: false,
        message: () => \`Expected document to exist but it doesn't\`
      };
    }
    
    // Check if all expected fields are present with matching values
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in data)) {
        return {
          pass: false,
          message: () => \`Expected document to have field "\${key}" but it was not found\`
        };
      }
      
      if (deep) {
        // Special handling for Firestore timestamps
        if (isFirestoreTimestamp(data[key]) && value instanceof Date) {
          const timestampDate = data[key].toDate();
          if (timestampDate.getTime() !== value.getTime()) {
            return {
              pass: false,
              message: () => \`Expected field "\${key}" to be date \${value} but got \${timestampDate}\`
            };
          }
          continue;
        }
        
        // Deep equality check for other values
        if (JSON.stringify(data[key]) !== JSON.stringify(value)) {
          return {
            pass: false,
            message: () => \`Expected field "\${key}" to be \${JSON.stringify(value)} but got \${JSON.stringify(data[key])}\`
          };
        }
      } else {
        // Shallow equality check
        if (data[key] !== value) {
          return {
            pass: false,
            message: () => \`Expected field "\${key}" to be \${value} but got \${data[key]}\`
          };
        }
      }
    }
    
    // If exact matching is required, check that there are no extra fields
    if (exact) {
      const extraFields = Object.keys(data).filter(key => !(key in expected));
      if (extraFields.length > 0) {
        return {
          pass: false,
          message: () => \`Document has unexpected fields: \${extraFields.join(', ')}\`
        };
      }
    }
    
    return {
      pass: true,
      message: () => \`Document has all expected fields\`
    };
  },
  
  // Assert that a Firestore query contains a document with specific fields
  toContainDocument(received, expected) {
    if (!received || !Array.isArray(received.docs)) {
      return {
        pass: false,
        message: () => \`Expected \${received} to be a Firestore query result\`
      };
    }
    
    for (const doc of received.docs) {
      const data = doc.data();
      let matches = true;
      
      for (const [key, value] of Object.entries(expected)) {
        if (!(key in data) || JSON.stringify(data[key]) !== JSON.stringify(value)) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        return {
          pass: true,
          message: () => \`Query contains a document matching the criteria\`
        };
      }
    }
    
    return {
      pass: false,
      message: () => \`Expected query to contain a document with fields \${JSON.stringify(expected)}, but none was found\`
    };
  },
  
  // Assert that a Firebase auth user has specific properties
  toHaveUserProperties(received, expected) {
    if (!isFirebaseUser(received)) {
      return {
        pass: false,
        message: () => \`Expected \${received} to be a Firebase user\`
      };
    }
    
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in received) || received[key] !== value) {
        return {
          pass: false,
          message: () => \`Expected user to have property "\${key}" with value \${value} but got \${received[key]}\`
        };
      }
    }
    
    return {
      pass: true,
      message: () => \`User has all expected properties\`
    };
  },
  
  // Assert that an object is a valid Firestore timestamp
  toBeFirestoreTimestamp(received) {
    const pass = isFirestoreTimestamp(received);
    
    return {
      pass,
      message: () => \`Expected \${received} \${pass ? 'not ' : ''}to be a Firestore timestamp\`
    };
  },
  
  // Assert that a function throws a Firebase error with a specific code
  async toThrowFirebaseError(received, expectedCode) {
    if (typeof received !== 'function') {
      return {
        pass: false,
        message: () => \`Expected a function, but got \${typeof received}\`
      };
    }
    
    try {
      await received();
      return {
        pass: false,
        message: () => \`Expected function to throw a Firebase error with code "\${expectedCode}" but it did not throw\`
      };
    } catch (error) {
      const hasCode = error && typeof error.code === 'string';
      const matchesCode = hasCode && error.code === expectedCode;
      
      return {
        pass: matchesCode,
        message: () => matchesCode
          ? \`Expected function not to throw Firebase error with code "\${expectedCode}"\`
          : \`Expected function to throw Firebase error with code "\${expectedCode}" but got \${hasCode ? \`"\${error.code}"\` : 'an error without a code'}\`
      };
    }
  },
  
  // Assert that a Storage reference points to a specific path
  toHaveStoragePath(received, expectedPath) {
    if (!isStorageReference(received)) {
      return {
        pass: false,
        message: () => \`Expected \${received} to be a Firebase Storage reference\`
      };
    }
    
    const pass = received.fullPath === expectedPath;
    
    return {
      pass,
      message: () => pass
        ? \`Expected Storage reference not to have path "\${expectedPath}"\`
        : \`Expected Storage reference to have path "\${expectedPath}" but got "\${received.fullPath}"\`
    };
  },
  
  // Assert that a Promise resolves within a specific time
  async toResolveWithin(received, ms) {
    if (!(received instanceof Promise)) {
      return {
        pass: false,
        message: () => \`Expected \${received} to be a Promise\`
      };
    }
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(\`Promise did not resolve within \${ms}ms\`)), ms);
    });
    
    try {
      await Promise.race([received, timeoutPromise]);
      return {
        pass: true,
        message: () => \`Promise resolved within \${ms}ms\`
      };
    } catch (error) {
      return {
        pass: false,
        message: () => \`\${error.message}\`
      };
    }
  }
});
`;

/**
 * Generate Vitest custom matchers type definition file
 * 
 * @param {Object} options - Generation options
 * @param {string} options.outputTypes - Output path for the type definitions file (relative to project root)
 * @param {string} options.outputImpl - Output path for the implementation file (relative to project root)
 * @param {boolean} [options.includeComments=true] - Whether to include descriptive comments
 * @param {boolean} [options.verbose=false] - Enable verbose output
 * @returns {Promise<object>} - Paths to the generated files
 */
export async function generateVitestMatchers(options) {
  const {
    outputTypes = 'src/tests/types/vitest-matchers.d.ts',
    outputImpl = 'src/tests/setup/vitest-matchers.js',
    includeComments = true,
    verbose = false
  } = options;
  
  logger.info(`Generating Vitest custom matchers...`);
  
  try {
    // Ensure directories exist
    const typesDir = path.dirname(outputTypes);
    const implDir = path.dirname(outputImpl);
    
    await fs.mkdir(typesDir, { recursive: true });
    await fs.mkdir(implDir, { recursive: true });
    
    // Generate files
    await fs.writeFile(outputTypes, VITEST_MATCHERS_TYPE_DEF, 'utf-8');
    await fs.writeFile(outputImpl, VITEST_MATCHERS_IMPLEMENTATION, 'utf-8');
    
    logger.success(`Vitest custom matchers generated at:
- Types: ${outputTypes}
- Implementation: ${outputImpl}`);
    
    if (verbose) {
      logger.info(`Type definition size: ${VITEST_MATCHERS_TYPE_DEF.length} bytes`);
      logger.info(`Implementation size: ${VITEST_MATCHERS_IMPLEMENTATION.length} bytes`);
    }
    
    return {
      typesPath: outputTypes,
      implPath: outputImpl
    };
  } catch (error) {
    logger.error(`Failed to generate Vitest custom matchers: ${error.message}`);
    throw error;
  }
}

/**
 * Generate setup file to use custom matchers in tests
 * 
 * @param {Object} options - Options
 * @param {string} options.setupPath - Path to the Vitest setup file
 * @param {string} options.matchersPath - Path to the matchers implementation file
 * @param {boolean} [options.createIfMissing=true] - Whether to create the setup file if missing
 * @param {boolean} [options.verbose=false] - Enable verbose output
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function setupVitestMatchers(options) {
  const {
    setupPath = 'src/tests/setup.js',
    matchersPath = 'src/tests/setup/vitest-matchers.js',
    createIfMissing = true,
    verbose = false
  } = options;
  
  logger.info(`Setting up Vitest custom matchers in ${setupPath}...`);
  
  try {
    let setupContent = '';
    let fileExists = true;
    
    // Check if setup file exists
    try {
      setupContent = await fs.readFile(setupPath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        fileExists = false;
        if (!createIfMissing) {
          logger.error(`Setup file not found: ${setupPath}`);
          return false;
        }
        logger.info(`Creating new setup file: ${setupPath}`);
        setupContent = `// Vitest setup file
// This file is run before each test file

`;
      } else {
        throw error;
      }
    }
    
    // Determine relative path from setup file to matchers implementation
    const relativePath = path.relative(
      path.dirname(setupPath),
      matchersPath
    ).replace(/\\/g, '/'); // Normalize path separators for cross-platform
    
    // Check if import already exists
    const importRegex = new RegExp(`import\\s+['"]${relativePath}['"]`, 'i');
    const requireRegex = new RegExp(`require\\s*\\(\\s*['"]${relativePath}['"]\\s*\\)`, 'i');
    
    if (importRegex.test(setupContent) || requireRegex.test(setupContent)) {
      logger.info(`Custom matchers already imported in setup file`);
      return true;
    }
    
    // Add import statement at the top of the file
    const importStatement = `import './${relativePath}';\n`;
    setupContent = importStatement + setupContent;
    
    // Write updated content
    await fs.mkdir(path.dirname(setupPath), { recursive: true });
    await fs.writeFile(setupPath, setupContent, 'utf-8');
    
    logger.success(`Vitest custom matchers setup complete`);
    
    // Suggest changes to vitest config if needed
    logger.info(`Make sure your vitest.config.js includes this setup file:
    
  test: {
    setupFiles: ['./src/tests/setup.js']
  }
`);
    
    return true;
  } catch (error) {
    logger.error(`Failed to setup Vitest custom matchers: ${error.message}`);
    return false;
  }
}

export default {
  generateVitestMatchers,
  setupVitestMatchers
}; 