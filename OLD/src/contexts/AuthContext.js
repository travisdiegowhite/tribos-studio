import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { isDemoMode, getDemoSession, demoUser, disableDemoMode } from '../utils/demoData';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if in demo mode first
    if (isDemoMode()) {
      console.log('✅ Demo mode active - using mock data');
      const demoSession = getDemoSession();
      setUser(demoSession?.user ?? null);
      setLoading(false);
      return;
    }

    // Handle auth tokens from URL hash (email confirmation, password reset, etc.)
    const handleAuthCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && type) {
        console.log('🔐 Processing auth callback:', type);

        // Let Supabase handle the session from the URL
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
        } else if (data.session) {
          console.log('✅ Auth callback successful, session established');
          setUser(data.session.user);

          // If this is a new signup confirmation, mark it for onboarding
          if (type === 'signup') {
            console.log('🎉 New user signup detected - will show onboarding');
            sessionStorage.setItem('tribos_new_signup', 'true');
            // Clear any existing onboarding completion flag for fresh start
            localStorage.removeItem('tribos_onboarding_completed');
          }

          // Clean up URL by removing hash params
          window.history.replaceState(null, '', window.location.pathname);
        }

        setLoading(false);
        return true;
      }
      return false;
    };

    // Try to handle auth callback first
    handleAuthCallback().then(wasCallback => {
      if (wasCallback) return;

      // Normal authentication flow
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      });
    });

    // Listen for changes in auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔄 Auth state changed:', _event);
      setUser(session?.user ?? null);

      // If user just signed in via email confirmation, clean up URL
      if (_event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = (email, password) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/?confirmed=true`,
      }
    });
  };

  const signIn = (email, password) => {
    return supabase.auth.signInWithPassword({
      email,
      password,
    });
  };

  const signInWithGoogle = async () => {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    });
  };

  const signOut = () => {
    // If in demo mode, just disable it and reload
    if (isDemoMode()) {
      disableDemoMode();
      window.location.reload();
      return Promise.resolve({ error: null });
    }

    return supabase.auth.signOut();
  };

  // Helper function to check if user account is new (created within 48 hours)
  const isNewUser = () => {
    if (!user || !user.created_at) return false;

    const accountCreatedAt = new Date(user.created_at);
    const now = new Date();
    const hoursSinceCreation = (now - accountCreatedAt) / (1000 * 60 * 60);

    return hoursSinceCreation <= 48;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      isNewUser,
      isDemoMode: isDemoMode(),
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
