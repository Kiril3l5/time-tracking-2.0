import { useState, useEffect } from 'react';

/**
 * Types of available feature flags in the application
 */
export type FeatureFlag =
  | 'mobile-time-entry'
  | 'mobile-approvals'
  | 'mobile-reports'
  | 'dark-mode'
  | 'offline-mode'
  | 'biometric-auth'
  | 'beta-features';

/**
 * Default state for feature flags
 */
const DEFAULT_FLAGS = {
  'mobile-time-entry': true,
  'mobile-approvals': true,
  'mobile-reports': false,
  'dark-mode': false,
  'offline-mode': true,
  'biometric-auth': true,
  'beta-features': false,
};

/**
 * Hook to check if a feature flag is enabled
 * 
 * Allows for progressive feature rollout and A/B testing
 * by conditionally enabling features.
 * 
 * @param flag The feature flag to check
 * @returns Boolean indicating if the feature is enabled
 * 
 * @example
 * ```tsx
 * const isOfflineEnabled = useFeatureFlag('offline-mode');
 * 
 * return (
 *   <div>
 *     {isOfflineEnabled && <OfflineIndicator />}
 *   </div>
 * );
 * ```
 */
export const useFeatureFlag = (flag: FeatureFlag): boolean => {
  const [isEnabled, setIsEnabled] = useState<boolean>(DEFAULT_FLAGS[flag] || false);
  
  useEffect(() => {
    // In a real implementation, this would fetch from:
    // 1. Local storage override
    // 2. User preferences API
    // 3. Remote feature flag service
    const fetchFeatureFlag = async () => {
      try {
        // For now, just use the default flags
        // This would normally check localStorage or call an API
        const enabled = DEFAULT_FLAGS[flag] || false;
        setIsEnabled(enabled);
      } catch (error) {
        console.error(`Error fetching feature flag '${flag}':`, error);
        // Fall back to default
        setIsEnabled(DEFAULT_FLAGS[flag] || false);
      }
    };
    
    fetchFeatureFlag();
  }, [flag]);
  
  return isEnabled;
};

/**
 * Hook to check multiple feature flags at once
 * 
 * @param flags Array of feature flags to check
 * @returns Object with each flag name as a key and its enabled status as a value
 * 
 * @example
 * ```tsx
 * const { isDarkMode, isOfflineMode } = useFeatureFlags(['dark-mode', 'offline-mode']);
 * ```
 */
export const useFeatureFlags = (flags: FeatureFlag[]): Record<string, boolean> => {
  const [flagStates, setFlagStates] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    // Initialize with default values
    const initialStates = flags.reduce((acc, flag) => {
      acc[flag] = DEFAULT_FLAGS[flag] || false;
      return acc;
    }, {} as Record<string, boolean>);
    
    setFlagStates(initialStates);
    
    // In a real implementation, would fetch flag states from API
  }, [flags]);
  
  return flagStates;
};

export default useFeatureFlag; 