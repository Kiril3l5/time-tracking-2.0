# Time Tracking System Architecture Overview

This document provides a comprehensive overview of the Time Tracking System architecture, explaining how the project is organized and the key patterns implemented.

## Project Structure

The project is organized as a monorepo using npm workspaces:

```
time-tracking-2.0/
├── packages/
│   ├── common/         # Shared code, hooks, components
│   ├── admin/          # Admin portal application
│   └── hours/          # Hours portal application
├── functions/          # Firebase Cloud Functions
├── docs/               # Documentation
├── scripts/            # Utility scripts
├── .github/            # GitHub Actions workflows
├── firebase.json       # Firebase configuration
└── package.json        # Root package configuration
```

### Key Directories

- **packages/common**: Contains shared code used by both portals
  - `src/components/`: Reusable UI components
  - `src/hooks/`: Custom React hooks, including React Query hooks
  - `src/store/`: Zustand state stores
  - `src/services/`: API and utility services
  - `src/lib/`: Library configurations (React Query, etc.)
  - `src/providers/`: React context providers
  - `src/types/`: TypeScript type definitions
  - `src/firebase/`: Firebase configuration and services

- **packages/admin**: Admin portal application
  - Targets: admin-autonomyhero-2024.web.app / admin.autonomyheroes.com

- **packages/hours**: Hours portal application
  - Targets: hours-autonomyhero-2024.web.app / hours.autonomyheroes.com

## State Management Architecture

We use a hybrid state management approach:

### 1. Server State: React Query

React Query is used for all server state and data fetching. The setup includes:

- `packages/common/src/lib/react-query.ts`: Core configuration with default settings
- `packages/common/src/providers/QueryProvider.tsx`: Provider component
- `packages/common/src/hooks/useTimeEntries.ts`: Example query hook pattern

Key patterns implemented:
- Standardized query key management
- Consistent error handling
- Cache invalidation strategies
- Type-safe query hooks

### 2. Client State: Zustand with Immer

Zustand manages all client-side state with:

- `packages/common/src/store/useAuthStore.ts`: Authentication state
- `packages/common/src/store/useTimeEntriesStore.ts`: Time entries client state
- `packages/common/src/store/useUiStore.ts`: UI state (modals, sidebar, etc.)

Key patterns implemented:
- Immer for immutable updates
- Selector hooks for performance
- Action pattern for state modifications

## Data Fetching Strategy

The data fetching strategy is built around React Query, with:

1. **API Service Layer**:
   - `packages/common/src/services/api/time-entries.ts`: Firebase service functions

2. **Query Hooks**:
   - `packages/common/src/hooks/useTimeEntries.ts`: Time entries CRUD operations

3. **Standard Pattern Elements**:
   - Type-safe parameters and return types
   - Error handling
   - Loading states
   - Cache management
   - Optimistic updates

## Authentication Flow

Authentication is handled via Firebase Authentication:

1. `packages/common/src/firebase/auth/auth-service.ts`: Authentication methods
2. `packages/common/src/firebase/auth/auth-hooks.ts`: Authentication hooks
3. `packages/common/src/store/useAuthStore.ts`: Authentication state management

## Deployment Pipeline

The deployment is automated via GitHub Actions with Workload Identity Federation:

1. **GitHub Actions Workflow**:
   - `.github/workflows/firebase-deploy.yml`: Deployment workflow

2. **Firebase Configuration**:
   - `firebase.json`: Firebase hosting and Firestore configuration
   - `.firebaserc`: Project and target configuration

3. **Security**:
   - Workload Identity Federation for keyless authentication
   - Time-bound IAM permissions

## Type System

Types are organized in dedicated files:

- `packages/common/src/types/firestore.ts`: Firestore data types

## Adding New Features

When adding new features:

1. **New Entity**:
   1. Add types to `packages/common/src/types/firestore.ts`
   2. Create API service in `packages/common/src/services/api/[entity-name].ts`
   3. Create query hooks in `packages/common/src/hooks/use[EntityName].ts`
   4. Export from `packages/common/src/hooks/index.ts`
   5. Add client state to Zustand if needed

2. **UI Components**:
   1. Create reusable components in `packages/common/src/components/`
   2. Create page-specific components in respective portal packages

3. **Routing**:
   1. Define routes in `packages/[portal]/src/App.tsx`
   2. Create page components in `packages/[portal]/src/pages/`

## Next Development Steps

The project has implemented all foundational patterns. The next steps are:

1. **Hours Portal Implementation**:
   - Set up routing structure
   - Implement authentication flow
   - Create time entry components
   - Build main time logging interface

2. **Admin Portal Implementation**:
   - Set up routing structure
   - Implement authentication and authorization
   - Create user management interface
   - Build time entry approval workflow
   - Implement reporting features

Both portals should follow the established patterns for:
- State management (Zustand + React Query)
- Component organization
- Type safety
- Data fetching

## Documentation

Additional documentation is available in the `/docs` directory:
- `docs/patterns/data-fetching.md`: Detailed data fetching patterns
- `docs/patterns/state-management.md`: State management guide
- `docs/deployment/setup.md`: Deployment setup details

## Testing

Testing follows these patterns:
- Unit tests with Vitest
- Components tested with React Testing Library
- Firebase emulator for integration tests 