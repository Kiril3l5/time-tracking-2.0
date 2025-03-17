# Testing Strategy

## Overview

This document outlines the testing strategy for the Time Tracking System. The project implements a comprehensive testing approach using Vitest, React Testing Library, and Firebase emulators to ensure code quality and reliability.

## Testing Tools

- **Vitest**: Fast, ESM-native test runner with a Jest-compatible API
- **React Testing Library**: Testing utilities focused on user behavior
- **@testing-library/user-event**: Simulates user interactions
- **Firebase Emulators**: Local Firebase services for integration testing

## Test Types

### Unit Tests

Unit tests verify individual functions, hooks, and utilities in isolation:

```typescript
// Example unit test for a utility function
import { describe, it, expect } from 'vitest';
import { calculateTotalHours } from '../utils/calculations';

describe('calculateTotalHours', () => {
  it('should sum all hour types correctly', () => {
    const result = calculateTotalHours({
      regularHours: 6,
      overtimeHours: 2,
      ptoHours: 0,
      unpaidLeaveHours: 0,
    });
    
    expect(result).toBe(8);
  });
});
```

### Component Tests

Component tests verify that UI components render and behave correctly:

```typescript
// Example component test
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeEntryForm } from '../components/TimeEntryForm';

describe('TimeEntryForm', () => {
  it('should render all form fields', () => {
    render(<TimeEntryForm onSubmit={() => {}} />);
    
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hours/i)).toBeInTheDocument();
  });
  
  it('should call onSubmit with form data when submitted', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    
    render(<TimeEntryForm onSubmit={handleSubmit} />);
    
    await user.type(screen.getByLabelText(/hours/i), '8');
    await user.click(screen.getByRole('button', { name: /save/i }));
    
    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      hours: 8,
    }));
  });
});
```

### Integration Tests

Integration tests verify that multiple components work together correctly:

```typescript
// Example integration test
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimeEntryPage } from '../pages/TimeEntryPage';
import { AuthProvider } from '../context/AuthContext';

describe('TimeEntryPage', () => {
  let queryClient;
  
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });
  
  it('should allow creating a new time entry', async () => {
    const user = userEvent.setup();
    
    render(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TimeEntryPage />
        </QueryClientProvider>
      </AuthProvider>
    );
    
    await user.click(screen.getByRole('button', { name: /new entry/i }));
    await user.type(screen.getByLabelText(/hours/i), '8');
    await user.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/entry saved/i)).toBeInTheDocument();
    });
  });
});
```

## Firebase Mocking

Firebase services are mocked for unit and component tests:

```typescript
// Example from src/tests/setup.ts
import { vi } from 'vitest';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  // ... other auth methods
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  // ... other firestore methods
}));
```

## Test Organization

Tests are co-located with the code they test:

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx
│   └── Form/
│       ├── Form.tsx
│       └── Form.test.tsx
├── hooks/
│   ├── useTimeEntries.ts
│   └── useTimeEntries.test.ts
└── utils/
    ├── calculations.ts
    └── calculations.test.ts
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## CI Integration

Tests run automatically on pull requests and pushes to main via GitHub Actions:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run tests
        run: pnpm -r test
```

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the component does, not how it's built
2. **Use Role-Based Queries**: Prefer `getByRole` over `getByTestId` for better accessibility
3. **Mock External Dependencies**: Use vi.mock for external services
4. **Test Edge Cases**: Include tests for error states and boundary conditions
5. **Keep Tests Fast**: Avoid unnecessary setup and teardown
6. **Maintain Test Independence**: Tests should not depend on each other

## Coverage Goals

The project aims for the following test coverage:

- **Utilities**: 100% coverage
- **Hooks**: 90%+ coverage
- **Components**: 80%+ coverage
- **Pages**: 70%+ coverage

Coverage is tracked in CI and reported in pull requests. 