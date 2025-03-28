/**
 * TextInput Component
 * 
 * A mobile-optimized text input component with touch-friendly sizing.
 * Includes variants for different types of text input (text, number, email, etc.)
 */
import React, { forwardRef } from 'react';

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label */
  label?: string;
  /** Help text displayed below the input */
  helpText?: string;
  /** Error message */
  error?: string;
  /** Input size */
  size?: 'small' | 'medium' | 'large';
  /** Makes the input take the full width of its container */
  fullWidth?: boolean;
  /** Icon to display at the start of the input */
  startIcon?: React.ReactNode;
  /** Icon to display at the end of the input */
  endIcon?: React.ReactNode;
  /** Callback for clicking the end icon */
  onEndIconClick?: () => void;
}

/**
 * TextInput - A mobile-optimized text input component
 * 
 * @example
 * ```tsx
 * <TextInput 
 *   label="Email" 
 *   type="email" 
 *   placeholder="your@email.com" 
 *   onChange={handleChange} 
 * />
 * ```
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({
    label,
    helpText,
    error,
    size = 'medium',
    fullWidth = true,
    startIcon,
    endIcon,
    onEndIconClick,
    className = '',
    id,
    disabled,
    ...rest
  }, ref) => {
    // Generate a unique ID if none provided
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;
    
    // Size classes - ensuring touch-friendly sizing for mobile
    const sizeClasses = {
      small: 'h-10 py-2 text-sm',
      medium: 'h-12 py-3', // Default 48px height (12 * 4px)
      large: 'h-14 py-4 text-lg',
    };
    
    // Icon padding adjustments
    const iconPaddingLeft = startIcon ? 'pl-10' : 'pl-3';
    const iconPaddingRight = endIcon ? 'pr-10' : 'pr-3';
    
    // Input classes
    const inputClasses = [
      // Base styles
      'block bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 touch-manipulation',
      // Size
      sizeClasses[size],
      // Width
      fullWidth ? 'w-full' : '',
      // Icon padding
      iconPaddingLeft,
      iconPaddingRight,
      // State styles
      disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : '',
      error ? 'border-red-500 focus:ring-red-500 focus:border-red-500 placeholder-red-300' : 'border-gray-300',
      // Custom styles
      className,
    ].filter(Boolean).join(' ');
    
    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label 
            htmlFor={inputId} 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {startIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
              {startIcon}
            </div>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
            {...rest}
          />
          
          {endIcon && (
            <div 
              className={`
                absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500
                ${onEndIconClick ? 'cursor-pointer' : 'pointer-events-none'}
              `}
              onClick={onEndIconClick}
            >
              {endIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p 
            id={`${inputId}-error`} 
            className="mt-1 text-sm text-red-600"
          >
            {error}
          </p>
        )}
        
        {!error && helpText && (
          <p 
            id={`${inputId}-help`} 
            className="mt-1 text-sm text-gray-500"
          >
            {helpText}
          </p>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';

export default TextInput; 