# Development Workflow Guide

This guide outlines the recommended development workflow for the Time Tracking 2.0 system, including using the automated workflow tool, interpreting the dashboard, and addressing warnings.

## Development Workflow Overview

The development workflow consists of these main steps:

1. **Set up your environment**
2. **Create a feature branch**
3. **Develop and test locally**
4. **Run the automated workflow**
5. **Review warnings and suggestions**
6. **Deploy and share preview**
7. **Create pull request**

## 1. Setting Up Your Environment

Before starting development:

```bash
# Clone the repository
git clone https://github.com/yourusername/time-tracking-2.0.git
cd time-tracking-2.0

# Install dependencies
pnpm install

# Configure Firebase
firebase login
```

## 2. Creating a Feature Branch

Always work on a dedicated feature branch:

```bash
# Create and checkout a new branch
git checkout -b feature/your-feature-name

# Verify you're on the correct branch
git branch
```

## 3. Developing and Testing Locally

During development:

```bash
# Start the local development server
pnpm run dev

# Run tests
pnpm test

# Run linting
pnpm lint
```

## 4. Running the Automated Workflow

When your changes are ready for review:

```bash
# Run the complete workflow
pnpm run workflow

# Or with specific options
pnpm run workflow --verbose
```

The workflow will:
- Check code quality
- Build applications
- Deploy to preview environments
- Generate a dashboard with warnings and suggestions
- Display preview URLs

## 5. Understanding the Dashboard

The workflow generates a comprehensive dashboard that opens automatically in your browser.

### Dashboard Sections

#### Preview URLs
Direct links to preview deployments of your applications.

#### Workflow Timeline
A chronological view of all workflow steps showing:
- Status (success/failure)
- Duration
- Error details if applicable

#### Warnings & Suggestions
This section categorizes potential issues by type and includes specific suggestions for fixes.

### Warning Categories

The dashboard groups warnings into several categories:

#### Documentation Warnings
- Missing README files
- Incomplete documentation
- Missing JSDoc comments
- Broken documentation links

What to do:
- Add missing documentation
- Update incomplete sections
- Add JSDoc comments to exported functions/classes

#### Code Quality Warnings
- Unused imports
- Type `any` usage
- Console.log statements
- Duplicate code

What to do:
- Remove unused imports
- Replace `any` with proper types
- Remove console.log from production code
- Refactor duplicate code

#### Security Warnings
- Dependency vulnerabilities
- Authentication issues
- Insecure configurations

What to do:
- Update vulnerable dependencies
- Fix authentication implementations
- Follow security best practices

#### Environment Warnings
- Missing environment variables
- Invalid configurations

What to do:
- Add required environment variables
- Fix configuration issues

## 6. Addressing Warnings

For each warning in the dashboard:

1. Review the warning message and suggested fix
2. Make the necessary changes in your code
3. Re-run the workflow to verify the warning is resolved
4. Focus first on critical warnings (security, critical errors)

Example process:
```bash
# 1. Run workflow and view dashboard
pnpm run workflow

# 2. Make fixes based on dashboard warnings
# 3. Re-run workflow to verify fixes
pnpm run workflow

# 4. Continue until all important warnings are resolved
```

## 7. Deploying and Sharing Preview

After the workflow completes successfully:

1. Copy the preview URLs from the dashboard
2. Test the application in the preview environment
3. Share the preview URLs with stakeholders for feedback

## 8. Creating a Pull Request

When you're ready to merge your changes:

```bash
# Commit your changes if you haven't already
git add .
git commit -m "Implement feature X"

# Push to remote repository
git push origin feature/your-feature-name
```

Then create a PR:
1. Go to GitHub repository
2. Click "New pull request"
3. Select your feature branch
4. Include preview URLs in the PR description
5. Reference any relevant issues
6. Request review from team members

## Best Practices

### Addressing Warnings

- **Prioritize by category**: Security > Code Quality > Environment > Documentation
- **Fix all security warnings**: Never ignore security issues
- **Document exceptions**: If a warning can't be fixed, document why

### Workflow Efficiency

- **Run locally first**: Solve obvious issues before running the workflow
- **Group related changes**: Make focused commits for easier review
- **Run workflow regularly**: Don't wait until the end of development

### Preview Management

- **Clean up old previews**: Let the automatic cleanup handle this
- **Use descriptive branch names**: Makes preview channel IDs more readable
- **Test thoroughly**: Check both applications in the preview environment

## Troubleshooting

### Dashboard Not Showing All Warnings

- Run with verbose flag: `pnpm run workflow --verbose`
- Check console output for warnings not captured in dashboard
- Manually check areas that commonly have issues

### Persistent Warnings

If warnings persist after fixes:
1. Verify your fixes were properly implemented
2. Check for similar issues elsewhere in the codebase
3. Ensure you're running the workflow on the correct branch
4. Clear any cached build files with `pnpm clean`

### Preview Deployment Issues

If preview deployment fails:
1. Check Firebase authentication: `firebase login:list`
2. Verify project permissions
3. Check for Firebase hosting configuration issues
4. Look for detailed error messages in the workflow output

## Further Information

For more details on specific aspects of the workflow:

- [Automated Workflow Guide](./automated-workflow-guide.md)
- [Preview Deployment Guide](./preview-deployment-guide.md)
- [Firebase Channel Management](../firebase/channel-management.md)
- [Code Quality Standards](../development/code-quality-standards.md) 