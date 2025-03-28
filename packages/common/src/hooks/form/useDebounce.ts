/**
 * useDebounce hook
 * 
 * Provides debounced functions and values for optimizing form inputs,
 * API calls, and other actions that shouldn't happen on every keystroke.
 * Particularly useful for mobile to reduce network requests.
 */
import { useState, useEffect, useCallback } from 'react';

/**
 * Debounces a value. Returns the latest value after the specified delay.
 * 
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const [inputValue, setInputValue] = useState('');
 * const debouncedValue = useDebounce(inputValue, 500);
 * 
 * // Effect only runs when debouncedValue changes, not on every inputValue change
 * useEffect(() => {
 *   fetchData(debouncedValue);
 * }, [debouncedValue]);
 * ```
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Creates a debounced version of the provided callback.
 * The callback will only execute after the specified delay
 * has passed without the function being called again.
 * 
 * @param callback - The function to debounce
 * @param delay - The delay in milliseconds
 * @returns The debounced callback function
 * 
 * @example
 * ```tsx
 * const debouncedSearch = useDebouncedCallback((term: string) => {
 *   fetchSearchResults(term);
 * }, 300);
 * 
 * // In event handler
 * const handleChange = (e) => {
 *   setSearchTerm(e.target.value);
 *   debouncedSearch(e.target.value);
 * };
 * ```
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 500
) {
  // We're memoizing the debounced function itself
  return useCallback(
    debounce(callback, delay),
    [callback, delay]
  );
}

/**
 * Utility function to debounce a function (not a hook).
 * Used internally by useDebouncedCallback.
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait = 500
) {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default useDebounce; 