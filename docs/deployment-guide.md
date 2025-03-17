# Deployment Guide

This document provides instructions for deploying the Time Tracking System to Firebase hosting.

## Prerequisites

Before deploying, ensure you have:

1. [Node.js](https://nodejs.org/) installed (v16 or later)
2. [pnpm](https://pnpm.io/installation) package manager installed 
3. Firebase CLI installed (`npm install -g firebase-tools`)
4. Logged in to Firebase CLI (`firebase login`)
5. Git properly configured on your machine

## Deployment Steps

### Automatic Deployment (Recommended)

We've simplified the deployment process into a single command:

```bash
pnpm run app:deploy "Your commit message"
```

This command will:
1. Clean up the project (remove build artifacts and temporary files)
2. Build all packages (common, admin, hours)
3. Add all files to git
4. Commit with the provided message
5. Push to the remote repository
6. Deploy to Firebase

### Using VS Code Tasks (Even Easier)

For VS Code users, we've added a task to streamline deployment:

1. Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
2. Select "Deploy Time Tracking System" if prompted
3. Enter your commit message
4. Watch the deployment happen automatically

### Manual Deployment Steps

If you prefer to deploy manually, you can follow these steps:

1. Clean the project
   ```bash
   pnpm run cleanup
   ```

2. Build all packages
   ```bash
   pnpm run build:all
   ```

3. Deploy to Firebase
   ```bash
   # Deploy everything
   pnpm run deploy:all
   
   # Or deploy specific components
   pnpm run deploy:admin  # Deploy admin panel only
   pnpm run deploy:hours  # Deploy hours tracking app only
   pnpm run deploy:rules  # Deploy Firestore rules only
   ```

## Deployment Environments

The deployment targets the Firebase project configured in your `.firebaserc` file.

## Troubleshooting

If you encounter issues during deployment:

1. **Build Errors**: Check the console output for specific error messages. Most build errors are related to TypeScript issues or missing dependencies.

2. **Deployment Errors**: Ensure you're logged in to Firebase with the correct account that has access to the project.

3. **Git Errors**: Make sure your git repository is properly configured and you have the right permissions to push to the remote.

4. **Script Execution Issues**: If the deployment script fails to run, ensure you have the latest version of Node.js and that the script has executable permissions (`chmod +x scripts/deploy.js`).

## Additional Information

For more detailed information about Firebase deployment options, see the [Firebase CLI Reference](https://firebase.google.com/docs/cli). 