import React, { useRef, useEffect } from 'react';

interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownMobileProps {
  /** Label for the dropdown */
  label: string;
  /** Options array */
  options: DropdownOption[];
  /** Selected value */
  value: string | null;
  /** Callback for value change */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message */
  error?: string;
  /** Help text */
  helpText?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Callback when dropdown is focused */
  onFocus?: () => void;
  /** Callback when dropdown loses focus */
  onBlur?: () => void;
  /** Input id (for label association) */
  id?: string;
}

/**
 * Mobile-friendly Dropdown component
 * 
 * Uses the native select element for the best touch experience
 * on mobile devices, with custom styling to match the design system.
 * 
 * @example
 * <DropdownMobile
 *   label="Project"
 *   options={[
 *     { value: 'project1', label: 'Project 1' },
 *     { value: 'project2', label: 'Project 2' }
 *   ]}
 *   value={selectedProject}
 *   onChange={setSelectedProject}
 *   required
 * />
 */
export const DropdownMobile: React.FC<DropdownMobileProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  helpText,
  disabled = false,
  required = false,
  className = '',
  onFocus,
  onBlur,
  id,
}) => {
  // Generate random ID if not provided
  const inputId = id || `dropdown-${Math.random().toString(36).substr(2, 9)}`;
  
  // Handle select change
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node)
      ) {
        // Handle click outside if needed
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  return (
    <div className={`mb-4 ${className}`} ref={dropdownRef}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        {/* Native select (better for mobile) */}
        <select
          id={inputId}
          value={value || ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={`
            appearance-none block w-full px-4 py-3 pr-10 rounded-md shadow-sm
            min-h-[44px] text-base
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${error ? 'border-red-300' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100 text-gray-500' : ''}
            touch-manipulation
          `}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          
          {options.map((option) => (
            <option 
              key={option.value} 
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        {/* Dropdown arrow */}
        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-1 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
      
      {/* Help text */}
      {helpText && !error && (
        <p
          id={`${inputId}-help`}
          className="mt-1 text-sm text-gray-500"
        >
          {helpText}
        </p>
      )}
    </div>
  );
};

export default DropdownMobile; 