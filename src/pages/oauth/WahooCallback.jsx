import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme';

function WahooCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Wahoo authorization was denied');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect Wahoo');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        // Exchange code for tokens via your backend/edge function
        const response = await fetch('/api/oauth/wahoo/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, userId: user.id }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete Wahoo connection');
        }

        const data = await response.json();

        // Store the connection in your database
        await supabase.from('connected_services').upsert({
          user_id: user.id,
          provider: 'wahoo',
          provider_user_id: data.user.id.toString(),
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        });

        navigate('/settings?connected=wahoo');
      } catch (err) {
        console.error('Wahoo callback error:', err);
        setError('Failed to connect Wahoo. Please try again.');
        setTimeout(() => navigate('/settings'), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams, user]);

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
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : (
          <>
            <div className="loading-spinner" />
            <Text style={{ color: tokens.colors.textSecondary }}>
              Connecting to Wahoo...
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default WahooCallback;
