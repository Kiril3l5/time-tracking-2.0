/**
 * Component Template
 * 
 * This file serves as a template for creating new React components.
 * Follow this structure when creating components to maintain consistency.
 */
import React from 'react';

// Types at the top
interface ComponentTemplateProps {
  /** Description of the prop */
  prop1: string;
  /** Description of the prop */
  prop2?: number;
  /** Description of the prop */
  children?: React.ReactNode;
}

/**
 * ComponentTemplate - Description of what this component does
 *
 * @example
 * ```tsx
 * <ComponentTemplate prop1="example">
 *   Content
 * </ComponentTemplate>
 * ```
 */
export const ComponentTemplate: React.FC<ComponentTemplateProps> = ({
  prop1,
  prop2 = 0, // Default values in destructuring
  children,
}) => {
  // State and hooks at the top
  const [state, setState] = React.useState(false);
  
  // Event handlers and other functions next
  const handleClick = () => {
    setState(!state);
  };
  
  // Computed values before render
  const computedValue = `${prop1}-${prop2}`;
  
  // Return JSX at the end
  return (
    <div className="relative p-4 rounded-lg">
      <h3>{prop1}</h3>
      {prop2 !== undefined && <p>Value: {prop2}</p>}
      <p>Computed: {computedValue}</p>
      <button onClick={handleClick}>
        {state ? 'On' : 'Off'}
      </button>
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
};

// Default export at the end
export default ComponentTemplate; 