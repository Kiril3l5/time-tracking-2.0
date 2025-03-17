# Time Tracking 2.0 Project Setup

This document outlines the technical setup of the Time Tracking 2.0 project, including tools, configurations, and development workflows.

## Project Structure

This project is organized as a monorepo using PNPM workspaces with the following structure:

```
time-tracking-2.0/
├── packages/             # Contains all packages/apps
│   ├── common/           # Shared utilities and types
│   ├── web/              # Web application
│   └── ...               # Other packages
├── pnpm-workspace.yaml   # Workspace configuration
├── package.json          # Root package.json
├── .eslintrc.js          # ESLint configuration
├── .prettierrc.json      # Prettier configuration
├── vitest.config.ts      # Vitest configuration
└── tsconfig.json         # TypeScript configuration
```

## Development Tools

### Package Manager

We use PNPM as our package manager for its speed and efficiency with monorepos. Workspaces are configured in the `pnpm-workspace.yaml` file.

### Linting and Formatting

- **ESLint**: We use ESLint for code linting with TypeScript and React support.
  - Run `pnpm lint` to check for issues
  - Run `pnpm lint:fix` to automatically fix issues where possible

- **Prettier**: We use Prettier for code formatting.
  - Run `pnpm format` to format all code

### Testing

- **Vitest**: We use Vitest as our test runner.
  - Run `pnpm test` to run all tests
  - Run `pnpm test:watch` to run tests in watch mode

## Development Workflow

1. **Install Dependencies**: 
   ```
   pnpm install
   ```

2. **Development**:
   - Write code in the appropriate package
   - Run tests and linting locally
   - Format code before committing

3. **Pre-commit Checks**:
   The `precommit` script runs automatically to ensure code quality:
   - Linting
   - Testing

4. **Continuous Integration**:
   Our GitHub Actions workflow:
   - Runs on pull requests and pushes to main
   - Installs dependencies
   - Runs linting
   - Runs tests
   - Builds packages
   - Deploys to Firebase (production or preview)

## Important Commands

- `pnpm install`: Install dependencies
- `pnpm lint`: Check for linting issues
- `pnpm lint:fix`: Fix linting issues automatically
- `pnpm format`: Format code with Prettier
- `pnpm test`: Run tests
- `pnpm test:watch`: Run tests in watch mode
- `pnpm build:all`: Build all packages

## Deployment

Deployment to Firebase happens automatically through GitHub Actions:
- Pushes to `main` branch deploy to production
- Pull requests create preview deployments

## Troubleshooting

If you encounter issues with the project setup:

1. Ensure you have the correct versions of Node.js and PNPM installed
2. Try removing `node_modules` and reinstalling with `pnpm install`
3. Check that all configuration files are properly set up 