import React from 'react';
import { Container, Stack, Title, Text, Button, Card, Group, Code } from '@mantine/core';
import { IconAlertTriangle, IconRefresh, IconHome } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * ErrorBoundary - Catches JavaScript errors in child component tree
 * Prevents the entire app from crashing and displays a user-friendly error message
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({ errorInfo });

    // If Sentry is configured, report the error
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, { extra: errorInfo });
    }
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const isDev = import.meta.env.DEV;

      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: tokens.colors.bgPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <Container size="sm">
            <Card
              padding="xl"
              radius="lg"
              style={{
                backgroundColor: tokens.colors.bgSecondary,
                border: `1px solid ${tokens.colors.bgTertiary}`
              }}
            >
              <Stack align="center" gap="lg">
                <IconAlertTriangle
                  size={64}
                  style={{ color: tokens.colors.warning }}
                />

                <Title order={2} ta="center" style={{ color: tokens.colors.textPrimary }}>
                  Something went wrong
                </Title>

                <Text
                  ta="center"
                  style={{ color: tokens.colors.textSecondary }}
                  maw={400}
                >
                  We encountered an unexpected error. This has been logged and we'll look into it.
                </Text>

                {isDev && error && (
                  <Card
                    padding="md"
                    radius="md"
                    w="100%"
                    style={{
                      backgroundColor: tokens.colors.bgTertiary,
                      border: `1px solid ${tokens.colors.error}33`
                    }}
                  >
                    <Stack gap="xs">
                      <Text size="sm" fw={600} style={{ color: tokens.colors.error }}>
                        Error Details (Dev Only)
                      </Text>
                      <Code
                        block
                        style={{
                          backgroundColor: tokens.colors.bgPrimary,
                          color: tokens.colors.textSecondary,
                          fontSize: '12px',
                          maxHeight: '150px',
                          overflow: 'auto'
                        }}
                      >
                        {error.toString()}
                        {errorInfo?.componentStack && (
                          <>
                            {'\n\nComponent Stack:'}
                            {errorInfo.componentStack}
                          </>
                        )}
                      </Code>
                    </Stack>
                  </Card>
                )}

                <Group gap="md">
                  <Button
                    variant="light"
                    color="gray"
                    leftSection={<IconHome size={18} />}
                    onClick={this.handleGoHome}
                  >
                    Go Home
                  </Button>
                  <Button
                    color="lime"
                    leftSection={<IconRefresh size={18} />}
                    onClick={this.handleRefresh}
                  >
                    Refresh Page
                  </Button>
                </Group>

                <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                  If this problem persists, please contact support.
                </Text>
              </Stack>
            </Card>
          </Container>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
