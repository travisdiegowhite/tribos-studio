import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Paper, Text, Loader, Center, Alert, Stack } from '@mantine/core';
import wahooService from '../utils/wahooService';
import toast from 'react-hot-toast';

const WahooCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const state = searchParams.get('state');

        if (error) {
          setError(`Wahoo authorization failed: ${error}`);
          setStatus('error');
          return;
        }

        if (!code) {
          setError('No authorization code received from Wahoo');
          setStatus('error');
          return;
        }

        console.log('🔗 Processing Wahoo authorization code...');
        setStatus('exchanging');

        // Exchange code for access token
        const tokenData = await wahooService.exchangeCodeForToken(code);

        console.log('✅ Wahoo connection successful!', {
          user: tokenData.user,
          id: tokenData.id
        });

        toast.success('Successfully connected to Wahoo Fitness!');

        setStatus('success');

        // Redirect back to the settings/integrations page after a short delay
        setTimeout(() => {
          navigate('/settings', { replace: true, state: { tab: 'integrations' } });
        }, 2000);

      } catch (err) {
        console.error('Wahoo callback error:', err);
        setError(err.message || 'Failed to connect to Wahoo');
        setStatus('error');

        toast.error('Failed to connect to Wahoo');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Paper shadow="md" p="xl" style={{ maxWidth: 400, width: '100%' }}>
        <Center mb="lg">
          <Stack align="center" gap="xs">
            <Text size="xl" fw={700} c="blue">
              Wahoo Fitness
            </Text>
            <Text size="xs" c="dimmed">
              ELEMNT • ROAM • BOLT
            </Text>
          </Stack>
        </Center>

        {status === 'processing' && (
          <>
            <Center mb="md">
              <Loader size="lg" />
            </Center>
            <Text ta="center" size="lg" fw={500} mb="xs">
              Connecting to Wahoo...
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Processing your authorization
            </Text>
          </>
        )}

        {status === 'exchanging' && (
          <>
            <Center mb="md">
              <Loader size="lg" />
            </Center>
            <Text ta="center" size="lg" fw={500} mb="xs">
              Setting up your connection...
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Exchanging tokens with Wahoo
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Text ta="center" size="lg" fw={500} mb="xs" c="green">
              ✅ Successfully connected!
            </Text>
            <Text ta="center" size="sm" c="dimmed">
              Your rides will now automatically sync from your Wahoo device
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

export default WahooCallback;
