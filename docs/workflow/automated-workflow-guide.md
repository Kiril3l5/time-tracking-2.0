# Automated Workflow Guide

The Time Tracking 2.0 system includes a powerful automated workflow tool that streamlines the development process. This guide explains how to use the workflow tool and understand its components.

## Overview

The automated workflow system consists of two complementary parts:

1. **Local Development Workflow**: A tool you run manually during development that orchestrates the entire development cycle from setup to deployment.

2. **CI/CD Pipeline**: An automated GitHub Actions workflow that runs on specific GitHub events (pushes, pull requests) to validate code and handle deployments.

Together, these components provide:

- Code quality validation (linting, type checking, testing)
- Automated building of packages
- Preview deployment to Firebase
- Interactive dashboard with detailed reporting
- Channel cleanup to maintain Firebase resources
- Automated cleanup of old logs and reports
- Branch management for easy commit and PR creation
- GitHub Actions integration and verification

## Running the Local Workflow

To start the local workflow, run:

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

# Performance options
pnpm run workflow --no-cache # Disable caching for validation and build phases
```

## CI/CD Integration

The local workflow is designed to work seamlessly with the CI/CD pipeline. Here's how they interact:

### Development Flow

1. **Local Development**:
   - Run `pnpm run workflow` to validate, build, and deploy to Firebase
   - The workflow assists with committing changes and pushing to branches
   - It verifies GitHub Actions workflow configuration

2. **Feature Branch Workflow**:
   - Push your feature branch to GitHub
   - GitHub Actions automatically runs linting and tests
   - Continue using `pnpm run workflow` for deployments during development

3. **Pull Request Workflow**:
   - Create a pull request targeting the main branch
   - GitHub Actions automatically:
     - Runs linting and tests
     - Builds all packages
     - Creates a PR-specific preview deployment
     - Adds the preview URL as a comment to the PR

4. **Production Deployment**:
   - When the PR is approved and merged to main
   - GitHub Actions automatically deploys to production

### GitHub Actions Workflow

The CI/CD pipeline is defined in `.github/workflows/firebase-deploy.yml` and is triggered by:

- Pushes to the `main` branch
- Pushes to branches starting with `feature/`, `fix/`, or `bugfix/`
- Pull requests targeting the `main` branch

The workflow behaves differently based on the trigger:

- **Feature/Fix/Bugfix Branch Pushes**: Runs linting and tests only
- **Pull Requests**: Runs linting, tests, builds packages, and creates a preview deployment
- **Main Branch Pushes**: Runs linting, tests, builds packages, and deploys to production

## Performance Optimizations

The workflow includes several optimizations to reduce execution time:

### Caching System

The workflow implements a caching system that significantly improves performance for repeated runs:

- **Validation Caching**: Results from TypeScript, ESLint, and other validation checks are cached
- **Build Caching**: Build artifacts are cached when the source files haven't changed
- **Smart Invalidation**: Cache is invalidated based on file modification times of relevant files
- **Command-Line Control**: Use `--no-cache` to force a fresh run without using cached results
- **Integrity**: Failed validation or build runs are not saved to the cache to prevent inconsistent states.

### Parallel Execution

Multiple operations are executed in parallel to reduce overall execution time:

- **Parallel Validation**: TypeScript and ESLint checks run simultaneously
- **Parallel Package Building**: The admin and hours packages are built in parallel
- **Concurrent Advanced Checks**: Multiple advanced checks run concurrently
- **Controlled Concurrency**: Resource utilization is managed to prevent overloading the system

### Incremental Processing

The workflow uses incremental processing where possible:

- **Smart Dependency Detection**: Analyzes which files have changed to minimize work
- **Prioritized Checks**: Critical checks are run first to fail fast if issues are found
- **Progressive Enhancement**: Basic checks run before more advanced analysis

The combined effect of these optimizations can reduce workflow execution time from minutes to seconds, especially for repeated runs where caching is most effective.

## Workflow Phases

The local workflow progresses through six distinct phases:

### 1. Setup Phase
- Verifies Git configuration
- Checks Firebase authentication status
- Validates required dependencies
- Shows authenticated user information for both Firebase and Git

### 2. Validation Phase
- Analyzes package dependencies
- Runs code quality checks:
  - Linting with ESLint (runs in parallel)
  - Type checking with TypeScript (runs in parallel)
  - Tests with Vitest
    - **Note:** Currently, the tests executed by Vitest (`pnpm test`) are primarily placeholders (e.g., `dummy.test.ts`, `basic.test.ts`). These need to be replaced with meaningful unit and integration tests covering application logic and components as development progresses.
- Performs advanced checks:
  - Documentation quality and freshness
  - Dead code detection
  - Security vulnerabilities
  - Bundle size analysis
  - Health checks
  - Workflow validation
- Utilizes caching to skip redundant checks when source files haven't changed
- Runs critical checks first (TypeScript, ESLint) to fail fast
- Executes multiple checks concurrently for faster validation
- Collects warnings from all checks to display in dashboard

### 3. Build Phase
- Cleans previous build artifacts (`dist/` directory).
- Builds `admin` and `hours` packages in parallel using **Vite**.
  - Executes the `vite build` command directly within each package's directory (`packages/admin`, `packages/hours`) for proper context.
- Uses caching to skip rebuilds when source files haven't changed
- Verifies build artifacts exist before proceeding to deployment
- Optimizes assets for deployment
- Detects and reports build warnings
  - *Note: Build warning and metric parsing from Vite output is currently basic.*

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

### 6. Cleanup Phase
- Automatically rotates old files to prevent excessive disk usage.
- **Reports**: Keeps the 10 most recent timestamped JSON and HTML reports in `./reports`, deleting older ones (excludes `latest-report.*`).
- **Command Logs**: Keeps the 10 most recent logs in `./temp/command-logs`, deleting older ones.
- **Performance Metrics**: Keeps the 10 most recent metrics files in `./temp/metrics`, deleting older ones.

## The Dashboard

The workflow generates an interactive dashboard that opens automatically in your browser after completion. For detailed information about the dashboard system, including its components, implementation details, and best practices, please refer to the [Dashboard System Documentation](dashboard.md).

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
- **Reporting**: `workflow/dashboard-generator.js` - Dashboard generation
- **Channel Management**: `firebase/channel-cleanup.js` - Hosting channel cleanup
- **Package Coordination**: `workflow/package-coordinator.js` - Package build ordering
- **Branch Management**: `workflow/branch-manager.js` - Git branch operations
- **Performance Monitoring**: `core/performance-monitor.js` - Timing tracking
- **Authentication**: `auth/auth-manager.js` - Service authentication
- **Caching System**: `workflow/workflow-cache.js` - Smart caching for validation and build
- **Parallel Execution**: `workflow/parallel-executor.js` - Concurrent task execution
- **File Utilities**: `core/command-runner.js` - Includes `rotateFiles` utility for cleanup

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
  package: 'admin', // Specify the package to build
  timeout: 180000, // Optional timeout
  parallel: true,  // Enable parallel package building
  recordWarning: fn,  // Workflow warning recorder
  recordStep: fn,     // Workflow step recorder
  phase: 'Build'
});
```

*Note: The `buildPackageWithWorkflowTracking` function now internally uses `vite build`.*

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
│   ├── core/logger.js - Logging
│   ├── core/command-runner.js - Executes shell commands
│   │   └── (Includes `rotateFiles` utility)
│   ├── core/progress-tracker.js - Visual progress indicators
│   ├── core/performance-monitor.js - Timing measurements
│   ├── core/error-handler.js - Error management and aggregation
│   └── core/colors.js - Console output formatting
│
├── Performance Optimization
│   ├── workflow/workflow-cache.js - Smart caching system
│   │   └── (Creates .workflow-cache directory for stored results)
│   └── workflow/parallel-executor.js - Parallel task execution
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
│   └── build/build-manager.js - Orchestrates Vite builds for packages
│       └── (Uses `vite build` via command runner)
│
├── Deploy Phase
│   ├── workflow/deployment-manager.js - Firebase preview deployment
│   │   └── workflow/branch-manager.js - Gets branch info for channels
│   └── firebase/channel-cleanup.js - Cleans up old channels
│       └── workflow/workflow-config.js - Channel retention config
│
└── Results Phase
    ├── workflow/dashboard-generator.js - Dashboard generation
    │   └── reports/report-collector.js - Collects check reports
    └── github/pr-manager.js - Pull request creation
        └── workflow/branch-manager.js - Branch management

└── Cleanup Phase
    └── (Uses `rotateFiles` from core/command-runner.js)
```

### Data Flow Through the System

The workflow passes several key data structures between components:

1. **Workflow Steps**: Records of each step's execution with success/failure status and timing
   - Created by: improved-workflow.js (`recordWorkflowStep` method)
   - Consumed by: dashboard-generator.js (for dashboard timeline)

2. **Warnings Collection**: Repository of all warnings from various validation checks
   - Created by: Multiple modules via improved-workflow.js (`recordWarning` method)
   - Consumed by: dashboard-generator.js (for dashboard warnings section)

3. **Preview URLs**: Links to deployed preview applications
   - Created by: deployment-manager.js
   - Consumed by: dashboard-generator.js and displayed in console

4. **Advanced Check Results**: Detailed analysis from specialized checks
   - Created by: Each specialized checker module
   - Aggregated by: advanced-checker.js
   - Consumed by: dashboard-generator.js (for dashboard visualizations)

5. **Build Artifacts**: Output files from the build process
   - Created by: Build processes via command execution
   - Validated by: build-validator.js (indirectly)
   - Used by: deployment-manager.js for deployment
   - *Note: Build metrics are now parsed from Vite output within build-manager.js*

6. **Cache Data**: Stored results from validation and build phases
   - Created by: workflow-cache.js in conjunction with validation and build phases
   - Stored in: .workflow-cache directory in the project root
   - Consumed by: Subsequent workflow runs to skip redundant operations
   - Invalidated by: File modifications to source code and configuration files

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
- Check for the 'open' package dependency

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
- `firebase-tools` is required for deployment operations and is installed as a dev dependency

### Caching Issues
- If you suspect the cache is providing stale results, run with `--no-cache` flag
- Cached files are stored in `.workflow-cache` directory - you can delete this directory to clear all caches
- **Failed builds are not cached**, so running again after a failure will force a rebuild.
- Check that file timestamps are accurate on your system as the cache relies on file modification times
- Cache is automatically invalidated when you modify package.json, tsconfig.json, or other critical configuration files

### Dashboard Generation Issues
- If you encounter errors during dashboard generation, check for syntax issues in `scripts/workflow/dashboard-generator.js`
- Avoid using complex template literals with HTML content in JavaScript modules
- Use string concatenation for building complex HTML or SVG structures
- For SVG chart generation, build markup incrementally instead of using complex template strings
- If dashboard fails to generate, check the console for specific syntax errors

### Missing Warnings in Dashboard
- Run with `--verbose` flag for more detailed output
- Check the workspace for quality issues that may not be detected

## Extending the Workflow

The workflow is designed to be extensible. To add new checks or features:

1. Add new modules in the appropriate scripts directory
2. Import them into the main workflow components
3. Use the `recordWarning` method to add findings to the dashboard
4. Follow the existing module pattern for consistency

### Extending the Caching System

To add caching to a new component:

1. Import the caching utilities from `workflow/workflow-cache.js`
2. Identify files that should invalidate your cache (source files, configuration)
3. Use `generateCacheKey()` to create deterministic cache keys based on file content
4. Use `tryUse*Cache()` and `save*Cache()` helpers or create your own cache integration
5. Handle cache hits and misses appropriately in your module

Example:
```javascript
import { generateCacheKey, WorkflowCache } from '../workflow/workflow-cache.js';

async function myComponentWithCaching(options) {
  // Create a cache key based on files that affect the operation
  const cacheKey = await generateCacheKey('my-component', [
    'package.json',
    'tsconfig.json',
    'src/myComponent.js'
  ]);
  
  // Try to get cached results
  const cache = new WorkflowCache();
  const cachedResult = await cache.get(cacheKey);
  
  if (cachedResult) {
    return cachedResult; // Use cached result
  }
  
  // Perform the actual operation
  const result = await doExpensiveOperation();
  
  // Cache the result for next time
  await cache.set(cacheKey, result);
  
  return result;
}
```

### Extending the Dashboard

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

## Best Practices

For optimal workflow usage:

1. **Understand Build Scripts**: Remember the workflow executes the `build` script defined in the `package.json` of each package (`admin`, `hours`) via Vite.
2. **Run Regularly**: Use the workflow during development, not just before PRs
3. **Review All Warnings**: Address issues shown in the dashboard
4. **Keep Channels Clean**: Let the workflow manage channel cleanup
5. **Include Preview URLs**: When sharing code for review, include the preview URLs
6. **Maintain Documentation**: Update docs to reflect changes in the system 
7. **Use GitHub Integration**: Take advantage of commit, push and PR creation features
8. **Configure Advanced Checks**: Adjust which checks run based on your needs
9. **Leverage Caching**: Let the caching system speed up your workflow - only use `--no-cache` when testing changes to the build process itself
10. **Use Parallel Building**: The parallel execution system automatically optimizes build speed based on your machine's resources
11. **Periodic Cache Cleanup**: Occasionally run with `--no-cache` to ensure a full validation if you suspect stale cache data
12. **Monitor Disk Usage**: While cleanup is implemented, periodically check `/reports`, `/temp/command-logs`, and `/temp/metrics` if issues arise.
13. **Dashboard Modifications**: When modifying the dashboard in dashboard-generator.js, use string concatenation for complex HTML/SVG content to avoid ESM parsing issues 