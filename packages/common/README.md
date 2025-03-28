# Time Tracking Common Package

This package contains shared components, hooks, and utilities used by both the Hours and Admin portals in the Time Tracking 2.0 application. It provides the foundation for our mobile-first implementation.

## Mobile-First Components

The common package includes reusable UI components optimized for mobile:

### UI Components
- `MobileContainer`: Base container with proper spacing and safe area insets
- `BottomNav`: Touch-friendly navigation for mobile layouts
- `MobileHeader`: Consistent header component for mobile pages
- Icon components: Optimized SVG icons for navigation and actions

### Hooks
- `useViewport`: Responsive design hook for viewport detection
- `useFeatureFlag`: Progressive feature rollout with feature flags
- Other hooks for form handling, API calls, etc.

### Utilities
- `api-client`: API client with offline support and optimistic updates
- Other shared utilities for both portals

## Structure

```
src/
├── components/              # Shared UI components
│   ├── ui/                  # Base UI elements
│   │   ├── containers/      # Layout containers
│   │   │   └── MobileContainer.tsx
│   │   └── icons/           # SVG icon components
│   └── navigation/          # Navigation components
│       ├── BottomNav.tsx    # Mobile bottom navigation
│       └── MobileHeader.tsx # Mobile header component
├── hooks/                   # Shared React hooks
│   ├── ui/                  # UI-related hooks
│   │   └── useViewport.ts   # Responsive viewport detection
│   └── features/            # Feature-related hooks
│       └── useFeatureFlag.ts # Feature flag management
└── utils/                   # Shared utilities
    └── api-client.ts        # API client with offline support
```

## Usage Guidelines

### Mobile Container

```tsx
import MobileContainer from '@common/components/ui/containers/MobileContainer';

function MyPage() {
  return (
    <MobileContainer>
      <h1>Page Content</h1>
    </MobileContainer>
  );
}
```

### Bottom Navigation

```tsx
import BottomNav from '@common/components/navigation/BottomNav';
import { HomeIcon, ClockIcon } from '@common/components/ui/icons';

const navItems = [
  { label: 'Home', path: '/', icon: <HomeIcon /> },
  { label: 'Time', path: '/time', icon: <ClockIcon /> }
];

function MyLayout() {
  return (
    <>
      <main>Content</main>
      <BottomNav items={navItems} />
    </>
  );
}
```

### Viewport Detection

```tsx
import { useViewport } from '@common/hooks/ui/useViewport';

function ResponsiveComponent() {
  const { isMobile, isTablet, isDesktop } = useViewport();
  
  return (
    <div>
      {isMobile && <MobileView />}
      {isTablet && <TabletView />}
      {isDesktop && <DesktopView />}
    </div>
  );
}
```

### Feature Flags

```tsx
import { useFeatureFlag } from '@common/hooks/features/useFeatureFlag';

function MyComponent() {
  const isOfflineEnabled = useFeatureFlag('offline-mode');
  
  return (
    <div>
      {isOfflineEnabled && <OfflineIndicator />}
    </div>
  );
}
```

## Mobile-First Documentation

For complete mobile implementation details, see:

- [Mobile-First Implementation Plan](../../docs/workflow/mobile-first-implementation-plan.md)
- [Mobile Design System](../../docs/design/mobile-design-system.md) 