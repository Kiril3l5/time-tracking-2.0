# Development & Deployment Guide

## Overview

This guide provides comprehensive instructions for setting up the development environment and deploying the Time Tracking System. It covers the complete lifecycle from initial developer onboarding to production deployment, following the project's core philosophy of lean implementation with clear patterns for future scalability.

## Development Environment Setup

### Prerequisites

Before starting development, ensure you have the following installed:

1. **Node.js** - v18 or later
2. **pnpm** - v8 or later (`npm install -g pnpm`)
3. **Git** - Latest version
4. **Firebase CLI** - (`npm install -g firebase-tools`)
5. **VS Code** - Recommended editor with the following extensions:
   - ESLint
   - Prettier
   - Tailwind CSS IntelliSense
   - Firebase Explorer

### Initial Project Setup

#### 1. Clone the Repository

```bash
git clone https://github.com/your-org/time-tracking-system.git
cd time-tracking-system
```

#### 2. Install Dependencies

```bash
pnpm install
```

#### 3. Configure Firebase Environment

Create a `.env.local` file in the project root:

```
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Environment
VITE_APP_ENV=development
```

#### 4. Set Up Firebase Emulators

Firebase emulators allow local development without affecting production data:

```bash
# Login to Firebase
firebase login

# Initialize emulators
firebase init emulators

# Start emulators
pnpm emulators:start
```

Configure your emulators in `firebase.json`:

```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "hosting": {
      "port": 5000
    },
    "functions": {
      "port": 5001
    },
    "storage": {
      "port": 9199
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

#### 5. Configure VS Code

Create a `.vscode/settings.json` file with recommended settings:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Development Workflow

#### 1. Start Development Server

The project uses a monorepo structure with multiple packages. Use these commands to start development servers:

```bash
# Start the hours portal (end-user)
pnpm dev:hours

# Start the admin portal
pnpm dev:admin

# Start both portals concurrently
pnpm dev
```

#### 2. Running Tests

The project uses Vitest for unit/integration tests and Playwright for E2E tests:

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Run specific E2E test
pnpm test:e2e --grep "time entry submission"
```

#### 3. Linting and Formatting

Maintain code quality with linting and formatting:

```bash
# Lint the project
pnpm lint

# Automatically fix linting issues
pnpm lint:fix

# Format code with Prettier
pnpm format
```

#### 4. Working with Firestore

Development uses the Firebase emulator for Firestore. The emulator data is isolated from production:

```bash
# Export emulator data (to preserve between sessions)
pnpm emulators:export

# Import previously exported data
pnpm emulators:import
```

For testing with different user roles, use the Firebase Authentication emulator UI (http://localhost:4000/auth) to create test users with different roles.

#### 5. Debugging Cloud Functions

Cloud Functions can be debugged locally:

```bash
# Start functions emulator in debug mode
pnpm functions:debug

# Or use VS Code launch configuration
```

Configure VS Code launch settings in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Debug Functions",
      "port": 9229,
      "restart": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Deployment Process

### Deployment Environments

The system supports three deployment environments:

1. **Development** - Local development with emulators
2. **Staging** - For testing before production
3. **Production** - Live environment for end users

Each environment has its own Firebase project and configuration.

### Continuous Integration

The project uses GitHub Actions for continuous integration:

#### 1. Pull Request Workflow

When a PR is opened, GitHub Actions automatically:
- Runs linting checks
- Executes all tests
- Creates a preview deployment to a staging environment
- Reports status back to the PR

The workflow is defined in `.github/workflows/pr.yml`:

```yaml
name: Pull Request

on:
  pull_request:
    branches: [ main, develop ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Lint
        run: pnpm lint
      - name: Type check
        run: pnpm typecheck
      - name: Test
        run: pnpm test

  preview:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm build
      - name: Deploy preview
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_STAGING }}'
          projectId: your-staging-project-id
          channelId: pr-${{ github.event.number }}
```

### Deployment to Staging

Staging deployments happen automatically when PRs are merged to the `develop` branch:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm build
      - name: Deploy to Firebase Staging
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_STAGING }}'
          projectId: your-staging-project-id
          channelId: live
```

### Production Deployment

Production deployments require manual approval and happen when code is merged to the `main` branch:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm build
      - name: Deploy to Firebase Production
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_PRODUCTION }}'
          projectId: your-production-project-id
          channelId: live
```

### Manual Deployment

For situations requiring manual deployment:

```bash
# Clean the project (ensures a fresh build environment)
pnpm project:cleanup

# Build the project
pnpm build

# Deploy to staging
firebase use staging
firebase deploy

# Deploy to production
firebase use production
firebase deploy
```

### Managing Firebase Projects

The project uses multiple Firebase projects for different environments:

```bash
# List available Firebase projects
firebase projects:list

# Switch between projects
firebase use staging
firebase use production

# Add a new project
firebase use --add
```

Configure Firebase projects in `.firebaserc`:

```json
{
  "projects": {
    "default": "your-development-project-id",
    "staging": "your-staging-project-id",
    "production": "your-production-project-id"
  },
  "targets": {
    "your-production-project-id": {
      "hosting": {
        "hours": [
          "your-production-hours-site"
        ],
        "admin": [
          "your-production-admin-site"
        ]
      }
    },
    "your-staging-project-id": {
      "hosting": {
        "hours": [
          "your-staging-hours-site"
        ],
        "admin": [
          "your-staging-admin-site"
        ]
      }
    }
  }
}
```

## Deployment Verification

After deployment, perform these verification steps:

### 1. Smoke Testing

A basic suite of checks to ensure the application is operational:

- Verify that both sites load without errors
- Confirm user authentication works
- Test basic time entry creation
- Check that critical API endpoints respond correctly

### 2. Performance Verification

- Run Lighthouse tests against production site
- Verify bundle sizes are within acceptable limits
- Check API response times against benchmarks

### 3. Error Monitoring

After deployment, monitor error rates in:
- Firebase Crashlytics
- Application logs
- Performance monitoring dashboards

### 4. Rollback Procedure

If critical issues are found, use this rollback procedure:

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to a previous version
firebase hosting:clone live:previous-version hours

# Verify the rollback
# If successful, update the live channel
firebase hosting:clone previous-version:live hours
```

## Best Practices

### Development Best Practices

1. **Environment Isolation**
   - Always develop against emulators, not production databases
   - Use environment-specific configuration files

2. **Git Workflow**
   - Use feature branches for all changes
   - Keep PRs focused on a single issue or feature
   - Write meaningful commit messages

3. **Testing**
   - Write tests alongside new features
   - Maintain test coverage during refactoring
   - Use test-driven development for critical components

### Deployment Best Practices

1. **Staged Rollouts**
   - Deploy to staging first, verify, then to production
   - Use feature flags for gradual feature rollout

2. **Clean Before Building**
   - Always run cleanup before building to ensure a fresh environment
   - The project:cleanup script removes old artifacts and temporary files
   - This prevents stale files from affecting the build or deployment

3. **Deployment Windows**
   - Schedule deployments during low-traffic periods
   - Avoid deploying on Fridays or before holidays

4. **Monitoring During Deployment**
   - Monitor error rates during and after deployment
   - Have team members available for emergency rollbacks

5. **Firestore Security Rules**
   - Test security rules before deployment
   - Verify access patterns in the emulator
   - Validate rules with security tests

## Troubleshooting Common Issues

### Development Issues

1. **Firebase Emulator Connection Problems**
   - Verify emulators are running (`pnpm emulators:start`)
   - Check if ports are already in use
   - Ensure environment variables point to emulator

2. **TypeScript Type Issues**
   - Run `pnpm typecheck` to identify type problems
   - Check for outdated type definitions

3. **Build Failures**
   - Verify all dependencies are installed
   - Check for syntax errors or linting issues

### Deployment Issues

1. **Firebase Deployment Failures**
   - Verify Firebase CLI authentication
   - Check project permissions
   - Validate firebase.json configuration

2. **Cloud Functions Deployment Issues**
   - Ensure functions package.json has correct dependencies
   - Check Node.js version compatibility
   - Verify IAM permissions

3. **Post-Deployment Errors**
   - Check browser console for client-side errors
   - Verify Firebase Authentication configuration
   - Review Firestore security rules

## Conclusion

This guide provides a comprehensive reference for both development environment setup and deployment procedures. By following these patterns, the team can maintain a consistent workflow from development to production, ensuring reliability and scalability as the application grows.

The development and deployment strategy follows the project's core philosophy by starting with a lean, efficient process that can expand to accommodate more complex requirements as needed. By automating routine tasks and implementing clear verification steps, the team can focus on delivering value rather than managing infrastructure. 