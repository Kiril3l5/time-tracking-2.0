import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import RegisterForm from '@common/components/auth/RegisterForm';
import { useViewport } from '@common/hooks/useViewport';
import logo from '../assets/logo.svg';

/**
 * Admin portal registration page
 * 
 * Mobile-first design with responsive adjustments for larger screens
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
      {/* Mobile-optimized header */}
      <header className="bg-white py-4 px-4 shadow-sm">
        <div className="container mx-auto">
          <h1 className="text-xl font-semibold text-neutral-900">
            Time Tracking Admin
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
            logo={<img src={logo} alt="Time Tracking Admin" className="h-16 w-auto" />} 
            redirectUrl={from}
            defaultRole="manager" // Default role for admin portal users
            className={`${!isMobile && !isTablet ? 'shadow-lg' : ''}`}
            onLogin={handleLoginClick}
          />
          
          {/* Admin-specific note */}
          <div className="mt-6 text-center text-sm text-secondary-500">
            <p className="mb-1">Manager Registration</p>
            <p>For company managers and administrators</p>
          </div>
        </div>
      </main>

      {/* Footer with safe area handling for mobile */}
      <footer className="py-4 pb-safe-bottom px-4 bg-white border-t border-neutral-200 mt-auto">
        <div className="container mx-auto text-center text-sm text-secondary-500">
          <p>© 2024 Time Tracking 2.0</p>
        </div>
      </footer>
    </div>
  );
};

export default RegisterPage; 