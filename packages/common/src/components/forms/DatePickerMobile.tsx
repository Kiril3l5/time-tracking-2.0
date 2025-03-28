import React from 'react';
import { format, isValid, parse } from 'date-fns';

interface DatePickerMobileProps {
  /** Label for the date picker */
  label: string;
  /** Selected date */
  value: Date | string | null;
  /** Callback for date change */
  onChange: (date: Date | null) => void;
  /** Error message */
  error?: string;
  /** Help text */
  helpText?: string;
  /** The minimum selectable date */
  minDate?: Date;
  /** The maximum selectable date */
  maxDate?: Date;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Date format to display (default: yyyy-MM-dd) */
  displayFormat?: string;
  /** Input id (for label association) */
  id?: string;
}

/**
 * Mobile-friendly Date Picker component
 * 
 * Uses the native date input on mobile devices for the best user experience
 * with touch controls and device-specific date pickers.
 * 
 * @example
 * <DatePickerMobile
 *   label="Start Date"
 *   value={startDate}
 *   onChange={setStartDate}
 *   minDate={new Date()}
 *   required
 * />
 */
export const DatePickerMobile: React.FC<DatePickerMobileProps> = ({
  label,
  value,
  onChange,
  error,
  helpText,
  minDate,
  maxDate,
  disabled = false,
  required = false,
  className = '',
  displayFormat = 'yyyy-MM-dd',
  id,
}) => {
  // Generate random ID if not provided
  const inputId = id || `date-${Math.random().toString(36).substr(2, 9)}`;
  
  // Handle native date input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateString = e.target.value;
    
    if (!dateString) {
      onChange(null);
      return;
    }
    
    // Parse from ISO format (yyyy-MM-dd)
    const date = parse(dateString, 'yyyy-MM-dd', new Date());
    
    if (isValid(date)) {
      onChange(date);
    }
  };
  
  // Convert Date objects to ISO string for input
  const getInputValue = (): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return format(value, 'yyyy-MM-dd');
  };
  
  // Format display value according to displayFormat
  const getDisplayValue = (): string => {
    if (!value) return '';
    
    const date = typeof value === 'string' 
      ? parse(value, 'yyyy-MM-dd', new Date())
      : value;
      
    return isValid(date) ? format(date, displayFormat) : '';
  };
  
  return (
    <div className={`mb-4 ${className}`}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          id={inputId}
          type="date"
          value={getInputValue()}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          min={minDate ? format(minDate, 'yyyy-MM-dd') : undefined}
          max={maxDate ? format(maxDate, 'yyyy-MM-dd') : undefined}
          className={`
            block w-full px-4 py-3 rounded-md shadow-sm
            min-h-[44px] text-base
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${error ? 'border-red-300' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100 text-gray-500' : ''}
            touch-manipulation
          `}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
        />
        
        {/* Display a date display for better format control */}
        {value && (
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            {getDisplayValue()}
          </div>
        )}
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

export default DatePickerMobile; 