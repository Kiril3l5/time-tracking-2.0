# Automated Workflow Guide

The Time Tracking 2.0 system includes a powerful automated workflow tool that streamlines the development process. This guide explains how to use the workflow tool and understand its components.

## Overview

The automated workflow system orchestrates the entire development cycle from setup to deployment, providing:

- Code quality validation (linting, type checking, testing)
- Automated building of packages
- Preview deployment to Firebase
- Interactive dashboard with detailed reporting
- Channel cleanup to maintain Firebase resources
- Branch management for easy commit and PR creation

## Running the Workflow

To start the workflow, run:

```bash
# Using npm
npm run workflow

# Using pnpm
pnpm run workflow

# Direct execution
node scripts/improved-workflow.js
```

### Workflow Options

The workflow supports several command-line options:

```bash
# Skip quality checks
pnpm run workflow --skip-tests

# Skip build phase
pnpm run workflow --skip-build

# Skip deployment 
pnpm run workflow --skip-deploy

# Verbose mode (more detailed output)
pnpm run workflow --verbose

# Skip specific advanced checks
pnpm run workflow --skip-bundle-check
pnpm run workflow --skip-dead-code
pnpm run workflow --skip-docs-check
pnpm run workflow --skip-docs-freshness
pnpm run workflow --skip-workflow-validation
pnpm run workflow --skip-health-check

# Skip all advanced checks
pnpm run workflow --skip-advanced-checks
```

## Workflow Phases

The workflow progresses through five distinct phases:

### 1. Setup Phase
- Verifies Git configuration
- Checks Firebase authentication status
- Validates required dependencies

### 2. Validation Phase
- Analyzes package dependencies
- Runs code quality checks:
  - Linting with ESLint
  - Type checking with TypeScript
  - Tests with Vitest
- Performs advanced checks:
  - Documentation quality
  - Dead code detection
  - Security vulnerabilities
  - Bundle size analysis
  - Health checks

### 3. Build Phase
- Cleans previous build artifacts with platform-specific commands (Windows/Unix)
- Uses `pnpm run build:all` to build packages sequentially in the correct dependency order
- Verifies build artifacts exist before proceeding to deployment
- Optimizes assets for deployment
- Detects and reports build warnings

### 4. Deploy Phase
- Creates a unique preview channel ID
- Deploys the Hours app to Firebase Hosting
- Deploys the Admin app to Firebase Hosting
- Provides preview URLs for both apps

### 5. Results Phase
- Cleans up old preview channels (maintaining only the most recent ones based on configuration)
- Generates a comprehensive dashboard
- Displays warnings and suggestions for improvement
- Provides options for branch/commit management

## The Dashboard

The workflow generates an interactive dashboard that opens automatically in your browser after completion. The dashboard provides:

### Preview URLs
Direct links to your deployed preview apps for:
- Hours application
- Admin application
- Channel ID for reference

### Workflow Timeline
A chronological view of all workflow steps including:
- Success/failure status for each step
- Duration of each step
- Error details for failed steps

### Warnings & Suggestions
A comprehensive list of potential issues categorized by:
- Phase (Setup, Validation, Build, Deploy, Results)
- Type (Documentation, Security, Code Quality, etc.)

Each warning includes specific information about the issue and the affected file/component.

### Advanced Check Results
Detailed results from advanced checks, including:
- Bundle size analysis
- Dead code detection
- Documentation quality and freshness
- TypeScript and lint issues
- Project health evaluation

### Workflow Settings
Shows the configuration used for this run, including:
- Command-line options
- Git branch information
- Environment information

## Channel Cleanup

The workflow automatically manages Firebase preview channels:

- Keeps the most recent channels based on configuration (default is 5)
- Removes channels older than a specified number of days (default is 7)
- Deletes older channels to stay within Firebase hosting limits
- Shows cleanup status in the dashboard

## Configuration System

The workflow uses a hierarchical configuration system:

1. **Default Configuration**: Basic settings defined in code
2. **Firebase Configuration**: Settings from .firebaserc and firebase.json
3. **Environment Variables**: Override settings with environment variables
4. **Command Line Options**: Override settings with command-line flags

Key configurations include:

```
# Firebase Configuration
FIREBASE_PROJECT_ID - Firebase project ID
FIREBASE_SITE - Site name for hosting

# Preview Configuration
PREVIEW_PREFIX - Prefix for preview channel names (default: 'preview-')
PREVIEW_EXPIRE_DAYS - Days until preview channels expire (default: 7)
PREVIEW_KEEP_COUNT - Number of channels to keep (default: 5)

# Build Configuration
BUILD_DIR - Directory containing build artifacts (default: 'dist')
```

## Workflow Architecture

The workflow system has a modular architecture:

- **Central Orchestrator**: `improved-workflow.js` - Manages workflow phases
- **Configuration Management**: `workflow/workflow-config.js` - Centralized settings
- **Quality Checking**: `checks/quality-checker.js` - Code quality validation
- **Advanced Checks**: `workflow/advanced-checker.js` - In-depth code analysis
- **Deployment**: `workflow/deployment-manager.js` - Firebase deployment
- **Reporting**: `workflow/consolidated-report.js` - Dashboard generation
- **Channel Management**: `firebase/channel-cleanup.js` - Hosting channel cleanup
- **Package Coordination**: `workflow/package-coordinator.js` - Package build ordering

## Troubleshooting

If you encounter issues with the workflow:

### Dashboard Not Opening
- The dashboard is saved as `dashboard.html` in the project root
- Open it manually if it doesn't launch automatically

### Firebase Authentication Issues
- Run `firebase login` to refresh your authentication
- Verify your Firebase project access

### Preview Deployment Failures
- Check Firebase permissions
- Verify your internet connection
- Review the error details in the dashboard

### Missing Warnings in Dashboard
- Run with `--verbose` flag for more detailed output
- Check the workspace for quality issues that may not be detected

### Platform-Specific Issues
- **Windows**: If you encounter issues with deletion commands, ensure PowerShell is used instead of Command Prompt
- **Unix/Mac**: Ensure proper permissions for script execution with `chmod +x scripts/*.js`
- **Cross-Platform**: The workflow automatically detects your OS and uses appropriate commands for cleaning build artifacts

### Dependency Issues
- If you encounter import errors, run `pnpm install` to ensure all dependencies are installed
- The 'open' package is required for automatic dashboard viewing

## Extending the Workflow

The workflow is designed to be extensible. To add new checks or features:

1. Add new modules in the appropriate scripts directory
2. Import them into the main workflow components
3. Use the `recordWarning` method to add findings to the dashboard
4. Follow the existing module pattern for consistency

## Best Practices

For optimal workflow usage:

1. **Run Regularly**: Use the workflow during development, not just before PRs
2. **Review All Warnings**: Address issues shown in the dashboard
3. **Keep Channels Clean**: Let the workflow manage channel cleanup
4. **Include Preview URLs**: When sharing code for review, include the preview URLs
5. **Maintain Documentation**: Update docs to reflect changes in the system 