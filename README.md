# Time Tracking System 2.0

A modern, TypeScript-based time tracking application with two completely separate sites:
- **/hours**: End-user facing application for time entry and tracking
- **/admin**: Administration portal for managers and administrators

Both sites are hosted on Firebase and share a common Firebase database for time entries, approvals, and user management.

## Mobile-First Implementation

This project implements a mobile-first approach, prioritizing a great user experience on mobile devices while maintaining responsive design for desktop users. Key features include:

- **Responsive UI Components**: Components adapt to different screen sizes
- **Touch-Friendly Controls**: All interactive elements are optimized for touch
- **Progressive Feature Rollout**: Feature flags for controlled deployment
- **Offline Support**: Core functionality works without constant connectivity
- **Optimized Performance**: Fast load times and minimal bundle size

For complete details on the mobile implementation plan, see [Mobile-First Implementation Plan](./docs/workflow/mobile-first-implementation-plan.md).

For mobile design guidelines, see [Mobile Design System](./docs/design/mobile-design-system.md).

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

### Common Package Structure

```
packages/common/src/
├── components/       # Shared UI components
│   ├── layout/       # Layout components (containers, grids, navigation)
│   ├── ui/           # UI elements (buttons, cards, badges)
│   ├── forms/        # Form elements (inputs, selects, checkboxes)
│   ├── data-display/ # Data presentation (tables, lists, cards)
│   └── feedback/     # User feedback (alerts, toasts, loaders)
├── hooks/            # Custom React hooks
│   ├── ui/           # UI-related hooks (useViewport, useMediaQuery)
│   ├── data/         # Data fetching hooks (useQuery, useMutation)
│   ├── auth/         # Authentication hooks (useAuth, usePermissions)
│   └── form/         # Form handling hooks (useDebounce, useForm)
├── config/           # Configuration including feature flags
├── utils/            # Utility functions and constants
├── firebase/         # Firebase service integrations
└── providers/        # React context providers
```

### Portal Structure

Both the Hours and Admin portals follow a similar structure:

```
packages/[hours|admin]/src/
├── assets/         # Static assets (images, icons)
├── components/     # Portal-specific components (use sparingly)
├── features/       # Feature-specific modules
├── hooks/          # Portal-specific hooks
├── layouts/        # Page layouts using common components
├── pages/          # Page components
├── App.tsx         # Main application component
└── main.tsx        # Application entry point
```

## Setup Requirements

### Path Aliases

To make imports cleaner, each portal's `tsconfig.json` should include path aliases:

```json
{
  "compilerOptions": {
    "paths": {
      "@common/*": ["../common/src/*"]
    }
  }
}
```

### Features and Mobile-First Examples

1. **Viewport Detection**: Use `useViewport` hook for responsive rendering
   ```tsx
   import { useViewport } from '@common/hooks/ui/useViewport';
   
   function MyComponent() {
     const { isMobile, isTablet } = useViewport();
     
     return isMobile ? <MobileView /> : <DesktopView />;
   }
   ```

2. **Mobile Containers**: Use `MobileContainer` as the base for mobile views
   ```tsx
   import { MobileContainer } from '@common/components/ui/containers/MobileContainer';
   
   function MobilePage() {
     return (
       <MobileContainer>
         <h1>Page Content</h1>
       </MobileContainer>
     );
   }
   ```

3. **Bottom Navigation**: Use `BottomNav` for mobile navigation
   ```tsx
   import { BottomNav } from '@common/components/navigation/BottomNav';
   import { HomeIcon, ClockIcon } from '@common/components/ui/icons';
   
   // Usage in layout components
   const navItems = [
     { label: 'Home', path: '/', icon: <HomeIcon /> },
     { label: 'Time', path: '/time', icon: <ClockIcon /> }
   ];
   
   <BottomNav items={navItems} />
   ```

4. **Feature Flags**: Use for progressive feature rollout
   ```tsx
   import { useFeatureFlag } from '@common/hooks/features/useFeatureFlag';
   
   function Component() {
     const isOfflineEnabled = useFeatureFlag('offline-mode');
     
     return (
       <div>
         {isOfflineEnabled && <OfflineIndicator />}
       </div>
     );
   }
   ```

## Documentation

For complete guidelines, see:

- [Documentation Index](./docs/documentation-index.md)
- [Project Structure Guidelines](./docs/workflow/project-structure-guidelines.md)
- [Mobile-First Implementation Plan](./docs/workflow/mobile-first-implementation-plan.md)
- [Mobile Design System Guidelines](./docs/design/mobile-design-system.md)

## Example Pages

Example mobile implementations can be found at:

- Admin Portal: [packages/admin/src/pages/ApprovalsPage.tsx](./packages/admin/src/pages/ApprovalsPage.tsx)
- Hours Portal: [packages/hours/src/pages/TimeEntryPage.tsx](./packages/hours/src/pages/TimeEntryPage.tsx)

Both demonstrate the use of shared mobile components and responsive design patterns. 

Key technologies:
- **Language**: TypeScript (strict mode)
- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Zustand + React Query
- **UI**: Tailwind CSS with custom design system
- **Backend**: Firebase (Auth, Firestore, Functions)
- **Testing**: Vitest + React Testing Library
- **Package Manager**: PNPM with workspaces

## Design System

The project includes a comprehensive design system that ensures UI consistency across both the /hours and /admin portals. The design system documentation can be found in the `docs/design/` directory.

To view the visual design system reference:

```bash
# Open the design system preview in your browser
node scripts/preview-design-system.js
# or
npm run design
# or
pnpm run docs:design-system
```

The design system includes:
- **Color Palette**: Primary Amber (#F59E0B) with secondary Cool Gray (#4B5563) and semantic status colors
- Typography guidelines
- Component examples and patterns
- Spacing, borders, and shadow tokens
- Responsive design patterns

See the [Design System Documentation](./docs/design/design-system.md) for more information on color usage, component specifications, and design principles.

## 🧠 Working with AI Tools

When using AI tools like Claude to assist with this project, follow these best practices:

### Effective AI Prompting

1. **Provide Context**: Point the AI to relevant documentation files, especially:
   - [Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md)
   - [Firebase Deployment Workflow](./docs/workflow/firebase-deployment-workflow.md)
   - [Automated Workflow Guide](./docs/workflow/automated-workflow-guide.md)

2. **Be Specific**: Request specific tasks rather than general improvements.
   - Good: "Help me fix the TypeScript error in `packages/common/src/firebase/hooks/query-hooks.ts`"
   - Avoid: "Fix all the errors in the project"

3. **One Task at a Time**: Focus on completing one task before moving to the next.

4. **Include Error Messages**: When troubleshooting, always include the complete error message.

### What To Do

- **Use the automated workflow**: Start development with `pnpm run workflow` or `pnpm run dev`
- **Create preview deployments**: Use `pnpm run preview` to test changes
- **Use the modular script system**: Leverage our enhanced tooling for faster development
- **Follow the post-PR workflow**: After a PR is merged, deploy to production with `node scripts/deploy.js "Your message"`
- **Use the logger** instead of direct console statements

### What To Avoid

- **Don't mix package managers**: Use pnpm exclusively for this project
- **Don't skip the post-PR deployment step**: Always deploy to production after merging
- **Don't ignore TypeScript errors**: Fix them with `pnpm run fix:typescript:enhanced`
- **Don't use direct console.log statements**: Use the logger module instead
- **Don't rebuild unnecessarily**: The skipBuild option is now available to prevent double builds

## Documentation

📚 **[DOCUMENTATION INDEX](./docs/documentation-index.md)** - Complete master index of all project documentation

### Essential Documentation

The most important documents to familiarize yourself with are:

1. **[Project Setup](./docs/setup/project-setup.md)** - First steps for setting up the project
2. **[Automated Workflow Guide](./docs/workflow/automated-workflow-guide.md)** - Day-to-day development workflow
3. **[Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md)** - How to create preview deployments
4. **[TypeScript & Linting Guidelines](./docs/development/typescript-linting-guide.md)** - Coding standards

### Documentation By Category

The documentation is organized by category in the `/docs` directory:

- **Setup & Configuration**: [Project Setup](./docs/setup/project-setup.md), [Environment Setup](./docs/env/setup.md)
- **Development Guidelines**: [JavaScript Modules](./docs/development/javascript-module-guide.md), [TypeScript Standards](./docs/development/typescript-linting-guide.md)
- **Workflows**: [Automated Workflow](./docs/workflow/automated-workflow-guide.md), [Preview Deployment](./docs/workflow/preview-deployment-guide.md)
- **Deployment**: [Firebase Deployment Workflow](./docs/workflow/firebase-deployment-workflow.md), [Deployment Guide](./docs/deployment/deployment-guide.md)
- **Architecture**: [Project Overview](./docs/architecture/project-overview.md), [Module Structure](./docs/structure/modules.md)
- **Quality Assurance**: [Testing Strategy](./docs/testing/overview.md)

### Documentation Maintenance

All documentation follows a structured approach defined in our [Documentation Organization Guide](./docs/structure/documentation-guide.md):

1. **For New Documentation**:
   - Place files in the appropriate category folder in `/docs/`
   - Use kebab-case naming: `example-guide.md`
   - Add the file to the [documentation index](./docs/documentation-index.md)
   - Link to it from related documentation

2. **For Updating Documentation**:
   - Make documentation changes alongside code changes
   - Update the "Last Modified" date
   - Update the documentation index if file size or summary changed
   - Include documentation updates in the same PR as code changes

3. **Documentation Organization**:
   - The [documentation index](./docs/documentation-index.md) is the master reference
   - Only documentation-index.md remains in the `/docs` root
   - All other documentation is organized in category folders

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
│   ├── channel-manager.js     # List, sort, and manage preview channels
│   ├── channel-cleanup.js     # Channel cleanup (interactive and automatic)
│   ├── channel-cli.js         # Unified CLI for channel management operations
│   ├── deployment.js          # Firebase deployment functionality
│   └── url-extractor.js       # Extract preview URLs from deployment output
├── build/         # Build process utilities
├── preview/       # Preview-specific utilities and components
├── reports/       # Report generation and analysis tools
├── workflow/      # Workflow automation utilities
├── utils.js       # Main export index 
├── preview.js     # Main preview deployment orchestration script
├── workflow-automation.js # Automated development workflow script
├── deploy.js      # Production deployment script
├── create-pr.js   # Pull request creation script
├── sync-main.js   # Sync main branch with remote script
└── fix-gitignore.js # Fix .gitignore configuration script
```

For a complete overview of the script organization, see [Preview Deployment Guide: Technical Architecture](./docs/workflow/preview-deployment-guide.md#technical-architecture).

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

See the [Project Setup Guide](./docs/setup/project-setup.md) for complete setup instructions.

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

### Development Workflow

For the most streamlined development experience, use our automated workflow:

```bash
# Start the automated workflow
pnpm run workflow

# Or use the shorthand
pnpm run dev
```

This will guide you through:
1. Branch creation/selection
2. Change management
3. Preview deployment
4. PR creation
5. Post-PR guidance

See [Automated Workflow Guide](./docs/workflow/automated-workflow-guide.md) for detailed instructions.

### Preview Deployments

Create Firebase preview deployments to test your changes:

```bash
# Create a preview deployment
pnpm run preview

# Create a preview and automatically create a PR
pnpm run preview-and-pr

# Quick preview with fewer checks
pnpm run preview --skip-lint --skip-tests
```

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

### Channel Management

Manage your Firebase preview channels with these commands:

```bash
# View all active previews in a dashboard
pnpm run channels

# List channels in JSON format
pnpm run channels:list

# Clean up old previews (interactive)
pnpm run channels:cleanup

# Auto-clean old previews
pnpm run channels:cleanup:auto
```

### Production Deployment

After your PR is merged to main:

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Deploy to production
node scripts/deploy.js "Your deployment message"
```

For detailed instructions, see [Firebase Deployment Workflow](./docs/workflow/firebase-deployment-workflow.md).

## Recent Improvements

*Last updated: May 2024*

1. **Eliminated Double Build** (March 2024): Preview deployments now avoid rebuilding the application during deployment using the `skipBuild` parameter.

2. **Enhanced Post-PR Guidance** (March 2024): Clear instructions for deploying to production after a PR is merged.

3. **Standardized Logger Usage** (April 2024): Replaced direct console statements with a consistent logger API.

4. **Fixed Linter Issues** (May 2024): Removed unused variables and improved code quality throughout the codebase.

5. **Improved Documentation Organization** (May 2024): Updated documentation structure with comprehensive summaries and better organization.

6. **Enhanced TypeScript Linting** (May 2024): Added clearer guidelines for handling unused variables with underscore prefixes.

7. **Optimized Markdown Linting** (May 2024): Updated VS Code settings to handle common Markdown linting issues.

8. **Script Workflow Improvements** (May 2024): Enhanced workflow automation scripts with better error handling and user guidance.

9. **Comprehensive Design System** (May 2024): Created a unified design system with visual reference, component examples, and documentation to ensure UI consistency across portals.

## License

[MIT](./LICENSE) 