import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme';

function GarminCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Garmin uses OAuth 1.0a, so the flow is different
      const oauthToken = searchParams.get('oauth_token');
      const oauthVerifier = searchParams.get('oauth_verifier');

      if (!oauthToken || !oauthVerifier) {
        setError('Invalid Garmin authorization response');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect Garmin');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        // Exchange tokens via your backend/edge function
        // Garmin OAuth 1.0a requires server-side handling
        const response = await fetch('/api/oauth/garmin/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            oauthToken,
            oauthVerifier,
            userId: user.id,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete Garmin connection');
        }

        const data = await response.json();

        // Store the connection in your database
        await supabase.from('connected_services').upsert({
          user_id: user.id,
          provider: 'garmin',
          provider_user_id: data.userId,
          access_token: data.accessToken,
          access_token_secret: data.accessTokenSecret,
        });

        navigate('/settings?connected=garmin');
      } catch (err) {
        console.error('Garmin callback error:', err);
        setError('Failed to connect Garmin. Please try again.');
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
              Connecting to Garmin...
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default GarminCallback;
