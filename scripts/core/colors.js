#!/usr/bin/env node

/**
 * ANSI Color Constants Module
 * 
 * Provides standardized color and formatting constants for terminal output.
 * Used throughout the scripts to ensure consistent styling and visual hierarchy
 * in command-line interfaces.
 * 
 * Features:
 * - Comprehensive set of ANSI color codes for text and backgrounds
 * - Text formatting options (bold, dim, italic, etc.)
 * - Helper functions for applying colors to strings
 * - Semantic formatting for status messages (error, success, etc.)
 * - Support for nested and compound formatting
 * 
 * @module preview/colors
 * @example
 * // Basic usage of color constants
 * import { colors, styled } from './core/colors.js';
 * 
 * // Apply colors directly using ANSI codes
 * console.log(`${colors.green}This text is green${colors.reset}`);
 * console.log(`${colors.bgBlue}${colors.yellow}Yellow text on blue background${colors.reset}`);
 * 
 * // Use helper functions for cleaner code
 * console.log(styled.green('This text is green'));
 * console.log(styled.error('Error message in red and bold'));
 * console.log(styled.header('Important Section', colors.magenta));
 */

/**
 * ANSI escape sequences for colors and text formatting
 * 
 * @const {Object} colors
 * @description Complete collection of ANSI escape codes for terminal text styling.
 * Each property is an ANSI escape sequence that can be used in console output.
 * Always remember to use colors.reset at the end of colored text to prevent
 * color bleeding into subsequent output.
 * @example
 * // Direct usage
 * console.log(`${colors.cyan}${colors.bold}Important:${colors.reset} This is highlighted`);
 * 
 * // Combining colors and styles
 * console.log(`${colors.bgYellow}${colors.black}Warning Message${colors.reset}`);
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
 * 
 * @const {Object} styled
 * @description Collection of functions that apply ANSI color and formatting to text,
 * automatically handling the reset code. These functions make it easier to apply 
 * styling without manual string concatenation and ensure proper reset of styles.
 * @example
 * // Basic color formatting
 * console.log(styled.green('Success message'));
 * console.log(styled.blue('Informational message'));
 * 
 * // Semantic status formatting
 * console.log(styled.error('Operation failed'));
 * console.log(styled.success('Operation completed'));
 * 
 * // Section headers
 * console.log(styled.header('Configuration', colors.blue));
 */
export const styled = {
  /**
   * Apply formatting to text
   * 
   * @function format
   * @param {string} text - The text to format
   * @param {string} color - The color or format to apply (ANSI escape sequence)
   * @returns {string} - Formatted text with proper reset code
   * @description Core formatting function that applies an ANSI color or style to
   * text and automatically appends the reset code. All other styling functions
   * use this function internally.
   * @example
   * // Apply custom formatting
   * const warning = styled.format('Warning!', colors.yellow + colors.bold);
   * console.log(warning);
   */
  format: (text, color) => `${color}${text}${colors.reset}`,
  
  // Basic colors
  /**
   * Format text in red
   * @function red
   * @param {string} text - Text to format
   * @returns {string} - Red-colored text
   */
  red: (text) => styled.format(text, colors.red),
  
  /**
   * Format text in green
   * @function green
   * @param {string} text - Text to format
   * @returns {string} - Green-colored text
   */
  green: (text) => styled.format(text, colors.green),
  
  /**
   * Format text in yellow
   * @function yellow
   * @param {string} text - Text to format
   * @returns {string} - Yellow-colored text
   */
  yellow: (text) => styled.format(text, colors.yellow),
  
  /**
   * Format text in blue
   * @function blue
   * @param {string} text - Text to format
   * @returns {string} - Blue-colored text
   */
  blue: (text) => styled.format(text, colors.blue),
  
  /**
   * Format text in magenta
   * @function magenta
   * @param {string} text - Text to format
   * @returns {string} - Magenta-colored text
   */
  magenta: (text) => styled.format(text, colors.magenta),
  
  /**
   * Format text in cyan
   * @function cyan
   * @param {string} text - Text to format
   * @returns {string} - Cyan-colored text
   */
  cyan: (text) => styled.format(text, colors.cyan),
  
  // Formatting
  /**
   * Format text in bold
   * @function bold
   * @param {string} text - Text to format
   * @returns {string} - Bold text
   */
  bold: (text) => styled.format(text, colors.bold),
  
  // Compound formatting
  /**
   * Format text as an error (bold red)
   * @function error
   * @param {string} text - Text to format
   * @returns {string} - Bold red text for errors
   * @example
   * console.log(styled.error('Failed to connect to database'));
   */
  error: (text) => styled.format(styled.format(text, colors.bold), colors.red),
  
  /**
   * Format text as a success message (bold green)
   * @function success
   * @param {string} text - Text to format
   * @returns {string} - Bold green text for success
   * @example
   * console.log(styled.success('File uploaded successfully'));
   */
  success: (text) => styled.format(styled.format(text, colors.bold), colors.green),
  
  /**
   * Format text as a warning (bold yellow)
   * @function warning
   * @param {string} text - Text to format
   * @returns {string} - Bold yellow text for warnings
   * @example
   * console.log(styled.warning('Disk space is low'));
   */
  warning: (text) => styled.format(styled.format(text, colors.bold), colors.yellow),
  
  /**
   * Format text as an info message (bold blue)
   * @function info
   * @param {string} text - Text to format
   * @returns {string} - Bold blue text for information
   * @example
   * console.log(styled.info('Processing started at 12:00'));
   */
  info: (text) => styled.format(styled.format(text, colors.bold), colors.blue),
  
  /**
   * Create a header with a colored box around it
   * 
   * @function header
   * @param {string} text - The header text
   * @param {string} [color=colors.cyan] - Color to use for the header
   * @returns {string} - Formatted header with decorative borders
   * @description Creates a visually distinct header with decorative borders,
   * useful for separating sections in console output. The header is padded
   * and surrounded by separator lines made of equals signs.
   * @example
   * // Create a cyan header (default)
   * console.log(styled.header('Configuration Settings'));
   * 
   * // Create a custom colored header
   * console.log(styled.header('Warning Section', colors.yellow));
   */
  header: (text, color = colors.cyan) => {
    const paddedText = ` ${text} `;
    const line = '='.repeat(paddedText.length);
    return `${color}${line}\n${paddedText}\n${line}${colors.reset}`;
  }
};

export default colors; 