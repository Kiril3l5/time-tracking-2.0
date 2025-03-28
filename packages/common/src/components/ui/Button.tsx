/**
 * Button Component
 * 
 * A mobile-optimized button component with various styles and sizes.
 * Follows touch-friendly sizing guidelines with minimum 44px height.
 */
import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button appearance variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Makes the button take up the full width of its container */
  fullWidth?: boolean;
  /** Shows a loading spinner */
  isLoading?: boolean;
  /** Button icon (optional) */
  icon?: React.ReactNode;
  /** Position of the icon */
  iconPosition?: 'left' | 'right';
}

/**
 * Button component optimized for mobile with touch-friendly sizing
 * 
 * @example
 * ```tsx
 * <Button onClick={handleClick} variant="primary">
 *   Submit
 * </Button>
 * ```
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  isLoading = false,
  icon,
  iconPosition = 'left',
  className = '',
  ...props
}) => {
  // Size classes - ensuring touch-friendly sizing on mobile
  const sizeClasses = {
    small: 'h-10 px-3 text-sm',
    medium: 'h-12 px-4', // Default 48px height (12 * 4px)
    large: 'h-14 px-6 text-lg',
  };

  // Variant classes using Tailwind
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
    secondary: 'bg-secondary-100 text-secondary-800 hover:bg-secondary-200 active:bg-secondary-300',
    outline: 'bg-transparent border border-primary-600 text-primary-600 hover:bg-primary-50 active:bg-primary-100',
    danger: 'bg-error-600 text-white hover:bg-error-700 active:bg-error-800',
    success: 'bg-success-600 text-white hover:bg-success-700 active:bg-success-800',
    ghost: 'bg-transparent text-primary-600 hover:bg-primary-50 active:bg-primary-100',
  };

  // Construct complete button classes
  const buttonClasses = [
    // Base classes
    'rounded-lg font-medium flex items-center justify-center transition-colors',
    // Size classes
    sizeClasses[size],
    // Variant classes
    variantClasses[variant],
    // Width classes
    fullWidth ? 'w-full' : '',
    // Disabled state
    isLoading || props.disabled ? 'opacity-50 pointer-events-none' : '',
    // Touch feedback for mobile
    'active:scale-[0.98] transform',
    // Custom classes passed as props
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={buttonClasses}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <span className="mr-2">{icon}</span>
          )}
          {children}
          {icon && iconPosition === 'right' && (
            <span className="ml-2">{icon}</span>
          )}
        </>
      )}
    </button>
  );
};

export default Button; 