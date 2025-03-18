/**
 * Comprehensive script to modernize the entire project
 * - Updates dependencies to latest versions
 * - Fixes TypeScript configuration
 * - Sets up proper testing environment
 * - Applies industry best practices
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting project modernization...');

try {
  // Step 1: Update root dependencies
  console.log('\n📦 [Step 1] Updating root dependencies...');
  execSync('pnpm up -r --latest', { stdio: 'inherit' });
  
  // Step 2: Add missing dependencies across packages
  console.log('\n📚 [Step 2] Adding missing dependencies...');
  
  // Root package
  console.log('  - Adding dependencies to root package...');
  execSync('pnpm add -D @types/node @vitejs/plugin-react', { stdio: 'inherit' });
  
  // Common package
  console.log('  - Adding dependencies to common package...');
  execSync(`
    cd packages/common && 
    pnpm add @tanstack/react-query@^5.28.2 &&
    pnpm add -D @tanstack/react-query-devtools@^5.28.2 @types/react-dom
  `, { stdio: 'inherit', shell: true });
  
  // Admin package
  console.log('  - Adding dependencies to admin package...');
  execSync(`
    cd packages/admin && 
    pnpm add react-router-dom@^6.22.3 &&
    pnpm add -D @tanstack/react-query@^5.28.2 @vitejs/plugin-react vite-plugin-static-copy
  `, { stdio: 'inherit', shell: true });
  
  // Hours package
  console.log('  - Adding dependencies to hours package...');
  execSync(`
    cd packages/hours && 
    pnpm add react-router-dom@^6.22.3 react-hook-form@^7.51.1 @hookform/resolvers@^3.3.4 zod@^3.22.4 &&
    pnpm add -D @tanstack/react-query@^5.28.2 @vitejs/plugin-react vite-plugin-static-copy
  `, { stdio: 'inherit', shell: true });
  
  // Step 3: Create proper TypeScript configuration
  console.log('\n🔧 [Step 3] Updating TypeScript configuration...');
  createTsConfig();
  
  // Step 4: Update test configuration
  console.log('\n🧪 [Step 4] Setting up test environment...');
  updateVitestConfig();
  updateVitestSetup();
  
  // Step 5: Create proper type declarations
  console.log('\n📝 [Step 5] Creating proper type declarations...');
  createTypeDeclarations();
  
  // Step 6: Update ESLint configuration
  console.log('\n🧹 [Step 6] Updating ESLint configuration...');
  updateEslintConfig();
  
  // Step 7: Final verification
  console.log('\n✅ [Step 7] Verifying setup...');
  execSync('pnpm install', { stdio: 'inherit' });
  
  console.log('\n🎉 Project modernization complete!');
  console.log('\nNext steps:');
  console.log('1. Fix remaining TypeScript errors by updating code to use new package versions');
  console.log('2. Update components to use modern React patterns');
  console.log('3. Run pnpm lint:fix to apply consistent code style');
  console.log('4. Run pnpm test to verify tests are working');
  
} catch (error) {
  console.error('\n❌ Error occurred during modernization:');
  console.error(error.message);
  process.exit(1);
}

function createTsConfig() {
  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      paths: {
        "@common/*": ["./packages/common/src/*"],
        "@admin/*": ["./packages/admin/src/*"],
        "@hours/*": ["./packages/hours/src/*"]
      },
      esModuleInterop: true
    },
    include: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    exclude: ["node_modules", "**/*.spec.ts", "**/*.test.ts", "**/*.test.tsx"]
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );
  console.log('  - Created root tsconfig.json');
}

function updateVitestConfig() {
  const vitestConfig = `/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/vite.config.ts',
        '**/vitest.setup.ts',
        '**/test/**',
      ],
    },
    alias: {
      '@common': resolve(__dirname, '../packages/common/src'),
      '@admin': resolve(__dirname, '../packages/admin/src'),
      '@hours': resolve(__dirname, '../packages/hours/src'),
    },
  },
});
`;
  
  fs.writeFileSync(
    path.join(__dirname, '../vitest.config.ts'),
    vitestConfig
  );
  console.log('  - Updated vitest.config.ts');
}

function updateVitestSetup() {
  const vitestSetup = `/**
 * Vitest setup file for global test configuration
 */

// Import Jest DOM for DOM testing utilities
import '@testing-library/jest-dom';

// Configure any global mocks or extensions
import { vi } from 'vitest';

// Firebase mocks
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
  })),
  onAuthStateChanged: vi.fn(() => vi.fn()), // Returns unsubscribe function
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDocs: vi.fn(() => ({ docs: [] })),
  getDoc: vi.fn(() => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()), // Returns unsubscribe function
  serverTimestamp: vi.fn(() => ({})),
}));

// Add globally available test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
`;
  
  fs.writeFileSync(
    path.join(__dirname, '../vitest.setup.ts'),
    vitestSetup
  );
  console.log('  - Updated vitest.setup.ts');
}

function createTypeDeclarations() {
  const commonDir = path.join(__dirname, '../packages/common/src/types');
  
  if (!fs.existsSync(commonDir)) {
    fs.mkdirSync(commonDir, { recursive: true });
  }
  
  const declarations = `// Type declarations for external modules
declare module '*.svg' {
  import React = require('react');
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.json' {
  const content: any;
  export default content;
}

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}
`;
  
  fs.writeFileSync(
    path.join(commonDir, 'declarations.d.ts'),
    declarations
  );
  console.log('  - Created type declarations');
}

function updateEslintConfig() {
  const eslintConfig = `import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prettier/prettier': 'warn'
    },
  },
  // TypeScript files configuration
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
  },
  // React files configuration
  {
    files: ['**/*.{jsx,tsx}'],
    extends: [
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
    ],
  },
  // Test files configuration
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);`;

  fs.writeFileSync(
    path.join(__dirname, '../eslint.config.js'),
    eslintConfig
  );
  console.log('  - Updated eslint.config.js');
} 