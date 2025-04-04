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
- GitHub Actions integration and verification

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

# Skip PR creation instructions
pnpm run workflow --skip-pr

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
- Shows authenticated user information for both Firebase and Git

### 2. Validation Phase
- Analyzes package dependencies
- Runs code quality checks:
  - Linting with ESLint
  - Type checking with TypeScript
  - Tests with Vitest
- Performs advanced checks:
  - Documentation quality and freshness
  - Dead code detection
  - Security vulnerabilities
  - Bundle size analysis
  - Health checks
  - Workflow validation
- Collects warnings from all checks to display in dashboard

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
- Handles deployment errors gracefully

### 5. Results Phase
- Cleans up old preview channels (maintaining only the most recent ones based on configuration)
- Generates a comprehensive dashboard
- Displays warnings and suggestions for improvement
- Provides options for branch/commit management
- Assists with GitHub integration including PR creation

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
- Bundle size analysis with component-level breakdown
- Dead code detection showing unused files and functions
- Documentation quality assessment and freshness evaluation
- TypeScript and lint issues with file locations and line numbers
- Security vulnerability reporting with severity levels
- Project health evaluation with actionable recommendations

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
- **Branch Management**: `workflow/branch-manager.js` - Git branch operations
- **Performance Monitoring**: `core/performance-monitor.js` - Timing tracking
- **Authentication**: `auth/auth-manager.js` - Service authentication

## Workflow Integration System

To better support the automated workflow, each core module now offers direct workflow integration capabilities through specialized functions. This integration allows modules to record warnings, track steps, and provide more detailed insights into the workflow process.

### Integration Pattern

All major modules now provide workflow-integrated versions of their core functions. These functions follow a consistent naming pattern like `xxxWithWorkflowTracking` or `xxxWithWorkflowIntegration` and accept workflow tracking callbacks.

### Common Integration Parameters

These integrated functions accept these standard parameters:

```javascript
{
  // ... regular function parameters
  recordWarning: Function, // Optional callback to record warnings
  recordStep: Function,    // Optional callback to track steps
  phase: String            // Optional workflow phase name
}
```

### Available Integrated Functions

#### Build Management
```javascript
import { buildPackageWithWorkflowTracking } from './scripts/workflow/build-manager.js';

const result = await buildPackageWithWorkflowTracking({
  target: 'production',
  minify: true, 
  sourceMaps: false,
  typeCheck: true,
  clean: true,
  recordWarning: fn,  // Workflow warning recorder
  recordStep: fn,     // Workflow step recorder
  phase: 'Build'
});
```

#### Deployment Management
```javascript
import { deployPackageWithWorkflowIntegration } from './scripts/workflow/deployment-manager.js';

const result = await deployPackageWithWorkflowIntegration({
  channelId: 'production',
  skipBuild: false,
  force: false,
  recordWarning: fn,
  recordStep: fn, 
  phase: 'Deployment'
});
```

#### Advanced Checks
```javascript
import { runSingleCheckWithWorkflowIntegration } from './scripts/workflow/advanced-checker.js';

const result = await runSingleCheckWithWorkflowIntegration('typescript', {
  // Check-specific options
  recordWarning: fn,
  recordStep: fn,
  phase: 'Validation'
});
```

#### Channel Cleanup
```javascript
import { cleanupChannelWithWorkflowTracking } from './scripts/workflow/channel-cleanup.js';

const result = await cleanupChannelWithWorkflowTracking({
  channelId: 'staging',
  dryRun: false,
  keepLatest: true,
  keepCount: 2,
  recordWarning: fn,
  recordStep: fn,
  phase: 'Maintenance'
});
```

#### Error Handling
```javascript
import { handleErrorWithWorkflowTracking } from './scripts/workflow/error-handler.js';

try {
  // some operation
} catch (error) {
  handleErrorWithWorkflowTracking(error, {
    source: 'myFunction',
    context: 'while processing data',
    isFatal: false,
    recordWarning: fn,
    recordStep: fn,
    phase: 'DataProcessing'
  });
}
```

### Benefits of Workflow Integration

This direct workflow integration offers several benefits:

1. **Consistent Tracking**: Standardized recording of steps and warnings across modules
2. **Detailed Insights**: More specific warnings tied to exactly where they occurred
3. **Timing Data**: Accurate performance metrics for each step
4. **Error Context**: Better error information with source and context captured
5. **Simplified Orchestration**: The main workflow can delegate tracking to each module
6. **Fine-Grained Reporting**: The dashboard can show more detailed information

### How Integration Works with the Orchestrator

The main workflow orchestrator uses these integrated functions to provide rich tracking throughout the execution:

```javascript
// Example workflow orchestrator integration
class WorkflowOrchestrator {
  async runBuildPhase(config) {
    return buildPackageWithWorkflowTracking({
      ...config,
      recordWarning: this.recordWarning.bind(this),
      recordStep: this.recordStep.bind(this),
      phase: 'Build'
    });
  }
  
  async runDeployPhase(config) {
    return deployPackageWithWorkflowIntegration({
      ...config,
      recordWarning: this.recordWarning.bind(this),
      recordStep: this.recordStep.bind(this),
      phase: 'Deployment'
    });
  }
  
  // Other phases can similarly use the integrated functions
}
```

## Workflow Module Dependency Map

Below is a dependency map showing how different scripts and modules feed into the main workflow orchestrator:

```
improved-workflow.js (Main Orchestrator)
├── Core Utilities
│   ├── core/logger.js - Logging and console output
│   ├── core/command-runner.js - Executes shell commands
│   ├── core/progress-tracker.js - Visual progress indicators
│   ├── core/performance-monitor.js - Timing measurements
│   ├── core/error-handler.js - Error management and aggregation
│   └── core/colors.js - Console output formatting
│
├── Authentication & Security
│   ├── auth/auth-manager.js - Authentication coordination
│   │   ├── auth/firebase-auth.js - Firebase authentication
│   │   └── auth/git-auth.js - Git authentication
│   └── core/environment.js - Environment variables
│
├── Setup Phase
│   └── workflow/workflow-state.js - Workflow state tracking
│
├── Validation Phase
│   ├── checks/quality-checker.js - Manages basic quality checks
│   │   ├── (Runs linting)
│   │   ├── (Runs type checking)
│   │   └── (Runs tests)
│   │
│   ├── workflow/advanced-checker.js - Advanced code analysis
│   │   ├── checks/bundle-analyzer.js - Bundle size analysis
│   │   ├── checks/dead-code-detector.js - Unused code detection
│   │   ├── checks/doc-quality.js - Documentation quality
│   │   ├── checks/doc-freshness.js - Documentation freshness
│   │   ├── checks/workflow-validation.js - Workflow integrity
│   │   ├── checks/typescript-check.js - In-depth TypeScript validation
│   │   ├── checks/lint-check.js - Specialized linting
│   │   └── checks/health-checker.js - Project health metrics
│   │
│   └── workflow/package-coordinator.js - Dependency analysis
│
├── Build Phase
│   ├── (Direct command execution) - Custom clean & build commands
│   └── build/build-manager.js - Not currently fully utilized
│       ├── build/build-validator.js - Validates build outputs
│       ├── build/build-cache.js - Build caching
│       └── build/build-runner.js - Build process execution
│
├── Deploy Phase
│   ├── workflow/deployment-manager.js - Firebase preview deployment
│   │   └── workflow/branch-manager.js - Gets branch info for channels
│   └── firebase/channel-cleanup.js - Cleans up old channels
│       └── workflow/workflow-config.js - Channel retention config
│
└── Results Phase
    ├── workflow/consolidated-report.js - Dashboard generation
    │   └── reports/report-collector.js - Collects check reports
    └── github/pr-manager.js - Pull request creation
        └── workflow/branch-manager.js - Branch management
```

### Data Flow Through the System

The workflow passes several key data structures between components:

1. **Workflow Steps**: Records of each step's execution with success/failure status and timing
   - Created by: improved-workflow.js (`recordWorkflowStep` method)
   - Consumed by: consolidated-report.js (for dashboard timeline)

2. **Warnings Collection**: Repository of all warnings from various validation checks
   - Created by: Multiple modules via improved-workflow.js (`recordWarning` method)
   - Consumed by: consolidated-report.js (for dashboard warnings section)

3. **Preview URLs**: Links to deployed preview applications
   - Created by: deployment-manager.js
   - Consumed by: consolidated-report.js and displayed in console

4. **Advanced Check Results**: Detailed analysis from specialized checks
   - Created by: Each specialized checker module
   - Aggregated by: advanced-checker.js
   - Consumed by: consolidated-report.js (for dashboard visualizations)

5. **Build Artifacts**: Output files from the build process
   - Created by: Build processes via command execution
   - Validated by: build-validator.js (indirectly)
   - Used by: deployment-manager.js for deployment

### Key Integration Points

The main orchestrator (improved-workflow.js) integrates with these modules through:

1. **Direct Method Calls**: For modules explicitly imported
2. **Command Execution**: For running build scripts and other shell commands
3. **State Management**: Recording and tracking workflow progress
4. **Warning Collection**: Central repository of warnings from all sources
5. **Error Handling**: Try/catch blocks around major operations

This modular architecture allows for focused functionality in each component while the main workflow orchestrates the overall process.

## GitHub Integration

The workflow includes GitHub integration features:

- Detects uncommitted changes and offers to commit them
- Provides push functionality to the current branch
- Verifies GitHub Actions workflow configuration
- Provides URLs to GitHub Actions and PR creation
- Shows troubleshooting steps for push failures
- Checks for workflow files in .github/workflows directory

## Platform-Specific Features

The workflow includes cross-platform support:

- **Windows**: Uses appropriate command syntax for file deletion (rmdir /s /q)
- **Unix/Mac**: Uses standard Unix commands (rm -rf) for file operations
- **Automatic Detection**: Determines the platform and adjusts commands accordingly
- **Error Handling**: Platform-specific error messages and remediation steps

## Error Handling and Recovery

The workflow implements robust error handling:

- Each phase and step has dedicated try/catch blocks
- Non-critical errors are recorded as warnings but don't stop the workflow
- Critical errors stop execution with clear error messages
- Detailed error information is included in the dashboard
- Graceful degradation when components fail to initialize
- Ability to continue despite certain types of errors (configurable)

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

### GitHub Integration Issues
- Ensure you have properly configured git user.name and user.email
- Check that you have access to push to the repository
- Verify GitHub Actions workflows exist in .github/workflows directory

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
6. **Use GitHub Integration**: Take advantage of commit, push and PR creation features
7. **Configure Advanced Checks**: Adjust which checks run based on your needs 