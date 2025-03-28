# Typography Setup Guide

*Last updated: May 2024*

This document provides instructions for setting up and using the typography system defined in our design system. Following these guidelines ensures consistent text styling across both the `/hours` and `/admin` portals.

## Font Families

Our design system uses three font families for different purposes:

1. **Roboto Condensed** - Used for body text and general content
2. **Roboto** - Used for headings and display text
3. **Roboto Mono** - Used for code blocks and technical content

## Installation

### Adding Fonts to Your Project

#### Method 1: Google Fonts (Recommended for Development)

1. Add the following link tag to the `<head>` section of your HTML:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
```

2. Verify that the fonts are loading correctly by inspecting your page and checking the computed styles.

#### Method 2: Self-hosting (Recommended for Production)

For better performance and to avoid dependencies on external services, self-host the fonts in production:

1. Download the font files from Google Fonts or another source:
   - [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed)
   - [Roboto](https://fonts.google.com/specimen/Roboto)
   - [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)

2. Create a `fonts` directory in your public assets folder.

3. Add the font files to this directory.

4. Create a CSS file called `fonts.css` with the following content:

```css
/* Roboto Condensed */
@font-face {
  font-family: 'Roboto Condensed';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('/assets/fonts/RobotoCondensed-Light.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Condensed';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/RobotoCondensed-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Condensed';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/assets/fonts/RobotoCondensed-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Condensed';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/assets/fonts/RobotoCondensed-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Condensed';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/assets/fonts/RobotoCondensed-Bold.woff2') format('woff2');
}

/* Roboto */
@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('/assets/fonts/Roboto-Light.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/Roboto-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/assets/fonts/Roboto-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/assets/fonts/Roboto-Bold.woff2') format('woff2');
}

/* Roboto Mono */
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/RobotoMono-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/assets/fonts/RobotoMono-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/assets/fonts/RobotoMono-Bold.woff2') format('woff2');
}
```

5. Import this CSS file in your main CSS file or include it in your HTML.

### Font Optimization

To ensure optimal performance, consider the following best practices:

1. **Preload critical fonts**:
   ```html
   <link rel="preload" href="/assets/fonts/RobotoCondensed-Regular.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="preload" href="/assets/fonts/Roboto-Bold.woff2" as="font" type="font/woff2" crossorigin>
   ```

2. **Use font-display: swap** to ensure text remains visible during font loading.

3. **Include only the weights you need** to minimize the download size.

4. **Use WOFF2 format** for the best compression and browser support.

## Using Typography in Your Application

### Tailwind CSS Classes

Our design system includes predefined typography classes that you can use in your components:

#### Font Families

```html
<p class="font-sans">This text uses Roboto Condensed (default body font)</p>
<h1 class="font-display">This text uses Roboto (heading font)</h1>
<code class="font-mono">This text uses Roboto Mono (code font)</code>
```

#### Font Sizes

```html
<p class="text-xs">Extra small text (12px)</p>
<p class="text-sm">Small text (14px)</p>
<p class="text-base">Base text size (16px)</p>
<p class="text-lg">Large text (18px)</p>
<p class="text-xl">Extra large text (20px)</p>
<p class="text-2xl">2XL text (24px)</p>
<p class="text-3xl">3XL text (30px)</p>
<p class="text-4xl">4XL text (36px)</p>
<p class="text-5xl">5XL text (48px)</p>
```

#### Font Weights

```html
<p class="font-light">Light text (300)</p>
<p class="font-normal">Normal text (400)</p>
<p class="font-medium">Medium text (500)</p>
<p class="font-semibold">Semi-bold text (600)</p>
<p class="font-bold">Bold text (700)</p>
```

### Text Utility Classes

Our design system includes custom utility classes for common text styles:

```html
<p class="text-body">Default body text</p>
<p class="text-body-sm">Smaller body text</p>
<p class="text-caption">Caption text</p>
<h1 class="text-heading-1">Heading 1</h1>
<h2 class="text-heading-2">Heading 2</h2>
<h3 class="text-heading-3">Heading 3</h3>
<h4 class="text-heading-4">Heading 4</h4>
```

### Combining Typography Classes

You can combine these classes to create specific text styles:

```html
<!-- Large bold heading -->
<h1 class="font-display text-4xl font-bold text-neutral-900">
  Welcome to the Dashboard
</h1>

<!-- Secondary information -->
<p class="font-sans text-sm font-normal text-neutral-600">
  Last updated: May 24, 2024
</p>

<!-- Input label -->
<label class="font-sans text-xs font-medium text-neutral-700">
  Email Address
</label>

<!-- Code example -->
<pre class="font-mono text-sm text-neutral-800 bg-neutral-50 p-4 rounded">
  const result = calculateHours(timeEntries);
</pre>
```

## Typography Hierarchy

Follow this hierarchy for consistent text styling:

1. **Page Titles**: `text-heading-1` - Main page headings
2. **Section Headings**: `text-heading-2` - Major section dividers
3. **Subsection Headings**: `text-heading-3` - Content group headings
4. **Card Headings**: `text-heading-4` - Card or small section titles
5. **Body Text**: `text-body` - Main content text
6. **Secondary Text**: `text-body-sm` - Supporting content
7. **Caption Text**: `text-caption` - Labels, metadata, timestamps

## Portal-Specific Guidelines

### Hours Portal

The Hours portal should prioritize readability and clarity:

- Use larger text sizes for time entry inputs (min 16px/1rem)
- Maintain proper spacing between text elements
- Use bold text sparingly to highlight important information
- Ensure sufficient contrast for all text

### Admin Portal

The Admin portal can use a more condensed typographic style:

- Use smaller text sizes for data tables and dense information displays
- Utilize the caption text style for metadata and supporting information
- Leverage font weight variations to create visual hierarchy
- Consider using monospace font for technical data or IDs

## Accessibility Considerations

- Maintain a minimum font size of 16px (1rem) for body text
- Ensure text has sufficient color contrast (4.5:1 for normal text, 3:1 for large text)
- Do not use font weight as the only means of conveying importance or structure
- Allow text to be resizable by using relative units (rem) instead of fixed units (px)

## Working with Line Heights

Our design system includes predefined line heights for each text size:

- `text-xs`: 1rem (16px) line height
- `text-sm`: 1.25rem (20px) line height
- `text-base`: 1.5rem (24px) line height
- `text-lg`: 1.75rem (28px) line height
- `text-xl`: 1.75rem (28px) line height
- `text-2xl`: 2rem (32px) line height
- `text-3xl`: 2.25rem (36px) line height
- `text-4xl`: 2.5rem (40px) line height
- `text-5xl`: 1 (equal to font size) line height

For custom line heights, use Tailwind's line height utilities:

```html
<p class="leading-none">1 (equal to font size)</p>
<p class="leading-tight">1.25</p>
<p class="leading-snug">1.375</p>
<p class="leading-normal">1.5</p>
<p class="leading-relaxed">1.625</p>
<p class="leading-loose">2</p>
```

## Font Loading Performance

To monitor font loading performance:

1. Use the Network tab in browser DevTools to check font load times
2. Monitor for Cumulative Layout Shift (CLS) caused by font loading
3. Consider using font subsetting to include only the characters you need
4. Use `font-display: swap` to prevent FOIT (Flash of Invisible Text)

## Troubleshooting

### Common Issues

**Issue**: Fonts not loading or displaying incorrect font
**Solution**: Check network requests for font files, ensure paths are correct, and verify font-family names match your CSS declarations.

**Issue**: Text looks different across browsers
**Solution**: Ensure all font weights are properly defined and loaded, and use system font fallbacks.

**Issue**: Text appears blurry on some devices
**Solution**: Ensure you're using proper font sizes and avoiding sub-pixel rendering issues by using whole-number font sizes.

**Issue**: Layout shifts when fonts load
**Solution**: Use font-display: swap and consider adding explicit width/height to text containers, or use a font loading strategy like the Font Face Observer library. 