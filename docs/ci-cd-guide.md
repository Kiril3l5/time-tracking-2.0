# CI/CD Guide for Time Tracking System

**Summary:** A comprehensive guide to the CI/CD process for the Time Tracking System, covering automated deployments with GitHub Actions and Google Cloud Workload Identity Federation.

## Document Information

**Purpose:** To provide a single source of truth for all deployment-related information
**Audience:** Developers, DevOps, and project maintainers
**Last Updated:** 2025-03-17
**Maintainer:** Project Team

---

## Automated Deployment

The Time Tracking System uses GitHub Actions with Google Cloud Workload Identity Federation for secure CI/CD, which automates the build, test, and deployment process.

### How It Works

1. When code is pushed to the `main` branch, a GitHub Actions workflow (`.github/workflows/firebase-deploy.yml`) is automatically triggered.
2. The workflow builds the application, runs all tests, and if tests pass, deploys the app to Firebase.
3. All deployments are logged in the GitHub Actions tab, where you can view the status of each deployment.

> **Important**: We exclusively use Workload Identity Federation for all deployments. The older approach using Firebase Service Account JSON or Firebase tokens is deprecated and should not be used due to security concerns.

## Deployment Process

The deployment process is fully automated and includes:

1. Setting up a Node.js environment
2. Installing dependencies with pnpm
3. Running all tests
4. Building the application packages
5. Authenticating to Google Cloud using Workload Identity Federation (a more secure method than using API keys)
6. Deploying to Firebase (hosting and Firestore rules)

## Manual Deployment

Currently, manual deployments are handled by pushing to the main branch. If you need manual deployment functionality, please contact the repository administrator.

## Pull Request Previews

For pull requests, the system will:
1. Build a preview version of your changes
2. Deploy it to a unique preview URL using Firebase Hosting Channels
3. Add a comment to your PR with the preview URL
4. Update the preview whenever you update the PR

The PR preview deployment uses the same secure Workload Identity Federation authentication as the production deployment, but deploys to a temporary preview channel instead of the live site. Each PR gets its own unique preview URL in the format: `https://pr-[PR_NUMBER]--[PROJECT_ID].web.app`

This approach ensures consistent authentication across all deployments while providing visible feedback directly on your PRs.

## Environment Setup

### Google Cloud Workload Identity Federation

This project uses Workload Identity Federation for GitHub Actions, which is Google's recommended approach that eliminates the need for storing service account keys as secrets.

#### How Workload Identity Federation Works

Workload Identity Federation allows GitHub Actions to temporarily assume the identity of a Google Cloud service account without using long-lived service account keys. Instead, it uses short-lived token exchange based on the GitHub repository's identity.

#### Configuration Steps

The following steps were taken to configure Workload Identity Federation:

1. **Creating a Workload Identity Pool for GitHub**:
   ```bash
   gcloud beta iam workload-identity-pools create "github-pool" \
     --location="global" \
     --display-name="GitHub Actions Pool"
   ```

2. **Creating an OIDC Provider for GitHub Actions**:
   ```bash
   gcloud beta iam workload-identity-pools providers create-oidc "github-provider" \
     --location="global" \
     --workload-identity-pool="github-pool" \
     --display-name="GitHub provider" \
     --attribute-condition="assertion.repository=='Kiril3l5/time-tracking-2.0'" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"
   ```

3. **Creating a Service Account for GitHub Actions**:
   ```bash
   gcloud iam service-accounts create github-actions-sa \
     --display-name="GitHub Actions Service Account"
   ```

4. **Granting the Service Account Firebase Admin Permissions**:
   ```bash
   gcloud projects add-iam-policy-binding autonomy-heroes \
     --member="serviceAccount:github-actions-sa@autonomy-heroes.iam.gserviceaccount.com" \
     --role="roles/firebase.admin" \
     --condition="expression=request.time < timestamp('2026-03-16T22:46:48.893Z'),title=github-actions-firebase-deployment"
   ```

5. **Configuring the Workload Identity Federation Binding**:
   ```bash
   gcloud beta iam service-accounts add-iam-policy-binding github-actions-sa@autonomy-heroes.iam.gserviceaccount.com \
     --member="principalSet://iam.googleapis.com/projects/266526530869/locations/global/workloadIdentityPools/github-pool/attribute.repository/Kiril3l5/time-tracking-2.0" \
     --role="roles/iam.workloadIdentityUser" \
     --condition="expression=request.time < timestamp('2026-03-16T22:46:48.893Z'),title=github-actions-identity-federation"
   ```

#### Security Benefits

- **No Service Account Keys**: No need to store sensitive service account JSON keys in GitHub Secrets
- **Time-Limited Access**: All permissions have an expiration date (March 2026)
- **Repository-Specific**: The service account can only be used by GitHub Actions running in this specific repository
- **Fine-Grained Permissions**: The service account has only the permissions necessary for Firebase deployment

This configuration is already set up for this project, so you don't need to manage any secrets for deployment.

## Firestore Rules and Indexes

The deployment includes Firestore security rules. Make sure to keep these files up to date:

- `firestore.rules` - Contains your security rules
- `firestore.indexes.json` - Contains your index configurations

Any changes to these files will be automatically deployed when the workflow runs.

## Deployment Targets

The project is configured with two hosting targets:

- **Admin Portal**: `admin-autonomyhero-2024.web.app` / `admin.autonomyheroes.com`
- **Hours Portal**: `hours-autonomyhero-2024.web.app` / `hours.autonomyheroes.com`

## Local Development

For local development, you can use these commands:

```bash
# Start Firebase emulators
pnpm firebase:emulators

# Deploy only specific components manually (for development/testing only)
firebase deploy --only hosting
firebase deploy --only firestore
```

**Note**: For production deployments, always push to the main branch to trigger the GitHub Actions workflow for consistency and proper testing before deployment.