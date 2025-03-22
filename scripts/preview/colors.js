#!/usr/bin/env node

/**
 * ANSI Color Constants
 * 
 * Provides standardized color and formatting constants for terminal output.
 * Used throughout the scripts to ensure consistent styling.
 * 
 * @module preview/colors
 */

/**
 * ANSI escape sequences for colors and text formatting
 */
export const colors = {
  // Reset
  reset: '\x1b[0m',
  
  // Regular colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Bright colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  
  // Text formatting
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m'
};

/**
 * Styled text formatter functions
 * Apply color and formatting to strings
 */
export const styled = {
  /**
   * Apply formatting to text
   * @param {string} text - The text to format
   * @param {string} color - The color to apply
   * @returns {string} - Formatted text
   */
  format: (text, color) => `${color}${text}${colors.reset}`,
  
  // Basic colors
  red: (text) => styled.format(text, colors.red),
  green: (text) => styled.format(text, colors.green),
  yellow: (text) => styled.format(text, colors.yellow),
  blue: (text) => styled.format(text, colors.blue),
  magenta: (text) => styled.format(text, colors.magenta),
  cyan: (text) => styled.format(text, colors.cyan),
  
  // Formatting
  bold: (text) => styled.format(text, colors.bold),
  
  // Compound formatting
  error: (text) => styled.format(styled.format(text, colors.bold), colors.red),
  success: (text) => styled.format(styled.format(text, colors.bold), colors.green),
  warning: (text) => styled.format(styled.format(text, colors.bold), colors.yellow),
  info: (text) => styled.format(styled.format(text, colors.bold), colors.blue),
  
  /**
   * Create a header with a colored box around it
   * @param {string} text - The header text
   * @param {string} color - Color to use (default: cyan)
   * @returns {string} - Formatted header
   */
  header: (text, color = colors.cyan) => {
    const paddedText = ` ${text} `;
    const line = '='.repeat(paddedText.length);
    return `${color}${line}\n${paddedText}\n${line}${colors.reset}`;
  }
};

export default colors; 