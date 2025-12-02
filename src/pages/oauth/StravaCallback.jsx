import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { stravaService } from '../../utils/stravaService';

function StravaCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Strava authorization was denied');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect Strava');
        setStatus('error');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        console.log('🔗 Processing Strava authorization code...');
        setStatus('exchanging');

        // Exchange code for access token via secure backend
        const result = await stravaService.exchangeCodeForToken(code);

        console.log('✅ Strava connection successful!', result.athlete);
        setStatus('success');

        // Redirect to settings with success indicator
        setTimeout(() => {
          navigate('/settings?tab=integrations&connected=strava');
        }, 2000);

      } catch (err) {
        console.error('Strava callback error:', err);
        setError(err.message || 'Failed to connect Strava. Please try again.');
        setStatus('error');
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
        {status === 'error' || error ? (
          <Alert color="red" variant="light" style={{ maxWidth: 400 }}>
            {error}
          </Alert>
        ) : status === 'success' ? (
          <>
            <Text size="xl" fw={600} style={{ color: tokens.colors.primary }}>
              ✅ Successfully connected!
            </Text>
            <Text style={{ color: tokens.colors.textSecondary }}>
              Redirecting to settings...
            </Text>
          </>
        ) : (
          <>
            <div className="loading-spinner" />
            <Text size="lg" fw={500} style={{ color: tokens.colors.textPrimary }}>
              {status === 'exchanging' ? 'Connecting to Strava...' : 'Processing authorization...'}
            </Text>
            <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
              {status === 'exchanging' ? 'Exchanging tokens securely' : 'Please wait'}
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default StravaCallback;
