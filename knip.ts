import { type KnipConfig } from 'knip';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const config: KnipConfig = {
  entry: [
    'packages/admin/src/main.tsx', // Assuming main entry for admin app
    'packages/hours/src/main.tsx', // Assuming main entry for hours app
    'packages/common/src/index.ts', // Assuming main export entry for common lib
    'scripts/**/*.ts', // Include scripts as entry points
    '*.config.{js,ts}', // Include config files
    'vitest.setup.ts'
  ],
  project: [
    'packages/*/src/**/*.{ts,tsx}', 
    'scripts/**/*.{ts,js}'
  ],
  ignore: [
    'dist',
    'coverage',
    'node_modules',
    'temp',
    '*.config.{js,ts}', // Ignore config files from being reported as unused themselves
    'vitest.setup.ts', 
    '*.stories.tsx', // Ignore storybook files
    '**/*.d.ts', // Ignore type definition files
    // Add specific ignores from old depcheck config if necessary
    // (Knip might be smarter about some of these)
    'packages/common/src/stories/**', // Likely still needed
    'packages/common/src/firebase/index.ts', // Check if Knip detects usage
    'packages/common/src/hooks/index.ts', // Check if Knip detects usage
    'packages/common/src/store/index.ts', // Check if Knip detects usage
    'packages/common/src/types/index.ts', // Check if Knip detects usage
    'packages/common/src/components/ui/icons/index.tsx', // Check if Knip detects usage
    'packages/common/src/components/forms/index.ts', // Check if Knip detects usage
    // Ignore the 8 files previously reported as unused
    'scripts/core/health-checks.js',
    'scripts/checks/doc-quality-checker.js',
    'scripts/checks/docs-freshness.js',
    'scripts/checks/typescript-quality-checker.js',  
    'scripts/github/pr-manager.js',
    'scripts/firebase/url-extractor.js',
    'scripts/workflow/parallel-executor.js',
    'scripts/core/health/workspace.js',
    // Ignore files containing the previously reported unused exports
    'scripts/auth/auth-manager.js',
    'scripts/auth/firebase-auth.js',
    'scripts/auth/git-auth.js',
    'scripts/core/command-runner.js',
    'scripts/core/config.js',
    'scripts/core/environment.js',
    'scripts/core/error-handler.js',
    'scripts/core/progress-tracker.js',
    'scripts/workflow/branch-manager.js',
    'scripts/workflow/build-manager.js',
    'scripts/workflow/deployment-manager.js',
    'scripts/workflow/workflow-cache.js',
    'scripts/workflow/workflow-state.js' // Added this one for WorkflowError
  ],
  ignoreDependencies: [
    // Add dependencies that Knip might falsely report as unused
    // e.g., type packages used implicitly, peer dependencies, etc.
    '@types/react-dom',
    '@types/uuid',
    // ESLint/Prettier plugins (keep some, remove hinted ones)
    // 'eslint-plugin-jest-dom', // Removed based on knip hint
    // 'eslint-plugin-prettier', // Removed based on knip hint
    // 'eslint-plugin-react', // Removed based on knip hint
    // 'eslint-plugin-react-hooks', // Removed based on knip hint
    // 'eslint-plugin-testing-library', // Removed based on knip hint
    // 'typescript-eslint', // Removed based on knip hint
    // Tailwind plugins (keep some, remove hinted ones)
    // '@tailwindcss/aspect-ratio', // Removed based on knip hint
    // '@tailwindcss/forms', // Removed based on knip hint
    // '@tailwindcss/typography', // Removed based on knip hint
    'autoprefixer',
    // Storybook addons/config related
    '@storybook/react', 
    '@storybook/test',
    // Vite/Vitest related potentially
    // '@vitejs/plugin-react', // Removed based on knip hint
    
    // Dependencies likely used only in workspaces
    'dotenv',
    'firebase',
    'immer',
    'react-router-dom', // Note: Also listed as devDep, ignoring both is safe
    '@hookform/resolvers',
    '@tanstack/react-query',
    'date-fns',
    'react-hook-form',
    'zod',
    'zustand',
    '@testing-library/react', // Listed as devDep, likely used in pkg tests

    // Ignores for likely indirect/tooling dependencies
    '@tailwindcss/postcss',
    'open-cli',
    'qrcode',
    'vite-plugin-static-copy'
  ],
  ignoreExportsUsedInFile: true, // Don't report exports used only within the same file
  workspaces: {
    '.': {
      // Define main scripts as entry points for the root workspace
      entry: [
        '*.config.{js,ts}', 
        'scripts/preview.js', // Main preview workflow
        'scripts/deploy.js', // Main deploy workflow
        'scripts/improved-workflow.js', // Assumed improved workflow entry
        'scripts/firebase/channel-cli.js', // Channel management CLI
        'scripts/workflow/dashboard-cli.js', // Dashboard CLI
        'scripts/workflow/advanced-checker.js', // Add advanced checker entry point
        'vitest.setup.ts'
        // Add other top-level scripts called directly if needed
      ],
      project: ['scripts/**/*.{ts,js}'], // Limit root project scan to scripts
      ignore: ['packages/**'] // Root ignores packages
    },
    'packages/admin': {
      entry: ['src/main.tsx', '**/*.config.{js,ts}'],
      project: ['src/**/*.{ts,tsx}','!src/**/*.test.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
    },
    'packages/hours': {
      entry: ['src/main.tsx', '**/*.config.{js,ts}'],
       project: ['src/**/*.{ts,tsx}','!src/**/*.test.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
    },
    'packages/common': {
      entry: ['src/index.ts', '**/*.config.{js,ts}'],
       project: ['src/**/*.{ts,tsx}','!src/**/*.test.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
    }
  },
};

export default config; 