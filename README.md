# Time Tracking System

A modern, TypeScript-based time tracking application with two completely separate sites:
- **/hours**: End-user facing application for time entry and tracking
- **/admin**: Administration portal for managers and administrators

Both sites are hosted on Firebase and share a common Firebase database for time entries, approvals, and user management.

## Architecture

This project implements a monorepo structure with:

```
project-root/
├── packages/
│   ├── common/     # Shared code between sites
│   ├── hours/      # End-user time tracking site
│   └── admin/      # Admin management site
│
└── functions/      # Firebase Cloud Functions
```

Key technologies:
- **Language**: TypeScript (strict mode)
- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Zustand + React Query
- **UI**: Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Functions)
- **Testing**: Vitest + React Testing Library
- **Package Manager**: PNPM with workspaces

## Documentation

Detailed documentation is available in the `/docs` directory:

### Project Setup and Configuration
- [**Project Setup**](./docs/project-setup.md) - Complete project setup guide with tools, configs, and workflows
- [Environment Setup](./docs/env/setup.md) - Setting up environment variables
- [Deployment Setup](./docs/deployment/setup.md) - GitHub Actions with Workload Identity Federation

### Architecture and Design
- [Architecture Overview](./docs/architecture/project-overview.md) - Complete architecture and patterns
- [Project Structure](./docs/structure/modules.md) - Module organization and dependencies
- [Project Architecture](./docs/main_readme/PROJECT-2.0.md) - Complete architecture overview

### Development Workflows
- [Development Workflow](./docs/workflow/development.md) - Development processes and standards
- [Development Guide](./docs/main_readme/development-deployment-guide.md) - Development workflow and legacy deployment
- [Documentation Guide](./docs/structure/documentation-guide.md) - Guidelines for maintaining documentation
- [**Scripts Organization**](./docs/workflow/preview-deployment-guide.md#technical-architecture) - Guide to the modular script organization

### Technical Patterns
- [Testing Strategy](./docs/testing/overview.md) - Testing approach and best practices
- [State Management](./docs/patterns/state-management.md) - Zustand and React Query strategy
- [Data Fetching](./docs/patterns/data-fetching.md) - Data fetching patterns and standards
- [Responsive Design](./docs/patterns/responsive-design.md) - Mobile-first responsive approach
- [Optimistic Updates](./docs/patterns/optimistic-updates.md) - Optimistic UI update patterns
- [State Management Guide](./docs/main_readme/state-management-guide.md) - State management patterns

### Firebase Integration
- [Firebase Integration](./docs/main_readme/firebase-integration-guide.md) - Firebase configuration
- [Firebase Data Access](./docs/main_readme/firebase-data-access-patterns.md) - Data access patterns
- [Firestore Security](./docs/security/firestore-rules.md) - Security rules review and recommendations
- [Security Implementation](./docs/main_readme/security-implementation-guide.md) - Security implementation details
- [Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md) - Complete guide for creating, managing, and using preview deployments for testing

### UI and Network
- [UI Components](./docs/main_readme/ui-component-library.md) - UI component library documentation
- [Network Connectivity](./docs/network/connectivity.md) - Network requirements and offline handling

### Maintenance
- [Project Cleanup](./docs/project-cleanup-summary.md) - Project organization and maintenance

## Project Maintenance

This project follows a structured approach to maintenance to ensure it remains lean and manageable:

### Development Scripts

Our scripts have been reorganized into a modular, maintainable structure:

```
scripts/
├── core/          # Core functionality (logging, commands, configuration)
├── auth/          # Authentication utilities
├── checks/        # Code quality checks
├── typescript/    # TypeScript utilities
│   ├── error-parser.js        # Parse TypeScript errors with cross-platform support
│   ├── duplicate-import-fix.js # Fix duplicate import statements
│   ├── unused-import-fix.js   # Remove unused imports
│   ├── type-validator.js      # Validate TypeScript types
│   ├── typescript-fixer.js    # Main TypeScript fixing orchestrator
│   └── query-types-fixer.js   # Fix React Query type imports
├── test-types/    # Test configuration
│   ├── firebase-type-def.js   # Firebase testing type definitions
│   ├── vitest-matchers.js     # Custom test matchers for Vitest
│   ├── test-setup-manager.js  # Test setup file management
│   ├── typescript-config.js   # TypeScript configuration for tests
│   └── test-deps-fixer.js     # Fix test dependencies and JSX runtime
├── firebase/      # Firebase deployment utilities
├── build/         # Build process utilities
├── utils.js       # Main export index
└── preview.js     # Main orchestration script
```

For a complete overview of the script organization, see [Scripts Reorganization Plan](./docs/scripts-reorganization-plan.md).

### Maintenance Guidelines

1. **Regular Cleanup**: Run cleanup scripts before commits and releases
2. **Documentation First**: All features should be documented according to our [documentation guidelines](./docs/structure/documentation-guide.md)
3. **Test Coverage**: Maintain high test coverage for all new and modified code
4. **Quarterly Review**: Perform documentation and code review quarterly to remove outdated content
5. **Automated Fixes**: Use the TypeScript auto-fixer (`pnpm run fix:typescript`) to resolve common errors
   - Enhanced TypeScript fixes: `pnpm run fix:typescript:enhanced`
   - React Query type fixes: `pnpm run fix:query-types:enhanced`
   - Test dependency fixes: `pnpm run fix:test-deps:enhanced`

## Implementation Patterns

The project implements several key patterns for robust, maintainable code:

- **Testing**: Comprehensive testing with Vitest and React Testing Library
- **CI/CD**: Automated testing and deployment with GitHub Actions
- **Form Validation**: Type-safe form validation with Zod and React Hook Form
- **API Abstraction**: Clean separation from Firebase implementation details
- **Error Handling**: Global error handling with Error Boundaries
- **Performance Monitoring**: Firebase Performance integration
- **Component Development**: Storybook for isolated component development
- **Optimistic Updates**: Immediate UI feedback with React Query
- **Network Connectivity**: Built-in network status detection with user alerts
- **Security**: Comprehensive Firestore security rules with role-based access

## Quick Start

### Prerequisites

- Node.js v18+
- pnpm v8+
- Firebase CLI

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Firebase credentials

# Start Firebase emulators
pnpm emulators

# Start development server (in a new terminal)
cd packages/hours
pnpm dev
```

### Preview Deployments

The project uses a modular script system for creating Firebase preview deployments:

```bash
# Ensure you're logged in to Firebase
firebase login

# Create a preview deployment
pnpm run preview
```

The preview script (`scripts/preview.js`) performs the following steps:
1. Verifies Firebase and Git authentication using the `auth` modules
2. Runs quality checks (linting, type checking, tests) via the `checks` modules
3. Builds all packages with the `build` utilities
4. Deploys to Firebase preview channels using the `firebase` utilities
5. Extracts and displays preview URLs for both admin and hours sites

**Available Options:**
```
Quality Checks:
  --quick               Skip all checks (linting, type checking, tests)
  --skip-lint           Skip linting checks
  --skip-typecheck      Skip TypeScript type checking
  --skip-tests          Skip running tests
  --skip-build          Skip building the application

Fixing Options:
  --auto-fix-typescript Auto-fix TypeScript errors when possible
  --fix-query-types     Fix React Query type imports
  --fix-test-deps       Fix test dependencies and JSX runtime
  --dry-run             Preview changes without applying them

Deployment Options:
  --skip-deploy         Skip deployment (only run checks)
  --skip-cleanup        Skip cleaning up old preview channels

Logging Options:
  --save-logs           Save console output to log file
  --verbose             Enable verbose logging
```

**Other Preview Commands:**
- View all active previews: `pnpm run channels` or `pnpm run channels:dashboard`
- List channels in JSON format: `pnpm run channels:list`
- Clean up old previews: `pnpm run channels:cleanup`
- Auto-clean old previews: `pnpm run channels:cleanup:auto`
- View channel CLI help: `pnpm run channels:help`
- Fix TypeScript issues: `pnpm run preview:fix-typescript`
- Fix React Query types: `pnpm run preview:fix-query-types`
- Fix test dependencies: `pnpm run preview:fix-test-deps`
- Fix all issues: `pnpm run preview:fix-all`

For detailed instructions, see [Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md).

## License

[MIT](./LICENSE) 