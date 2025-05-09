# Preview Deployment Guide

This guide explains how the Time Tracking 2.0 system handles preview deployments to Firebase Hosting, including channel management and cleanup.

## Overview

The preview deployment system automatically deploys both the Hours and Admin applications to Firebase Hosting preview channels. Preview deployments allow you to:

- Test changes in a production-like environment
- Share working previews with stakeholders for feedback
- Verify that builds work correctly in the Firebase environment
- Run UAT (User Acceptance Testing) before production deployment

## How Preview Deployment Works

The system uses Firebase Hosting's preview channels feature to create isolated environments for testing:

1. A unique channel ID is generated based on the current branch name and date
2. Previous build artifacts are cleaned using platform-specific commands
3. Applications are built sequentially using `pnpm run build:all` to ensure proper dependency handling
4. Build artifacts are verified before proceeding with deployment
5. Both applications (Hours and Admin) are deployed to the same channel ID
6. Preview URLs are generated and displayed in the dashboard
7. Old preview channels are automatically cleaned up to maintain resource limits

## Preview URLs

The system generates two preview URLs:

- **Hours App**: `https://hours-autonomyhero-2024--{channel-id}.web.app`
- **Admin App**: `https://admin-autonomyhero-2024--{channel-id}.web.app`

These URLs are displayed in both the terminal output and the workflow dashboard.

## Channel Management

### Channel Creation

Preview channels follow this naming convention:

```
preview-{branch-name}-{date}
```

For example: `preview-feature-mobile-auth-20250325`

### Channel Cleanup

To prevent exceeding Firebase's channel limits and keep the hosting environment clean, the workflow automatically manages channels:

- Only the 5 most recent preview channels are kept
- Older channels are automatically deleted
- Cleanup runs during the Results Phase of the workflow
- Channel cleanup status is shown in the dashboard

The cleanup process:
1. Lists all existing channels for both sites
2. Sorts channels by creation date
3. Keeps the 5 most recent channels
4. Deletes all older channels

## Accessing Previews

### From the Workflow Dashboard

The dashboard provides direct links to both applications:

1. Run the workflow: `pnpm run workflow`
2. When complete, the dashboard opens automatically in your browser
3. Click the preview links in the "Preview Channels" section.
   *Note: The dashboard displays both the **Current** URL for this run and the **Previous** URL from the prior deployment (if available) for easy comparison.*

### From the Terminal

Preview URLs are also displayed in the terminal output:

```
Preview URLs:
Hours App: https://hours-autonomyhero-2024--preview-feature-auth-20250330-ef12abc.web.app
Admin App: https://admin-autonomyhero-2024--preview-feature-auth-20250330-ef12abc.web.app
```

### From the Firebase Console

You can also access previews from the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to Hosting
4. Click on the "Channels" tab
5. Find your channel and click on the preview links

## Manual Preview Management

While the workflow handles channel management automatically, you can also manage channels manually:

### Listing Channels

```bash
# List all channels for the hours site
firebase hosting:channel:list --site=hours-autonomyhero-2024

# List all channels for the admin site
firebase hosting:channel:list --site=admin-autonomyhero-2024
```

### Manually Deleting a Channel

```bash
# Delete a specific channel
firebase hosting:channel:delete CHANNEL_ID --site=hours-autonomyhero-2024
firebase hosting:channel:delete CHANNEL_ID --site=admin-autonomyhero-2024
```

### Manually Creating a Channel

```bash
# Create a custom channel
firebase hosting:channel:create CHANNEL_ID --site=hours-autonomyhero-2024
firebase hosting:channel:create CHANNEL_ID --site=admin-autonomyhero-2024
```

## Best Practices

For effective use of the preview deployment system:

1. **Use Meaningful Branch Names**: This creates clearer channel IDs
2. **Let the Workflow Handle Cleanup**: Don't manually delete channels unless necessary
3. **Include Preview URLs in PR Descriptions**: Makes it easy for reviewers to test changes
4. **Test on Multiple Devices**: Check both mobile and desktop views of the preview
5. **Verify Both Apps**: Always check that both Hours and Admin apps work correctly

## Troubleshooting

### Preview Deployment Failures

If deployment fails:

1. Check the dashboard for specific error details
2. Verify Firebase CLI authentication with `firebase login:list`
3. Ensure you have deployment permissions for the Firebase project
4. Check your internet connection

### Channel Limit Reached

If you encounter channel limit errors:

1. Run the workflow to trigger automatic cleanup
2. Manually delete unused channels if necessary
3. Wait for Firebase to process previous deletions (this can take a few minutes)

### Preview Not Updating

If a preview doesn't reflect your latest changes:

1. Make sure you've pushed your latest commits
2. Verify that the workflow completed successfully
3. Try clearing your browser cache or using incognito/private mode
4. Check that you're using the correct URL for the latest deployment

### Preview Not Showing Latest Changes

If your code changes (especially in App.tsx router files) aren't appearing in the deployed preview:

1. **Clean Build Artifacts**: The workflow now automatically cleans previous build artifacts
2. **Ensure Sequential Building**: The workflow now uses `pnpm run build:all` instead of `pnpm build` to ensure packages are built in the correct order
3. **Check Build Success**: Verify in the dashboard that both the "clean" and "build" steps completed successfully
4. **Verify Routing Changes**: For React Router changes, ensure that:
   - Route components exist and are exported correctly
   - Import paths in route definitions are correct
   - Nested routes have proper parent-child relationships
5. **Run with Verbose Flag**: Use `pnpm run workflow --verbose` to see detailed build output
6. **Manual Build Test**: Run `pnpm run clean && pnpm run build:all` locally to verify the build process
