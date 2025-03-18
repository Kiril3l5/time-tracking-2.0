// Type definitions for @testing-library/jest-dom
import '@testing-library/jest-dom';

declare global {
  namespace Vi {
    interface JestAssertion {
      toBeInTheDocument(): void;
      toBeVisible(): void;
      toBeDisabled(): void;
      toBeEnabled(): void;
      toBeEmpty(): void;
      toBeEmptyDOMElement(): void;
      toBeInvalid(): void;
      toBeRequired(): void;
      toBeValid(): void;
      toBeChecked(): void;
      toBePartiallyChecked(): void;
      toHaveAccessibleDescription(description?: string | RegExp): void;
      toHaveAccessibleName(name?: string | RegExp): void;
      toHaveAttribute(attr: string, value?: string | RegExp): void;
      toHaveClass(...classNames: string[]): void;
      toHaveFocus(): void;
      toHaveFormValues(values: Record<string, any>): void;
      toHaveStyle(css: string | Record<string, string>): void;
      toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace: boolean }): void;
      toHaveValue(value?: string | string[] | number | null): void;
      toContainElement(element: HTMLElement | null): void;
      toContainHTML(htmlText: string): void;
      toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): void;
    }
  }
} 