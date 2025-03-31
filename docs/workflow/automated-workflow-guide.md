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

### 3. Build Phase
- Builds all packages in the correct dependency order
- Optimizes assets for deployment

### 4. Deploy Phase
- Creates a unique preview channel ID
- Deploys the Hours app to Firebase Hosting
- Deploys the Admin app to Firebase Hosting
- Provides preview URLs for both apps

### 5. Results Phase
- Cleans up old preview channels (maintaining only the 5 most recent)
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

Each warning includes a specific suggestion for how to fix the issue.

### Workflow Settings
Shows the configuration used for this run, including:
- Command-line options
- Git branch information

## Channel Cleanup

The workflow automatically manages Firebase preview channels:

- Maintains only the 5 most recent preview channels
- Deletes older channels to stay within Firebase hosting limits
- Shows cleanup status in the dashboard

## Understanding Warning Categories

The dashboard groups warnings into several categories:

### Documentation
- Missing or incomplete README files
- Missing JSDoc comments
- Broken links in documentation
- Incomplete API documentation

### Security
- Dependencies with vulnerabilities
- Authentication issues
- Missing security configurations

### Code Quality
- Unused imports/exports
- Unnecessary type annotations
- Console.log statements in production code
- Type 'any' usage

### Environment
- Missing environment variables
- Invalid configuration settings

## After Workflow Completion

Once the workflow completes, you'll be prompted with options for branch management:

1. **Commit Changes**: You can choose to commit your changes directly
2. **Create Pull Request**: Option to create a PR with the preview URLs included
3. **Continue Working**: Keep your changes uncommitted for further work

## Workflow Structure

The workflow is composed of several specialized modules:

- `improved-workflow.js`: Main orchestration script
- `workflow/quality-checker.js`: Handles code quality validation
- `workflow/doc-quality.js`: Checks documentation quality
- `workflow/deployment-manager.js`: Manages deployments
- `workflow/consolidated-report.js`: Generates the dashboard
- `firebase/channel-cleanup.js`: Manages Firebase preview channels

## Troubleshooting

If you encounter issues with the workflow:

### Dashboard Not Opening
- The dashboard is saved as `preview-dashboard.html` in the project root
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

## Extending the Workflow

The workflow is designed to be extensible. To add new checks or features:

1. Add new modules in the appropriate scripts directory
2. Connect them to the main workflow in a modular way
3. Ensure warnings are properly categorized

## Best Practices

For optimal workflow usage:

1. **Run Regularly**: Use the workflow during development, not just before PRs
2. **Review All Warnings**: Address issues shown in the dashboard
3. **Keep Channels Clean**: Let the workflow manage channel cleanup
4. **Include Preview URLs**: When sharing code for review, include the preview URLs
5. **Maintain Documentation**: Update docs to reflect changes in the system 