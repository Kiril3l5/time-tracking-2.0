# Design System Documentation

*Last updated: May 2024*

This document provides a comprehensive reference for the design system used across both the `/hours` and `/admin` portals. It serves as a guide for developers to maintain consistency when building UI components.

## Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing](#spacing)
4. [Border Radius](#border-radius)
5. [Shadows](#shadows)
6. [Transitions & Animations](#transitions--animations)
7. [Component-Specific Styles](#component-specific-styles)
8. [Custom Utility Classes](#custom-utility-classes)
9. [Common Components](#common-components)
10. [Usage Guidelines](#usage-guidelines)

## Color System

Our color system is built on semantic color palettes that ensure consistency across both portals.

### Primary Colors (Amber)

The primary amber color palette is used for main UI elements, CTAs, and branding. This vibrant, warm color creates clear focal points in the interface.

| Class | Hex | Usage |
|-------|-----|-------|
| `bg-primary-50` | `#FFFBEB` | Very light backgrounds, hover states |
| `bg-primary-100` | `#FEF3C7` | Light backgrounds, focus rings |
| `bg-primary-200` | `#FDE68A` | Disabled button backgrounds |
| `bg-primary-300` | `#FCD34D` | Hover states |
| `bg-primary-400` | `#FBBF24` | Alternative button states, icons |
| `bg-primary-500` | `#F59E0B` | **Primary default** - Main buttons, links, accents |
| `bg-primary-600` | `#D97706` | **Primary dark** - Button hover states |
| `bg-primary-700` | `#B45309` | Active states, pressed buttons |
| `bg-primary-800` | `#92400E` | Very dark accents |
| `bg-primary-900` | `#78350F` | Extremely dark backgrounds or text |

### Secondary Colors (Cool Gray)

The secondary cool gray palette provides a neutral foundation for UI elements and is used for less prominent actions. This creates a perfect backdrop that allows the primary amber color to stand out.

| Class | Hex | Usage |
|-------|-----|-------|
| `bg-secondary-50` | `#F9FAFB` | Very light backgrounds |
| `bg-secondary-100` | `#F3F4F6` | Light backgrounds |
| `bg-secondary-200` | `#E5E7EB` | Light accents, borders |
| `bg-secondary-300` | `#D1D5DB` | Medium accents, input borders |
| `bg-secondary-400` | `#9CA3AF` | Medium-dark accents, placeholder text |
| `bg-secondary-500` | `#6B7280` | **Secondary default** - Main secondary color for buttons, text, icons, and UI elements |
| `bg-secondary-600` | `#4B5563` | Secondary dark - Button hover states, depth elements |
| `bg-secondary-700` | `#374151` | Active states, body text |
| `bg-secondary-800` | `#1F2937` | Very dark accents, emphasis text |
| `bg-secondary-900` | `#111827` | Extremely dark backgrounds, headings |

#### Using Secondary Colors

The Cool Gray palette, particularly the main secondary color `#6B7280`, should be used for:

- Secondary buttons and action elements
- Main text content and labels
- Icons and UI elements that don't need to stand out
- Navigation items (not selected/active)
- Borders and dividers
- Avatar backgrounds
- Form labels and help text

Using `#6B7280` consistently across the application creates a cohesive, professional look that allows the amber primary color to be more impactful when used for important actions and focus points.

#### Interactive Elements & Hover States

For interactive elements using the secondary color:

- **Secondary Buttons**: On hover, secondary buttons (gray `#6B7280`) should change to the primary amber color (`#F59E0B`). This creates a consistent interaction language and reinforces the primary brand color.
- **Text Links**: Secondary text links should follow the same pattern, changing from gray to amber on hover.
- **Icons**: Interactive icons should also transition from gray to amber on hover.

This consistent hover behavior ensures that users immediately recognize interactive elements while maintaining the visual hierarchy between primary and secondary elements in their default state.

### Interactive Elements

Our design system maintains consistent interaction patterns across all interactive elements to create a cohesive user experience and reinforce our brand identity.

#### Transition Animations

All hover and focus transitions should use the following timing:
- **Duration**: 150ms (quick enough to feel responsive, slow enough to be noticeable)
- **Timing Function**: `cubic-bezier(0.4, 0, 0.2, 1)` (standard ease-in-out for smooth, natural transitions)

```css
.interactive-element {
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

#### Component-Specific Interactions

| Component | Default State | Hover State | Focus State | Active State |
|-----------|--------------|------------|------------|-------------|
| Buttons | Gray (`#6B7280`) for secondary | Amber (`#F59E0B`) | Amber focus ring with 3px outline | Slightly darker amber (`#D97706`) |
| Text Links | Gray (`#6B7280`) for secondary | Amber (`#F59E0B`) | Amber with underline | Amber with underline |
| Dropdown Menus | Gray text | Gray background with amber text | Amber focus ring | Amber background, white text |
| Tabs | Gray when inactive | Amber text, light gray background | Amber with focus ring | Amber with bottom border |
| Checkboxes/Radios | Gray border | Amber border | Amber focus ring | Amber fill when selected |
| Pagination | Gray for inactive | Amber text and border | Amber focus ring | Amber background |
| Chips/Tags | Gray background | Amber border | Amber focus ring | Amber background |
| Tooltips/Popovers | Show on hover with 200ms delay | N/A | N/A | N/A |
| Navigation Items | Gray when inactive | Amber text | Amber focus ring | Amber with indicator |

#### Keyboard Focus States

For accessibility, keyboard focus states **must** be clearly visible and should never be removed. All focusable elements should have:

- A visible focus ring using amber (`#F59E0B`) 
- 3px offset with the proper alpha transparency (rgba(245, 158, 11, 0.3))
- No animation when focus appears (immediate visual feedback)
- Higher contrast than hover states

```css
.interactive-element:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.3);
}
```

#### Touch Targets

For touch interfaces, ensure:
- Minimum touch target size of 44px × 44px
- Adequate spacing between interactive elements (minimum 8px)
- Visual feedback on touch (state change within 100ms)
- Touch feedback should use the same amber color as hover states

These interaction guidelines ensure consistency across both the /hours and /admin portals while accommodating different input methods and accessibility needs.

### Neutral Colors

The neutral palette is used for text, backgrounds, borders, and dividers. It's similar to the secondary palette but used specifically for non-interactive elements.

| Class | Hex | Usage |
|-------|-----|-------|
| `bg-neutral-50` | `#F9FAFB` | Page backgrounds, table headers |
| `bg-neutral-100` | `#F3F4F6` | Card backgrounds, table row hover |
| `bg-neutral-200` | `#E5E7EB` | Borders, dividers |
| `bg-neutral-300` | `#D1D5DB` | Input borders, disabled states |
| `bg-neutral-400` | `#9CA3AF` | Placeholder text |
| `bg-neutral-500` | `#6B7280` | Secondary text |
| `bg-neutral-600` | `#4B5563` | Labels, captions |
| `bg-neutral-700` | `#374151` | Body text |
| `bg-neutral-800` | `#1F2937` | Emphasis text |
| `bg-neutral-900` | `#111827` | Headings |

### Semantic Status Colors

These colors communicate statuses and feedback to users. Note that our warning color matches our primary color to maintain consistency while still communicating caution.

| Class | Hex | Usage |
|-------|-----|-------|
| `bg-success-50` | `#ECFDF5` | Success alert backgrounds |
| `bg-success-100` | `#D1FAE5` | Success light backgrounds |
| `bg-success-500` | `#10B981` | Success messages, icons |
| `bg-success-700` | `#047857` | Success text |
| `bg-warning-50` | `#FFFBEB` | Warning alert backgrounds |
| `bg-warning-100` | `#FEF3C7` | Warning light backgrounds |
| `bg-warning-500` | `#F59E0B` | Warning messages, icons (matches primary) |
| `bg-warning-700` | `#B45309` | Warning text |
| `bg-error-50` | `#FEF2F2` | Error alert backgrounds |
| `bg-error-100` | `#FEE2E2` | Error light backgrounds |
| `bg-error-500` | `#EF4444` | Error messages, icons |
| `bg-error-700` | `#B91C1C` | Error text |
| `bg-info-50` | `#EFF6FF` | Info alert backgrounds |
| `bg-info-100` | `#DBEAFE` | Info light backgrounds |
| `bg-info-500` | `#3B82F6` | Info messages, icons |
| `bg-info-700` | `#1D4ED8` | Info text |

## Typography

## Spacing

## Border Radius

## Shadows

## Transitions & Animations

## Component-Specific Styles

## Custom Utility Classes

## Common Components

## Usage Guidelines

## Previewing the Design System

To view the design system in action, you can use our dedicated preview script which opens the design system preview in your default browser:

```bash
node scripts/preview-design-system.js
```

The preview provides a visual representation of all design elements including:
- Color swatches for all palettes (primary amber, secondary cool gray, and semantic colors)
- Typography styles and text elements
- UI components (buttons, forms, cards, tables, etc.)
- Layout elements
- Navigation patterns

The preview serves as both documentation and a development reference to ensure consistency throughout the application. 