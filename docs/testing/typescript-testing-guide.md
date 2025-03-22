# TypeScript Testing Guide

This document outlines best practices for TypeScript in tests, based on lessons learned from our development process. It focuses especially on common issues with Firebase testing and how to properly resolve them.

## Table of Contents
- [TypeScript Testing Guide](#typescript-testing-guide)
  - [Table of Contents](#table-of-contents)
  - [Core Principles](#core-principles)
  - [Proper Type Definitions for Tests](#proper-type-definitions-for-tests)
  - [Firebase Testing TypeScript Guidelines](#firebase-testing-typescript-guidelines)
  - [Module Augmentation for Custom Matchers](#module-augmentation-for-custom-matchers)
  - [Common Issues and Solutions](#common-issues-and-solutions)
  - [Type Declaration Best Practices](#type-declaration-best-practices)
  - [Configuration Tips](#configuration-tips)

## Core Principles

1. **Fix Issues, Don't Suppress Them**: Never use `@ts-ignore` or `@ts-nocheck` comments to bypass TypeScript errors. Instead, properly fix them with correct type declarations.

2. **No Type Suppression**: Avoid using `any` types in test files. Even for tests, proper typing improves reliability and helps catch issues early.

3. **Type Declarations for Third-Party Libraries**: Create proper type declarations for third-party libraries that don't have their own TypeScript definitions.

4. **Maintainable Type Solutions**: Solutions to type issues should be maintainable and easy to understand by other developers.

5. **Use Module Augmentation**: Extend existing types properly using TypeScript's module augmentation pattern rather than creating conflicting global declarations.

## Proper Type Definitions for Tests

To properly type test files, follow these guidelines:

1. **Declare Global Test Functions**: Test runner functions like `describe`, `it`, `test`, etc. should be properly typed. For Vitest, import these from the Vitest package:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
```

2. **Don't Mix Test Libraries**: Stick with one testing library and its typings. Don't try to use multiple libraries' type definitions simultaneously.

3. **Type Test Fixtures**: Ensure test fixtures and mock data are properly typed:

```typescript
// Bad
const testData = {
  id: '123',
  name: 'Test User'
};

// Good
interface TestUser {
  id: string;
  name: string;
}

const testData: TestUser = {
  id: '123',
  name: 'Test User'
};
```

## Firebase Testing TypeScript Guidelines

When testing Firebase functionality, especially Firebase Security Rules:

1. **Create Proper Type Declarations**: Create a dedicated `.d.ts` file for Firebase testing utilities. Example for `firebase-testing.d.ts`:

```typescript
/**
 * Type definitions for Firebase Testing utilities
 */
declare module '@firebase/rules-unit-testing' {
  export interface RulesTestContext {
    firestore(): FirebaseFirestore;
  }

  export interface RulesTestEnvironment {
    firestore(): FirebaseFirestore;
    authenticatedContext(uid: string, options?: Record<string, unknown>): RulesTestContext;
    unauthenticatedContext(): RulesTestContext;
    withSecurityRulesDisabled(fn: (context: RulesTestContext) => Promise<void>): Promise<void>;
    cleanup(): Promise<void>;
  }

  export function initializeTestEnvironment(options: {
    projectId: string;
    firestore: {
      rules: string;
      host: string;
      port: number;
    }
  }): Promise<RulesTestEnvironment>;
}

// Firebase Firestore type definitions
interface FirebaseFirestore {
  collection(path: string): FirebaseCollection;
}

interface FirebaseCollection {
  doc(path?: string): FirebaseDocument;
}

interface FirebaseDocument {
  set(data: Record<string, unknown>): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  get(): Promise<unknown>;
  delete(): Promise<unknown>;
}
```

2. **Custom Matchers for Firebase Rules Tests**: Add custom matchers for Firebase rules testing:

```typescript
// In vitest.setup.ts
expect.extend({
  async toAllow(received) {
    try {
      await received;
      return {
        message: () => 'Expected operation to be denied, but it was allowed',
        pass: true,
      };
    } catch (err) {
      return {
        message: () => `Expected operation to be allowed, but it was denied with: ${err}`,
        pass: false,
      };
    }
  },
  async toDeny(received) {
    try {
      await received;
      return {
        message: () => 'Expected operation to be denied, but it was allowed',
        pass: false,
      };
    } catch (err) {
      return {
        message: () => `Expected operation to be denied and it was denied with: ${err}`,
        pass: true,
      };
    }
  },
});
```

3. **Include Type Definitions in tsconfig**: Make sure your type definitions are included in the `tsconfig.json` file:

```json
{
  "include": [
    "src/**/*",
    "tests/**/*",
    "src/types/firebase-testing.d.ts",
    "src/types/vitest.d.ts"
  ]
}
```

## Module Augmentation for Custom Matchers

The recommended approach for adding custom matchers is to use TypeScript's module augmentation pattern. This is much better than using global declarations or type suppression:

1. **Create a dedicated type definition file** for extending Vitest:

```typescript
/// <reference types="vitest" />

/**
 * Type definitions for Firebase Testing custom matchers
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
  interface Assertion<T = any> extends FirebaseRuleMatchers<Assertion<T>> {}
  
  // Also extend asymmetric matchers (for expect.extend)
  interface AsymmetricMatchersContaining extends FirebaseRuleMatchers<void> {}
}

export {};
```

2. **Benefits of this approach**:
   - Preserves TypeScript's strong type checking
   - Avoids conflicts with other global declarations
   - Makes custom matchers chainable with other assertions
   - Keeps the solution localized and maintainable
   - Works with IDE autocompletion and documentation

3. **Separation of concerns**:
   - `firebase-testing.d.ts` defines Firebase-specific interfaces
   - `vitest.d.ts` extends Vitest's types with custom matchers

This approach fully resolves TypeScript errors without needing to exclude files from TypeScript checking or using type suppression techniques.

## Common Issues and Solutions

1. **'Cannot find name `describe`, `test`, `expect`, etc.'**:
   - **Bad Solution**: Add `// @ts-ignore` comments
   - **Good Solution**: Import these functions from Vitest directly or use module augmentation

2. **'Property X does not exist on type Y'**:
   - **Bad Solution**: Cast to `any`
   - **Good Solution**: Use module augmentation to properly extend the type

3. **Type Errors in Firebase Test Files**:
   - **Bad Solution**: Skip TypeScript checks for test files using `exclude` in tsconfig
   - **Good Solution**: Use module augmentation to extend Vitest's types properly

4. **Missing Custom Matcher Types**:
   - **Bad Solution**: Disable type checking for assertions
   - **Good Solution**: Use module augmentation to extend Vitest's Assertion interface

## Type Declaration Best Practices

1. **Keep Type Definitions Focused**: Don't create overly complex type definitions. Break them down into smaller, more focused interfaces.

2. **Organize Type Declarations**: Place type declarations for related functionality together in the same `.d.ts` file.

3. **Document Type Declarations**: Add comments to explain the purpose and usage of complex type declarations.

4. **Version Control Type Declarations**: Keep type declarations under version control and update them when the APIs change.

5. **Reference Original Types**: Use triple-slash directives to reference original type declarations: `/// <reference types="vitest" />`

## Configuration Tips

1. **Avoid Adding `vitest/globals` to tsconfig.json**: This can cause build errors. Instead, use more specific type definitions that don't interfere with the build process.

2. **Setup File for Tests**: Use a test setup file to define custom matchers and global utilities:

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom';

// Add custom matchers here
expect.extend({
  // Custom matchers...
});
```

3. **Configure Vitest to Use Setup File**:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // other options...
  }
});
```

4. **Proper Directory Structure for Type Declarations**:

```
src/
  types/
    firebase-testing.d.ts
    vitest.d.ts
```

By following these guidelines, you'll avoid common TypeScript issues in tests and create a more maintainable test suite. The module augmentation approach is particularly valuable for handling custom matchers, as it properly extends existing type definitions without causing conflicts. 