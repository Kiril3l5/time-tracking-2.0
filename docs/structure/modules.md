# Project Modules Overview

## Overview

This document outlines the module structure of the Time Tracking System, explaining the purpose and organization of each package in the monorepo.

## Monorepo Structure

The project is organized as a monorepo using pnpm workspaces. This structure enables:

- **Code sharing**: Common components, utilities, and types can be shared
- **Independent deployments**: Each package can be built and deployed independently
- **Focused development**: Developers can work on specific areas without affecting others
- **Consistent tooling**: Same linting, formatting, and build tools across all packages

## Core Packages

### packages/common

The shared library used by both the hours and admin portals. It contains:

```
packages/common/
├── src/
│   ├── components/    # Shared UI components
│   ├── firebase/      # Firebase service implementations
│   │   ├── auth/      # Authentication services
│   │   ├── core/      # Core Firebase configuration
│   │   ├── firestore/ # Firestore access services
│   │   ├── functions/ # Cloud Functions clients
│   │   └── hooks/     # React hooks for Firebase
│   ├── services/      # Application services
│   ├── types/         # TypeScript interfaces and types
│   └── utils/         # Utility functions
```

This package is built as a library that can be imported by other packages using the `@common` import alias.

### packages/hours

The end-user facing application for time entry and tracking:

```
packages/hours/
├── src/
│   ├── features/      # Feature-based organization
│   │   ├── time-entries/  # Time entry management
│   │   ├── calendar/      # Calendar views
│   │   ├── projects/      # Project selection
│   │   └── profile/       # User profile management
│   ├── layouts/      # Layout components
│   ├── pages/        # Page components
│   ├── store/        # Redux store configuration
│   ├── routes.tsx    # Application routes
│   └── App.tsx       # Application root
```

This package implements a feature-based architecture that organizes code by domain rather than technical concerns.

### packages/admin

The administration portal for managers and administrators:

```
packages/admin/
├── src/
│   ├── features/     # Feature-based organization
│   │   ├── user-management/  # User administration
│   │   ├── approvals/        # Time entry approvals
│   │   ├── reporting/        # Reports and analytics
│   │   └── settings/         # System settings
│   ├── layouts/      # Layout components
│   ├── pages/        # Page components
│   ├── store/        # Redux store configuration
│   ├── routes.tsx    # Application routes
│   └── App.tsx       # Application root
```

Similar to the hours portal, this package uses a feature-based architecture for maintainability.

### functions

Firebase Cloud Functions for backend operations:

```
functions/
├── src/
│   ├── auth/         # Authentication triggers
│   ├── notifications/# Notification functions
│   ├── reports/      # Report generation
│   ├── api/          # API endpoints
│   └── index.ts      # Functions entry point
```

This package implements serverless functions that handle backend operations like notifications, complex calculations, and API endpoints.

## Package Dependencies

The dependencies between packages are strictly controlled:

- `common` has no dependencies on other workspace packages
- `hours` and `admin` depend on `common`
- `functions` may depend on `common` (for types and utilities)

This dependency structure ensures clean separation of concerns and prevents circular dependencies.

## Build and Deployment

Each package has its own build configuration:

- `common`: Built as a library with TypeScript declarations
- `hours` and `admin`: Built as standalone web applications
- `functions`: Built as Firebase Cloud Functions

Deployment is handled through Firebase Hosting with separate targets for each web application. 