import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Text, Stack, Alert } from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { tokens } from '../../theme';
import { wahooService } from '../../utils/wahooService';

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
        // Exchange code for tokens via our wahoo service
        await wahooService.exchangeCodeForToken(code);
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
