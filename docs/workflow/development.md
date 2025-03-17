# Development Workflow

## Overview

This document outlines the development workflow for the Time Tracking System. It provides guidelines for local development, code organization, and contribution processes.

## Local Development Setup

### Initial Setup

1. Clone the repository
2. Install dependencies with `pnpm install`
3. Configure environment variables (see [Environment Setup](../env/setup.md))
4. Start Firebase emulators with `pnpm emulators`

### Running Applications

#### Hours Portal

```bash
cd packages/hours
pnpm dev
```

The application will be available at http://localhost:5173

#### Admin Portal

```bash
cd packages/admin
pnpm dev
```

The application will be available at http://localhost:5174

### Testing

#### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Code Organization Guidelines

### Feature-Based Structure

Organize code by feature domains rather than technical concerns:

```
src/features/time-entries/
├── components/        # UI components specific to time entries
├── hooks/             # React hooks for time entry functionality
├── store/             # Redux slices for time entry state
├── utils/             # Utility functions for time entries
└── index.ts           # Public API for the feature
```

### Export Patterns

- Use barrel files (`index.ts`) to export the public API of a feature or module
- Keep implementation details private unless they need to be shared
- Export types alongside their implementations

Example:

```typescript
// src/features/time-entries/index.ts
export { TimeEntryForm } from './components/TimeEntryForm';
export { TimeEntryList } from './components/TimeEntryList';
export { useTimeEntries } from './hooks/useTimeEntries';
export type { TimeEntryFormProps } from './components/TimeEntryForm';
```

### Component Organization

Follow these guidelines for React components:

1. Organize by feature, not by type
2. Co-locate component files with their styles, tests, and types
3. Use compound components for complex UI elements
4. Prefer functional components with hooks over class components

## Version Control Guidelines

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: Individual feature development
- `fix/*`: Bug fixes
- `release/*`: Release preparation branches

### Commit Message Format

Use conventional commits for clean history:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or correcting tests
- `chore`: Changes to the build process or tooling

### Pull Request Process

1. Create a branch from `develop` for your feature or fix
2. Implement changes with tests
3. Keep commits small and focused
4. Submit a pull request to `develop`
5. Address review feedback
6. Merge only after approval

## Coding Standards

### TypeScript

- Use strict mode
- Prefer interfaces over types for object definitions
- Use proper type annotations for function parameters and returns
- Use generics for reusable components and utilities

### React

- Use functional components with hooks
- Use React.memo for performance optimizations
- Manage component state at the appropriate level
- Use context for global state sparingly

### State Management

- Use Redux Toolkit for global application state
- Use React Query for server state
- Use local state for UI-specific state
- See [State Management Guide](../main_readme/state-management-guide.md) for details

## Deployment Process

For deployment instructions, see the [CI/CD Guide](../ci-cd-guide.md). 