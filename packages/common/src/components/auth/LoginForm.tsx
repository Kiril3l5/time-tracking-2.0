import React, { useState, useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { 
  getRememberedUser, 
  getLastUser, 
  isBiometricAvailable, 
  isBiometricEnabled
} from '../../firebase/auth/auth-service';
import { useViewport } from '../../hooks/ui/useViewport';
import { useFeatureFlag } from '../../hooks/features/useFeatureFlag';

interface LoginFormProps {
  // Optional redirect URL after successful login
  redirectUrl?: string;
  // Optional logo or branding component
  logo?: React.ReactNode;
  // Custom styles for the container
  className?: string;
  // Option to hide the "Remember me" checkbox
  hideRememberMe?: boolean;
  // Option to hide the "Forgot password" link
  hideForgotPassword?: boolean;
  // Callback for when user clicks "Forgot password"
  onForgotPassword?: () => void;
  // Callback for when user clicks "Register"
  onRegister?: () => void;
}

const LoginForm = ({
  redirectUrl = '/',
  logo,
  className = '',
  hideRememberMe = false,
  hideForgotPassword = false,
  onForgotPassword,
  onRegister,
}: LoginFormProps) => {
  // Feature flags
  const isBiometricFeatureEnabled = useFeatureFlag('biometric-auth');
  
  // State for form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  
  // States for form handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [lastLoggedInUser, setLastLoggedInUser] = useState<string | null>(null);
  
  // Get auth context
  const { login } = useAuth();
  
  // Get viewport size for responsive behavior
  const { isMobile } = useViewport();
  
  // Effect to check biometric availability and setup remembered user
  useEffect(() => {
    const setupLoginForm = async () => {
      try {
        // Check for remembered user email and prefill
        const rememberedUser = getRememberedUser();
        if (rememberedUser) {
          setEmail(rememberedUser);
          setRememberMe(true);
        }
        
        // Check for biometric authentication availability
        if (isBiometricFeatureEnabled) {
          // Check device/browser support
          const deviceSupported = isBiometricAvailable();
          
          if (deviceSupported) {
            // Get the last user (even if not "remembered")
            const lastUser = getLastUser();
            if (lastUser) {
              setLastLoggedInUser(lastUser);
              
              // Check if this user has biometric enabled
              const isBiometricEnabledForUser = await isBiometricEnabled(lastUser);
              setBiometricAvailable(isBiometricEnabledForUser);
            }
          }
        }
      } catch (err) {
        console.error('Error setting up login form:', err);
      }
    };
    
    setupLoginForm();
  }, [isBiometricFeatureEnabled]);
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate form
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    try {
      setIsSubmitting(true);
      await login(email, password, rememberMe);
      
      // Redirect
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (err: unknown) {
      // Handle different error codes
      const errorMessage = err && typeof err === 'object' && 'code' in err
        ? err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' 
          ? 'Invalid email or password'
          : err.code === 'auth/too-many-requests'
            ? 'Too many failed login attempts. Please try again later.'
            : 'An error occurred during login. Please try again.'
        : 'An error occurred during login. Please try again.';
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle biometric authentication
  const handleBiometricLogin = async () => {
    if (!lastLoggedInUser || !isBiometricFeatureEnabled) return;
    
    setError(null);
    setIsSubmitting(true);
    
    try {
      // In a real implementation, this would use WebAuthn to get credentials
      // and then authenticate the user using the stored credential
      
      // For now, we're just showing a placeholder
      setError('Biometric authentication is not fully implemented yet.');
      
      // Redirect after successful login would go here
    } catch (err: unknown) {
      setError('Biometric authentication failed. Please use password.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div 
      className={`
        w-full max-w-md mx-auto p-4 sm:p-6 
        rounded-lg shadow-lg
        ${isMobile ? 'bg-white' : 'bg-gray-50'} 
        ${className}
      `}
    >
      {logo && (
        <div className="flex justify-center mb-4 sm:mb-6">
          {logo}
        </div>
      )}
      
      <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 mb-4 sm:mb-6">
        Login to Your Account
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}
      
      {biometricAvailable && lastLoggedInUser && isBiometricFeatureEnabled && (
        <button
          type="button"
          onClick={handleBiometricLogin}
          disabled={isSubmitting}
          className="
            w-full mb-4 py-3 bg-blue-100 text-blue-800 rounded-md 
            hover:bg-blue-200 flex items-center justify-center
            min-h-[44px] touch-manipulation
          "
        >
          <span className="mr-2">
            {/* Fingerprint icon (can be replaced with an SVG or image) */}
            👆
          </span>
          Use Biometric Login
        </button>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="
              w-full p-3 border border-gray-300 rounded-md 
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              min-h-[44px]
            "
            placeholder="your@email.com"
          />
        </div>
        
        <div className="mb-5">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="
              w-full p-3 border border-gray-300 rounded-md 
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              min-h-[44px]
            "
            placeholder="••••••••"
          />
        </div>
        
        <div className="flex items-center justify-between mb-5">
          {!hideRememberMe && (
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="
                  h-5 w-5 text-blue-600 border-gray-300 rounded 
                  focus:ring-blue-500 touch-manipulation
                "
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
          )}
          
          {!hideForgotPassword && (
            <div className="text-sm">
              <button
                type="button"
                onClick={onForgotPassword}
                className="
                  font-medium text-blue-600 hover:text-blue-500
                  min-h-[44px] px-2 py-1 -my-1 touch-manipulation
                "
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className={`
            w-full py-3 px-4 rounded-md
            font-medium text-white
            min-h-[44px] touch-manipulation
            transition-all duration-200
            ${isSubmitting 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98]'
            }
          `}
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      
      {onRegister && (
        <div className="mt-6 text-center">
          <span className="text-sm text-gray-600">Don't have an account?</span>
          <button
            type="button"
            onClick={onRegister}
            className="
              ml-2 text-sm font-medium text-blue-600 hover:text-blue-500
              min-h-[44px] px-2 py-1 -my-1 touch-manipulation
            "
          >
            Create account
          </button>
        </div>
      )}
    </div>
  );
};

export default LoginForm; 