import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { googleCalendarService } from '../../utils/googleCalendarService';

function GoogleCalendarCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('processing');
  const hasProcessed = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent duplicate processing in React strict mode
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Google Calendar authorization was denied');
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
        setError('You must be logged in to connect Google Calendar');
        setStatus('error');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        console.log('Processing Google Calendar authorization code...');
        setStatus('exchanging');

        // Exchange code for access token via secure backend
        const result = await googleCalendarService.exchangeCodeForToken(code);

        console.log('Google Calendar connection successful!', result.email);
        setStatus('success');

        // Redirect to settings with success indicator
        setTimeout(() => {
          navigate('/settings?tab=coach&connected=google-calendar');
        }, 2000);

      } catch (err) {
        console.error('Google Calendar callback error:', err);
        setError(err.message || 'Failed to connect Google Calendar. Please try again.');
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
              Calendar Connected!
            </Text>
            <Text style={{ color: 'var(--tribos-text-secondary)' }}>
              Redirecting to settings...
            </Text>
          </>
        ) : (
          <>
            <div className="loading-spinner" />
            <Text size="lg" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
              {status === 'exchanging' ? 'Connecting Google Calendar...' : 'Processing authorization...'}
            </Text>
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              {status === 'exchanging' ? 'Setting up calendar access' : 'Please wait'}
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default GoogleCalendarCallback;
