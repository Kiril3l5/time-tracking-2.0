# Firebase Deployment Setup

> **Note**: This document focuses specifically on the modern GitHub Actions setup with Workload Identity Federation. For general deployment workflows and processes, see also the [Development & Deployment Guide](../main_readme/development-deployment-guide.md).

This document outlines the deployment setup for the Time Tracking System using Firebase Hosting and GitHub Actions with Workload Identity Federation.

## Configuration Files

### 1. Firebase Configuration

The project is configured with two deployment targets:

- **Admin Portal**: `admin-autonomyhero-2024.web.app` / `admin.autonomyheroes.com`
- **Hours Portal**: `hours-autonomyhero-2024.web.app` / `hours.autonomyheroes.com`

**firebase.json**:
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": [
    {
      "target": "admin",
      "public": "packages/admin/dist",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ]
    },
    {
      "target": "hours",
      "public": "packages/hours/dist",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ],
      "rewrites": [
        {
          "source": "**",
          "destination": "/index.html"
        }
      ]
    }
  ]
}
```

**.firebaserc**:
```json
{
  "projects": {
    "default": "autonomy-heroes"
  },
  "targets": {
    "autonomy-heroes": {
      "hosting": {
        "admin": [
          "admin-autonomyhero-2024"
        ],
        "hours": [
          "hours-autonomyhero-2024"
        ]
      }
    }
  }
}
```

### 2. GitHub Actions Workflow

The project uses GitHub Actions with Workload Identity Federation for secure, keyless authentication to Google Cloud/Firebase.

**.github/workflows/firebase-deploy.yml**:
```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: 'read'
      id-token: 'write'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        
      - name: Build common package
        run: |
          cd packages/common
          npm run build

      - name: Build admin app
        if: github.event_name == 'push' || contains(github.event.pull_request.labels.*.name, 'deploy-admin')
        run: |
          cd packages/admin
          npm run build
          
      - name: Build hours app
        if: github.event_name == 'push' || contains(github.event.pull_request.labels.*.name, 'deploy-hours')
        run: |
          cd packages/hours
          npm run build
      
      - id: 'auth'
        name: 'Authenticate to Google Cloud'
        uses: 'google-github-actions/auth@v1'
        with:
          workload_identity_provider: 'projects/266526530869/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
          service_account: 'github-actions-sa@autonomy-heroes.iam.gserviceaccount.com'
          
      - name: Deploy to Firebase
        if: github.event_name == 'push'
        run: |
          npm install -g firebase-tools
          firebase deploy
          
      - name: Deploy PR Preview
        if: github.event_name == 'pull_request'
        run: |
          npm install -g firebase-tools
          firebase hosting:channel:deploy pr-${{ github.event.pull_request.number }}
```

## Workload Identity Federation Setup

The following steps were taken to configure Workload Identity Federation:

1. Created a Workload Identity Pool for GitHub:
   ```bash
   gcloud beta iam workload-identity-pools create "github-pool" \
     --location="global" \
     --display-name="GitHub Actions Pool"
   ```

2. Created an OIDC Provider for GitHub Actions:
   ```bash
   gcloud beta iam workload-identity-pools providers create-oidc "github-provider" \
     --location="global" \
     --workload-identity-pool="github-pool" \
     --display-name="GitHub provider" \
     --attribute-condition="assertion.repository=='Kiril3l5/time-tracking-2.0'" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"
   ```

3. Created a service account for GitHub Actions:
   ```bash
   gcloud iam service-accounts create github-actions-sa \
     --display-name="GitHub Actions Service Account"
   ```

4. Granted the service account Firebase admin permissions:
   ```bash
   gcloud projects add-iam-policy-binding autonomy-heroes \
     --member="serviceAccount:github-actions-sa@autonomy-heroes.iam.gserviceaccount.com" \
     --role="roles/firebase.admin" \
     --condition="expression=request.time < timestamp('2026-03-16T22:46:48.893Z'),title=github-actions-firebase-deployment"
   ```

5. Configured the Workload Identity Federation binding:
   ```bash
   gcloud beta iam service-accounts add-iam-policy-binding github-actions-sa@autonomy-heroes.iam.gserviceaccount.com \
     --member="principalSet://iam.googleapis.com/projects/266526530869/locations/global/workloadIdentityPools/github-pool/attribute.repository/Kiril3l5/time-tracking-2.0" \
     --role="roles/iam.workloadIdentityUser" \
     --condition="expression=request.time < timestamp('2026-03-16T22:46:48.893Z'),title=github-actions-identity-federation"
   ```

## Local Deployment Commands

For manual deployments from a local environment:

```bash
# Build all packages
npm run build:all

# Deploy everything
npm run deploy:all

# Deploy only admin app
npm run deploy:admin

# Deploy only hours app
npm run deploy:hours

# Deploy only Firestore rules
npm run deploy:rules
```

## Security Considerations

- **Workload Identity Federation**: Provides keyless authentication for CI/CD, following Google Cloud best practices
- **Time-bound Permissions**: All IAM bindings have an expiration date (March 2026)
- **Repository-specific Access**: The service account can only be used by GitHub Actions running in the specific repository
- **PR Previews**: Pull request deployments create isolated preview channels for testing before merging 