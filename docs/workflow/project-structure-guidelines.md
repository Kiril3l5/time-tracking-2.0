# Project Structure Guidelines

This document outlines the agreed-upon structure for the Time Tracking 2.0 project, especially for the mobile-first implementation. Following these guidelines ensures consistency and prevents the codebase from growing in an uncontrolled manner.

## Core Principles

1. **Mobile-First Design**: All components should be designed for mobile first, with responsive adaptations for larger screens.
2. **Component Categorization**: Components should be organized by function, not by feature.
3. **File Modification Over Creation**: Prefer extending existing files rather than creating new parallel implementations.
4. **Feature Flags for Experiments**: Use feature flags for experimental features instead of duplicate code paths.
5. **Single Source of Truth**: Documentation should be consolidated and references should point to a single source.

## Directory Structure

### Components Organization

Components are organized by their functional category:

```
packages/common/src/components/
├── layout/        # Structural components: containers, grids, navigation
├── ui/            # UI elements: buttons, cards, badges
├── forms/         # Form elements: inputs, selects, checkboxes
├── data-display/  # Data presentation: tables, lists, cards
└── feedback/      # User feedback: alerts, toasts, loaders
```

### Hooks Organization

Hooks are organized by the concerns they address:

```
packages/common/src/hooks/
├── ui/            # UI-related hooks: useViewport, useMediaQuery
├── data/          # Data fetching hooks: useQuery, useMutation
├── auth/          # Authentication hooks: useAuth, usePermissions
└── form/          # Form handling hooks: useDebounce, useForm
```

### Configuration and Feature Flags

Feature flags and configuration are centralized:

```
packages/common/src/config/
└── features.ts    # Feature flags configuration
```

## Component Creation Guidelines

1. **Follow the Template**: Use the `ComponentTemplate.tsx` as a starting point for new components.
2. **Place in the Right Directory**: Each component should be in the appropriate directory based on its function.
3. **Mobile-Optimized by Default**: Ensure components work well on mobile by default, with appropriate sizing.
4. **Document with JSDoc**: Include JSDoc comments and examples for all components.

## Hooks Creation Guidelines

1. **Single Responsibility**: Each hook should have a single, well-defined purpose.
2. **Reusable Before Specific**: Create general-purpose hooks before specialized ones.
3. **Document Usage Examples**: Include usage examples in JSDoc comments.

## Mobile Implementation Guidelines

1. **Touch-Friendly Controls**: All interactive elements should be at least 44px height/width.
2. **Handle iOS Safari Issues**: Use provided utilities for iOS Safari compatibility.
3. **Offline-First Thinking**: Plan for offline use from the beginning.
4. **Performance Conscious**: Optimize for mobile networks and CPUs.

## Validation Process

1. **Run Structure Validation**: Use `npm run validate-structure` to check project structure compliance.
2. **Review Against Guidelines**: Before submitting PR, verify against these guidelines.
3. **Update Guidelines as Needed**: If new patterns emerge, update this document.

## Working with Claude

When using Claude to help with development:

1. **Reference This Document**: Ask Claude to follow the patterns in this document.
2. **Be Explicit About Paths**: Always specify the exact file path for modifications.
3. **Request Incremental Changes**: One component or feature at a time.
4. **Prefer Extending Existing Files**: Ask Claude to modify existing files rather than create new ones.
5. **Reference Implementation Plan**: Point Claude to the implementation plan for context.

## Recommended Workflow

1. **Prioritize Base Components**: Build foundational components first.
2. **Create Standardized Hooks**: Implement shared hooks for common patterns.
3. **Test on Real Devices**: Regularly test on mobile devices.
4. **Implement Core Features**: Focus on critical workflows first.
5. **Progressive Enhancement**: Add advanced features after core functionality works.

## Troubleshooting Common Issues

1. **iOS Safari Issues**: Check mobile-fixes.ts for common issues and solutions.
2. **Component Placement**: Run the validation script to check component placement.
3. **Feature Flag Problems**: Verify configuration in features.ts.

By following these guidelines, we maintain a clean, organized, and consistent project structure throughout the mobile-first implementation process. 