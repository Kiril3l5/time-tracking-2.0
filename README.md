# Time Tracking System 2.0

A modern, TypeScript-based time tracking application with two completely separate sites:
- **/hours**: End-user facing application for time entry and tracking
- **/admin**: Administration portal for managers and administrators

Both sites are hosted on Firebase and share a common Firebase database for time entries, approvals, and user management.

## Project Status

Current development status and progress:
- **Mobile-First Implementation**: IN PROGRESS (Phase 1, Week 3)
- **Firebase Authentication**: IN PROGRESS (Biometric support implementation ongoing)
- **Preview Deployment System**: COMPLETED
- **Automated Workflow**: COMPLETED

## Automated Workflow & Preview System

The project includes a comprehensive automated workflow system that streamlines development:

### Workflow Dashboard

The workflow generates an interactive dashboard that provides:

- **Preview URLs**: Direct links to both Hours and Admin apps
- **Workflow Timeline**: Chronological view of all workflow steps
- **Warnings & Suggestions**: Categorized warnings with recommended fixes
- **Workflow Settings**: Configuration details for the current run

![Workflow Dashboard](./docs/images/workflow-dashboard.png)

### Key Features

- **Code Quality Validation**: Automatically checks code quality including lint, type, and test errors
- **Preview Deployments**: Deploys both applications to Firebase preview channels
- **Warning Collection**: Gathers warnings from multiple sources and displays them in categories
- **Channel Management**: Automatically maintains only the 5 most recent preview channels
- **Branch Management**: Provides options for commit and PR creation after previewing

### Running the Workflow

```bash
# Start the workflow
pnpm run workflow

# With verbose output
pnpm run workflow --verbose
```

For detailed information on the workflow, see:
- [Development Workflow Guide](./docs/workflow/development-workflow.md)
- [Automated Workflow Guide](./docs/workflow/automated-workflow-guide.md)
- [Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md)

## Mobile-First Implementation

This project implements a mobile-first approach, prioritizing a great user experience on mobile devices while maintaining responsive design for desktop users. Key features include:

- **Responsive UI Components**: Components adapt to different screen sizes
- **Touch-Friendly Controls**: All interactive elements are optimized for touch
- **Progressive Feature Rollout**: Feature flags for controlled deployment
- **Offline Support**: Core functionality works without constant connectivity
- **Optimized Performance**: Fast load times and minimal bundle size
- **Biometric Authentication**: Enhanced security for mobile users

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

The project documentation is organized into the following categories:

### Core Documentation
- [Documentation Index](./docs/documentation-index.md)
- [Project Setup](./docs/setup/project-setup.md)
- [System Architecture](./docs/architecture/system-architecture.md)

### Development
- [Development Workflow](./docs/workflow/development-workflow.md)
- [TypeScript & Linting Guidelines](./docs/development/typescript-linting-guide.md)
- [Component Library](./docs/development/component-library.md)
- [State Management](./docs/development/state-management.md)
- [API Integration](./docs/development/api-integration.md)

### Mobile & Design
- [Mobile-First Implementation Plan](./docs/workflow/mobile-first-implementation-plan.md)
- [Mobile Design System](./docs/design/mobile-design-system.md)
- [Design System Documentation](./docs/design/design-system.md)
- [Component Examples](./docs/design/component-examples.md)
- [Color Palette](./docs/design/color-palette.md)

### Testing & Quality
- [Testing Strategy](./docs/testing/testing-strategy.md)
- [Unit Testing Guide](./docs/testing/unit-testing-guide.md)
- [E2E Testing Guide](./docs/testing/e2e-testing-guide.md)
- [Performance Testing](./docs/testing/performance-testing.md)

### Deployment & Workflow
- [Preview Deployment Guide](./docs/workflow/preview-deployment-guide.md)
- [Firebase Deployment Workflow](./docs/workflow/firebase-deployment-workflow.md)
- [Automated Workflow Guide](./docs/workflow/automated-workflow-guide.md)

### Security & Infrastructure
- [Security Implementation Guide](./docs/main_readme/security-implementation-guide.md)
- [Firebase Authentication Integration](./docs/development/firebase-auth-integration-plan.md)
- [Network Connectivity](./docs/network/connectivity.md)
- [Monitoring & Logging](./docs/main_readme/monitoring-logging-guide.md)

## Key Technologies

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
- Typography guidelines and setup
- Component examples and patterns
- Spacing, borders, and shadow tokens
- Responsive design patterns
- Interactive design system preview

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