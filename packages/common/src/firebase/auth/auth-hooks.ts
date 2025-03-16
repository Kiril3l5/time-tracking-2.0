import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../core/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserProfile } from './auth-service';
import { UserProfile } from '../../types/firestore';

// Hook to access the current Firebase auth user
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  return { user, loading };
};

// Hook to access the current user's profile from Firestore
export const useUserProfile = () => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    
    const fetchProfile = async () => {
      try {
        const userProfile = await getUserProfile(user.uid);
        setProfile(userProfile);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch user profile'));
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
  }, [user, authLoading]);
  
  return { profile, loading, error, authUser: user };
};