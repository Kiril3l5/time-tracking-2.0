# Time Tracking Hours Portal

This package contains the Hours portal for the Time Tracking 2.0 application, built with a mobile-first approach to allow users to log and manage their time efficiently from any device.

## Mobile-First Implementation

The Hours portal follows the mobile-first design principles outlined in the main project documentation:

- [Mobile-First Implementation Plan](../../docs/workflow/mobile-first-implementation-plan.md)
- [Mobile Design System](../../docs/design/mobile-design-system.md)

## Structure

```
src/
├── assets/         # Static assets (images, icons)
├── components/     # Hours-specific components
├── features/       # Feature-specific modules
├── hooks/          # Hours-specific hooks
├── layouts/        # Page layouts
│   └── MobileHoursLayout.tsx  # Mobile-optimized layout
├── pages/          # Page components
│   └── TimeEntryPage.tsx      # Example mobile-first page
├── App.tsx         # Main application component
└── main.tsx        # Application entry point
```

## Key Mobile Components

- `MobileHoursLayout.tsx`: Provides a consistent layout for mobile time tracking screens with bottom navigation
- `TimeEntryPage.tsx`: Example implementation of a mobile-first time entry form with offline support

## Mobile Features

The Hours portal prioritizes these mobile-focused features:

- **Efficient Time Entry**: Optimized forms for quick time logging
- **Offline Support**: Continue logging time without internet connection
- **Touch-Friendly UI**: Large touch targets and swipe gestures
- **Responsive Design**: Adapts to all screen sizes while prioritizing mobile

## Local Development

```bash
# Install dependencies from root
cd ../..
pnpm install

# Start the hours portal dev server
cd packages/hours
pnpm dev
```

## Notes for Implementation

When implementing new features in the Hours portal:

1. **Mobile First**: Design and implement for mobile screens first
2. **Use Shared Components**: Leverage components from the common package
3. **Test on Real Devices**: Always test on actual mobile devices
4. **Consider Offline Usage**: Users should be able to log time without constant connectivity

For implementation questions, refer to the [Mobile-First Implementation Plan](../../docs/workflow/mobile-first-implementation-plan.md). 