# Firebase Deployment Workflow

**Summary:** A comprehensive guide to the Firebase deployment workflow for the Time Tracking System, covering local testing and CI/CD process.

## Document Information

**Purpose:** To document the complete deployment workflow from development to production
**Audience:** Developers and DevOps personnel
**Last Updated:** 2024-05-22
**Maintainer:** Project Team

---

## Overview

This document outlines the complete workflow for developing, testing, and deploying the Time Tracking System. The workflow follows a progression from local development through preview deployments to production releases.

## Workflow Stages

### 1. Local Development & Testing

The first stage involves developing and testing changes in your local environment:

```bash
# Make code changes in your local development environment

# Run linting to catch syntax and style issues
pnpm run lint

# Fix any lint errors
pnpm run lint:fix

# Run tests to verify functionality
pnpm run test

# Build all packages locally to verify the build process
pnpm run build:all
```

If any of these steps fail, fix the issues before proceeding.

### 2. Local Preview Deployment

Before pushing to GitHub, you can test your changes locally using our preview script:

```bash
# Run the preview script (includes linting, type checking, building, and deploying)
pnpm run preview

# To run a quicker preview (skipping certain checks)
pnpm run preview --skip-lint --skip-tests

# To run without deploying (just build and check)
pnpm run preview:clean
```

The preview script creates temporary preview URLs for both the admin and hours portals:
- `https://admin-autonomyhero-2024--preview-<branch-name>-<timestamp>.web.app`
- `https://hours-autonomyhero-2024--preview-<branch-name>-<timestamp>.web.app`

### 3. Push Changes & Create Pull Request

Once local testing is successful, you can either:

1. **Manually push and create a PR:**
   ```bash
   # Add and commit your changes
   git add .
   git commit -m "Description of changes"
   
   # Push to GitHub
   git push origin feature/<feature-name>
   
   # Then create a PR on GitHub
   ```

2. **Use the automated workflow:**
   ```bash
   # Run the automated workflow which handles PR creation
   pnpm run workflow
   ```

### 4. Automated CI/CD Testing

The GitHub Actions workflow automatically runs when a pull request is created:

1. **Linting**: Checks code style and quality
2. **Testing**: Runs all tests to verify functionality
3. **Building**: Builds all packages to verify the build process
4. **Preview Deployment**: Creates a PR-specific preview deployment (using the optimized build process that avoids rebuilding)

The workflow generates a comment on the PR with links to the preview URLs.

### 5. Review & Approval

Team members review the pull request:

1. Code review
2. Review the preview deployment
3. Verify functionality
4. Approve if everything looks good

### 6. Production Deployment

After the PR is approved and merged to main:

1. The automated workflow provides guidance for the next steps:
   ```bash
   # Switch to main branch
   git checkout main
   
   # Pull latest changes
   git pull origin main
   
   # Deploy to production with a descriptive message
   node scripts/deploy.js "Deploy feature XYZ"
   ```

2. The production deployment script:
   - Runs tests and quality checks
   - Builds the application
   - Deploys to production Firebase hosting
   - Updates the production sites:
     - Admin: `admin.autonomyheroes.com`
     - Hours: `hours.autonomyheroes.com`

## Workflow Diagram

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│                 │     │                   │     │                 │
│  Local Changes  │────▶│  Local Preview    │────▶│  Push to GitHub │
│                 │     │  Deployment       │     │                 │
└─────────────────┘     └───────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│                 │     │                   │     │                 │
│  Production     │◀────│  PR Approval      │◀────│  PR & CI/CD     │
│  Deployment     │     │  & Merge          │     │  Testing        │
│                 │     │                   │     │                 │
└─────────────────┘     └───────────────────┘     └─────────────────┘
```

## Recent Improvements

The deployment workflow has received several optimizations:

1. **Enhanced Progress Tracking**
   - Visual progress indicators for each phase
   - Structured logging with section headers
   - Detailed step-by-step status updates
   - Clear success/failure indicators

2. **Performance Monitoring**
   - Operation duration tracking
   - Resource usage monitoring
   - Build time optimization
   - Test execution metrics
   - Deployment timing analysis

3. **State Management**
   - Improved workflow state persistence
   - Operation duration tracking
   - Error state handling
   - Progress tracking
   - Recovery mechanisms

4. **Build Optimization**
   - Eliminated double build with skipBuild option
   - Sequential package building with `pnpm run build:all` to ensure proper dependency handling
   - Platform-specific clean commands for Windows and Unix systems
   - Build artifact verification before deployment
   - Resource-aware scheduling

5. **Error Handling**
   - Detailed error messages with context
   - Error categorization by type
   - Recovery suggestions
   - Error state persistence
   - Performance impact tracking

6. **Logging Improvements**
   - Structured section headers
   - Progress indicators
   - Error highlighting
   - Performance metrics display
   - Operation duration reporting

7. **Documentation Quality**
   - Updated workflow guides
   - Enhanced troubleshooting sections
   - Clear command references
   - Improved examples
   - Better error resolution guidance

8. **Firebase Configuration Management**
   - Environment variables used for secure configuration handling
   - Separation of development and production configurations
   - GitHub Actions secrets for sensitive Firebase credentials
   - Automatic injection of Firebase configuration during CI/CD builds
   - Consistent configuration between local, preview, and production environments

## Testing and Authentication Architecture

The deployment workflow uses Google Cloud Workload Identity Federation for secure authentication:

1. **Local Deployments**: Use your Firebase CLI credentials
2. **CI/CD Deployments**: Use Workload Identity Federation, which:
   - Eliminates the need to store service account keys as secrets
   - Provides short-lived, scoped access tokens
   - Restricts access to specific repositories
   - Applies principle of least privilege

## Firebase Configuration Management

The deployment workflow uses environment variables to securely manage Firebase configuration:

1. **Local Development**: 
   - Configuration stored in `.env` files (not committed to Git)
   - Example configuration provided in `.env.example`
   - Local environment variables loaded by Vite during development and build

2. **CI/CD Deployments**:
   - Firebase configuration stored as GitHub repository secrets:
     - `FIREBASE_API_KEY`
     - `FIREBASE_AUTH_DOMAIN`
     - `FIREBASE_PROJECT_ID`
     - `FIREBASE_STORAGE_BUCKET`
     - `FIREBASE_MESSAGING_SENDER_ID`
     - `FIREBASE_APP_ID`
     - `FIREBASE_MEASUREMENT_ID`
   - GitHub Actions automatically injects these secrets as environment variables during build
   - Same configuration used for both PR previews and production deployments

3. **Configuration Access in Code**:
   - Firebase configuration accessed via `import.meta.env` variables
   - Vite replaces these variables at build time
   - Runtime configuration validation prevents missing configuration errors

To set up Firebase configuration in GitHub:

1. Go to your repository settings: `Settings > Secrets and variables > Actions`
2. Add each Firebase configuration value as a repository secret
3. Ensure the workflow YAML file has the environment variable section for each deployment step

```yaml
# Example from the workflow
- name: Build packages
  env:
    VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
    VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
    VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
    VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
    VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
    VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
    VITE_FIREBASE_MEASUREMENT_ID: ${{ secrets.FIREBASE_MEASUREMENT_ID }}
    VITE_USE_FIREBASE_EMULATOR: "false"
  run: |
    pnpm run build:all
```

## Preview Channel Management

Preview channels are temporary Firebase Hosting instances that allow testing without affecting production:

- **Local Preview Channels**: For developer testing
- **PR Preview Channels**: For reviewing changes
- **Both channel types automatically expire** (default 1 day)

To list and manage active preview channels:

```bash
# List all preview channels (with visual dashboard)
pnpm run channels

# List all preview channels (JSON format)
pnpm run channels:list

# Clean up old preview channels (interactive)
pnpm run channels:cleanup

# Automatically clean up old channels
pnpm run channels:cleanup:auto
```

## Troubleshooting

If you encounter issues with the deployment workflow:

### Local Deployment Issues

1. **Authentication Problems**:
   ```bash
   # Re-authenticate with Firebase
   firebase login
   ```

2. **Build Failures**:
   - Check for TypeScript errors with `pnpm run typecheck`
   - Verify all dependencies are installed with `pnpm install`
   - Check for environment variables
   - Try running the preview with specific options to isolate the issue:
     ```bash
     # Skip linting
     pnpm run preview --skip-lint
     
     # Skip tests
     pnpm run preview --skip-tests
     
     # Skip bundle analysis
     pnpm run preview --skip-bundle-analysis
     ```

3. **Firebase Configuration Errors**:
   - Error: `Missing Firebase configuration: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId`
   - Solution: 
     - For local development: Check that your `.env` file exists with all required Firebase variables
     - For CI/CD: Verify GitHub secrets are correctly set up
     - For production: Ensure env variables are passed to the build step in workflow YAML

   ```bash
   # Verify local environment variables
   cat .env | grep VITE_FIREBASE

   # Check GitHub workflow file for proper env configuration
   cat .github/workflows/firebase-deploy.yml
   ```

   The Firebase configuration is accessed at build time, not runtime. If you see this error in a deployed app, it means the environment variables weren't available during the build process.

### CI/CD Issues

1. **CI/CD Authentication Issues**:
   - If GitHub Actions can't authenticate with Firebase, check your Workload Identity configuration
   - Check Google Cloud IAM permissions
   - Review service account roles

2. **Firebase Configuration in CI/CD**:
   - If deployment fails with "Missing Firebase configuration" or shows a blank white screen:
     - Verify that GitHub Secrets are properly set up (case-sensitive)
     - Ensure all build steps include the necessary environment variables
     - Check workflow logs to see if environment variables were passed correctly
   - Common mistake: Adding environment variables to the deploy step but forgetting the build step

3. **Preview Deployment Failures**:
   - If preview channels fail but production works, check if branch-specific environment variables are different
   - Check Firebase Hosting logs for errors
   - Verify channel permissions

## Best Practices

1. **Always test locally** before pushing
2. **Use unique branch names** to prevent preview channel conflicts
3. **Clean up old preview channels** when no longer needed
4. **Set expiration dates** for preview channels
5. **Include meaningful commit messages** for easier CI/CD debugging
6. **Follow the post-PR workflow** to ensure changes reach production properly 