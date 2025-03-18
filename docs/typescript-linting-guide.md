# TypeScript and Linting Guidelines

This document outlines the TypeScript and linting standards for the Time Tracking 2.0 project, with specific guidance for code generation and AI-assisted development.

## Recent Improvements

- [x] Fixed TypeScript configuration to properly include test files
- [x] Added `.eslintignore` file for better linting performance
- [x] Updated GitHub workflows to ensure linting runs properly
- [x] Fixed linting errors in CI/CD pipeline
- [x] Improved build processes to validate TypeScript compliance

## TypeScript Configuration

The project uses a strict TypeScript configuration with the following key settings enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Our `tsconfig.json` has been updated to include test files in compilation:

```json
"include": [
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
  "packages/*/src/**/*.test.ts",
  "packages/*/src/**/*.test.tsx",
  "packages/*/tests/**/*.ts",
  "packages/*/tests/**/*.tsx",
  "packages/*/src/tests/**/*.ts",
  "packages/*/src/tests/**/*.tsx"
]
```

## ESLint Rules

ESLint is configured with the following rule sets:
- `eslint:recommended`
- `plugin:@typescript-eslint/recommended`
- `plugin:react/recommended`
- `plugin:react-hooks/recommended`

Key custom rules:
- `react/react-in-jsx-scope`: Off (not needed with modern JSX transform)
- `@typescript-eslint/no-explicit-any`: Warn (avoid `any` types where possible)
- `@typescript-eslint/no-unused-vars`: Warn with pattern exclusions (prefixing with `_`)
- `no-console`: Warn (only `console.warn` and `console.error` allowed)

## Strict TypeScript Rules for AI-Generated Code

When using AI to generate code, enforce these rules:

### 1. No `any` Type
```typescript
// ❌ Bad
const processData = (data: any) => {
  return data.value;
};

// ✅ Good
interface DataItem {
  value: string;
}

const processData = (data: DataItem) => {
  return data.value;
};
```

### 2. Proper Function Return Types
```typescript
// ❌ Bad
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ Good
interface PricedItem {
  price: number;
}

function calculateTotal(items: PricedItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### 3. Use TypeScript Utility Types
```typescript
// ❌ Bad
interface CreateUserParams {
  name: string;
  email: string;
  role: string;
}

interface UpdateUserParams {
  name?: string;
  email?: string;
  role?: string;
}

// ✅ Good
interface User {
  name: string;
  email: string;
  role: string;
}

type CreateUserParams = User;
type UpdateUserParams = Partial<User>;
```

### 4. Avoid Type Assertions When Possible
```typescript
// ❌ Bad
const element = document.getElementById('root') as HTMLDivElement;

// ✅ Good
const element = document.getElementById('root');
if (element instanceof HTMLDivElement) {
  // Now TypeScript knows it's an HTMLDivElement
}
```

### 5. Use Proper React Component Types
```typescript
// ❌ Bad
const Button = (props) => {
  return <button onClick={props.onClick}>{props.label}</button>;
};

// ✅ Good
interface ButtonProps {
  onClick: () => void;
  label: string;
}

const Button: React.FC<ButtonProps> = ({ onClick, label }) => {
  return <button onClick={onClick}>{label}</button>;
};
```

### 6. Prefer Interfaces for Object Shapes
```typescript
// ❌ Acceptable but not preferred
type User = {
  id: string;
  name: string;
};

// ✅ Preferred
interface User {
  id: string;
  name: string;
}
```

### 7. Use Enums for Fixed Sets of Values
```typescript
// ❌ Bad
const setStatus = (status: string) => {
  // ...
};

// ✅ Good
enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending',
}

const setStatus = (status: Status) => {
  // ...
};
```

### 8. Explicit Promise Typing
```typescript
// ❌ Bad
async function fetchUser(id: string) {
  const response = await fetch(`/users/${id}`);
  return response.json();
}

// ✅ Good
interface User {
  id: string;
  name: string;
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/users/${id}`);
  return response.json() as Promise<User>;
}
```

## Linting Don'ts

1. **Don't Disable ESLint Rules in Files**:
   ```typescript
   // ❌ Bad
   /* eslint-disable @typescript-eslint/no-explicit-any */
   ```

2. **Don't Use `@ts-ignore` or `@ts-nocheck`**:
   ```typescript
   // ❌ Bad
   // @ts-ignore
   const result = unsafeFunction();
   ```

3. **Don't Use Console Logs in Production Code**:
   ```typescript
   // ❌ Bad
   console.log('User data:', userData);
   
   // ✅ Good for debugging (but should be removed)
   console.warn('Deprecated method used');
   console.error('Failed to process request', error);
   ```

## Testing Guidelines

1. **Type Your Test Functions**:
   ```typescript
   // ❌ Bad
   it('should calculate total', () => {
     expect(calculateTotal([{price: 10}])).toBe(10);
   });
   
   // ✅ Good
   it('should calculate total', (): void => {
     const items: PricedItem[] = [{price: 10}];
     expect(calculateTotal(items)).toBe(10);
   });
   ```

2. **Use Typed Test Utilities**:
   ```typescript
   // ❌ Bad
   const renderComponent = () => {
     return render(<Component />);
   };
   
   // ✅ Good
   const renderComponent = (): RenderResult => {
     return render(<Component />);
   };
   ```

## Linting Process

1. **Run Linting Locally**:
   ```bash
   pnpm run lint
   ```

2. **Fix Automatically Fixable Issues**:
   ```bash
   pnpm run lint:fix
   ```

3. **Verify TypeScript Compilation**:
   ```bash
   pnpm -r exec tsc --noEmit
   ```

## CI/CD Integration

Our GitHub Actions workflows now automatically:
1. Update the TypeScript configuration for test files
2. Run linting checks
3. Run tests
4. Build the project only if linting and tests pass

## Known Issues and Exceptions

- **ErrorBoundary Component**: Must remain a class component due to React limitations
- **Type Declarations (*.d.ts)**: Excluded from linting as they often need to use `any`
- **Generated Files**: Source maps and other generated files are excluded from linting

## Best Practices for New Code

1. Start with proper interfaces/types before implementing functionality
2. Use React hooks with proper typing
3. Ensure all function parameters and return values are typed
4. Use TypeScript's built-in utility types where appropriate
5. Keep types close to their implementation
6. Export types with their implementations when needed by other components

By following these guidelines, we ensure that AI-generated code maintains the highest quality standards and integrates seamlessly with our existing codebase. 