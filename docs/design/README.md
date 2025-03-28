# Time Tracking 2.0 Design System

*Last Updated: May 2024*

This directory contains the design system documentation for the Time Tracking 2.0 application. The design system provides a unified approach to styling, components, and user interface patterns across both the `/hours` and `/admin` portals.

## Documentation Files

| File | Description |
|------|-------------|
| `design-system.md` | Comprehensive documentation of the design system, including color palette, typography, spacing, and other foundational elements. |
| `component-examples.md` | Practical examples of components built with the design system, including code snippets. |
| `color-palette.md` | Visual representation of the color palettes (Amber primary and Cool Gray secondary) with usage guidelines. |
| `typography-setup.md` | Instructions for setting up typography, including font families and sizing. |
| `design-system-preview.html` | Interactive HTML preview of all design system components and styles. |

## Using the Design System Preview

The design system preview is an HTML file that showcases all components and styles in a single page. To view it:

1. **Using the npm/pnpm script**:
   ```
   pnpm run design
   ```
   This will open the preview in your default browser.

2. **Manually opening**:
   - Navigate to `docs/design/design-system-preview.html` 
   - Open it in Chrome, Firefox, or any modern browser

## Implementation Guidelines

To implement UI components using this design system:

1. Reference the design system preview for visual guidance
2. Follow the code examples in `component-examples.md`
3. Use the Tailwind CSS utility classes as documented
4. Maintain consistency with the color palette (Amber primary, Cool Gray secondary)
5. Follow the typography scale as defined in the documentation

## Extending the Design System

When adding new components or styles:

1. Update the relevant documentation files
2. Add examples to the component examples document
3. Consider adding to the preview HTML for visual reference
4. Ensure the Tailwind configuration includes any necessary customizations

## Tailwind Configuration

This design system utilizes Tailwind CSS for styling. The custom configuration includes:

- Custom color palettes (Primary Amber, Secondary Cool Gray)
- Custom typography scale
- Extended spacing scale
- Custom component classes

## Accessibility

All components should meet WCAG 2.1 AA standards. Pay special attention to:

- Color contrast ratios
- Keyboard navigation
- Proper ARIA attributes
- Text alternatives for non-text content

## Questions and Support

For questions about the design system, consult the documentation first, then reach out to the design team if you need further assistance. 