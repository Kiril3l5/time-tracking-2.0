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

### UI and Network
- [UI Components](./docs/main_readme/ui-component-library.md) - UI component library documentation
- [Network Connectivity](./docs/network/connectivity.md) - Network requirements and offline handling

### Maintenance
- [Project Cleanup](./docs/project-cleanup-summary.md) - Project organization and maintenance

## Project Maintenance

This project follows a structured approach to maintenance to ensure it remains lean and manageable:

### Cleanup Scripts

- `scripts/cleanup.sh` - Removes temporary files, build artifacts, and other unnecessary files
- `scripts/find-duplicates.js` - Identifies potential duplicate documentation

### Maintenance Guidelines

1. **Regular Cleanup**: Run cleanup scripts before commits and releases
2. **Documentation First**: All features should be documented according to our [documentation guidelines](./docs/structure/documentation-guide.md)
3. **Test Coverage**: Maintain high test coverage for all new and modified code
4. **Quarterly Review**: Perform documentation and code review quarterly to remove outdated content

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

See [Project Setup](./docs/project-setup.md) and [Environment Setup](./docs/env/setup.md) for detailed instructions.

## License

[MIT](./LICENSE) 