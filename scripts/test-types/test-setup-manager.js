#!/usr/bin/env node

/**
 * Test Setup Manager Module
 * 
 * Manages test setup files, providing utilities for creating, validating,
 * and maintaining test setup configurations.
 * 
 * Features:
 * - Generate test setup files for different testing scenarios
 * - Support for Vitest, Jest, and other testing frameworks
 * - Handle global setup and teardown functions
 * - Manage test mocks and fixtures
 * 
 * @module test-types/test-setup-manager
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

/**
 * Create a basic test setup file for Vitest
 * 
 * @param {Object} options - Setup options
 * @param {string} options.outputPath - Path to create the setup file
 * @param {boolean} [options.includeTimers=true] - Include fake timers setup
 * @param {boolean} [options.includeMocking=true] - Include basic mocking utilities
 * @param {boolean} [options.includeFirebase=false] - Include Firebase mocking
 * @param {boolean} [options.includeDOM=false] - Include DOM testing utilities
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<string>} - Path to the created file
 */
export async function createVitestSetup(options) {
  const {
    outputPath = 'src/tests/setup.js',
    includeTimers = true,
    includeMocking = true,
    includeFirebase = false,
    includeDOM = false,
    verbose = false
  } = options;
  
  logger.info(`Creating Vitest setup file at ${outputPath}...`);
  
  // Base setup content
  let content = `// Vitest test setup file
// This file is automatically loaded before running tests

import { vi } from 'vitest';

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

`;

  // Add timers if requested
  if (includeTimers) {
    content += `// Setup fake timers
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

`;
  }

  // Add mocking utilities if requested
  if (includeMocking) {
    content += `// Common mock reset
beforeEach(() => {
  vi.resetAllMocks();
  vi.clearAllMocks();
});

// Helper to create spies and mocks
export const createSpy = vi.fn;

// Helper to mock modules
export function mockModule(modulePath, implementation) {
  vi.mock(modulePath, () => implementation);
  return vi.mocked(implementation);
}

// Helper to reset mocks
export function resetMocks(...mocks) {
  mocks.forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
}

`;
  }

  // Add Firebase mocking if requested
  if (includeFirebase) {
    content += `// Firebase mocking setup
import { vi } from 'vitest';

const mockFirebaseAuth = {
  getAuth: vi.fn().mockReturnValue({
    currentUser: null,
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    createUserWithEmailAndPassword: vi.fn()
  }),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn()
};

const mockFirestore = {
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    onSnapshot: vi.fn()
  }),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn()
};

vi.mock('firebase/auth', () => mockFirebaseAuth);
vi.mock('firebase/firestore', () => mockFirestore);

// Reset Firebase mocks between tests
beforeEach(() => {
  Object.values(mockFirebaseAuth).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  Object.values(mockFirestore).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
});

`;
  }

  // Add DOM testing utilities if requested
  if (includeDOM) {
    content += `// DOM testing utilities
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Re-export testing library utilities
export { render, screen, fireEvent, waitFor, userEvent };

// Helper to render a component with default providers if needed
export function renderWithProviders(ui, options = {}) {
  const { wrapper, ...rest } = options;
  
  // You can replace this with your actual providers
  const AllProviders = ({ children }) => {
    return children;
  };
  
  return render(ui, { wrapper: wrapper || AllProviders, ...rest });
}

`;
  }

  // Ensure the directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the file
  await fs.writeFile(outputPath, content, 'utf-8');
  
  logger.success(`Vitest setup file created at: ${outputPath}`);
  
  if (verbose) {
    logger.info(`File size: ${content.length} bytes`);
    logger.info(`Included features: ${[
      includeTimers && 'Fake Timers',
      includeMocking && 'Mocking Utilities',
      includeFirebase && 'Firebase Mocks',
      includeDOM && 'DOM Testing'
    ].filter(Boolean).join(', ')}`);
  }
  
  return outputPath;
}

/**
 * Generate a test environment file for Jest/Vitest
 * 
 * @param {Object} options - Options
 * @param {string} options.outputPath - Path to create the environment file
 * @param {string} [options.framework='vitest'] - Testing framework ('vitest' or 'jest')
 * @param {string} [options.environmentType='jsdom'] - Environment type ('jsdom' or 'node')
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<string>} - Path to the created file
 */
export async function createTestEnvironment(options) {
  const {
    outputPath = 'src/tests/environment.js',
    framework = 'vitest',
    environmentType = 'jsdom',
    verbose = false
  } = options;
  
  logger.info(`Creating test environment file at ${outputPath}...`);
  
  let content = '';
  
  if (framework === 'vitest') {
    if (environmentType === 'jsdom') {
      content = `// Custom JSDOM environment for Vitest
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
beforeEach(() => {
  // Add any global setup needed before each test
});

afterEach(() => {
  cleanup(); // Clean up any rendered components
});

// Global setup and teardown
beforeAll(() => {
  // Add any one-time setup code here
  
  // Custom window properties
  global.window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  });
  
  // Mock intersection observer
  global.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }
    disconnect() {
      return null;
    }
    observe() {
      return null;
    }
    unobserve() {
      return null;
    }
  };
});

afterAll(() => {
  // Add any one-time teardown code here
});
`;
    } else { // node environment
      content = `// Custom Node environment for Vitest
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Environment setup and teardown
beforeAll(() => {
  // Add any one-time setup code here
  
  // Store original environment variables
  process.env.ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Restore environment variables
  process.env.NODE_ENV = process.env.ORIGINAL_NODE_ENV;
  delete process.env.ORIGINAL_NODE_ENV;
});

// Per-test setup and teardown
beforeEach(() => {
  // Add any setup before each test
});

afterEach(() => {
  // Add any cleanup after each test
});
`;
    }
  } else if (framework === 'jest') {
    // Similar content for Jest
    content = `// Custom test environment for Jest
import Environment from 'jest-environment-${environmentType}';

class CustomEnvironment extends Environment {
  constructor(config) {
    super(config);
    this.global.testPath = config.testPath;
  }

  async setup() {
    await super.setup();
    
    // Add any custom setup code here
    if (this.global.window) {
      // Browser-like environment setup
      this.global.window.matchMedia = query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
      });
    } else {
      // Node environment setup
      process.env.TEST_ENV = 'true';
    }
  }

  async teardown() {
    // Add any custom teardown code here
    
    await super.teardown();
  }
}

module.exports = CustomEnvironment;
`;
  }

  // Ensure the directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the file
  await fs.writeFile(outputPath, content, 'utf-8');
  
  logger.success(`Test environment file created at: ${outputPath}`);
  
  if (verbose) {
    logger.info(`Framework: ${framework}`);
    logger.info(`Environment type: ${environmentType}`);
    logger.info(`File size: ${content.length} bytes`);
  }
  
  if (framework === 'vitest') {
    logger.info(`
To use this environment, update your vitest.config.js:

export default defineConfig({
  test: {
    environment: ${environmentType === 'jsdom' ? "'jsdom'" : "'node'"},
    setupFiles: ['${outputPath.replace(/^src\//, './')}'],
  }
})
`);
  } else {
    logger.info(`
To use this environment, update your jest.config.js:

module.exports = {
  testEnvironment: '${outputPath}',
};
`);
  }
  
  return outputPath;
}

/**
 * Create a test fixtures file for managing test data
 * 
 * @param {Object} options - Options
 * @param {string} options.outputPath - Path to create the fixtures file
 * @param {string[]} [options.fixtureTypes=['users', 'posts']] - Types of fixtures to include
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<string>} - Path to the created file
 */
export async function createTestFixtures(options) {
  const {
    outputPath = 'src/tests/fixtures.js',
    fixtureTypes = ['users', 'posts'],
    verbose = false
  } = options;
  
  logger.info(`Creating test fixtures file at ${outputPath}...`);
  
  // Start with the header
  let content = `// Test fixtures file
// Contains sample data for use in tests

`;

  // Generate fixtures for each requested type
  if (fixtureTypes.includes('users')) {
    content += `// User fixtures
export const users = {
  admin: {
    uid: 'admin-user-123',
    email: 'admin@example.com',
    displayName: 'Admin User',
    photoURL: 'https://example.com/admin.png',
    emailVerified: true,
    isAdmin: true,
    createdAt: new Date('2023-01-01').toISOString(),
  },
  regular: {
    uid: 'regular-user-456',
    email: 'user@example.com',
    displayName: 'Regular User',
    photoURL: 'https://example.com/user.png',
    emailVerified: true,
    isAdmin: false,
    createdAt: new Date('2023-02-15').toISOString(),
  },
  new: {
    uid: 'new-user-789',
    email: 'new@example.com',
    displayName: 'New User',
    photoURL: null,
    emailVerified: false,
    isAdmin: false,
    createdAt: new Date('2023-05-20').toISOString(),
  }
};

`;
  }

  if (fixtureTypes.includes('posts')) {
    content += `// Post fixtures
export const posts = {
  published: {
    id: 'post-123',
    title: 'Published Post',
    content: 'This is a published post with content.',
    userId: 'regular-user-456',
    status: 'published',
    publishedAt: new Date('2023-03-10').toISOString(),
    updatedAt: new Date('2023-03-15').toISOString(),
  },
  draft: {
    id: 'post-456',
    title: 'Draft Post',
    content: 'This is a draft post with content.',
    userId: 'regular-user-456',
    status: 'draft',
    publishedAt: null,
    updatedAt: new Date('2023-04-20').toISOString(),
  },
  archived: {
    id: 'post-789',
    title: 'Archived Post',
    content: 'This is an archived post with content.',
    userId: 'admin-user-123',
    status: 'archived',
    publishedAt: new Date('2023-02-05').toISOString(),
    archivedAt: new Date('2023-04-05').toISOString(),
    updatedAt: new Date('2023-04-05').toISOString(),
  }
};

`;
  }

  if (fixtureTypes.includes('comments')) {
    content += `// Comment fixtures
export const comments = {
  approved: {
    id: 'comment-123',
    postId: 'post-123',
    userId: 'regular-user-456',
    content: 'This is an approved comment.',
    status: 'approved',
    createdAt: new Date('2023-03-12').toISOString(),
  },
  pending: {
    id: 'comment-456',
    postId: 'post-123',
    userId: 'new-user-789',
    content: 'This is a pending comment.',
    status: 'pending',
    createdAt: new Date('2023-03-14').toISOString(),
  },
  rejected: {
    id: 'comment-789',
    postId: 'post-123',
    userId: 'new-user-789',
    content: 'This is a rejected comment with inappropriate content.',
    status: 'rejected',
    createdAt: new Date('2023-03-13').toISOString(),
    rejectedAt: new Date('2023-03-13').toISOString(),
    rejectionReason: 'inappropriate_content',
  }
};

`;
  }
  
  if (fixtureTypes.includes('files')) {
    content += `// File fixtures
export const files = {
  image: {
    id: 'file-123',
    name: 'test-image.jpg',
    type: 'image/jpeg',
    size: 1024 * 50, // 50KB
    url: 'https://example.com/files/test-image.jpg',
    path: '/uploads/test-image.jpg',
    userId: 'regular-user-456',
    uploadedAt: new Date('2023-03-20').toISOString(),
  },
  document: {
    id: 'file-456',
    name: 'test-document.pdf',
    type: 'application/pdf',
    size: 1024 * 200, // 200KB
    url: 'https://example.com/files/test-document.pdf',
    path: '/uploads/test-document.pdf',
    userId: 'admin-user-123',
    uploadedAt: new Date('2023-02-25').toISOString(),
  }
};

`;
  }

  // Add helper functions
  content += `// Helper functions for working with fixtures

/**
 * Create a copy of a fixture with specific overrides
 * 
 * @param {Object} fixture - The base fixture to copy
 * @param {Object} overrides - Properties to override in the copy
 * @returns {Object} A new object with the combined properties
 */
export function createFixture(fixture, overrides = {}) {
  return { ...fixture, ...overrides };
}

/**
 * Create an array of fixtures with sequential IDs
 * 
 * @param {Object} baseFixture - The base fixture to copy
 * @param {number} count - Number of fixtures to create
 * @param {Function} [modifier] - Optional function to modify each fixture (index) => modifications
 * @returns {Array} Array of fixtures
 */
export function createFixtureArray(baseFixture, count, modifier) {
  return Array.from({ length: count }, (_, index) => {
    const fixture = { ...baseFixture, id: \`\${baseFixture.id}-\${index}\` };
    return modifier ? { ...fixture, ...modifier(index) } : fixture;
  });
}

// Default export with all fixtures
export default {
  ${fixtureTypes.join(',\n  ')},
  createFixture,
  createFixtureArray
};
`;

  // Ensure the directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the file
  await fs.writeFile(outputPath, content, 'utf-8');
  
  logger.success(`Test fixtures file created at: ${outputPath}`);
  
  if (verbose) {
    logger.info(`Included fixture types: ${fixtureTypes.join(', ')}`);
    logger.info(`File size: ${content.length} bytes`);
  }
  
  return outputPath;
}

/**
 * Check and verify the test setup configuration
 * 
 * @param {Object} options - Options
 * @param {string} [options.framework='vitest'] - Testing framework ('vitest' or 'jest')
 * @param {string} [options.configPath] - Path to the test config file
 * @param {boolean} [options.verify=true] - Whether to verify the configuration
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<Object>} - Configuration status and suggestions
 */
export async function checkTestSetup(options) {
  const {
    framework = 'vitest',
    configPath = framework === 'vitest' ? 'vitest.config.js' : 'jest.config.js',
    verify = true,
    verbose = false
  } = options;
  
  logger.info(`Checking ${framework} test setup...`);
  
  const results = {
    exists: false,
    valid: false,
    warnings: [],
    suggestions: [],
    missingDependencies: []
  };
  
  try {
    // Check if config file exists
    try {
      await fs.access(configPath);
      results.exists = true;
      
      if (verbose) {
        logger.info(`Found ${framework} config at: ${configPath}`);
      }
    } catch (error) {
      logger.warn(`${framework} config file not found at: ${configPath}`);
      results.warnings.push(`Config file not found: ${configPath}`);
      results.suggestions.push(`Create a ${framework} config file at: ${configPath}`);
      return results;
    }
    
    // Read the config file
    const configContent = await fs.readFile(configPath, 'utf-8');
    
    // Check for setup files
    if (!configContent.includes('setupFiles') && !configContent.includes('setupFilesAfterEnv')) {
      results.warnings.push('No test setup files configured');
      results.suggestions.push(`Add setupFiles in your ${configPath}`);
    }
    
    // Check for environment configuration
    if (!configContent.includes('environment')) {
      results.warnings.push('No test environment configured');
      results.suggestions.push(`Add environment configuration in your ${configPath}`);
    }
    
    // Verify dependencies if requested
    if (verify) {
      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Check for testing framework
      if (framework === 'vitest' && !allDeps.vitest) {
        results.missingDependencies.push('vitest');
      } else if (framework === 'jest' && !allDeps.jest) {
        results.missingDependencies.push('jest');
      }
      
      // Check for testing library
      if (!allDeps['@testing-library/react'] && !allDeps['@testing-library/vue']) {
        results.suggestions.push('Consider adding @testing-library for component testing');
      }
      
      // Check for environment
      if (configContent.includes('jsdom') && !allDeps['jsdom'] && 
          !(framework === 'vitest' && allDeps['@vitest/browser'])) {
        results.missingDependencies.push('jsdom');
      }
      
      if (results.missingDependencies.length > 0) {
        logger.warn(`Missing dependencies: ${results.missingDependencies.join(', ')}`);
        results.suggestions.push(`Install missing dependencies: pnpm add -D ${results.missingDependencies.join(' ')}`);
      }
      
      // Run a basic test to check setup
      if (results.missingDependencies.length === 0) {
        const testCmd = framework === 'vitest' ? 'npx vitest run --no-watch' : 'npx jest --listTests';
        try {
          await commandRunner.runCommandAsync(testCmd, { ignoreError: true, verbose });
          results.valid = true;
        } catch (error) {
          logger.warn(`Test setup verification failed: ${error.message}`);
          results.warnings.push('Test setup verification failed');
        }
      }
    }
    
    // Final status
    if (results.warnings.length === 0 && results.missingDependencies.length === 0) {
      results.valid = true;
      logger.success(`${framework} test setup looks good!`);
    } else {
      logger.warn(`${framework} test setup has ${results.warnings.length} warnings and ${results.missingDependencies.length} missing dependencies`);
      
      if (results.suggestions.length > 0) {
        logger.info('Suggestions:');
        results.suggestions.forEach(suggestion => {
          logger.info(`- ${suggestion}`);
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error(`Failed to check test setup: ${error.message}`);
    results.warnings.push(`Error checking setup: ${error.message}`);
    return results;
  }
}

export default {
  createVitestSetup,
  createTestEnvironment,
  createTestFixtures,
  checkTestSetup
}; 