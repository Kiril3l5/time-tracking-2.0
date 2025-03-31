/// <reference types="vitest" />

/**
 * Type definitions for Firebase Testing custom matchers
 * 
 * This file properly augments Vitest's types using module augmentation.
 * This is the recommended approach instead of:
 * 1. Using @ts-ignore comments
 * 2. Excluding test files from TypeScript checking
 * 3. Adding global declarations that may conflict
 * 
 * Key principles:
 * - Uses module augmentation to extend existing types
 * - Preserves type checking capabilities
 * - Makes custom matchers properly chainable
 */

// Define the custom matcher methods
interface FirebaseRuleMatchers<R> {
  /**
   * Assert that a Firebase operation is allowed by security rules
   * @returns The assertion chain for further assertions
   */
  toAllow(): R;
  
  /**
   * Assert that a Firebase operation is denied by security rules
   * @returns The assertion chain for further assertions
   */
  toDeny(): R;
}

// Augment Vitest's expect interface using declaration merging
declare module 'vitest' {
  // Extend the Assertion interface to include our custom matchers
  interface Assertion<T = unknown> extends FirebaseRuleMatchers<Assertion<T>> {}
  
  // Also extend asymmetric matchers (for expect.extend)
  interface AsymmetricMatchersContaining extends FirebaseRuleMatchers<void> {}
}

export {}; 