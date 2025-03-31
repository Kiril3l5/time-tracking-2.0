# Automated Development Workflow Guide

This guide provides an overview of our automated development workflow, which handles environment setup, code validation, building, and deployment to preview environments.

> **Related Documentation**
> - [Preview Deployment Guide](./preview-deployment-guide.md) - For preview deployment details
> - [Firebase Configuration Guide](../firebase/firebase-config-guide.md) - For Firebase setup
> - [GitHub Workflow Guide](../github/github-workflow-guide.md) - For PR management

## Overview

The automated workflow simplifies the development process with these key phases:
1. Environment setup and verification
2. Code quality validation
3. Building the application
4. Deploying to preview environments
5. Results display and report generation

## Core Workflow Phases

### 1. Setup Phase
- Verifies Git configuration (user name and email)
- Checks Firebase authentication
- Ensures required dependencies are installed (pnpm)

### 2. Validation Phase
- Analyzes package dependencies
- Runs linting checks
- Performs TypeScript type checking
- Executes unit tests

### 3. Build Phase
- Builds the application
- Creates production-ready assets

### 4. Deploy Phase
- Creates a unique Firebase preview channel based on branch name
- Deploys hours and admin applications
- Captures preview URLs for sharing

### 5. Results Phase
- Displays preview URLs
- Generates a consolidated workflow report
- Provides instructions for PR creation

## Command-Line Options

| Option | Description |
|--------|-------------|
| `--verbose` | Enable verbose logging |
| `--skip-tests` | Skip test execution and validation |
| `--skip-build` | Skip the build process |
| `--skip-deploy` | Skip deployment to preview |
| `--skip-pr` | Skip PR creation instructions |
| `--help`, `-h` | Show help information |

## Quick Start

```bash
# Run complete workflow
node scripts/improved-workflow.js

# Skip test execution
node scripts/improved-workflow.js --skip-tests

# Skip build and deployment
node scripts/improved-workflow.js --skip-build --skip-deploy

# Get more detailed logs
node scripts/improved-workflow.js --verbose
```

## Implementation Details

The workflow consists of several focused modules:

### Core Components
- **Logger**: Handles logging with various log levels and formatting
- **Command Runner**: Executes shell commands with error handling
- **Progress Tracker**: Provides visual step-by-step tracking

### Workflow Components
- **Quality Checker**: Runs linting, type checking, and tests
- **Package Coordinator**: Analyzes package dependencies
- **Deployment Manager**: Handles preview deployment to Firebase
- **Report Generator**: Creates consolidated workflow reports

## Workflow Reports

At the end of each run, the workflow generates a consolidated report that includes:
- Preview URLs for both hours and admin apps
- Channel ID information
- Workflow duration and execution details
- Git branch information

These reports are saved in the `reports` directory:
- JSON format for programmatic access
- HTML format for easy viewing in a browser
- A `latest-report.html` file is always available with the most recent results

## Error Handling

The workflow includes error handling at each phase:
- Setup errors (Git config, Firebase auth)
- Validation errors (linting, type checking, tests)
- Build errors (compilation failures)
- Deployment errors (Firebase issues)

## After Deployment

After a successful deployment:

1. Access the preview URLs displayed in the results
2. View the detailed HTML report in the `reports` directory
3. Create a PR following the instructions provided
4. Share the preview URLs with your team for feedback

## Troubleshooting

### Common Issues

1. **Git Configuration Issues**
   - Ensure Git user.name and user.email are configured
   - Run `git config --global user.name "Your Name"` and `git config --global user.email "your.email@example.com"`

2. **Firebase Authentication Issues**
   - Run `firebase login` to authenticate
   - Verify with `firebase login:list`

3. **Build Failures**
   - Check for TypeScript errors
   - Ensure all dependencies are installed with `pnpm install`

4. **Deployment Issues**
   - Verify Firebase project configuration
   - Check Firebase hosting configuration in firebase.json 