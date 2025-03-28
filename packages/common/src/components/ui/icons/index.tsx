/**
 * Icon Components
 * 
 * Common icons used throughout the application.
 * These are simple SVG icons wrapped as React components.
 */
import React from 'react';

interface IconProps {
  /** Override the default CSS class */
  className?: string;
}

/**
 * Home icon
 */
export const HomeIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);

/**
 * Clock icon for time entry
 */
export const ClockIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
    <path fill="currentColor" d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
  </svg>
);

/**
 * History icon
 */
export const HistoryIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
  </svg>
);

/**
 * User/profile icon
 */
export const UserIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

/**
 * Dashboard icon
 */
export const DashboardIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
  </svg>
);

/**
 * Check/approval icon
 */
export const ApprovalIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

/**
 * Reports/chart icon
 */
export const ReportsIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
  </svg>
);

/**
 * Settings/gear icon
 */
export const SettingsIcon: React.FC<IconProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
); 