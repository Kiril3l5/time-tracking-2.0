import React from 'react';

export type ButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
};

/**
 * Button component for common use across the application
 */
export const Button = ({ 
  onClick, 
  disabled = false, 
  variant = 'primary',
  size = 'md',
  children,
  type = 'button',
  className = ''
}: ButtonProps) => {
  const baseClasses = "rounded font-medium focus:outline-none";
  
  const variantClasses = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    secondary: "bg-secondary text-white hover:bg-secondary-dark",
    outline: "bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50"
  };
  
  const sizeClasses = {
    sm: "py-1 px-2 text-sm",
    md: "py-2 px-4 text-base",
    lg: "py-3 px-6 text-lg"
  };
  
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={classes}
      data-testid="button"
      type={type}
    >
      {children}
    </button>
  );
}; 