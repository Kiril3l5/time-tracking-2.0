/**
 * Format a date to a localized string
 */
export function formatDate(date: Date | string | number): string {
  const dateObj = typeof date === 'object' ? date : new Date(date);
  return dateObj.toLocaleDateString();
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format a number as hours
 */
export function formatHours(hours: number): string {
  const wholePart = Math.floor(hours);
  const minutePart = Math.round((hours - wholePart) * 60);
  
  if (minutePart === 0) {
    return `${wholePart}h`;
  }
  
  return `${wholePart}h ${minutePart}m`;
}

/**
 * Format a string to title case
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
} 