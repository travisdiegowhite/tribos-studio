import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { stravaService } from '../../utils/stravaService';

function StravaCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('processing');
  const hasProcessed = useRef(false);
  const authCheckCount = useRef(0);

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) return;

    const handleCallback = async () => {
      // If already successfully processed, don't run again
      if (hasProcessed.current) return;

      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      // Handle Strava errors immediately
      if (errorParam) {
        hasProcessed.current = true;
        setError('Strava authorization was denied');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // Handle missing code immediately
      if (!code) {
        hasProcessed.current = true;
        setError('No authorization code received');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // For user check - give auth context time to restore session
      // The session exists in localStorage but may take a moment to hydrate
      if (!user) {
        authCheckCount.current += 1;
        console.log(`⏳ Waiting for auth session... (attempt ${authCheckCount.current})`);

        // After 10 attempts (~2-3 seconds), give up
        if (authCheckCount.current >= 10) {
          hasProcessed.current = true;
          setError('You must be logged in to connect Strava');
          setStatus('error');
          setTimeout(() => navigate('/auth'), 3000);
        }
        // Don't mark as processed - let the effect retry when user changes
        return;
      }

      // We have a user - now mark as processed to prevent duplicates
      hasProcessed.current = true;

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
  }, [navigate, searchParams, user, loading]);

  // Retry effect when user is null but we're waiting
  useEffect(() => {
    if (loading || user || hasProcessed.current) return;

    // Poll for user becoming available
    const timer = setTimeout(() => {
      // Trigger a re-check by incrementing the counter
      // This is a workaround for the auth state race condition
      authCheckCount.current += 1;
    }, 200);

    return () => clearTimeout(timer);
  }, [loading, user, authCheckCount.current]);

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--tribos-bg-primary)',
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
            <Text style={{ color: 'var(--tribos-text-secondary)' }}>
              Redirecting to settings...
            </Text>
          </>
        ) : (
          <>
            <div className="loading-spinner" />
            <Text size="lg" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
              {status === 'exchanging' ? 'Connecting to Strava...' : 'Processing authorization...'}
            </Text>
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              {status === 'exchanging' ? 'Exchanging tokens securely' : 'Please wait'}
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default StravaCallback;
