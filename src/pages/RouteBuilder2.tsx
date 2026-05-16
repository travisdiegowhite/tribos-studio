import { useEffect } from 'react';
import { Box, Text } from '@mantine/core';
import AppShell from '../components/AppShell.jsx';

export default function RouteBuilder2() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Route Builder 2.0 BETA — Tribos';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <AppShell fullWidth>
      <Box
        style={{
          backgroundColor: '#F4F4F2',
          minHeight: 'calc(100dvh - 63px)',
          padding: '48px 24px',
        }}
      >
        <Box style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <Text
              component="h1"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 48,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#141410',
                lineHeight: 1,
                margin: 0,
              }}
            >
              Route Builder 2.0
            </Text>
            <Box
              component="span"
              data-testid="rb2-beta-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 10px',
                backgroundColor: '#2A8C82',
                color: '#FFFFFF',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                borderRadius: 0,
              }}
            >
              BETA
            </Box>
          </Box>
          <Text
            style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 16,
              color: '#5A5A52',
              maxWidth: 560,
            }}
          >
            The new Route Builder is being built. More coming soon.
          </Text>
        </Box>
      </Box>
    </AppShell>
  );
}
