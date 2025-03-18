# Error Fixing Plan

**Summary:** A comprehensive plan to fix the identified errors in the Time Tracking System codebase to ensure smooth CI/CD pipeline functionality.

## Document Information

**Purpose:** To provide a systematic approach for resolving code errors
**Audience:** Developers working on the project
**Last Updated:** 2025-03-17
**Maintainer:** Project Team

---

## Overview of Issues

Based on the error outputs from our tests, the following categories of issues need to be addressed:

1. **Missing Dependencies**: React Query, Storybook, testing libraries
2. **TypeScript Errors**: Type issues, especially with React Query
3. **Test Failures**: Configuration issues with test files
4. **Linting Errors**: `any` types, console statements, unused variables
5. **Build Failures**: Errors preventing successful builds

## Step 1: Fix Missing Dependencies

First, we'll fix the missing dependencies across all packages:

### Common Package Dependencies

```bash
cd packages/common
pnpm add -D @tanstack/react-query@^4.29.5
pnpm add -D @storybook/react@^7.0.27
pnpm add -D @testing-library/jest-dom@^6.1.4
cd ../..
```

### Admin Package Dependencies

```bash
cd packages/admin
pnpm add -D @tanstack/react-query@^4.29.5
cd ../..
```

### Hours Package Dependencies

```bash
cd packages/hours
pnpm add -D @tanstack/react-query@^4.29.5
cd ../..
```

### Root Package Dependencies

```bash
# Align vitest versions
pnpm add -D vitest@^1.6.1 @vitest/ui@^1.6.1 @vitest/coverage-v8@^1.6.1
```

## Step 2: Fix TypeScript Errors

### Update Types Declarations

1. Replace temporary type declarations with proper types:

```typescript
// packages/common/src/firebase/hooks/query-hooks.ts
import { 
  useQuery, 
  useMutation, 
  useQueryClient, 
  UseMutationOptions,
  QueryKey
} from '@tanstack/react-query';

// Add proper types instead of any
```

2. Fix specific TypeScript errors:

```bash
# Create a detailed list of TypeScript errors and fixes
pnpm exec tsc --noEmit
```

### Fix Common TypeScript Issues

1. **Update useUiStore.ts**:
   - Add type for toast.id

2. **Update query-hooks.ts**:
   - Add proper types for parameters and return values

3. **Update Firebase service files**:
   - Replace `any` types with proper interfaces

## Step 3: Fix Test Configuration

1. Create a proper test setup file:

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom';

// Add any global test setup needed
```

2. Update vitest configuration:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['**/*.test.{ts,tsx}']
  }
});
```

3. Fix test files:

```typescript
// example.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
// Fix imports and assertions
```

## Step 4: Fix Linting Errors

1. Address `no-console` warnings:
   - Replace console.log with proper logging utility
   - Add exceptions for necessary console statements

2. Fix unused variables:
   - Prefix unused variables with `_` (e.g., `_variable`)
   - Remove truly unused variables

3. Fix explicit `any` types:
   - Replace with proper interfaces
   - Use generics where appropriate

## Step 5: Fix Build Issues

1. Ensure all imports resolve correctly:
   - Check path aliases
   - Verify module resolution

2. Fix React component issues:
   - Update component props with proper types
   - Fix missing key warnings

3. Update package scripts:
   - Ensure build scripts correctly reference dependencies

## Implementation Order

To ensure a smooth fix process, we'll tackle the issues in this order:

1. Fix dependencies first (they're foundational)
2. Fix TypeScript errors (they affect type checking)
3. Fix test configuration (enables proper testing)
4. Fix linting errors (improves code quality)
5. Fix build issues (enables successful builds)

For each step, we'll:
1. Implement the fixes
2. Run verification tests
3. Commit changes with descriptive messages

## Verification Process

After each set of fixes, run these verification steps:

```bash
# Verify dependencies
pnpm install

# Verify types
pnpm exec tsc --noEmit

# Verify tests
pnpm test

# Verify linting
pnpm run lint

# Verify build
pnpm run build:all

# Verify local deployment
pnpm run test:deployment
```

## Timeline

- **Day 1**: Fix dependencies and TypeScript errors
- **Day 2**: Fix test configuration and test files
- **Day 3**: Fix linting errors and build issues
- **Day 4**: Final verification and documentation updates 