import React, { useState, useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { 
  getRememberedUser, 
  getLastUser, 
} from '../../firebase/auth/auth-service';
import { useViewport } from '../../hooks/ui/useViewport';
import { useFeatureFlag } from '../../hooks/features/useFeatureFlag';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
    startAuthentication, 
    browserSupportsWebAuthn
} from '@simplewebauthn/browser';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

// Define callable function references
const functions = getFunctions();
const generateAuthenticationOptions = httpsCallable(functions, 'webauthnGenerateAuthenticationOptions');
const verifyAuthentication = httpsCallable(functions, 'webauthnVerifyAuthentication');

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
  const isPasskeyFeatureEnabled = useFeatureFlag('biometric-auth');
  
  // State for form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  
  // States for form handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoggedInUser, setLastLoggedInUser] = useState<string | null>(null);
  const [isCheckingPasskeySupport, setIsCheckingPasskeySupport] = useState(true);
  const [isPasskeyAvailable, setIsPasskeyAvailable] = useState(false);
  
  // Get auth context
  const { login } = useAuth();
  
  // Get viewport size for responsive behavior
  const { isMobile } = useViewport();
  
  // Effect to check Passkey/WebAuthn availability and setup remembered user
  useEffect(() => {
    const setupLoginForm = async () => {
        setIsCheckingPasskeySupport(true);
        try {
            // Remembered user logic (unchanged)
            const rememberedUser = getRememberedUser();
            if (rememberedUser) {
                setEmail(rememberedUser);
                setRememberMe(true);
            }
            
            // Check for Passkey/WebAuthn availability
            if (isPasskeyFeatureEnabled) {
                const supported = await browserSupportsWebAuthn();
                if (supported) {
                    // More sophisticated checks like PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                    // could be added here to be more certain biometrics are available.
                    // For now, just check if the last user might have registered one.
                    const lastUser = getLastUser(); 
                    if (lastUser) {
                        setLastLoggedInUser(lastUser); 
                        // We can't know for sure if a passkey *exists* for this user from the browser alone,
                        // but we can show the button optimistically if the browser supports WebAuthn.
                        setIsPasskeyAvailable(true); 
                    }
                }
            }
        } catch (err) {
            console.error('Error setting up login form:', err);
            setError('Could not check Passkey availability.')
        } finally {
            setIsCheckingPasskeySupport(false);
        }
    };
    
    setupLoginForm();
  }, [isPasskeyFeatureEnabled]);
  
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
      await login(email, password);
      
      // Store email if "Remember me" is checked
      if (rememberMe) {
        localStorage.setItem('rememberedUser', email);
      } else {
        localStorage.removeItem('rememberedUser');
      }
      // Always store the last logged-in user for potential biometric use
      localStorage.setItem('lastUser', email);

      // Redirect
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (err: unknown) {
      // Check if it's the specific service unavailable error
      if (err instanceof Error && err.message === "Authentication service is not available.") {
        setError("Login service is currently unavailable. Please try again later.");
      } else {
        // Handle other Firebase auth errors
        const errorMessage = err && typeof err === 'object' && 'code' in err
          ? getFirebaseErrorMessage(err.code as string)
          : 'An unexpected error occurred during login.';
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle Passkey/Biometric authentication
  const handlePasskeyLogin = async () => {
    if (!isPasskeyAvailable || isCheckingPasskeySupport) return;
    
    setError(null);
    setIsSubmitting(true);
    
    let challengeId: string | null = null; // Variable to store the challenge ID

    try {
        // 1. Get options from server
        const optionsResult = await generateAuthenticationOptions({ userId: lastLoggedInUser }); 
        // Expecting { ...options, challengeId: string } 
        const optionsResponse = optionsResult.data as any; 
        const options = { ...optionsResponse, challenge: undefined }; // Remove challenge if present
        challengeId = optionsResponse.challengeId; // Store the challenge ID

        if (!challengeId) {
            throw new Error('Challenge ID missing from server response.');
        }

        // 2. Start authentication with browser API via SimpleWebAuthn
        let authenticationResponse;
        try {
            authenticationResponse = await startAuthentication(options);
        } catch (browserError: any) {
            console.error('Browser WebAuthn authentication failed:', browserError);
            if (browserError.name === 'NotAllowedError') {
                setError('Passkey authentication cancelled or not permitted.');
            } else {
                 setError(`Browser error during authentication: ${browserError.message}`);
            }
            setIsSubmitting(false);
            return;
        }

        // 3. Send response AND challengeId to server for verification
        const verificationPayload: VerifyAuthPayload = { // Use the interface defined in functions
            challengeId: challengeId,
            authResponse: authenticationResponse
        };
        const verificationResult = await verifyAuthentication(verificationPayload);
        const verificationData = verificationResult.data as { verified: boolean; customToken?: string };

        // 4. Sign in with Custom Token if verification succeeded
        if (verificationData.verified && verificationData.customToken) {
            const auth = getAuth();
            await signInWithCustomToken(auth, verificationData.customToken);
            // Successful login will trigger the onAuthStateChanged listener in App.tsx,
            // updating Zustand state and handling redirection implicitly.
            // No explicit redirect needed here if App.tsx handles it based on auth state.
            
             // Clear potential last user/remember me if login is successful?
             // localStorage.removeItem('rememberedUser');
             // localStorage.removeItem('lastUser');

        } else {
             throw new Error('Passkey verification failed on server.');
        }

    } catch (err: any) {
        console.error('Passkey login process failed:', err);
        const errorMessage = err.message || 'An unknown error occurred during Passkey login.';
        setError(`Passkey Login Error: ${errorMessage}`);
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
      
      {isPasskeyFeatureEnabled && !isCheckingPasskeySupport && isPasskeyAvailable && (
        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={isSubmitting}
          className="
            w-full mb-4 py-3 bg-blue-100 text-blue-800 rounded-md 
            hover:bg-blue-200 flex items-center justify-center
            min-h-[44px] touch-manipulation
          "
        >
          <span className="mr-2">
            {/* Placeholder Icon */} 
            🔑
          </span>
          Sign in with Passkey / Biometrics
        </button>
      )}
      {!isPasskeyFeatureEnabled && isCheckingPasskeySupport && (
         <div className="text-center text-sm text-gray-500 mb-4">Checking for Passkey support...</div>
      )}

      {isPasskeyFeatureEnabled && !isCheckingPasskeySupport && isPasskeyAvailable && (
        <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or sign in with password</span>
            </div>
        </div>
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
          className="
            w-full py-3 px-4 bg-blue-600 text-white rounded-md font-semibold 
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
            disabled:opacity-50 disabled:cursor-not-allowed
            min-h-[44px] touch-manipulation
          "
        >
          {isSubmitting ? 'Logging in...' : 'Login with Password'}
        </button>
        
        {onRegister && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <button 
                type="button" 
                onClick={onRegister} 
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                Register here
              </button>
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

// Helper function to map Firebase error codes to user-friendly messages
const getFirebaseErrorMessage = (code: string): string => {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': // Catch all invalid credential errors
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please try again later or reset your password.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    default:
      console.error('Unhandled Firebase Auth Error Code:', code); // Log unhandled codes
      return 'An unexpected error occurred during login.';
  }
};

// Define the payload type expected by the verify function (mirroring the backend)
interface VerifyAuthPayload {
    challengeId: string;
    authResponse: any; // Use appropriate type from @simplewebauthn/types if possible
}

export default LoginForm; 