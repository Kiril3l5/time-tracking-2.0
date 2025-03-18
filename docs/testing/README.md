# Testing Documentation

## Overview

This document provides guidelines and examples for testing the Time Tracking application. We use Vitest as our test runner along with React Testing Library for component testing. Our testing approach focuses on behavior-driven tests that simulate real user interactions.

## Testing Stack

- **Test Runner**: Vitest
- **Testing Libraries**: 
  - React Testing Library
  - @testing-library/jest-dom (for DOM assertions)
- **Test Environment**: jsdom
- **Mocking**: Vitest built-in mocking capabilities

## Test Structure

Tests are organized by component or feature, with test files co-located with the code they test:

```
packages/
  common/
    src/
      components/
        Button.tsx
        Button.test.tsx
      hooks/
        useTimeEntry.ts
        useTimeEntry.test.ts
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage reporting
pnpm test:coverage
```

## Testing Patterns

### Component Tests

We follow a behavior-driven testing approach. Here's an example from `Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Component code...

describe('Button Component', () => {
  it('renders with the correct text', () => {
    render(<Button>Click me</Button>);
    
    const button = screen.getByTestId('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');
  });
  
  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByTestId('button');
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  // Other tests...
});
```

### Mocking Firebase

Firebase services are automatically mocked in the `vitest.setup.ts` file:

```typescript
// Firebase mocks example
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
  })),
  onAuthStateChanged: vi.fn(() => vi.fn()),
  // Other auth methods...
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  // Other firestore methods...
}));
```

### Testing Hooks

Custom hooks are tested using React Testing Library's `renderHook`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  it('should increment counter', () => {
    const { result } = renderHook(() => useCounter());
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.count).toBe(1);
  });
});
```

### Testing Async Code

For async operations, we use `async/await` with Vitest:

```typescript
it('loads data asynchronously', async () => {
  // Mock API response
  vi.spyOn(api, 'fetchData').mockResolvedValue({ items: ['item1', 'item2'] });
  
  render(<DataComponent />);
  
  // Wait for the loading state to resolve
  await screen.findByText('item1');
  
  expect(screen.getByText('item1')).toBeInTheDocument();
  expect(screen.getByText('item2')).toBeInTheDocument();
});
```

## Best Practices

1. **Test behavior, not implementation**: Focus on what the component does, not how it does it
2. **Use data-testid sparingly**: Prefer accessible queries like `getByRole`, `getByLabelText`
3. **Mock as little as possible**: Test with real implementations when feasible
4. **Isolate tests**: Each test should be independent; cleanup after each test
5. **Keep tests simple**: One assertion per test when possible
6. **Test edge cases**: Include tests for error states, empty states, etc.

## TypeScript Support

Our tests are fully typed using TypeScript, with proper type definitions for testing utilities. See `types/testing-library.d.ts` for Jest-DOM type augmentations.

## Continuous Integration

Tests are automatically run in CI/CD pipelines through GitHub Actions, with test results published to the workflow summary.

## Troubleshooting

Common testing issues and solutions:

1. **Test can't find elements**: Check if elements are actually rendered; verify queries
2. **Mock not working**: Ensure mocks are set up before component renders
3. **Async test fails**: Use proper async utilities (findBy*) instead of getBy*

## Example: A Complete Test Suite

See `packages/common/src/components/Button.test.tsx` for a comprehensive example of a component test suite that demonstrates best practices. 