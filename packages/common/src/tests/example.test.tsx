import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Example test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should render a component', () => {
    render(<div data-testid="test-component">Test Component</div>);
    expect(screen.getByTestId('test-component')).toBeInTheDocument();
  });
}); 