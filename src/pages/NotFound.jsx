import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Box, Group } from '@mantine/core';
import { IconRoute, IconHome, IconArrowLeft } from '@tabler/icons-react';
import { tokens } from '../theme';

function NotFound() {
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
      <Container size="sm">
        <Stack align="center" gap="xl">
          <Box style={{ textAlign: 'center' }}>
            <IconRoute size={64} color={tokens.colors.electricLime} style={{ marginBottom: 16 }} />
            <Title
              order={1}
              style={{
                fontSize: '6rem',
                fontWeight: 800,
                color: tokens.colors.electricLime,
                lineHeight: 1,
              }}
            >
              404
            </Title>
          </Box>

          <Stack align="center" gap="md">
            <Title order={2} style={{ color: tokens.colors.textPrimary, textAlign: 'center' }}>
              Route Not Found
            </Title>
            <Text
              size="lg"
              style={{ color: tokens.colors.textSecondary, textAlign: 'center', maxWidth: 400 }}
            >
              Looks like you've gone off course. The page you're looking for doesn't exist or has been moved.
            </Text>
          </Stack>

          <Group gap="md">
            <Button
              component={Link}
              to="/"
              size="lg"
              color="lime"
              leftSection={<IconHome size={20} />}
            >
              Back to Home
            </Button>
            <Button
              component={Link}
              to="/dashboard"
              size="lg"
              variant="outline"
              color="gray"
              leftSection={<IconArrowLeft size={20} />}
            >
              Go to Dashboard
            </Button>
          </Group>

          <Text size="sm" style={{ color: tokens.colors.textMuted }}>
            Need help?{' '}
            <a href="mailto:travis@tribos.studio" style={{ color: tokens.colors.electricLime }}>
              Contact support
            </a>
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}

export default NotFound;
