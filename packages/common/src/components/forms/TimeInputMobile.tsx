import React from 'react';

interface TimeInputMobileProps {
  /** Label for the time input */
  label: string;
  /** Selected value (in minutes) */
  value: number | null;
  /** Callback for value change */
  onChange: (value: number | null) => void;
  /** Error message */
  error?: string;
  /** Help text */
  helpText?: string;
  /** Preset values to show (in minutes) */
  presets?: number[];
  /** Whether to show the preset buttons */
  showPresets?: boolean;
  /** Minimum value allowed (in minutes) */
  min?: number;
  /** Maximum value allowed (in minutes) */
  max?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Increment/decrement step when using arrows (in minutes) */
  incrementStep?: number;
  /** Format to display the time (hours, minutes or both) */
  displayFormat?: 'hours' | 'minutes' | 'both';
  /** Input id (for label association) */
  id?: string;
}

/**
 * Mobile-friendly Time Input component with quick presets
 * 
 * Allows selecting time durations with touch-friendly controls
 * and quick preset buttons for common values.
 * 
 * @example
 * <TimeInputMobile
 *   label="Hours Worked"
 *   value={hoursWorked}
 *   onChange={setHoursWorked}
 *   presets={[30, 60, 120, 240, 480]} // 30min, 1hr, 2hrs, 4hrs, 8hrs
 *   displayFormat="hours"
 * />
 */
export const TimeInputMobile: React.FC<TimeInputMobileProps> = ({
  label,
  value,
  onChange,
  error,
  helpText,
  presets = [30, 60, 120, 240, 480], // 30min, 1hr, 2hrs, 4hrs, 8hrs
  showPresets = true,
  min = 0,
  max = 1440, // 24 hours in minutes
  disabled = false,
  required = false,
  className = '',
  incrementStep = 15,
  displayFormat = 'both',
  id,
}) => {
  // Generate random ID if not provided
  const inputId = id || `time-${Math.random().toString(36).substr(2, 9)}`;
  
  // Handle numeric input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Handle empty input
    if (!inputValue.trim()) {
      onChange(null);
      return;
    }
    
    const numValue = parseFloat(inputValue);
    
    // Basic validation
    if (isNaN(numValue)) return;
    
    // Convert to minutes based on display format
    let valueInMinutes: number;
    if (displayFormat === 'hours') {
      valueInMinutes = Math.round(numValue * 60);
    } else if (displayFormat === 'minutes') {
      valueInMinutes = Math.round(numValue);
    } else {
      // If the input contains a decimal point, interpret as hours.minutes
      if (inputValue.includes('.')) {
        const [hours, minutes] = inputValue.split('.');
        valueInMinutes = (parseInt(hours) * 60) + parseInt(minutes.padEnd(2, '0').substring(0, 2));
      } else {
        // Otherwise assume hours
        valueInMinutes = numValue * 60;
      }
    }
    
    // Bounds checking
    const boundedValue = Math.min(Math.max(valueInMinutes, min), max);
    
    onChange(boundedValue);
  };
  
  // Format value for display
  const formatValue = (valueInMinutes: number | null): string => {
    if (valueInMinutes === null) return '';
    
    if (displayFormat === 'hours') {
      return (valueInMinutes / 60).toFixed(2);
    } else if (displayFormat === 'minutes') {
      return valueInMinutes.toString();
    } else {
      // Format as hours and minutes (decimal)
      return (valueInMinutes / 60).toFixed(2);
    }
  };
  
  // Handle increment/decrement
  const handleIncrement = () => {
    if (disabled) return;
    
    const currentValue = value || 0;
    const newValue = Math.min(currentValue + incrementStep, max);
    onChange(newValue);
  };
  
  const handleDecrement = () => {
    if (disabled) return;
    
    const currentValue = value || 0;
    const newValue = Math.max(currentValue - incrementStep, min);
    onChange(newValue);
  };
  
  // Select a preset value
  const selectPreset = (presetValue: number) => {
    if (disabled) return;
    onChange(presetValue);
  };
  
  // Format the label for each preset
  const formatPresetLabel = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = minutes / 60;
      return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
    }
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
      
      <div className="flex items-center">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || (value === null ? false : value <= min)}
          className="h-12 w-12 rounded-l-md border border-gray-300 flex items-center justify-center bg-gray-50"
          aria-label="Decrease time"
        >
          <span className="text-xl font-bold text-gray-500">-</span>
        </button>
        
        {/* Input */}
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={formatValue(value)}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          className={`
            block w-full px-4 py-3 border-y border-gray-300 
            text-center min-h-[44px] text-base
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${error ? 'border-red-300' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100 text-gray-500' : ''}
            touch-manipulation
          `}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
        />
        
        {/* Increment Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || (value === null ? false : value >= max)}
          className="h-12 w-12 rounded-r-md border border-gray-300 flex items-center justify-center bg-gray-50"
          aria-label="Increase time"
        >
          <span className="text-xl font-bold text-gray-500">+</span>
        </button>
        
        {/* Unit indicator */}
        <span className="ml-2 text-gray-500">
          {displayFormat === 'hours' ? 'hrs' : 
           displayFormat === 'minutes' ? 'min' : 
           'hrs'}
        </span>
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
      
      {/* Quick presets */}
      {showPresets && presets.length > 0 && (
        <div className="mt-3">
          <label className="text-xs text-gray-500 mb-1 block">Quick select:</label>
          <div className="flex flex-wrap gap-2">
            {presets.map((presetValue) => (
              <button
                key={presetValue}
                type="button"
                onClick={() => selectPreset(presetValue)}
                disabled={disabled}
                className={`
                  px-3 py-2 rounded-md text-sm font-medium min-h-[40px] min-w-[44px]
                  ${value === presetValue 
                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  touch-manipulation
                `}
              >
                {formatPresetLabel(presetValue)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeInputMobile; 