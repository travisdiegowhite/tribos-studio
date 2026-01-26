import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { wahooService } from '../../utils/wahooService';

function WahooCallback() {
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

      if (errorParam) {
        hasProcessed.current = true;
        setError('Wahoo authorization was denied');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        hasProcessed.current = true;
        setError('No authorization code received');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // For user check - give auth context time to restore session
      if (!user) {
        authCheckCount.current += 1;
        console.log(`⏳ Waiting for auth session... (attempt ${authCheckCount.current})`);

        // After 10 attempts (~2-3 seconds), give up
        if (authCheckCount.current >= 10) {
          hasProcessed.current = true;
          setError('You must be logged in to connect Wahoo');
          setStatus('error');
          setTimeout(() => navigate('/auth'), 3000);
        }
        return;
      }

      // We have a user - now mark as processed to prevent re-runs
      hasProcessed.current = true;

      try {
        console.log('🔄 Processing Wahoo callback...');
        setStatus('exchanging');

        // Exchange code for tokens via our wahoo service
        await wahooService.exchangeCodeForToken(code);

        console.log('✅ Wahoo connected successfully');
        setStatus('success');
        navigate('/settings?connected=wahoo');
      } catch (err) {
        console.error('Wahoo callback error:', err);
        setError('Failed to connect Wahoo. Please try again.');
        setStatus('error');
        setTimeout(() => navigate('/settings'), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams, user, loading]);

  // Retry effect - poll for user if not yet available
  useEffect(() => {
    if (hasProcessed.current || loading) return;

    // If we don't have a user yet, set up a retry interval
    if (!user && authCheckCount.current > 0 && authCheckCount.current < 10) {
      const timer = setTimeout(() => {
        // Trigger re-check by incrementing counter
        authCheckCount.current += 1;
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [user, loading, authCheckCount.current]);

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
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : (
          <>
            <div className="loading-spinner" />
            <Text style={{ color: 'var(--tribos-text-secondary)' }}>
              {status === 'exchanging' ? 'Connecting to Wahoo...' : 'Processing...'}
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default WahooCallback;
