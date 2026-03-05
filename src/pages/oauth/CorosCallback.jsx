import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { corosService } from '../../utils/corosService';

function CorosCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const [error, setError] = useState(null);
  const hasExchanged = useRef(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) return;

    const handleCallback = async () => {
      // Prevent multiple executions (React StrictMode, dependency changes)
      if (hasExchanged.current) return;
      hasExchanged.current = true;

      // COROS OAuth 2.0 flow - get code and state from URL
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      // Handle OAuth error response
      if (errorParam) {
        setError(`Authorization failed: ${errorParam}`);
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // If no code, user denied authorization
      if (!code) {
        setError('COROS authorization was denied or no code received');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect COROS');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        // Exchange authorization code for tokens
        await corosService.exchangeCodeForToken(code);
        navigate('/settings?connected=coros');
      } catch (err) {
        console.error('COROS callback error:', err);
        setError(err.message || 'Failed to connect COROS. Please try again.');
        setTimeout(() => navigate('/settings'), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams, user, loading]);

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
              Connecting to COROS...
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default CorosCallback;
