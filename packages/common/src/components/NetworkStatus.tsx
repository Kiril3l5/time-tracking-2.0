import React, { useState, useEffect } from 'react';

interface NetworkStatusProps {
  offlineMessage?: string;
}

/**
 * NetworkStatus component
 * Displays a warning when the user is offline
 */
export const NetworkStatus: React.FC<NetworkStatusProps> = ({
  offlineMessage = 'You are currently offline. An internet connection is required to save changes.',
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Update network status when online/offline events occur
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Only render something when offline
  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-0 right-0 mx-auto w-full max-w-md px-4 z-50">
      <div className="bg-warning-50 border-l-4 border-warning p-4 rounded shadow-md">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            {/* Warning icon */}
            <svg
              className="h-5 w-5 text-warning"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-warning-700">{offlineMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to check if the user is online
 * Can be used in components that need to know the network status
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
