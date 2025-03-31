import React, { useState } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useViewport } from '../../hooks/useViewport';

interface RegisterFormProps {
  // Optional redirect URL after successful registration
  redirectUrl?: string;
  // Optional logo or branding component
  logo?: React.ReactNode;
  // Custom styles for the container
  className?: string;
  // Default company ID for registration
  companyId?: string;
  // Default manager ID for registration
  managerId?: string;
  // Default role (typically 'user' for workers)
  defaultRole?: 'user' | 'manager' | 'admin';
  // Callback for when user clicks "Login" link
  onLogin?: () => void;
}

const RegisterForm = ({
  redirectUrl = '/',
  logo,
  className = '',
  companyId = '', // This would typically come from an invite link or context
  managerId = '', // This would typically come from an invite link or context
  defaultRole = 'user',
  onLogin,
}: RegisterFormProps) => {
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  
  // Form handling state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Auth context
  const { register } = useAuth();
  
  // Viewport for responsive design
  const { isMobile } = useViewport();
  
  // Validate form
  const validateForm = () => {
    // Reset error
    setError(null);
    
    // Check required fields
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      setError('All fields are required');
      return false;
    }
    
    // Validate email format with regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    // Check password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars)) {
      setError('Password must include uppercase, lowercase, number, and special character');
      return false;
    }
    
    // Check passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    // Check terms acceptance
    if (!acceptTerms) {
      setError('You must accept the terms and conditions');
      return false;
    }
    
    return true;
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) return;
    
    try {
      setIsSubmitting(true);
      
      // Register user
      await register(email, password, {
        firstName,
        lastName,
        email,
        companyId: companyId || 'default', // In a real app, this would be required
        managerId: managerId || undefined,
        role: defaultRole,
        permissions: [],
        isActive: true,
      });
      
      // Show success and redirect after delay
      setSuccess(true);
      setTimeout(() => {
        if (redirectUrl) {
          window.location.href = redirectUrl;
        }
      }, 1500);
    } catch (err: unknown) {
      // Handle Firebase auth errors
      if (err && typeof err === 'object' && 'code' in err) {
        if (err.code === 'auth/email-already-in-use') {
          setError('This email is already registered. Please use a different email or login.');
        } else if (err.code === 'auth/invalid-email') {
          setError('Invalid email address format.');
        } else if (err.code === 'auth/weak-password') {
          setError('Password is too weak. Please choose a stronger password.');
        } else {
          setError('message' in err && typeof err.message === 'string' 
            ? err.message 
            : 'An error occurred during registration.');
        }
      } else {
        setError('An error occurred during registration.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (success) {
    return (
      <div className={`w-full max-w-md mx-auto p-6 rounded-lg shadow-lg bg-green-50 ${className}`}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-green-800 mb-4">Registration Successful!</h2>
          <p className="text-green-700 mb-2">Your account has been created.</p>
          <p className="text-green-700">Redirecting you automatically...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`w-full max-w-md mx-auto p-6 rounded-lg shadow-lg ${isMobile ? 'bg-white' : 'bg-gray-50'} ${className}`}>
      {logo && (
        <div className="flex justify-center mb-6">
          {logo}
        </div>
      )}
      
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
        Create Your Account
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isSubmitting}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="John"
            />
          </div>
          
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isSubmitting}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Doe"
            />
          </div>
        </div>
        
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
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="your@email.com"
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
          />
          <p className="mt-1 text-xs text-gray-500">
            Must be at least 8 characters with uppercase, lowercase, number, and special character.
          </p>
        </div>
        
        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isSubmitting}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="••••••••"
          />
        </div>
        
        <div className="mb-6">
          <div className="flex items-center">
            <input
              id="terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
              I accept the <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
            </label>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 px-4 ${
            isSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          } text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
        >
          {isSubmitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
      
      {onLogin && (
        <div className="mt-6 text-center">
          <span className="text-sm text-gray-600">Already have an account?</span>
          <button
            type="button"
            onClick={onLogin}
            className="ml-1 text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Log in
          </button>
        </div>
      )}
    </div>
  );
};

export default RegisterForm; 