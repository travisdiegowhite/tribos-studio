import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { garminService } from '../../utils/garminService';

function GarminCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      // OAuth 2.0 PKCE flow - get code and state from URL
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Handle OAuth error response
      if (errorParam) {
        setError(errorDescription || `Authorization failed: ${errorParam}`);
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        setError('Invalid Garmin authorization response - no authorization code received');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!user) {
        setError('You must be logged in to connect Garmin');
        setTimeout(() => navigate('/auth'), 3000);
        return;
      }

      try {
        // Exchange authorization code for tokens
        await garminService.exchangeToken(code, state);
        navigate('/settings?connected=garmin');
      } catch (err) {
        console.error('Garmin callback error:', err);
        setError(err.message || 'Failed to connect Garmin. Please try again.');
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
