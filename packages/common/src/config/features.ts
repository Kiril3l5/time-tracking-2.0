/**
 * Feature Flags Configuration
 * 
 * This file contains feature flags that can be toggled to enable/disable
 * features across the application. Use this to implement progressive
 * development and control feature rollout.
 */

export const FEATURES = {
  // Mobile-specific features
  OFFLINE_SYNC: true,
  BIOMETRIC_AUTH: false,
  SWIPE_APPROVALS: true,
  LOCATION_TRACKING: false,
  PUSH_NOTIFICATIONS: false,
  
  // UI features
  ADVANCED_FILTERS: false,
  DARK_MODE: false,
  EXPERIMENTAL_UI: false,
  
  // Business logic features
  APPROVAL_WORKFLOWS: true,
  ADVANCED_REPORTING: false,
  TIME_SUGGESTIONS: false,
};

/**
 * Helper function to check if a feature is enabled
 * @param feature - Feature key to check
 * @returns boolean indicating if feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature] === true;
}

// Example usage:
// if (isFeatureEnabled('OFFLINE_SYNC')) {
//   // Enable offline sync functionality
// } 