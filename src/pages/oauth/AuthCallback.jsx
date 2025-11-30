import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Text, Stack } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../theme';

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          navigate('/auth?error=callback_failed');
          return;
        }

        // Successfully authenticated
        navigate('/dashboard');
      } catch (err) {
        console.error('Auth callback exception:', err);
        navigate('/auth?error=callback_failed');
      }
    };

    handleCallback();
  }, [navigate]);

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
