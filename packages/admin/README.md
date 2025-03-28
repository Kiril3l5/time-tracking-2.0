# Time Tracking Admin Portal

This package contains the Admin portal for the Time Tracking 2.0 application, built with a mobile-first approach.

## Mobile-First Implementation

The Admin portal follows the mobile-first design principles outlined in the main project documentation:

- [Mobile-First Implementation Plan](../../docs/workflow/mobile-first-implementation-plan.md)
- [Mobile Design System](../../docs/design/mobile-design-system.md)

## Structure

```
src/
├── assets/         # Static assets (images, icons)
├── components/     # Admin-specific components
├── features/       # Feature-specific modules
├── hooks/          # Admin-specific hooks
├── layouts/        # Page layouts
│   └── MobileAdminLayout.tsx  # Mobile-optimized layout
├── pages/          # Page components
│   └── ApprovalsPage.tsx      # Example mobile-first page
├── App.tsx         # Main application component
└── main.tsx        # Application entry point
```

## Key Mobile Components

- `MobileAdminLayout.tsx`: Provides a consistent layout for mobile admin screens with bottom navigation
- `ApprovalsPage.tsx`: Example implementation of a mobile-first time entry approval page

## Local Development

```bash
# Install dependencies from root
cd ../..
pnpm install

# Start the admin portal dev server
cd packages/admin
pnpm dev
```

## Notes for Implementation

When implementing new features in the Admin portal:

1. **Start with Mobile**: Design and implement for mobile screens first
2. **Use Shared Components**: Leverage components from the common package 
3. **Test on Real Devices**: Always test on actual mobile devices
4. **Use Feature Flags**: For gradual rollout of advanced features

For implementation questions, refer to the [Mobile-First Implementation Plan](../../docs/workflow/mobile-first-implementation-plan.md). 