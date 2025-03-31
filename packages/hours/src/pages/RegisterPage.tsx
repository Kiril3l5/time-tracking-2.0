import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import RegisterForm from '@common/components/auth/RegisterForm';
import { useViewport } from '@common/hooks/ui/useViewport';

/**
 * Hours portal registration page
 * 
 * Mobile-first design with responsive adjustments for larger screens
 * Optimized for field workers and contractors
 */
const RegisterPage = () => {
  const { isMobile, isTablet } = useViewport();
  const navigate = useNavigate();
  const location = useLocation();
  const [registrationError, _setRegistrationError] = useState<string | null>(null);

  // Get the return URL from location state or default to dashboard
  const from = location.state?.from || '/';

  // Handle login redirect
  const handleLoginClick = () => {
    navigate('/login', { state: { from } });
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Mobile-optimized header with safe area handling */}
      <header className="bg-primary-500 text-white py-4 pt-safe-top px-4 shadow-sm">
        <div className="container mx-auto">
          <h1 className="text-xl font-semibold">
            Hours Portal
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className={`w-full max-w-md ${isMobile ? 'px-0' : 'px-8 py-6'}`}>
          {/* Show error message if registration fails */}
          {registrationError && (
            <div className="mb-4 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
              {registrationError}
            </div>
          )}
          
          {/* Registration form from common package */}
          <RegisterForm
            redirectUrl={from}
            defaultRole="user" // Default role for workers
            className={`${!isMobile && !isTablet ? 'shadow-lg' : ''}`}
            onLogin={handleLoginClick}
          />
          
          {/* Worker-specific note */}
          <div className="mt-6 text-center text-sm text-secondary-500">
            <p className="mb-1">Worker Registration</p>
            <p>For field workers and contractors</p>
          </div>
        </div>
      </main>

      {/* Footer with safe area handling for mobile */}
      <footer className="py-4 pb-safe-bottom px-4 bg-white border-t border-neutral-200 mt-auto">
        <div className="container mx-auto text-center text-sm text-secondary-500">
          <p>© 2024 Time Tracking 2.0</p>
          <p className="text-xs mt-1">Quick tracking for your hours</p>
        </div>
      </footer>
    </div>
  );
};

export default RegisterPage; 