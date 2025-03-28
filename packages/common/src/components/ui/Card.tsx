/**
 * Card Component
 * 
 * A mobile-optimized card component with various styles and options.
 * Designed to be touch-friendly and work well in mobile layouts.
 */
import React from 'react';

// Types at the top
export interface CardProps {
  /** Card title (optional) */
  title?: React.ReactNode;
  /** Card subtitle (optional) */
  subtitle?: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Footer content (optional) */
  footer?: React.ReactNode;
  /** Makes the card take up the full width of its container */
  fullWidth?: boolean;
  /** Custom padding */
  padding?: 'none' | 'small' | 'medium' | 'large';
  /** Background color */
  background?: 'white' | 'gray' | 'primary-light';
  /** Border style */
  border?: 'none' | 'default' | 'highlight';
  /** Highlight color for border (when border is 'highlight') */
  highlightColor?: 'primary' | 'success' | 'warning' | 'error';
  /** Shadow size */
  shadow?: 'none' | 'small' | 'medium' | 'large';
  /** Makes the card interactive with hover/active states */
  interactive?: boolean;
  /** Callback for when card is clicked (only used with interactive=true) */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Card - A mobile-optimized container component for structured content
 *
 * @example
 * ```tsx
 * <Card title="Recent Activity" shadow="medium">
 *   <p>Card content goes here</p>
 * </Card>
 * ```
 */
export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  footer,
  fullWidth = true,
  padding = 'medium',
  background = 'white',
  border = 'default',
  highlightColor = 'primary',
  shadow = 'medium',
  interactive = false,
  onClick,
  className = '',
}) => {
  // Padding classes
  const paddingClasses = {
    none: '',
    small: 'p-2',
    medium: 'p-4',
    large: 'p-6',
  };

  // Background classes
  const backgroundClasses = {
    white: 'bg-white',
    gray: 'bg-gray-50',
    'primary-light': 'bg-primary-50',
  };

  // Border classes
  const borderClasses = {
    none: 'border-0',
    default: 'border border-gray-200',
    highlight: `border-l-4 border-${highlightColor}-500`,
  };

  // Shadow classes
  const shadowClasses = {
    none: '',
    small: 'shadow-sm',
    medium: 'shadow',
    large: 'shadow-lg',
  };

  // Interactive classes
  const interactiveClasses = interactive
    ? 'cursor-pointer touch-manipulation hover:bg-gray-50 active:bg-gray-100 transition-colors'
    : '';

  // Combine all classes
  const cardClasses = [
    'rounded-lg overflow-hidden',
    paddingClasses[padding],
    backgroundClasses[background],
    borderClasses[border],
    shadowClasses[shadow],
    interactiveClasses,
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ');

  // Card content
  const content = (
    <>
      {(title || subtitle) && (
        <div className={`${padding !== 'none' ? 'mb-4' : ''}`}>
          {title && (
            <h3 className="text-lg font-medium text-gray-900">
              {title}
            </h3>
          )}
          {subtitle && (
            <div className="text-sm text-gray-500 mt-1">
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div>{children}</div>
      {footer && (
        <div className={`${padding !== 'none' ? 'mt-4 pt-3 border-t border-gray-200' : ''}`}>
          {footer}
        </div>
      )}
    </>
  );

  // If interactive, wrap in a button
  if (interactive && onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={cardClasses}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClick();
          }
        }}
      >
        {content}
      </div>
    );
  }

  // Otherwise, render as a regular div
  return <div className={cardClasses}>{content}</div>;
};

// Default export at the end
export default Card; 