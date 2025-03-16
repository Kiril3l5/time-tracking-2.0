# Environment Setup

## Overview

This document outlines the environment setup for the Time Tracking System. It explains how to configure the necessary environment variables for local development and deployment.

## Environment Variables

The application uses environment variables to configure Firebase and other services. These variables are loaded at build time by Vite.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | `AIzaSyB1...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | `your-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | `1:123456789012:web:abc123def456` |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics measurement ID | `G-ABCDEF1234` |
| `VITE_USE_FIREBASE_EMULATOR` | Whether to use Firebase emulators | `true` or `false` |

### Setup Process

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and replace the placeholders with your Firebase project details:
   ```
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   # ...and so on
   ```

3. For local development, set `VITE_USE_FIREBASE_EMULATOR=true` to use the Firebase emulators.

## Environment File Security

The `.env` file contains sensitive information and should never be committed to version control. Our repository is configured with the following safeguards:

1. `.env` is included in `.gitignore` to prevent accidental commits
2. `.env.example` is provided as a template with placeholder values
3. CI/CD pipelines use environment secrets rather than committed files

## Environment-Specific Configurations

For different deployment environments, create environment-specific files:

- `.env.development` - Development environment configuration
- `.env.staging` - Staging environment configuration
- `.env.production` - Production environment configuration

These files are also excluded from version control via `.gitignore`.

## Troubleshooting

If you encounter issues with environment variables:

1. Verify that the `.env` file exists in the project root
2. Check that all required variables are defined
3. Ensure the variable names match exactly as specified above
4. For Firebase emulator issues, verify that emulators are running with `pnpm emulators`

## References

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase Project Setup](https://firebase.google.com/docs/web/setup) 