import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration } from '@simplewebauthn/browser';

// Get functions instance
const functions = getFunctions();

// Define callable function references
const generateRegistrationOptions = httpsCallable(functions, 'webauthnGenerateRegistrationOptions');
const verifyRegistration = httpsCallable(functions, 'webauthnVerifyRegistration');

interface PasskeyManagerProps {
    // Optional: Add props if needed, e.g., onSuccess callback
}

export const PasskeyManager: React.FC<PasskeyManagerProps> = () => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleRegisterClick = async () => {
        setIsRegistering(true);
        setError(null);
        setSuccess(null);

        try {
            // 1. Get options from server
            const optionsResult = await generateRegistrationOptions();
            const options = optionsResult.data as any; // Cast as needed based on actual return type

            // 2. Start registration with browser API via SimpleWebAuthn
            let registrationResponse;
            try {
                registrationResponse = await startRegistration(options);
            } catch (browserError: any) {
                console.error('Browser WebAuthn registration failed:', browserError);
                if (browserError.name === 'NotAllowedError') {
                    setError('Registration cancelled or not permitted by the browser.');
                } else {
                    setError(`Browser error during registration: ${browserError.message}`);
                }
                setIsRegistering(false);
                return;
            }

            // 3. Send response to server for verification
            await verifyRegistration(registrationResponse);

            setSuccess('Passkey registered successfully!');

        } catch (err: any) {
            console.error('Passkey registration process failed:', err);
            const errorMessage = err.message || 'An unknown error occurred.';
            // Check for specific HttpsError codes if needed
            if (err.code === 'functions/already-exists') {
                 setError('This passkey or device seems to be already registered.');
            } else if (err.code) { // Handle other Firebase functions errors
                 setError(`Server error: ${err.code} - ${errorMessage}`);
            } else {
                setError(`Error: ${errorMessage}`);
            }
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className="p-4 border rounded-md shadow-sm bg-white">
            <h3 className="text-lg font-semibold mb-3">Manage Passkeys</h3>
            <p className="text-sm text-gray-600 mb-4">
                Register this device to log in quickly and securely using biometrics (like Face ID, Touch ID, Windows Hello) or a security key.
            </p>
            
            {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-green-100 border border-green-200 text-green-700 rounded-md text-sm">
                    {success}
                </div>
            )}

            <button
                onClick={handleRegisterClick}
                disabled={isRegistering}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isRegistering ? 'Registering...' : 'Register This Device as a Passkey'}
            </button>
        </div>
    );
}; 