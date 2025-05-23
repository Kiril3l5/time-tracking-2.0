import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LoginForm from '@common/components/auth/LoginForm';
import { useViewport } from '@common/hooks/ui/useViewport';

/**
 * Admin portal login page
 * 
 * Mobile-first design with responsive adjustments for larger screens
 */
const LoginPage = () => {
  const { isMobile, isTablet } = useViewport();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginError, _setLoginError] = useState<string | null>(null);

  // Get the return URL from location state or default to dashboard
  const from = location.state?.from || '/';

  // Handle registration redirect
  const handleRegisterClick = () => {
    navigate('/register', { state: { from } });
  };

  // Handle forgot password
  const handleForgotPassword = () => {
    navigate('/reset-password');
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
          {/* Show error message if authentication fails */}
          {loginError && (
            <div className="mb-4 p-3 bg-error-50 border border-error-200 text-error-700 rounded-md">
              {loginError}
            </div>
          )}
          
          {/* Login form from common package */}
          <LoginForm
            redirectUrl={from}
            className={`${!isMobile && !isTablet ? 'shadow-lg' : ''}`}
            onRegister={handleRegisterClick}
            onForgotPassword={handleForgotPassword}
          />
          
          {/* Admin-specific note */}
          <div className="mt-6 text-center text-sm text-secondary-500">
            <p className="mb-1">Admin &amp; Manager Portal</p>
            <p>For approvals and time management</p>
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

export default LoginPage; 