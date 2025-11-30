import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme';

function StravaCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Strava authorization was denied');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect Strava');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        // Exchange code for tokens via your backend/edge function
        // This is a placeholder - implement the token exchange on your backend
        const response = await fetch('/api/oauth/strava/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, userId: user.id }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete Strava connection');
        }

        const data = await response.json();

        // Store the connection in your database
        await supabase.from('connected_services').upsert({
          user_id: user.id,
          provider: 'strava',
          provider_user_id: data.athlete.id.toString(),
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(data.expires_at * 1000).toISOString(),
        });

        navigate('/settings?connected=strava');
      } catch (err) {
        console.error('Strava callback error:', err);
        setError('Failed to connect Strava. Please try again.');
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
              Connecting to Strava...
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default StravaCallback;
