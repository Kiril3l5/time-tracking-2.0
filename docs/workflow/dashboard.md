# Dashboard System Documentation

## Overview

The Time Tracking 2.0 system includes a powerful dashboard that provides real-time insights into the workflow execution. This document details the dashboard's architecture, components, and integration with the workflow system.

## Dashboard Components

### 1. Workflow Timeline
- Chronological view of all workflow steps
- Success/failure status for each step
- Duration of each step
- Error details for failed steps

### 2. Preview URLs
- Direct links to deployed preview apps
- Hours application URL
- Admin application URL
- Channel ID for reference

### 3. Warnings & Suggestions
- Comprehensive list of potential issues
- Categorized by phase (Setup, Validation, Build, Deploy, Results)
- Categorized by type (Documentation, Security, Code Quality, etc.)
- Each warning includes specific information about the issue and affected file/component

### 4. Advanced Check Results
- Build Metrics
  - Total file count
  - Estimated size based on Vite output
  - Historical build size trend chart
- Dead code detection showing unused files and functions
- Documentation quality assessment and freshness evaluation
- TypeScript and lint issues with file locations and line numbers
- Security vulnerability reporting with severity levels
- Project health evaluation with actionable recommendations

### 5. Workflow Settings
- Configuration used for the current run
- Command-line options
- Git branch information
- Environment information

## Dashboard CLI

The dashboard system includes a command-line interface (CLI) that allows you to generate and manage dashboards independently of the main workflow. This is useful for viewing previous workflow results or generating dashboards from saved workflow data.

### Available Commands

```bash
# Generate a dashboard from workflow data
node scripts/workflow/dashboard-cli.js generate

# Generate a dashboard with verbose output
node scripts/workflow/dashboard-cli.js generate --verbose

# Generate a dashboard without opening it in the browser
node scripts/workflow/dashboard-cli.js generate --no-open

# Display help information
node scripts/workflow/dashboard-cli.js --help
```

### Command-Line Options

The dashboard CLI supports the following options:

- `--input <file>`: Specify the input file containing workflow data (default: `workflow-data.json`)
- `--output <file>`: Specify the output file for the dashboard (default: `dashboard.html`)
- `--no-open`: Don't open the dashboard in the browser after generation
- `--verbose`: Enable verbose output for debugging
- `--help`: Display help information

### NPM Scripts

For convenience, the following npm scripts are available:

```bash
# Generate a dashboard
npm run dashboard:generate

# Generate a dashboard with verbose output
npm run dashboard:verbose

# Generate a dashboard without opening it in the browser
npm run dashboard:no-open

# Display help information
npm run dashboard:help
```

### Example Usage

```bash
# Generate a dashboard from a specific workflow data file
node scripts/workflow/dashboard-cli.js generate --input ./reports/workflow-data-2023-04-07.json

# Generate a dashboard with a custom output file
node scripts/workflow/dashboard-cli.js generate --output ./reports/custom-dashboard.html

# Generate a dashboard with verbose output and don't open it in the browser
node scripts/workflow/dashboard-cli.js generate --verbose --no-open
```

### Integration with Other Tools

The dashboard CLI can be integrated with other tools and scripts:

```javascript
// Example: Generate a dashboard programmatically
import { generateWorkflowDashboard } from './scripts/workflow/dashboard-integration.js';

async function generateCustomDashboard(workflowData, options = {}) {
  const dashboardPath = await generateWorkflowDashboard(workflowData, {
    ...options,
    openInBrowser: false
  });
  
  console.log(`Dashboard generated at: ${dashboardPath}`);
  return dashboardPath;
}
```

## Implementation Details

### File Structure
- `scripts/workflow/dashboard-generator.js` - Main dashboard generation logic
- `scripts/workflow/dashboard-integration.js` - Integration with workflow system
- `scripts/workflow/dashboard-cli.js` - Command-line interface for dashboard generation

### Key Functions

#### Dashboard Generation
```javascript
// Generate the complete dashboard
async function generateWorkflowDashboard(workflowState, options = {}) {
  // Extract metrics and data from workflow state
  // Generate HTML content
  // Write dashboard file
  // Open in browser if requested
}
```

#### Metrics Collection
```javascript
// Extract metrics from workflow state
function extractWorkflowMetrics(workflowState) {
  // Calculate durations
  // Process warnings
  // Format check results
  // Return structured metrics
}
```

#### HTML Generation
```javascript
// Generate HTML content for dashboard
function generateDashboardHTML(metrics, options) {
  // Build HTML structure
  // Add CSS styles
  // Include JavaScript for interactivity
  // Return complete HTML string
}
```

## Best Practices

### HTML Content in JavaScript
1. **String Concatenation**: For complex HTML structures, use string concatenation instead of template literals:
   ```javascript
   // PREFERRED: String concatenation for complex HTML
   filterBar.innerHTML = 
     '<div class="filter-item">' +
       '<input type="text" id="search-input" placeholder="Search...">' +
     '</div>';
   
   // AVOID: Template literals with complex HTML in ESM modules
   filterBar.innerHTML = `
     <div class="filter-item">
       <input type="text" id="search-input" placeholder="Search...">
     </div>
   `;
   ```

2. **Incremental Construction**: For SVG or complex elements, build HTML string incrementally:
   ```javascript
   // PREFERRED: Build complex content incrementally
   let svgMarkup = '<svg width="800" height="400">';
   svgMarkup += '<line x1="50" y1="350" x2="750" y2="350" stroke="#d1d5da" />';
   // ... add more elements
   svgMarkup += '</svg>';
   ```

3. **Simple Values in Template Literals**: For inserting simple values, string concatenation is clearer:
   ```javascript
   // PREFERRED: Simple concatenation for text content
   ctx.fillText(step.durationMs + 'ms', leftPadding + 5, y + 3);
   
   // AVOID: Template literals in dynamic contexts
   ctx.fillText(`${step.durationMs}ms`, leftPadding + 5, y + 3);
   ```

### ESM Module Compatibility
1. **Error Prevention**: ESM modules parse the entire file statically before executing
2. **Syntax Requirements**: Template literals with embedded expressions can sometimes be misinterpreted
3. **Testing Changes**: Always test any dashboard changes with `node scripts/improved-workflow.js`
4. **Verify Runs**: Make sure to test with `--verbose` flag to see all output

## Troubleshooting

### Dashboard Not Opening
- The dashboard is saved as `dashboard.html` in the project root
- Open it manually if it doesn't launch automatically
- Check for the 'open' package dependency

### Missing Warnings in Dashboard
- Run with `--verbose` flag for more detailed output
- Check the workspace for quality issues that may not be detected

### Dashboard Generation Issues
- If you encounter errors during dashboard generation, check for syntax issues in `scripts/workflow/dashboard-generator.js`
- Avoid using complex template literals with HTML content in JavaScript modules
- Use string concatenation for building complex HTML or SVG structures
- For SVG chart generation, build markup incrementally instead of using complex template strings
- If dashboard fails to generate, check the console for specific syntax errors

## Extending the Dashboard

To add new visualizations or sections to the dashboard:

1. Modify `workflow/dashboard-generator.js`
2. Carefully structure your HTML/JavaScript to avoid syntax issues:
   - Use string concatenation for complex HTML elements
   - Build SVG content incrementally
   - Avoid nested template literals
   - Test changes by running the workflow with `--verbose`
3. Follow the existing patterns for element structure and styling
4. Add CSS definitions in the cssContent section of the file
5. Consider creating helper functions for complex visualizations 