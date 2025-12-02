import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Paper, Text, Loader, Center, Alert, Stack } from '@mantine/core';
import garminService from '../utils/garminService';
import toast from 'react-hot-toast';

const GarminCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
          setError(`Garmin authorization failed: ${error}`);
          setStatus('error');
          return;
        }

        if (!code || !state) {
          setError('Missing OAuth 2.0 parameters from Garmin');
          setStatus('error');
          return;
        }

        console.log('🔗 Processing Garmin OAuth 2.0 callback...');
        setStatus('exchanging');

        // Complete OAuth 2.0 PKCE flow (exchange code for access token)
        const result = await garminService.completeAuth(code, state);

        console.log('✅ Garmin connection successful!');

        toast.success('Successfully connected to Garmin Connect!');

        setStatus('success');

        // Redirect back to settings page
        setTimeout(() => {
          navigate('/settings', { replace: true, state: { tab: 'integrations' } });
        }, 2000);

      } catch (err) {
        console.error('Garmin callback error:', err);
        setError(err.message || 'Failed to connect to Garmin');
        setStatus('error');

        toast.error('Failed to connect to Garmin Connect');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Paper shadow="md" p="xl" style={{ maxWidth: 400, width: '100%' }}>
        <Center mb="lg">
          <Stack align="center" gap="xs">
            <svg width="120" height="40" viewBox="0 0 120 40" fill="none">
              <text x="0" y="30" fontSize="28" fontWeight="700" fill="#007CC3">
                GARMIN
              </text>
            </svg>
            <Text size="xs" c="dimmed">
              Edge • Forerunner • Fenix
            </Text>
          </Stack>
        </Center>

        {status === 'processing' && (
          <>
            <Center mb="md">
              <Loader size="lg" color="blue" />
            </Center>
            <Text ta="center" size="lg" fw={500} mb="xs">
              Connecting to Garmin...
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Processing your authorization
            </Text>
          </>
        )}

        {status === 'exchanging' && (
          <>
            <Center mb="md">
              <Loader size="lg" color="blue" />
            </Center>
            <Text ta="center" size="lg" fw={500} mb="xs">
              Setting up your connection...
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Exchanging tokens with Garmin Connect
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Text ta="center" size="lg" fw={500} mb="xs" c="green">
              ✅ Successfully connected!
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Your activities will now automatically sync from Garmin Connect
            </Text>
          </>
        )}

        {status === 'error' && (
          <Alert color="red" title="Connection Failed">
            {error}
          </Alert>
        )}
      </Paper>
    </Center>
  );
};

export default GarminCallback;
