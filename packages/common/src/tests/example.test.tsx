import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Example test', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should render a component', () => {
    const { container } = render(<div data-testid="test-component">Test Component</div>);
    // Use the most basic assertion without any jest-dom extensions
    expect(container.innerHTML).toContain('Test Component');
    expect(screen.getByTestId('test-component')).toBeTruthy();
  });
});
