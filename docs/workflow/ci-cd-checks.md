# CI/CD Pipeline Verification Guide

## Overview

This document outlines the procedures for verifying and maintaining the CI/CD pipeline to ensure reliable builds and deployments.

## Pre-Deployment Checklist

Before committing changes that will trigger deployments, always run the following verification:

```bash
npm run project:audit
```

This command performs comprehensive checks including:
- Documentation structure validation
- Duplicate content detection
- GitHub Actions workflow verification
- Script existence verification

## Workflow Validation Process

The workflow validation script (`scripts/workflow-check.js`) automatically checks:

1. **Script Existence**: Ensures all scripts referenced in workflows exist in package.json
2. **Package Manager Consistency**: Verifies consistent package manager usage (npm, yarn, or pnpm)
3. **Git Hook Integration**: Runs automatically on pre-commit via Husky (when configured)

## Common Issues and Fixes

### Missing Scripts in package.json

If the validator reports scripts referenced in workflows that don't exist:

```
⚠️ Found 1 scripts in firebase-deploy.yml that don't exist in package.json:
  - build:test
```

Fix by either:
- Adding the missing script to package.json
- Updating the workflow to use an existing script

### Package Manager Inconsistency

If multiple package managers are detected:

```
⚠️ Workflow uses multiple package managers, which may cause issues:
  - npm
  - pnpm
```

Fix by standardizing on one package manager throughout all workflows.

## Manual Verification

In addition to automated checks, periodically perform these manual verifications:

1. **Local Workflow Testing**: Use [act](https://github.com/nektos/act) to test workflows locally
2. **Credentials Verification**: Ensure all required secrets exist in GitHub repository settings
3. **Permission Checks**: Verify workflow permissions are correctly configured for minimum required access

## Troubleshooting Failed Workflows

If a workflow fails despite passing local validation:

1. Check the detailed GitHub Actions logs
2. Verify environment differences between local and GitHub runners
3. Examine dependency caching behavior
4. Test with specific GitHub Actions runner versions locally

## Keeping Workflows Updated

Regularly audit workflows for:

- Deprecated GitHub Actions
- Outdated Node.js or package manager versions
- Security vulnerabilities in dependencies
- Performance improvements

## Continuous Integration Best Practices

- Keep workflows modular and focused
- Split complex workflows into reusable components
- Implement appropriate timeouts
- Cache dependencies efficiently
- Use matrix builds for cross-platform testing 