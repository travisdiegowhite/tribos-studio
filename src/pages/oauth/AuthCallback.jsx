import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../theme';

function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
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
          // Successfully authenticated
          navigate('/dashboard');
        } else {
          // No session yet, might need to wait for auth state change
          // Listen for the auth state to update
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (session) {
                subscription.unsubscribe();
                navigate('/dashboard');
              }
            }
          );

          // Timeout fallback - if no session after 5 seconds, redirect to auth
          setTimeout(() => {
            subscription.unsubscribe();
            navigate('/auth');
          }, 5000);
        }
      } catch (err) {
        console.error('Auth callback exception:', err);
        navigate('/auth?error=callback_failed');
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.colors.bgPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="md">
        <div className="loading-spinner" />
        <Text style={{ color: tokens.colors.textSecondary }}>
          Completing sign in...
        </Text>
      </Stack>
    </Box>
  );
}

export default AuthCallback;
