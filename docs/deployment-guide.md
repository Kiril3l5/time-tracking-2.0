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

### Test Deployment (Simulation)

If you want to test the deployment process without actually executing any commands:

```bash
pnpm run app:deploy:test "Your test message"
```

This will simulate the deployment process, showing you what commands would be run without actually executing them. This is useful for verifying that the process is configured correctly.

### Using VS Code Tasks (Even Easier)

For VS Code users, we've added tasks to streamline deployment:

1. Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
2. Select either:
   - "Deploy Time Tracking System" for actual deployment
   - "Test Deployment (Simulation)" to simulate without executing commands
3. Enter your commit message
4. Watch the deployment happen automatically (or simulation run)

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
   pnpm run deploy:admin    # Deploy admin panel only
   pnpm run deploy:hours    # Deploy hours tracking app only
   pnpm run deploy:rules    # Deploy Firestore rules only
   pnpm run deploy:indexes  # Deploy Firestore indexes only
   ```

## Firestore Indexes

The application uses several Firestore indexes to optimize database queries, particularly for the `timeEntries` collection. These indexes are defined in the `firestore.indexes.json` file.

### Managing Indexes

- **Export current indexes:**
  ```bash
  firebase firestore:indexes > firestore.indexes.json
  ```

- **Deploy indexes:**
  ```bash
  pnpm run deploy:indexes
  ```

- **Check index status:**
  ```bash
  firebase firestore:indexes
  ```

Always commit changes to the `firestore.indexes.json` file to ensure your team is using the same index configuration.

## Deployment Environments

The deployment targets the Firebase project configured in your `.firebaserc` file.

## Troubleshooting

If you encounter issues during deployment:

1. **Build Errors**: Check the console output for specific error messages. Most build errors are related to TypeScript issues or missing dependencies.

2. **Deployment Errors**: Ensure you're logged in to Firebase with the correct account that has access to the project.

3. **Git Errors**: Make sure your git repository is properly configured and you have the right permissions to push to the remote.

4. **Script Execution Issues**: If the deployment script fails to run, ensure you have the latest version of Node.js and that the script has executable permissions (`chmod +x scripts/deploy.js`).

5. **Index Errors**: If you see index-related errors during deployment, try running `firebase firestore:indexes` to verify your indexes are configured correctly.

## Additional Information

For more detailed information about Firebase deployment options, see the [Firebase CLI Reference](https://firebase.google.com/docs/cli). 