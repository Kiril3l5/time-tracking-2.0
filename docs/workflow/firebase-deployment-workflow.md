# Firebase Deployment Workflow

**Summary:** A comprehensive guide to the Firebase deployment workflow for the Time Tracking System, covering local testing and CI/CD process.

## Document Information

**Purpose:** To document the complete deployment workflow from development to production
**Audience:** Developers and DevOps personnel
**Last Updated:** 2025-03-17
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
# Run the preview script with skipping deployment
pnpm run preview:clean

# To run quality checks and build
pnpm run preview:quick
```

Or you can deploy directly to a Firebase preview channel to verify the changes:

```bash
# Deploy to a personal development preview channel
firebase hosting:channel:deploy dev-<your-name>-<feature-name> --expires 1d
```

This creates temporary preview URLs for both the admin and hours portals:
- `https://admin-autonomyhero-2024--dev-<n>-<feature>.web.app`
- `https://hours-autonomyhero-2024--dev-<n>-<feature>.web.app`

### 3. Push Changes & Create Pull Request

Once local testing is successful, push your changes to GitHub:

```bash
# Create a feature branch
git checkout -b feature/<feature-name>

# Add and commit your changes
git add .
git commit -m "Description of changes"

# Push to GitHub
git push origin feature/<feature-name>
```

Create a pull request on GitHub from your feature branch to the main branch.

### 4. Automated CI/CD Testing

The GitHub Actions workflow automatically runs when a pull request is created:

1. **Linting**: Checks code style and quality
2. **Testing**: Runs all tests to verify functionality
3. **Building**: Builds all packages to verify the build process
4. **Preview Deployment**: Creates a PR-specific preview deployment

The workflow generates a comment on the PR with links to the preview URLs.

### 5. Review & Approval

Team members review the pull request:

1. Code review
2. Review the preview deployment
3. Verify functionality
4. Approve if everything looks good

### 6. Production Deployment

After the PR is approved and merged to main:

1. The GitHub Actions production workflow triggers automatically
2. The workflow builds and deploys to production
3. The production sites are updated:
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

## Testing and Authentication Architecture

The deployment workflow uses Google Cloud Workload Identity Federation for secure authentication:

1. **Local Deployments**: Use your Firebase CLI credentials
2. **CI/CD Deployments**: Use Workload Identity Federation, which:
   - Eliminates the need to store service account keys as secrets
   - Provides short-lived, scoped access tokens
   - Restricts access to specific repositories
   - Applies principle of least privilege

## Preview Channel Management

Preview channels are temporary Firebase Hosting instances that allow testing without affecting production:

- **Local Preview Channels**: For developer testing
- **PR Preview Channels**: For reviewing changes
- **Both channel types automatically expire** (default 1 day)

To list and manage active preview channels:

```bash
# List all preview channels
firebase hosting:channel:list

# Delete a specific preview channel
firebase hosting:channel:delete <channel-name>
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
   - Check for TypeScript errors
   - Verify all dependencies are installed with `pnpm install`
   - Check for environment variables
   - Try running the build recovery script: `pnpm run fix:build`

### CI/CD Issues

1. **Authentication Failures**:
   - Verify Workload Identity Federation setup
   - Check service account permissions
   - Ensure GitHub repository is configured correctly

2. **Build or Test Failures**:
   - Check GitHub Actions logs
   - Test locally with the same Node.js version
   - Verify package.json scripts match CI configuration

## Best Practices

1. **Always test locally** before pushing
2. **Use unique branch names** to prevent preview channel conflicts
3. **Clean up old preview channels** when no longer needed
4. **Set expiration dates** for preview channels
5. **Include meaningful commit messages** for easier CI/CD debugging 