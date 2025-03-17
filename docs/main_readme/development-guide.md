# Development Guide

**Summary:** A comprehensive guide for setting up the development environment for the Time Tracking System, covering local setup, workflows, testing, and best practices.

## Document Information

**Purpose:** To help developers set up and maintain a productive development environment
**Audience:** Developers and contributors
**Last Updated:** 2025-03-17
**Maintainer:** Project Team

---

## Overview

This guide provides comprehensive instructions for setting up the development environment for the Time Tracking System. For deployment information, please refer to the [CI/CD Guide](../ci-cd-guide.md).

> **Documentation Consolidation Notice**: The deployment section of this document has been moved to the [CI/CD Guide](../ci-cd-guide.md) as part of our effort to maintain a "Single Source of Truth" for all documentation.

## Development Environment Setup

### Prerequisites

Before starting development, ensure you have the following installed:

1. **Node.js** - v18 or later
2. **pnpm** - v8 or later (`npm install -g pnpm`)
3. **Git** - Latest version
4. **Firebase CLI** - (`npm install -g firebase-tools`)
5. **VS Code** - Recommended editor with the following extensions:
   - ESLint
   - Prettier
   - Tailwind CSS IntelliSense
   - Firebase Explorer

### Initial Project Setup

#### 1. Clone the Repository

```bash
git clone https://github.com/your-org/time-tracking-system.git
cd time-tracking-system
```

#### 2. Install Dependencies

```bash
pnpm install
```

#### 3. Configure Firebase Environment

Create a `.env.local` file in the project root:

```
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Environment
VITE_APP_ENV=development
```

#### 4. Set Up Firebase Emulators

Firebase emulators allow local development without affecting production data:

```bash
# Login to Firebase
firebase login

# Initialize emulators
firebase init emulators

# Start emulators
pnpm firebase:emulators
```

Configure your emulators in `firebase.json`:

```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "hosting": {
      "port": 5000
    },
    "functions": {
      "port": 5001
    },
    "storage": {
      "port": 9199
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

#### 5. Configure VS Code

Create a `.vscode/settings.json` file with recommended settings:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Development Workflow

#### 1. Start Development Server

The project uses a monorepo structure with multiple packages. Use these commands to start development servers:

```bash
# Start the hours portal (end-user)
pnpm dev:hours

# Start the admin portal
pnpm dev:admin

# Start both portals concurrently
pnpm dev
```

#### 2. Running Tests

The project uses Vitest for unit/integration tests and Playwright for E2E tests:

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Run specific E2E test
pnpm test:e2e --grep "time entry submission"
```

#### 3. Linting and Formatting

Maintain code quality with linting and formatting:

```bash
# Lint the project
pnpm lint

# Automatically fix linting issues
pnpm lint:fix

# Format code with Prettier
pnpm format
```