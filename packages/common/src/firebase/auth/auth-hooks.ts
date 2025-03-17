import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, getUserProfile } from './auth-service';
import { UserProfile } from '../../types/firestore';

/**
 * Hook to get and monitor the authentication state
 */
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange(async authUser => {
      setLoading(true);
      try {
        if (authUser) {
          setUser(authUser);
          const profile = await getUserProfile(authUser.uid);
          setUserProfile(profile);
        } else {
          setUser(null);
          setUserProfile(null);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown authentication error'));
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, userProfile, loading, error };
};
