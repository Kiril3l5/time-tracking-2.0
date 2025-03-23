/**
 * Firebase URL Extractor Module
 * 
 * Utilities for extracting, validating, and formatting URLs from Firebase deployment output.
 * This module is critical for parsing and processing URLs from Firebase deployment results,
 * making them available in various formats for displaying to users or using in automated systems.
 * 
 * Features:
 * - Extract hosting URLs from deployment output
 * - Extract channel IDs from URLs
 * - Validate URL formats
 * - Format URLs for various contexts (markdown, html, etc.)
 * - Generate formatted PR comments with preview links
 * 
 * @module firebase/url-extractor
 * @example
 * // Basic usage example
 * import * as urlExtractor from './firebase/url-extractor.js';
 * 
 * // Extract URLs from deployment output
 * const result = urlExtractor.extractHostingUrls({
 *   deploymentOutput: firebaseCommandOutput,
 *   verbose: true
 * });
 * 
 * if (result.success) {
 *   console.log('Extracted URLs:', result.urls);
 *   
 *   // Format URLs for display
 *   const formattedLinks = urlExtractor.formatUrls({
 *     urls: result.urls,
 *     format: 'markdown'
 *   });
 *   
 *   console.log('Markdown links:\n', formattedLinks.formatted);
 * }
 */

import * as logger from '../core/logger.js';
import { DeploymentError, ErrorAggregator } from '../core/error-handler.js';

/* global URL */

/**
 * Extract hosting URLs from Firebase deployment output
 * 
 * @function extractHostingUrls
 * @param {Object} options - Options for URL extraction
 * @param {string} options.deploymentOutput - Raw Firebase deployment command output
 * @param {boolean} [options.includeChannelId=false] - Include channel ID in the result
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for centralized error handling
 * @returns {Object} Extraction result containing:
 *   - success {boolean}: Whether URLs were successfully extracted
 *   - urls {string[]}: Array of extracted URLs
 *   - channelId {string}: Channel ID (if includeChannelId is true)
 *   - error {string}: Error message if extraction failed
 * @description Parses the raw text output from a Firebase deployment command
 * to extract deployment URLs. Handles both web.app and firebaseapp.com domains,
 * removing duplicates and providing optional channel ID extraction.
 * @example
 * // Extract URLs with verbose logging
 * const result = extractHostingUrls({
 *   deploymentOutput: `
 *     ✓ Deploy complete!
 *     Channel URL (admin): https://admin-myproject--preview-branch-12345.web.app
 *     Channel URL (client): https://client-myproject--preview-branch-12345.web.app
 *   `,
 *   verbose: true
 * });
 * 
 * console.log(result);
 * // {
 * //   success: true,
 * //   urls: [
 * //     'https://admin-myproject--preview-branch-12345.web.app',
 * //     'https://client-myproject--preview-branch-12345.web.app'
 * //   ]
 * // }
 * 
 * // Extract URLs and include the channel ID
 * const resultWithChannel = extractHostingUrls({
 *   deploymentOutput: outputText,
 *   includeChannelId: true
 * });
 * 
 * console.log(resultWithChannel);
 * // {
 * //   success: true,
 * //   urls: [...],
 * //   channelId: 'preview-branch-12345'
 * // }
 */
export function extractHostingUrls(options) {
  const {
    deploymentOutput,
    includeChannelId = false,
    verbose = false,
    errorTracker
  } = options;
  
  if (!deploymentOutput) {
    if (verbose) {
      logger.warn('No deployment output provided for URL extraction');
    }
    
    const error = new DeploymentError(
      'No deployment output provided for URL extraction',
      'url-extraction',
      null,
      'Ensure the deployment command executed successfully and produced output'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return { 
      success: false, 
      error: error.message, 
      urls: [] 
    };
  }
  
  try {
    // Extract all hosting URLs (both web.app and firebaseapp.com)
    // Original regex patterns
    const webAppUrlRegex = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.web\.app/g;
    const firebaseUrlRegex = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*--[a-zA-Z0-9][a-zA-Z0-9-]*\.firebaseapp\.com/g;
    
    // Enhanced patterns to handle more URL formats, including site URLs without channels
    const enhancedWebAppUrlRegex = /https:\/\/([a-zA-Z0-9][a-zA-Z0-9-]*(?:--[a-zA-Z0-9][a-zA-Z0-9-]*)?)\.web\.app/g;
    const enhancedFirebaseUrlRegex = /https:\/\/([a-zA-Z0-9][a-zA-Z0-9-]*(?:--[a-zA-Z0-9][a-zA-Z0-9-]*)?)\.firebaseapp\.com/g;
    
    // Also check for the Channel URL format in the output
    const channelUrlRegex = /Channel URL \([^)]+\): (https:\/\/[^\s]+)/g;
    
    // Extract URLs using all patterns
    const webAppUrls = [...new Set(deploymentOutput.match(enhancedWebAppUrlRegex) || [])];
    const firebaseUrls = [...new Set(deploymentOutput.match(enhancedFirebaseUrlRegex) || [])];
    
    // Also check for channel URLs directly mentioned
    let channelUrls = [];
    const channelMatches = [...deploymentOutput.matchAll(channelUrlRegex)];
    if (channelMatches.length > 0) {
      channelUrls = channelMatches.map(match => match[1]);
    }
    
    // Combine and deduplicate URLs
    const allUrls = [...new Set([...webAppUrls, ...firebaseUrls, ...channelUrls])];
    
    if (allUrls.length === 0) {
      if (verbose) {
        logger.warn('No Firebase hosting URLs found in deployment output');
      }
      
      const error = new DeploymentError(
        'No Firebase hosting URLs found in deployment output',
        'url-extraction',
        null,
        'Check if the deployment completed successfully and generated hosting URLs'
      );
      
      if (errorTracker) {
        errorTracker.addError(error);
      }
      
      return {
        success: false,
        error: error.message,
        urls: []
      };
    }
    
    const result = {
      success: true,
      urls: allUrls
    };
    
    // Extract channel ID if requested
    if (includeChannelId && allUrls.length > 0) {
      const channelId = extractChannelId(allUrls[0], errorTracker);
      if (channelId) {
        result.channelId = channelId;
      }
    }
    
    return result;
  } catch (err) {
    if (verbose) {
      logger.error(`Error extracting URLs: ${err.message}`);
    }
    
    const error = new DeploymentError(
      'Failed to extract URLs from deployment output',
      'url-extraction',
      err,
      'Check the deployment output format or Firebase CLI version'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return {
      success: false,
      error: error.message,
      urls: []
    };
  }
}

/**
 * Extract channel ID from a Firebase hosting URL
 * 
 * @function extractChannelId
 * @param {string} url - Firebase hosting URL (web.app or firebaseapp.com)
 * @param {ErrorAggregator} [errorTracker] - Error tracker for centralized error handling
 * @returns {string|null} Extracted channel ID or null if not found/invalid
 * @description Parses a Firebase hosting URL to extract the channel ID portion.
 * This function works with both web.app and firebaseapp.com domains and handles
 * different URL formats that Firebase might generate.
 * @example
 * // Extract channel ID from a web.app URL
 * const channelId = extractChannelId('https://admin-myproject--preview-branch-abc123.web.app');
 * console.log(channelId); // 'preview-branch-abc123'
 * 
 * // Extract channel ID from a firebaseapp.com URL
 * const channelId2 = extractChannelId('https://client-myproject--pr-45-20230615.firebaseapp.com');
 * console.log(channelId2); // 'pr-45-20230615'
 * 
 * // Handle invalid URL
 * const invalidResult = extractChannelId('https://example.com');
 * console.log(invalidResult); // null
 */
export function extractChannelId(url, errorTracker) {
  if (!url || typeof url !== 'string') {
    const error = new DeploymentError(
      'Invalid URL provided for channel ID extraction',
      'channel-extraction',
      null,
      'Provide a valid Firebase hosting URL'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return null;
  }
  
  try {
    // Parse the URL to work with its components
    const parsedUrl = new URL(url);
    
    // Check if it's a Firebase hosting URL (web.app or firebaseapp.com)
    if (!parsedUrl.hostname.endsWith('.web.app') && !parsedUrl.hostname.endsWith('.firebaseapp.com')) {
      return null;
    }
    
    // Extract the channel ID from the hostname
    // Format: site-project--channel-id.web.app or site-project--channel-id.firebaseapp.com
    const hostnameParts = parsedUrl.hostname.split('--');
    if (hostnameParts.length < 2) {
      return null;
    }
    
    // The channel ID is after the -- separator, but we need to remove the domain suffix
    const channelWithDomain = hostnameParts[1];
    return channelWithDomain
      .replace('.web.app', '')
      .replace('.firebaseapp.com', '');
  } catch (error) {
    // Invalid URL format
    if (errorTracker) {
      errorTracker.addError(new DeploymentError(
        'Failed to parse URL for channel ID extraction',
        'channel-extraction',
        error,
        'Ensure the URL is in a valid format'
      ));
    }
    
    return null;
  }
}

/**
 * Format URLs into various presentation formats
 * 
 * @function formatUrls
 * @param {Object} options - Formatting options
 * @param {string[]} options.urls - Array of URLs to format
 * @param {string} [options.format='markdown'] - Output format: 'markdown', 'html', 'plain'
 * @param {string} [options.siteNames] - Optional mapping of site names for labeling
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for centralized error handling
 * @returns {Object} Formatting result containing:
 *   - success {boolean}: Whether formatting was successful
 *   - formatted {string}: Formatted URL string
 *   - error {string}: Error message if formatting failed
 * @description Formats a list of URLs into a presentable format for display.
 * Supports multiple output formats and can label URLs based on site names.
 * @example
 * // Format URLs as Markdown links
 * const result = formatUrls({
 *   urls: [
 *     'https://admin-myproject--preview-branch.web.app',
 *     'https://client-myproject--preview-branch.web.app'
 *   ],
 *   format: 'markdown',
 *   siteNames: {
 *     'admin': 'Admin Dashboard',
 *     'client': 'Client Portal'
 *   }
 * });
 * 
 * console.log(result.formatted);
 * // [Admin Dashboard](https://admin-myproject--preview-branch.web.app)
 * // [Client Portal](https://client-myproject--preview-branch.web.app)
 * 
 * // Format URLs as HTML links
 * const htmlResult = formatUrls({
 *   urls: ['https://example--preview.web.app'],
 *   format: 'html'
 * });
 * 
 * console.log(htmlResult.formatted);
 * // <a href="https://example--preview.web.app" target="_blank">example</a>
 */
export function formatUrls(options) {
  const {
    urls,
    format = 'markdown',
    siteNames = {},
    errorTracker
  } = options;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    const error = new DeploymentError(
      'No URLs provided for formatting',
      'url-formatting',
      null,
      'Ensure URLs were successfully extracted from the deployment output'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return {
      success: false,
      error: error.message,
      formatted: ''
    };
  }
  
  try {
    const formattedUrls = urls.map(url => {
      try {
        // Extract site name from URL for labeling
        let siteName = '';
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        
        // Format: site-project--channel-id.web.app
        const siteProject = hostname.split('--')[0];
        if (siteProject) {
          // Get just the site part (before any dash followed by project)
          const siteParts = siteProject.split('-');
          if (siteParts.length > 0) {
            siteName = siteParts[0];
            
            // Use custom site name if provided
            if (siteNames[siteName]) {
              siteName = siteNames[siteName];
            }
          }
        }
        
        // Fallback if we couldn't extract a good name
        if (!siteName) {
          siteName = 'Preview';
        }
        
        // Format based on requested output format
        switch (format.toLowerCase()) {
          case 'html':
            return `<a href="${url}" target="_blank">${siteName}</a>`;
          case 'markdown':
            return `[${siteName}](${url})`;
          case 'plain':
          default:
            return `${siteName}: ${url}`;
        }
      } catch (err) {
        // Log but continue processing other URLs
        logger.warn(`Error formatting URL '${url}': ${err.message}`);
        
        // Add to error tracker but don't fail completely
        if (errorTracker) {
          errorTracker.addWarning(new DeploymentError(
            `Error formatting URL '${url}'`,
            'url-formatting',
            err,
            'URL may be malformed'
          ));
        }
        
        return url; // Return the raw URL as fallback
      }
    });
    
    return {
      success: true,
      formatted: formattedUrls.join('\n')
    };
  } catch (err) {
    const error = new DeploymentError(
      'Failed to format URLs',
      'url-formatting',
      err,
      'Check the URL format and try again'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return {
      success: false,
      error: error.message,
      formatted: ''
    };
  }
}

/**
 * Format a PR comment with preview links
 * 
 * @function formatPRComment
 * @param {Object} options - PR comment options
 * @param {string[]} options.urls - Array of preview URLs
 * @param {string} [options.prNumber] - Pull request number
 * @param {string} [options.branchName] - Branch name
 * @param {string} [options.deploymentTarget] - Deployment target name
 * @param {string} [options.siteNames] - Optional mapping of site names for labeling
 * @param {ErrorAggregator} [options.errorTracker] - Error tracker for centralized error handling
 * @returns {Object} Formatting result containing:
 *   - success {boolean}: Whether comment generation was successful
 *   - comment {string}: Formatted PR comment
 *   - error {string}: Error message if generation failed
 * @description Generates a formatted comment for pull requests containing
 * preview deployment links with context information about the deployment.
 * @example
 * // Generate a PR comment with preview links
 * const result = formatPRComment({
 *   urls: [
 *     'https://admin-myproject--pr-123.web.app',
 *     'https://client-myproject--pr-123.web.app'
 *   ],
 *   prNumber: '123',
 *   branchName: 'feature/new-login',
 *   deploymentTarget: 'preview'
 * });
 * 
 * console.log(result.comment);
 * // ## 🚀 Preview Deployment for PR #123
 * // 
 * // **Branch:** feature/new-login
 * // **Environment:** preview
 * // 
 * // ### Preview Links:
 * // - [admin](https://admin-myproject--pr-123.web.app)
 * // - [client](https://client-myproject--pr-123.web.app)
 */
export function formatPRComment(options) {
  const {
    urls,
    prNumber,
    branchName,
    deploymentTarget = 'preview',
    siteNames = {},
    errorTracker
  } = options;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    const error = new DeploymentError(
      'No URLs provided for PR comment generation',
      'pr-comment',
      null,
      'Ensure URLs were successfully extracted from the deployment output'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return {
      success: false,
      error: error.message,
      comment: ''
    };
  }
  
  try {
    // Format the URLs as markdown links
    const formattedUrlsResult = formatUrls({
      urls,
      format: 'markdown',
      siteNames,
      errorTracker
    });
    
    if (!formattedUrlsResult.success) {
      return {
        success: false,
        error: formattedUrlsResult.error,
        comment: ''
      };
    }
    
    // Create PR comment with context
    let comment = `## 🚀 Preview Deployment`;
    
    // Add PR number if available
    if (prNumber) {
      comment += ` for PR #${prNumber}`;
    }
    
    comment += '\n\n';
    
    // Add branch name if available
    if (branchName) {
      comment += `**Branch:** ${branchName}\n`;
    }
    
    // Add deployment target
    comment += `**Environment:** ${deploymentTarget}\n\n`;
    
    // Add preview links
    comment += `### Preview Links:\n`;
    const linkLines = formattedUrlsResult.formatted.split('\n');
    linkLines.forEach(link => {
      comment += `- ${link}\n`;
    });
    
    return {
      success: true,
      comment
    };
  } catch (err) {
    const error = new DeploymentError(
      'Failed to generate PR comment',
      'pr-comment',
      err,
      'Check the URL format and try again'
    );
    
    if (errorTracker) {
      errorTracker.addError(error);
    }
    
    return {
      success: false,
      error: error.message,
      comment: ''
    };
  }
}

/**
 * Check if a URL is a valid Firebase hosting URL
 * 
 * @function isValidFirebaseUrl
 * @param {string} url - URL to validate
 * @param {ErrorAggregator} [errorTracker] - Error tracker for centralized error handling
 * @returns {boolean} True if URL is a valid Firebase hosting URL
 * @description Validates if a given URL matches the pattern of a Firebase hosting URL.
 * Supports both web.app and firebaseapp.com domains.
 * @example
 * // Check if a URL is a valid Firebase hosting URL
 * const isValid = isValidFirebaseUrl('https://admin-myproject--pr-123.web.app');
 * console.log(isValid); // true
 * 
 * const isInvalid = isValidFirebaseUrl('https://example.com');
 * console.log(isInvalid); // false
 */
export function isValidFirebaseUrl(url, errorTracker) {
  if (!url || typeof url !== 'string') {
    if (errorTracker) {
      errorTracker.addWarning(new DeploymentError(
        'Invalid URL provided for validation',
        'url-validation',
        null,
        'Provide a valid URL string'
      ));
    }
    
    return false;
  }
  
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname.endsWith('.web.app') ||
      parsedUrl.hostname.endsWith('.firebaseapp.com')
    );
  } catch (error) {
    if (errorTracker) {
      errorTracker.addWarning(new DeploymentError(
        'Failed to parse URL for validation',
        'url-validation',
        error,
        'Ensure the URL is in a valid format'
      ));
    }
    
    return false;
  }
}

export default {
  extractHostingUrls,
  extractChannelId,
  formatUrls,
  formatPRComment,
  isValidFirebaseUrl
}; 