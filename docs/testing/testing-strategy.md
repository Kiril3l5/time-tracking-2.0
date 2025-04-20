# Testing Strategy

*(Initial outline - To be expanded)*

This document outlines the testing strategy for the Time Tracking 2.0 application.

## Core Testing Framework: Vitest

The project utilizes **Vitest** as the primary framework for running unit and integration tests due to its speed, compatibility with Vite, and modern features.

*   **Location**: Tests reside alongside the code they are testing (e.g., `*.test.ts` or `*.test.tsx` files within `packages/`).
*   **Execution**: Tests are run via PNPM scripts (e.g., `pnpm test`, `pnpm test:ci`, `pnpm test:watch`).
*   **CI Integration**: Tests are automatically executed as part of the GitHub Actions CI/CD pipeline (`.github/workflows/firebase-deploy.yml`) during the validation phase.
*   **Workflow Integration**: The local development workflow (`scripts/improved-workflow.js` via `pnpm run workflow`) also runs these tests during its validation phase, using helper scripts (`scripts/checks/test-runner.js`, `scripts/checks/test-coordinator.js`) to execute Vitest and parse results.

## Current Status & Next Steps

*   **Placeholder Tests**: Currently, many of the tests executed by Vitest are placeholders (e.g., `dummy.test.ts`, `basic.test.ts`) used to set up the testing infrastructure.
*   **Action Required**: These placeholder tests **must be replaced** with meaningful unit and integration tests covering:
    *   Utility functions (`packages/common/src/utils`)
    *   React components (`packages/common/src/components`, portal-specific components)
    *   Custom hooks (`packages/common/src/hooks`, portal-specific hooks)
    *   State management logic (Zustand stores in `packages/common/src/store`)
    *   Key workflows (e.g., authentication flow, time entry submission)

## Future Considerations

*   **End-to-End (E2E) Testing**: A strategy for E2E testing (e.g., using Playwright or Cypress) should be defined and implemented.
*   **Performance Testing**: Define and implement performance benchmarks and tests.
*   **Coverage Thresholds**: Establish minimum test coverage requirements. 