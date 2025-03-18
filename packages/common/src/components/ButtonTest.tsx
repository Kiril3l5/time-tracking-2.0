import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button Component', () => {
  it('renders with the correct text', () => {
    render(<Button>Click me</Button>);
    
    const button = screen.getByTestId('button');
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Click me');
  });
  
  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByTestId('button');
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  it('can be disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByTestId('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
  
  it('applies different variants', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    let button = screen.getByTestId('button');
    expect(button.className).toContain('bg-primary');
    
    rerender(<Button variant="secondary">Secondary</Button>);
    button = screen.getByTestId('button');
    expect(button.className).toContain('bg-secondary');
    
    rerender(<Button variant="outline">Outline</Button>);
    button = screen.getByTestId('button');
    expect(button.className).toContain('bg-transparent');
  });
  
  it('applies different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByTestId('button');
    expect(button.className).toContain('py-1');
    
    rerender(<Button size="md">Medium</Button>);
    button = screen.getByTestId('button');
    expect(button.className).toContain('py-2');
    
    rerender(<Button size="lg">Large</Button>);
    button = screen.getByTestId('button');
    expect(button.className).toContain('py-3');
  });
}); 