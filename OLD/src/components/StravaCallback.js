import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Paper, Text, Loader, Center, Alert } from '@mantine/core';
import { stravaService } from '../utils/stravaService';
import toast from 'react-hot-toast';

const StravaCallback = () => {
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
          setError(`Strava authorization failed: ${error}`);
          setStatus('error');
          return;
        }

        if (!code) {
          setError('No authorization code received from Strava');
          setStatus('error');
          return;
        }

        console.log('🔗 Processing Strava authorization code...');
        setStatus('exchanging');
        
        // Exchange code for access token
        const tokenData = await stravaService.exchangeCodeForToken(code);
        
        console.log('✅ Strava connection successful!', {
          athlete: tokenData.athlete.firstname + ' ' + tokenData.athlete.lastname,
          id: tokenData.athlete.id
        });

        toast.success(`Connected to Strava as ${tokenData.athlete.firstname} ${tokenData.athlete.lastname}!`);
        
        setStatus('success');
        
        // Redirect back to the Import page after a short delay
        setTimeout(() => {
          navigate('/import', { replace: true });
        }, 2000);

      } catch (err) {
        console.error('Strava callback error:', err);
        setError(err.message || 'Failed to connect to Strava');
        setStatus('error');
        
        toast.error('Failed to connect to Strava');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Paper shadow="md" p="xl" style={{ maxWidth: 400, width: '100%' }}>
        <Center mb="lg">
          <img 
            src="https://developers.strava.com/images/strava-logo.svg" 
            alt="Strava" 
            style={{ height: 40 }}
          />
        </Center>

        {status === 'processing' && (
          <>
            <Center mb="md">
              <Loader size="lg" />
            </Center>
            <Text align="center" size="lg" fw={500} mb="xs">
              Connecting to Strava...
            </Text>
            <Text align="center" size="sm" c="dimmed">
              Processing your authorization
            </Text>
          </>
        )}

        {status === 'exchanging' && (
          <>
            <Center mb="md">
              <Loader size="lg" />
            </Center>
            <Text align="center" size="lg" fw={500} mb="xs">
              Setting up your connection...
            </Text>
            <Text align="center" size="sm" c="dimmed">
              Exchanging tokens with Strava
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Text align="center" size="lg" fw={500} mb="xs" c="green">
              ✅ Successfully connected!
            </Text>
            <Text align="center" size="sm" c="dimmed">
              Taking you to the Strava integration page...
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

export default StravaCallback;