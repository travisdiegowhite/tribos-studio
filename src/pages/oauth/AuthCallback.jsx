import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { hasPendingPasswordRecovery } from '../../contexts/AuthContext.jsx';
import { consumeReturnTo } from '../../utils/returnTo';
import { tokens } from '../../theme';

// Where a fresh session should go. A recovery session (password-reset link
// whose template ignored redirectTo and landed here) must reach the reset
// page, not the dashboard.
function postAuthDestination() {
  if (hasPendingPasswordRecovery()) return '/auth/reset-password';
  return consumeReturnTo() || '/today';
}

function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Held outside the async body so cleanup can cancel them: the fallback
    // timer used to fire even after a successful sign-in, bouncing a slow
    // (but successful) confirmation back to /auth.
    let subscription = null;
    let fallbackTimer = null;

    const handleCallback = async () => {
      try {
        // Check for error in URL params (from Supabase)
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('Auth callback error:', error, errorDescription);
          navigate('/auth?error=callback_failed');
          return;
        }

        // For email confirmations, Supabase automatically handles the token
        // in the URL hash when getSession is called
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Auth callback session error:', sessionError);
          navigate('/auth?error=callback_failed');
          return;
        }

        if (data?.session) {
          // Successfully authenticated. Guests who signed up from the route
          // builder stashed a return path — land them back there (their
          // in-progress route rehydrates from the persisted store).
          navigate(postAuthDestination());
        } else {
          // No session yet, might need to wait for auth state change
          // Listen for the auth state to update
          ({ data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (session) {
                clearTimeout(fallbackTimer);
                subscription?.unsubscribe();
                navigate(postAuthDestination());
              }
            }
          ));

          // Timeout fallback - if no session after 5 seconds, redirect to auth
          // and say why (Auth.jsx reads ?error=callback_failed).
          fallbackTimer = setTimeout(() => {
            subscription?.unsubscribe();
            navigate('/auth?error=callback_failed');
          }, 5000);
        }
      } catch (err) {
        console.error('Auth callback exception:', err);
        navigate('/auth?error=callback_failed');
      }
    };

    handleCallback();

    return () => {
      clearTimeout(fallbackTimer);
      subscription?.unsubscribe();
    };
  }, [navigate, searchParams]);

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="md">
        <div className="loading-spinner" />
        <Text style={{ color: 'var(--color-text-secondary)' }}>
          Completing sign in...
        </Text>
      </Stack>
    </Box>
  );
}

export default AuthCallback;
