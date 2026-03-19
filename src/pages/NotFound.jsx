import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Box, Group } from '@mantine/core';
import { tokens } from '../theme';
import { ArrowLeft, House, Path } from '@phosphor-icons/react';

function NotFound() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Container size="sm">
        <Stack align="center" gap="xl">
          <Box style={{ textAlign: 'center' }}>
            <Path size={64} color={'var(--color-teal)'} style={{ marginBottom: 16 }} />
            <Title
              order={1}
              style={{
                fontSize: '6rem',
                fontWeight: 800,
                color: 'var(--color-teal)',
                lineHeight: 1,
              }}
            >
              404
            </Title>
          </Box>

          <Stack align="center" gap="md">
            <Title order={2} style={{ color: 'var(--color-text-primary)', textAlign: 'center' }}>
              Route Not Found
            </Title>
            <Text
              size="lg"
              style={{ color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 400 }}
            >
              Looks like you've gone off course. The page you're looking for doesn't exist or has been moved.
            </Text>
          </Stack>

          <Group gap="md">
            <Button
              component={Link}
              to="/"
              size="lg"
              color="teal"
              leftSection={<House size={20} />}
            >
              Back to Home
            </Button>
            <Button
              component={Link}
              to="/today"
              size="lg"
              variant="outline"
              color="gray"
              leftSection={<ArrowLeft size={20} />}
            >
              Go to Dashboard
            </Button>
          </Group>

          <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
            Need help?{' '}
            <a href="mailto:travis@tribos.studio" style={{ color: 'var(--color-teal)' }}>
              Contact support
            </a>
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}

export default NotFound;
