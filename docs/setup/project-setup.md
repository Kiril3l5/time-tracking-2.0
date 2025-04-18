# Time Tracking 2.0 Project Setup

This document outlines the technical setup of the Time Tracking 2.0 project, including tools, configurations, development workflows, and deployment processes.

## Project Structure

This project is organized as a monorepo using PNPM workspaces with the following structure:

```
time-tracking-2.0/
├── packages/             # Contains all packages/apps
│   ├── common/           # Shared utilities and types
│   ├── admin/            # Admin portal application
│   ├── hours/            # Hours portal application
│   └── ...               # Other packages
├── pnpm-workspace.yaml   # Workspace configuration
├── package.json          # Root package.json
├── .eslintrc.js          # ESLint configuration
├── .prettierrc.json      # Prettier configuration
├── vitest.config.ts      # Vitest configuration
├── tsconfig.json         # TypeScript configuration
├── firebase.json         # Firebase configuration
└── .firebaserc           # Firebase project configuration
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

## Deployment

Deployment to Firebase happens automatically through GitHub Actions. The deployment targets two primary applications:

- **Admin Portal**: `admin-autonomyhero-2024.web.app` / `admin.autonomyheroes.com`
- **Hours Portal**: `hours-autonomyhero-2024.web.app` / `hours.autonomyheroes.com`

### Deployment Triggers

- **Production**: Pushes to the `main` branch automatically deploy to production
- **Preview**: Pull requests create isolated preview environments

### Manual Deployment Commands

For manual deployments from a local environment:

```bash
# Build all packages
pnpm run build:all

# Deploy everything
pnpm run deploy:all

# Deploy only admin app
pnpm run deploy:admin

# Deploy only hours app
pnpm run deploy:hours

# Deploy only Firestore rules
pnpm run deploy:rules
```

### Security Considerations

- **Workload Identity Federation**: Provides keyless authentication for CI/CD, following Google Cloud best practices
- **Repository-specific Access**: The service account can only be used by GitHub Actions running in the specific repository
- **PR Previews**: Pull request deployments create isolated preview channels for testing before merging

## Key Configuration Files

### `.eslintrc.js`

Our ESLint configuration includes:
- TypeScript and React support
- Jest plugin for testing
- Permissive rules during development
- Line ending configurations

### `.prettierrc.json`

Our Prettier configuration includes:
- Line width and tab settings
- Quote preferences
- Trailing comma settings
- End of line handling (`endOfLine: "auto"`)

### `vitest.config.ts`

Testing configuration for Vitest with:
- JSdom environment for testing React components
- Test file patterns
- Global test setup files

### `pnpm-workspace.yaml`

Defines packages directory for our monorepo:
```yaml
packages:
  - 'packages/*'
```

### GitHub Actions Workflow

Located in `.github/workflows/firebase-deploy.yml`, our CI/CD pipeline handles:
- Code checkout and dependency installation
- Linting and testing
- Building packages
- Secure authentication to Google Cloud
- Deploying to Firebase hosting environments

## Recent Improvements

We've made the following improvements to the project setup:

1. **PNPM Workspace Configuration**
   - Properly defined monorepo structure for better dependency management

2. **ESLint Configuration**
   - Added Jest plugin for testing
   - Made rules more permissive during development
   - Fixed line ending issues

3. **Prettier Configuration**
   - Added `endOfLine: "auto"` to handle line ending issues
   - Ensured consistent formatting across the codebase

4. **Testing Setup**
   - Installed Vitest and related testing libraries
   - Added test setup and example tests

5. **GitHub Actions Workflow**
   - Re-enabled linting and testing in the CI pipeline
   - Improved the build and deployment process

## Known Issues & Next Steps

1. **Linting Errors**
   - There are still some linting errors related to:
     - Unescaped entities in JSX
     - Using `any` type
     - Console statements
     - Unused variables
   - These can be addressed gradually as the project evolves

2. **Peer Dependencies**
   - Some peer dependency warnings should be addressed
   - Mostly related to version mismatches between Vitest and its UI plugin

3. **Future Improvements**
   - Address remaining linting errors
   - Improve test coverage
   - Resolve peer dependencies
   - Enhance documentation for specific features

## Troubleshooting

If you encounter issues with the project setup:

1. Ensure you have the correct versions of Node.js and PNPM installed
2. Try removing `node_modules` and reinstalling with `pnpm install`
3. Check that all configuration files are properly set up
4. Verify Firebase CLI authentication if performing manual deployments 